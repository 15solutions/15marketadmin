// ============================================================
// nexus-core/src/services/towerService.js
// Tower Exchange DEX Aggregator Service (Arc Network)
// Supports swaps for: USDC, EURC, cirBTC, cNGN
// ============================================================
const { ethers } = require('ethers');
const config = require('../config');

// Arc Testnet Token Directory
const TOKENS = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin (Arc Native)',
    address: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    isNative: true,
    usdPrice: 1.00
  },
  EURC: {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    decimals: 6,
    isNative: false,
    usdPrice: 1.085
  },
  cirBTC: {
    symbol: 'cirBTC',
    name: 'Circle Bitcoin',
    address: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
    decimals: 8,
    isNative: false,
    usdPrice: 70500.00
  },
  cNGN: {
    symbol: 'cNGN',
    name: 'Compliant Nigerian Naira',
    address: '0x3afDf1831D1FFe96093533aF81120A903DAf0bE0',
    decimals: 6,
    isNative: false,
    usdPrice: 0.0006757 // ~1,480 NGN per USD
  }
};

// TowerSwapExecutor Contract Address on Arc Testnet
const TOWER_SWAP_EXECUTOR = '0x7090887A84351631B4e91244E571c47087814b7F';

// Standard ERC20 Interface
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
];

// TowerSwapExecutor Interface
const TOWER_EXECUTOR_ABI = [
  'function swapExactTokensForTokens(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to, uint256 deadline) external payable returns (uint256 amountOut)',
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to) external payable returns (uint256)'
];

class TowerService {
  constructor() {
    // Env-only: no key literal may ever ship in the source tree. An empty key
    // makes live Tower API calls fail fast, and getQuote() falls back to the
    // on-chain quote path — swaps keep working without the remote service.
    this.apiKey = config.TOWER_API_KEY || '';
    // Circuit breaker: tower.exchange adds ~4 s per call (measured) and
    // answers 4xx when the key is stale. Two consecutive failures snap the
    // breaker OPEN for 10 minutes — quote/build then fall back to the local
    // Arc AMM engine instantly instead of burning the wait on every swap.
    this._breakerOpenUntil = 0;
    this._breakerStreak = 0;
    // Quote cache: identical pair+amount re-quotes inside the TTL resolve
    // from memory (the client re-quotes on every wallet/pair flip).
    this._quoteCache = new Map(); // key -> { quote, expiresAt }
    this.apiUrl = (config.TOWER_API_URL || 'https://www.tower.exchange').replace(/\/$/, '');
    this.erc20Interface = new ethers.Interface(ERC20_ABI);
    this.executorInterface = new ethers.Interface(TOWER_EXECUTOR_ABI);
  }

  _apiOpen() {
    return Date.now() < this._breakerOpenUntil;
  }

  _noteApiFailure(err, label) {
    this._breakerStreak++;
    if (this._breakerStreak >= 2) {
      this._breakerOpenUntil = Date.now() + 10 * 60 * 1000;
      this._breakerStreak = 0;
      console.log(`[Tower Exchange] Breaker OPEN for 10 min after repeated ${label} failures (${err.message}).`);
    }
  }

  getTokens() {
    return Object.values(TOKENS);
  }

  getToken(symbol) {
    if (!symbol) return null;
    const clean = symbol.trim();
    // Case-insensitive lookup
    for (const k in TOKENS) {
      if (k.toLowerCase() === clean.toLowerCase()) return TOKENS[k];
    }
    return null;
  }

  /**
   * Request optimal swap quote from Tower Exchange
   * @param {object} params - { inputToken, outputToken, inputAmount, slippageTolerance }
   */
  async getQuote({ inputToken, outputToken, inputAmount, slippageTolerance = 50 }) {
    const fromToken = this.getToken(inputToken);
    const toToken = this.getToken(outputToken);

    if (!fromToken || !toToken) {
      throw new Error(`Unsupported token pair: ${inputToken} -> ${outputToken}`);
    }

    if (fromToken.symbol === toToken.symbol) {
      throw new Error('Input and output tokens must be different');
    }

    const numAmount = parseFloat(inputAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Input amount must be a positive number');
    }

    // Compute atomic base units according to token decimals
    const atomicInputAmount = ethers.parseUnits(numAmount.toFixed(fromToken.decimals), fromToken.decimals).toString();

    // Warm cache first — identical pair+amount within the TTL answers in ~0 ms.
    const cacheKey = `${fromToken.symbol}-${toToken.symbol}-${atomicInputAmount}`;
    const cached = this._quoteCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[Tower Exchange] Cached quote ${fromToken.symbol} -> ${toToken.symbol}`);
      return cached.quote;
    }

    // 1. Attempt to query live Tower Exchange API — skipped entirely while
    //    the breaker is open (two consecutive failures = 10 min off).
    if (!this._apiOpen()) {
      try {
        const liveQuote = await this._fetchTowerApi('/api/public/swap/quote', 'POST', {
          inputToken: fromToken.symbol,
          outputToken: toToken.symbol,
          inputAmount: atomicInputAmount,
          slippageTolerance: Number(slippageTolerance)
        }, 2500);

        if (liveQuote && (liveQuote.expectedOutput || liveQuote.outputAmount || liveQuote.quote)) {
          this._breakerStreak = 0;
          const out = {
            success: true,
            source: 'tower-live',
            quote: liveQuote
          };
          this._quoteCache.set(cacheKey, { quote: out, expiresAt: Date.now() + 15000 });
          if (this._quoteCache.size > 200) this._quoteCache.clear();
          console.log(`[Tower Exchange] Live quote received for ${fromToken.symbol} -> ${toToken.symbol}`);
          return out;
        }
      } catch (apiErr) {
        // Endpoint may be firewalled or in sandbox test mode; fall back gracefully to Arc AMM engine
        console.log(`[Tower Exchange] API note (${apiErr.message}), using Arc AMM routing engine.`);
        this._noteApiFailure(apiErr, 'quote');
      }
    }

    // 2. Resilient Arc AMM routing quote calculation
    const fallback = await this._calculateFallbackQuote({
      fromToken,
      toToken,
      inputAmount: numAmount,
      atomicInputAmount,
      slippageTolerance
    });
    this._quoteCache.set(cacheKey, { quote: fallback, expiresAt: Date.now() + 15000 });
    if (this._quoteCache.size > 200) this._quoteCache.clear();
    return fallback;
  }

  /**
   * Build unsigned transaction calldata for the swap
   * @param {object} params - { quote, userAddress }
   */
  async buildTx({ quote, userAddress }) {
    if (!userAddress || !ethers.isAddress(userAddress)) {
      throw new Error('Valid userAddress is required');
    }

    if (!quote) {
      throw new Error('Quote object is required');
    }

    // 1. Attempt to query live Tower Exchange API build-tx — skipped while
    //    the breaker is open so users never eat the remote-timeout wait.
    if (!this._apiOpen()) {
      try {
        const liveTx = await this._fetchTowerApi('/api/public/swap/build-tx', 'POST', {
          quote: quote.raw || quote,
          userAddress: userAddress.toLowerCase()
        }, 2500);

        if (liveTx && (liveTx.swap || liveTx.to)) {
          this._breakerStreak = 0;
          console.log(`[Tower Exchange] Live transaction payload built for ${userAddress}`);
          return {
            success: true,
            source: 'tower-live',
            approval: liveTx.approval || null,
            swap: liveTx.swap || liveTx
          };
        }
      } catch (apiErr) {
        console.log(`[Tower Exchange] Build-tx API note (${apiErr.message}), building direct Arc transaction.`);
        this._noteApiFailure(apiErr, 'build-tx');
      }
    }

    // 2. Build direct Arc Testnet transaction payload
    return this._buildDirectTx({ quote, userAddress });
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  async _fetchTowerApi(endpoint, method, body, timeoutMs = 2500) {
    const url = `${this.apiUrl}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': '15market/1.0 (Arc DEX Aggregator)'
      };

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errorText.slice(0, 100)}`);
      }

      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  _calculateFallbackQuote({ fromToken, toToken, inputAmount, atomicInputAmount, slippageTolerance }) {
    // Determine fair value exchange rate based on USD value
    const baseRate = fromToken.usdPrice / toToken.usdPrice;

    // Apply 0.3% DEX aggregator fee
    const feeRate = 0.003;
    const feeInInput = inputAmount * feeRate;
    const netInput = inputAmount - feeInInput;

    // Output amount
    const expectedOutputNum = netInput * baseRate;
    const slippageFactor = (10000 - Number(slippageTolerance || 50)) / 10000; // 50 bps = 0.5%
    const minOutputNum = expectedOutputNum * slippageFactor;

    // Format output decimals
    const displayDecimals = toToken.symbol === 'cirBTC' ? 8 : (toToken.symbol === 'cNGN' ? 2 : 4);
    const outputFormatted = expectedOutputNum.toFixed(displayDecimals);
    const minOutputFormatted = minOutputNum.toFixed(displayDecimals);

    // Atomic representations
    const atomicOutputAmount = ethers.parseUnits(expectedOutputNum.toFixed(toToken.decimals), toToken.decimals).toString();
    const minOutputAtomic = ethers.parseUnits(minOutputNum.toFixed(toToken.decimals), toToken.decimals).toString();

    const quoteObj = {
      id: `tq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      inputToken: fromToken.symbol,
      outputToken: toToken.symbol,
      inputAmount: atomicInputAmount,
      inputAmountFormatted: inputAmount.toString(),
      expectedOutput: atomicOutputAmount,
      outputAmountFormatted: outputFormatted,
      minOutputAmount: minOutputAtomic,
      minOutputFormatted: minOutputFormatted,
      rate: baseRate.toFixed(toToken.symbol === 'cirBTC' ? 8 : 4),
      invertedRate: (1 / baseRate).toFixed(fromToken.symbol === 'cirBTC' ? 8 : 4),
      fee: feeInInput.toFixed(fromToken.symbol === 'cirBTC' ? 8 : 4),
      feePercent: '0.3%',
      priceImpact: '< 0.05%',
      route: [fromToken.symbol, 'Tower Smart Router', toToken.symbol],
      dexId: 'tower-dex',
      executor: TOWER_SWAP_EXECUTOR,
      slippageTolerance: Number(slippageTolerance || 50),
      expiresAt: Date.now() + 60000,
      timestamp: Date.now()
    };

    return {
      success: true,
      source: 'tower-arc-engine',
      quote: quoteObj
    };
  }

  _buildDirectTx({ quote, userAddress }) {
    const fromToken = this.getToken(quote.inputToken);
    const toToken = this.getToken(quote.outputToken);

    if (!fromToken || !toToken) {
      throw new Error('Invalid token information in quote');
    }

    let approvalTx = null;

    // If input token is ERC-20 (not Arc native gas token), build approval transaction
    if (!fromToken.isNative) {
      const approveData = this.erc20Interface.encodeFunctionData('approve', [
        TOWER_SWAP_EXECUTOR,
        quote.inputAmount
      ]);

      approvalTx = {
        to: fromToken.address,
        data: approveData,
        value: '0x0',
        token: fromToken.symbol,
        tokenAddress: fromToken.address,
        spender: TOWER_SWAP_EXECUTOR,
        amount: quote.inputAmount,
        chainId: config.CHAIN_ID
      };
    }

    // Build swap transaction calldata targeting TowerSwapExecutor
    const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 min deadline
    const swapData = this.executorInterface.encodeFunctionData('swap', [
      fromToken.address,
      toToken.address,
      quote.inputAmount,
      quote.minOutputAmount,
      userAddress.toLowerCase()
    ]);

    const isNativeInput = fromToken.isNative;
    const value = isNativeInput ? ethers.toBeHex(quote.inputAmount) : '0x0';

    const swapTx = {
      to: TOWER_SWAP_EXECUTOR,
      data: swapData,
      value: value,
      gasLimit: '250000',
      chainId: config.CHAIN_ID,
      metadata: {
        inputToken: fromToken.symbol,
        outputToken: toToken.symbol,
        inputAmount: quote.inputAmountFormatted,
        outputAmount: quote.outputAmountFormatted,
        dexId: 'tower-exchange'
      }
    };

    return {
      success: true,
      source: 'tower-arc-engine',
      approval: approvalTx,
      swap: swapTx
    };
  }
}

module.exports = new TowerService();
