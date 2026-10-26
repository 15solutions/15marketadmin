// ==================================================================================
// CLASSIC TRADING ENGINE — ON-CHAIN VERIFIED SETTLEMENT
// ==================================================================================
// Every trade is broadcast on-chain BEFORE deducting balance.
// Every settlement tx is broadcast on-chain with real hash.
// All RPC calls use broadcastWithFailover() across 4 Arc RPCs.
// ==================================================================================
const cache = require('./cache');
const config = require('./config');
const rpc = require('./rpc');
const { ethers } = require('ethers');
const crypto = require('crypto');

const STATIC_GAS_PRICE = ethers.parseUnits("60", "gwei");

class ClassicEngine {
  constructor(io) {
    this.io = io;
    this._tradeLocks = new Set(); // Prevents concurrent trade placement per user

    this.TREASURY_ABI = [
      "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
      "function settleBet(uint256 _betId, uint256 _exitPrice, uint256 _payoutAmount) external",
      "function withdraw(uint256 _amount) external",
      "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ];

    // Interface for encoding tx data
    this.contractInterface = new ethers.Interface(this.TREASURY_ABI);

    if (rpc.wallet) {
      this.treasuryContract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, rpc.wallet);
    }
  }

  start() {
    setInterval(() => this.ensureOperatorFunded(), 30000);
    setInterval(() => this._reclaimIdleSessionArc(), 300000); // Every 5 min

    // Trade Monitor & Result Locking
    // Per-trade try/catch: ONE bad trade must never take down the tick loop —
    // an earlier throw here killed all active-trade processing with no log.
    setInterval(() => {
      const now = Date.now();
      for (const trade of cache.trades.values()) {
        try {
          if (trade.status === 'PENDING') {
            const msLeft = (trade.settleAt || 0) - now;
            const timeLeft = Math.max(0, msLeft / 1000);

            if (trade.expiryEmitted) continue;

            const currentPrice = cache.prices[trade.symbol] || trade.entryPrice;
            if (msLeft < 10000 && currentPrice > 0) cache.snapshotPrice(trade.symbol);

            if (msLeft <= 0) {
              this.lockResult(trade);
            } else {
              const isUp = this.resolveDirection(trade.direction) === 1;
              const isWinning = isUp ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;
              this.io.to(trade.userAddr).emit('trade_tick', {
                betId: trade.id,
                timeLeft,
                currentPrice,
                isWinning,
                direction: trade.direction
              });
            }
          }
        } catch (err) {
          console.error(`[Engine] monitor tick ERROR for #${trade && trade.id}:`, err?.message || err);
        }
      }
    }, 50);

    // Recovery sweep — guarantees no trade is ever left un-resolved:
    //  - overdue PENDING trades that never hit the 50ms lock path get completed here;
    //  - "zombie" trades (lock attempted but final state never reached, still
    //    PENDING) are completed using their ALREADY-LOCKED verdict — never a
    //    fabricated LOST — so the result is accurate and the client isn't stranded
    //    in RESOLVING.
    setInterval(() => this._recoverStuckTrades(), 3000);
  }

  /**
   * Sweeps for overdue / zombie trades once per 3s (defense in depth).
   * Independent of the 50ms monitor so a partially-locked trade is still caught.
   */
  _recoverStuckTrades() {
    try {
      const now = Date.now();
      for (const trade of cache.trades.values()) {
        try {
          if (trade.status !== 'PENDING') continue;
          if (((trade.settleAt || 0) - now) > 0) continue;
          // lockResult is idempotent and completes accurately (reuses the locked
          // exit price if one was captured), so this safely finishes both plain
          // overdue trades and zombies.
          this.lockResult(trade);
        } catch (err) {
          console.error(`[Engine] Recovery error for #${trade && trade.id}:`, err?.message || err);
        }
      }
    } catch (err) {
      console.error('[Engine] Recovery sweep failed:', err?.message || err);
    }
  }

  normalizeAddr(addr) { return String(addr || '').toLowerCase(); }

  /**
   * Syncs session balance to profile store so it survives server restarts.
   */
  syncBalance(userAddr, session) {
    if (!session) return;
    try {
      const profiles = require('./profiles');
      profiles.upsert(userAddr, { balance: session.balance });
    } catch (_) {}
  }

  resolveSessionIdentity(body) {
    const raw = body.address || body.walletAddress || body.userAddress;
    if (!raw) return { ok: false, error: 'Missing address in request body' };
    const identityKey = this.normalizeAddr(raw);
    if (!identityKey || identityKey.length < 10) {
      return { ok: false, error: 'Invalid address format' };
    }
    return { ok: true, identityKey, walletAddress: identityKey };
  }

  resolveDirection(dir) {
    if (dir === 1 || dir === '1' || String(dir).toUpperCase() === 'UP') return 1;
    if (dir === 0 || dir === '0' || String(dir).toUpperCase() === 'DOWN') return 0;
    return null;
  }

  // ── RESULT LOCKING ─────────────────────────────────────────────────────
  // Locks the result at the EXACT instant the countdown ends (trade.settleAt).
  // The exit price is taken STRICTLY from timestamped snapshots at-or-before
  // that instant — never a live poll captured after expiry — so the result
  // CANNOT change once the timer hits zero even while the feed streams through
  // the settlement window.
  lockResult(trade) {
    // Fully resolved already — never re-evaluate a locked trade.
    if (trade.status !== 'PENDING') return;

    const alreadyLocked = trade.expiryEmitted || trade.isSettled;
    // Set BOTH flags first: prevents re-entry even if anything below throws,
    // and lets the recovery sweep identify zombies (locked but still PENDING).
    trade.isSettled = true;
    trade.expiryEmitted = true;

    // ── DISPUTE ────────────────────────────────────────────────────────────
    // A trade that cannot be decided is parked, NOT settled. It used to be
    // declared a LOST here, which meant a price-feed gap silently cost the user
    // their entire stake: our failure, billed to them as a loss. The same
    // happened in the catch below, where ANY exception became a LOST.
    //
    // A DISPUTE trade keeps its stake, stays visible in the user's history with
    // a DISPUTE status (which the client renders as unsettled), and waits for an
    // admin to clear it. No money moves and no verdict is invented.
    const parkForDispute = (reason, detail) => {
      // profiles is required lazily inside methods in this file, not at module
      // scope, so it must be pulled in here. Getting this wrong is not a no-op:
      // the reference threw a ReferenceError, which meant a dispute was never
      // persisted or pushed to the user - the one path that must never fail
      // silently.
      const profiles = require('./profiles');
      trade.status = 'DISPUTE';
      trade.disputeReason = reason;
      trade.disputeDetail = detail || null;
      trade.disputeAt = Date.now();
      // Deliberately NOT setting lockedExitPrice / lockedWon / settledAt: a
      // verdict must not exist for a trade we could not decide, and an admin
      // re-settle has to be able to compute it fresh from a usable price.
      console.error(
        `[Engine] #${trade.id} PARKED IN DISPUTE (${reason}: ${detail}) — ` +
        `stake held, no verdict. Needs admin resolution.`
      );
      profiles.recordBetResult(trade.id, {
        status: 'DISPUTE',
        settled_at: null
      });
      cache.pushHistory(trade.userAddr, {
        ...trade,
        status: 'DISPUTE',
        disputeReason: reason
      });
      // Out of the recovery sweep: a dispute is waiting on a human, not on the
      // automatic settler, so re-restoring it would only spin. It stays in the
      // trades table and in the user's history where an admin can find it.
      cache.resolveOpenTrade(trade.id);
      this.io.to(trade.userAddr).emit('trade_disputed', {
        betId: trade.id,
        status: 'DISPUTE',
        reason,
        // The stake is untouched - say so plainly rather than implying a loss.
        message: 'We could not verify this trade\'s result. Your stake is safe and an admin will resolve it.'
      });
      // The ADMIN console is not in the user's room: broadcast globally so the
      // trade feed swaps its beam for a DISPUTE marker the moment the engine
      // parks the trade, instead of waiting for the next snapshot poll.
      this.io.emit('global_trade_disputed', {
        betId: trade.id,
        id: trade.id,
        status: 'DISPUTE',
        reason,
        userAddr: trade.userAddr,
        settledAt: null
      });
      this._noteDispute(trade, reason);
    };

    try {
      // If the result was already captured (e.g. a zombie being completed by the
      // recovery sweep or a force-settle), REUSE the original locked exit price —
      // a settlement verdict must never change after countdown zero.
      const exitPrice = (alreadyLocked && trade.lockedExitPrice !== undefined && trade.lockedExitPrice !== null)
        ? trade.lockedExitPrice
        : this.captureExitPrice(trade);

      // A nonsense / feed-down exit price must NOT decide an outcome.
      const validExit = Number.isFinite(exitPrice) && exitPrice > 0;
      const isUp = this.resolveDirection(trade.direction);

      // ── The boundary: a decidable trade settles automatically, exactly as
      // before. Nothing below this point is new behaviour.
      if (!validExit) {
        return parkForDispute('INVALID_EXIT_PRICE', String(exitPrice));
      }
      if (isUp === null) {
        return parkForDispute('INVALID_DIRECTION', JSON.stringify(trade.direction));
      }
      // ── End boundary. Everything after here is the pre-existing automatic
      // settlement path and is unchanged.

      const recomputed = isUp === 1 ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);
      const won = trade.lockedWon !== undefined ? trade.lockedWon : recomputed;

      trade.lockedExitPrice = exitPrice;
      trade.lockedWon = won;
      trade.settledAt = Date.now();

      console.log(`[Engine] Locked #${trade.id} | Won: ${won} | Entry: ${trade.entryPrice} | Exit: ${exitPrice} @ settleAt ${trade.settleAt} | Dir: ${isUp === 1 ? 'UP' : 'DOWN'} | validExit: true`);

      // Cache the result in Redis — pure cache, best-effort, never throws upward.
      cache.cacheTradeResult(trade.id, {
        tradeId: trade.id,
        exitPrice,
        won,
        entryPrice: trade.entryPrice,
        amount: trade.amount,
        symbol: trade.symbol,
        direction: trade.direction,
        userAddr: trade.userAddr,
        settledAt: trade.settledAt
      }).catch(err => console.error(`[Engine] cacheTradeResult failed for #${trade.id}:`, err?.message || err));

      this.io.to(trade.userAddr).emit('trade_expired', {
        betId: trade.id,
        exitPrice,
        won,
        stakeTxHash: trade.stakeTxHash || null,
        status: 'RESOLVING'
      });

      if (won) {
        this._noteSettled(true);
        this.creditWinner(trade, exitPrice);
        this.settleOnChainBackground(trade);
      } else {
        trade.status = 'LOST';
        this._noteSettled(false);
        this.settleTradeLocally(trade);
      }
      // Keep the idempotency ledger in step with the settlement so an operator
      // reconciling balances can see the bet is closed, not stuck.
      //
      // Wrapped: `profiles` is not in module scope in this file, and a
      // ReferenceError here used to be thrown AFTER the money had already moved,
      // landing in the catch below and leaving the ledger row stuck on PENDING
      // for a trade that had in fact settled. Ledger bookkeeping must never be
      // able to break settlement.
      try {
        require('./profiles').recordBetResult(trade.id, {
          status: trade.status,
          settled_at: new Date().toISOString()
        });
      } catch (ledgerErr) {
        console.error(`[Engine] could not update the ledger for #${trade.id}:`, ledgerErr?.message || ledgerErr);
      }
    } catch (err) {
      // NEVER leave the client hanging in RESOLVING with no backend error — and
      // never convert our own crash into the user's loss, which is what the old
      // `status = 'LOST'` fallback here did.
      console.error(`[Engine] lockResult ERROR for #${trade.id}:`, err?.message || err);
      if (trade.status === 'PENDING') {
        try {
          parkForDispute('ENGINE_ERROR', err?.message || String(err));
        } catch (err2) {
          console.error(`[Engine] dispute parking ALSO failed for #${trade.id}:`, err2?.message || err2);
        }
      }
    }
  }

  // ── Settlement telemetry ────────────────────────────────────────────────
  //
  // "Are most trades settling?" was unanswerable, which is how a feed failure
  // could quietly turn into a user's LOST stake for an unknown period of time
  // with nothing counting it. Every terminal outcome is counted here so the
  // success rate is a number rather than an impression.
  //
  // Counters are in-process, so they reset on deploy. That is enough to answer
  // "is the current build settling trades, and how often does it fail", which is
  // the question that matters when a change is live. A durable counter belongs in
  // Redis if this ever needs to survive a restart.
  _settlementStats() {
    this._stats = this._stats || { settledWins: 0, settledLosses: 0, disputes: 0, byReason: {} };
    return this._stats;
  }

  _noteSettled(won) {
    const s = this._settlementStats();
    if (won) s.settledWins++; else s.settledLosses++;
  }

  /**
   * Deadline breaches are a platform failure by definition, so they are counted
   * and surfaced rather than discovered by looking at a list.
   */
  _noteDispute(trade, reason) {
    const s = this._settlementStats();
    s.disputes++;
    s.byReason[reason] = (s.byReason[reason] || 0) + 1;
    console.error(
      `[Engine] DISPUTES OPEN: ${s.disputes} total — ${JSON.stringify(s.byReason)} ` +
      `(latest: #${trade.id} ${trade.userAddr})`
    );
  }

  /**
   * Captures the settlement exit price strictly at-or-before trade.settleAt.
   * Priority:
   *   1. last timestamped snapshot with time <= settleAt (exact countdown end);
   *   2. earliest known snapshot (still pre-expiry when any row predates it);
   *   3. live price, ONLY when the history buffer is completely cold — loud warn.
   * Never picks a snapshot captured after expiry while pre-expiry rows exist.
   */
  captureExitPrice(trade) {
    const target = trade.settleAt || Date.now();
    const history = cache.priceHistory[trade.symbol];

    let atOrBefore = null;
    if (history) {
      for (const entry of history) {
        if (entry.time <= target && (!atOrBefore || entry.time >= atOrBefore.time)) atOrBefore = entry;
      }
    }
    if (atOrBefore) {
      const gap = target - atOrBefore.time;
      if (gap > 1000) console.warn(`[Engine] #${trade.id} exit-price gap ${gap}ms — locking to last pre-expiry snapshot ${atOrBefore.price}.`);
      return atOrBefore.price;
    }

    if (history && history.length) {
      console.warn(`[Engine] #${trade.id} no pre-expiry snapshot — locking to earliest known ${history[0].price}.`);
      return history[0].price;
    }

    const live = cache.prices[trade.symbol] || trade.entryPrice;
    console.error(`[Engine] #${trade.id} NO price history for ${trade.symbol} — fallback live price ${live} (may be post-expiry).`);
    return live;
  }

  // ── INSTANT WINNER CREDIT ──────────────────────────────────────────────
  // Maximum net payout for a stake, derived from the published duration
  // multipliers in config.MULTIPLIERS.
  //
  // creditWinner used to compute `amount / sharePrice` with no ceiling. A trade
  // is only worth the multiplier, but a sharePrice near the 0.03 clamp floor
  // turns a 3.95 USDC stake into a ~97 USDC payout - 13x the 1.90x ceiling for
  // a 15s trade. That is a direct house-loss, so the payout is now capped at
  // stake * multiplier * 0.99 regardless of what the odds engine reports.
  // Nearest configured duration tier, so an odd duration cannot fall through
  // uncapped. Falls back to the 15s tier, the most conservative.
  multiplierFor(duration) {
    const tiers = Object.keys(config.MULTIPLIERS)
      .map(Number)
      .filter((d) => isFinite(d))
      .sort((a, b) => a - b);
    if (!tiers.length) return 1.90;
    const d = Number(duration);
    const tier = tiers.reduce((best, t) => (
      Math.abs(t - d) < Math.abs(best - d) ? t : best
    ), tiers[0]);
    return config.MULTIPLIERS[tier] || 1.90;
  }

  maxPayoutFor(trade) {
    return Number(trade?.amount || 0) * this.multiplierFor(trade?.duration) * 0.99;
  }

  creditWinner(trade, exitPrice) {
    // Same guard as settleTradeLocally: a win must be credited exactly once.
    if (trade.status === 'WON' || trade.payoutAmount) {
      console.warn(`[Engine] #${trade.id} duplicate win credit ignored (already WON).`);
      // The credit already happened, but the indexed history row may still say
      // PENDING and the live cache row may never have been evicted (crash
      // between credit and record). Reconcile without paying again.
      try {
        const profiles = require('./profiles');
        profiles.pushTrade(trade.userAddr, {
          ...trade,
          status: 'PAID',
          won: true,
          payout: trade.payoutAmount ?? trade.payout,
          paid: true,
          exitPrice: trade.lockedExitPrice ?? exitPrice,
          settledAt: trade.settledAt || Date.now()
        });
      } catch (e) {
        console.error(`[Engine] #${trade.id} win history reconcile failed:`, e?.message || e);
      }
      try {
        const cache = require('./cache');
        cache.resolveOpenTrade(String(trade.id));
        for (const [key, t] of cache.trades) {
          if (String(t.id) === String(trade.id)) cache.trades.delete(key);
        }
      } catch (e2) {
        console.error(`[Engine] #${trade.id} win cache reconcile failed:`, e2?.message || e2);
      }
      return;
    }
    const sharePrice = Math.max(0.03, Math.min(0.97, Number(trade.sharePrice) || 0.50));
    const grossPayout = trade.amount / sharePrice;
    const uncappedNet = grossPayout * 0.99;
    const cap = this.maxPayoutFor(trade);
    const payoutAmount = Math.max(0.000001, Math.min(uncappedNet, cap));
    const payoutStr = payoutAmount.toFixed(6);

    if (uncappedNet > cap + 0.000001) {
      console.error(
        `[Engine] #${trade.id} PAYOUT CAPPED: sharePrice=${sharePrice} would pay ${uncappedNet.toFixed(6)} ` +
        `but ${trade.duration}s stake ${trade.amount} caps at ${cap.toFixed(6)}. Odds engine out of range.`
      );
    }

    let exitPriceBigInt;
    try { exitPriceBigInt = ethers.parseUnits(Number(exitPrice).toFixed(8), 8); }
    catch (e) { console.warn(`[Engine] #${trade.id} invalid exit price for on-chain settle (${exitPrice}):`, e?.message || e); exitPriceBigInt = ethers.parseUnits("0", 8); }
    let payoutBigInt;
    try { payoutBigInt = ethers.parseEther(payoutStr); } catch { payoutBigInt = ethers.parseEther("0.000001"); }

    trade.status = 'WON';
    trade.payoutAmount = payoutAmount;
    trade.payoutStr = payoutStr;
    trade.exitPriceBigInt = exitPriceBigInt;
    trade.payoutBigInt = payoutBigInt;

    const session = cache.sessions.get(trade.userAddr);
    if (session) {
      session.balance = Number((session.balance + payoutAmount).toFixed(6));
      session.lastWinAt = Date.now();
      session.lastTradeAt = Date.now();
      this.syncBalance(trade.userAddr, session);
    }

    this.io.to(trade.userAddr).emit('balance_update', {
      balance: String(session ? session.balance : payoutAmount),
      reason: 'WIN_PAYOUT',
      betId: trade.id,
      payout: payoutAmount
    });

    this.io.to(trade.userAddr).emit('trade_settled', {
      betId: trade.id,
      won: true,
      status: 'WON',
      exitPrice,
      payout: payoutAmount,
      amount: trade.amount,
      symbol: trade.symbol,
      direction: trade.direction,
      duration: trade.duration,
      entryPrice: trade.entryPrice,
      stakeTxHash: trade.stakeTxHash || null,
      userAddr: trade.userAddr
    });

    this.io.to(trade.userAddr).emit('payout_completed', {
      tradeId: trade.id,
      betId: trade.id,
      payout: payoutAmount
    });

    this.io.emit('global_trade_settled', {
      betId: trade.id,
      id: trade.id,
      won: true,
      status: 'PAID',
      paid: true,
      payout: payoutAmount,
      exitPrice: exitPrice,
      userAddr: trade.userAddr,
      amount: trade.amount,
      symbol: trade.symbol,
      direction: trade.direction,
      duration: trade.duration,
      entryPrice: trade.entryPrice,
      sharePrice: trade.sharePrice,
      settledAt: Date.now()
    });

    cache.pushHistory(trade.userAddr, {
      ...trade,
      won: true,
      status: 'PAID',
      exitPrice,
      payout: payoutAmount,
      settledAt: Date.now()
    });
    cache.resolveOpenTrade(trade.id);
    cache.saveSessionSnapshot(trade.userAddr, cache.sessions.get(trade.userAddr)?.balance);

    this.settleCopyTrades(trade, payoutAmount);

    try {
      const notifier = require('./services/notificationService');
      notifier.notifyUserWithPush(trade.userAddr, "Trade Won 🎉", `Your ${trade.symbol?.toUpperCase() || 'BTC'} ${trade.direction === 1 ? 'LONG' : 'SHORT'} trade won! +${payoutAmount.toFixed(2)} USDC.`, "success");
    } catch (e) {}

    console.log(`[Instant] Bet #${trade.id} credited. Payout: ${payoutStr} USDC`);
  }

  // ── BACKGROUND ON-CHAIN SETTLEMENT ─────────────────────────────────────
  // Broadcasts settleBet via failover RPC. Verifies receipt in background.
  settleOnChainBackground(trade) {
    const betId = BigInt(trade.id);
    const exitPriceBigInt = trade.exitPriceBigInt;
    const payoutBigInt = trade.payoutBigInt;
    const payoutStr = trade.payoutStr;
    const payoutAmount = trade.payoutAmount;

    (async () => {
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          const data = this.contractInterface.encodeFunctionData('settleBet', [
            betId, exitPriceBigInt, payoutBigInt
          ]);
          const nonce = await rpc.getNonce(rpc.wallet.address);

          const txResponse = await rpc.broadcastWithFailover(
            config.PRIVATE_KEY,
            {
              to: config.TREASURY_ADDRESS,
              data,
              gasLimit: 600000,
              gasPrice: STATIC_GAS_PRICE,
              nonce,
              chainId: rpc.chainId
            }
          );

          console.log(`[BG-Settle] #${betId} broadcasted | Tx: ${txResponse.hash}`);

          const receipt = await rpc.waitForReceipt(txResponse.hash, 8, 5000);
          if (receipt && receipt.status === 1) {
            console.log(`[BG-Settle] #${betId} confirmed on-chain`);
            cache.trades.delete(String(betId));
            cache.deleteCachedTradeResult(String(betId));
            return;
          }

          try {
            const verifyBet = await this.treasuryContract.bets(betId);
            if (verifyBet && verifyBet.settled) {
              console.log(`[BG-Settle] #${betId} confirmed via direct check`);
              cache.trades.delete(String(betId));
              cache.deleteCachedTradeResult(String(betId));
              return;
            }
          } catch {}

          throw new Error("Receipt not found or status 0");
        } catch (err) {
          retries++;
          console.error(`[BG-Settle] #${betId} attempt ${retries}/${maxRetries} failed:`, err.message?.substring(0, 120));
          if (retries < maxRetries) await new Promise(r => setTimeout(r, 5000 * retries));
        }
      }

      // ALL RETRIES FAILED — Revert the in-memory credit (guard against negative)
      console.error(`[BG-Settle] #${betId} FAILED after ${maxRetries} attempts. Reverting credit.`);
      const session = cache.sessions.get(trade.userAddr);
      if (session) {
        session.balance = Number(Math.max(0, session.balance - payoutAmount).toFixed(6));
        this.syncBalance(trade.userAddr, session);
        this.io.to(trade.userAddr).emit('balance_update', {
          balance: String(session.balance),
          reason: 'SETTLEMENT_FAILED_REVERT',
          betId: String(betId)
        });
      }

      // Do NOT flip the authoritative verdict here. The trade genuinely won — only
      // the on-chain payout delivery failed. Keep status/lockedWon as WON so the
      // backend's source of truth is never corrupted after the verdict was locked.
      cache.pushHistory(trade.userAddr, {
        ...trade,
        status: 'PAYOUT_FAILED',
        won: true,
        exitPrice: trade.lockedExitPrice,
        payout: payoutAmount,
        settledAt: Date.now(),
        payoutFailed: true
      });

      this.io.to(trade.userAddr).emit('payout_failed', {
        betId: String(betId),
        message: "On-chain settlement failed. Payout was reverted."
      });

      // The global broadcast was missing here, so the admin console kept the
      // row on "Resolving…" forever even though the user side had already
      // settled. Emit it with the payoutFailed flag so the admin row flips to
      // WON + PAY FAIL with a retry affordance instead of hanging.
      this.io.emit('global_trade_settled', {
        betId: trade.id,
        id: trade.id,
        won: true,
        status: 'PAYOUT_FAILED',
        paid: false,
        payoutFailed: true,
        payout: payoutAmount,
        exitPrice: trade.lockedExitPrice,
        userAddr: trade.userAddr,
        amount: trade.amount,
        symbol: trade.symbol,
        direction: trade.direction,
        duration: trade.duration,
        entryPrice: trade.entryPrice,
        sharePrice: trade.sharePrice,
        settledAt: Date.now()
      });

      cache.trades.delete(String(betId));
      cache.deleteCachedTradeResult(String(betId));
    })();
  }

  // ── PAYOUT RETRY (admin) ───────────────────────────────────────────────
  // Re-delivers a WON trade's payout whose on-chain settlement exhausted its
  // retries (the history row carries payoutFailed). The failed attempt
  // reverted the wallet credit, so this credits the balance again, flips the
  // history row to PAID and re-broadcasts settleBet in the background. If the
  // chain refuses again the credit is reverted and the row flips back to
  // PAYOUT_FAILED — the admin can simply retry once more. Idempotent: a row
  // that is not in the payout-failed state is refused (or reported already
  // paid), and a bet still owned by the live settler is never double-handled.
  async retryFailedPayout(betId) {
    const profiles = require('./profiles');
    const id = String(betId || '');
    if (!id) return { success: false, error: 'Missing bet id' };

    let row = null;
    let addr = null;
    for (const a in profiles.profiles) {
      const rows = profiles.profiles[a]?.trades || [];
      const hit = rows.find(t => String(t.id || t.betId) === id);
      if (hit) { row = hit; addr = a; break; }
    }
    if (!row) return { success: false, error: 'Trade not found', betId: id };

    const isFailedRow = row.payoutFailed === true || String(row.status || '').toUpperCase() === 'PAYOUT_FAILED';
    if (!isFailedRow) {
      const wonRow = row.won === true || ['PAID', 'WON'].includes(String(row.status || '').toUpperCase());
      if (wonRow) return { success: true, alreadyPaid: true, betId: id };
      return { success: false, error: 'Trade is not a failed payout', betId: id, status: row.status };
    }
    if (cache.trades.has(id)) {
      return { success: false, error: 'Trade is still live in the working set', betId: id };
    }

    const amt = Number(row.amount) || 0;
    if (amt <= 0) return { success: false, error: 'Trade stake invalid', betId: id };

    // Newer failed rows carry the exact credited payout; older ones derive it
    // from the duration multiplier with the same 0.99 house cap.
    const payout = Number(
      row.payout ?? row.payoutAmount ?? amt * this.multiplierFor(row.duration) * 0.99
    );
    if (!payout || payout <= 0 || !isFinite(payout)) {
      return { success: false, error: 'Payout amount unknown', betId: id };
    }

    // Re-credit the wallet (the failed attempt reverted it).
    const session = cache.sessions.get(addr);
    if (session) {
      session.balance = Number((session.balance + payout).toFixed(6));
      this.syncBalance(addr, session);
    }
    this.io.to(addr).emit('balance_update', {
      balance: String(session ? session.balance : payout),
      reason: 'PAYOUT_RETRY',
      betId: id,
      payout
    });

    // Flip the history row to PAID — pushTrade merge-upserts and persists.
    const exitPriceRaw = Number(row.exitPrice ?? row.lockedExitPrice ?? 0) || 0;
    try {
      profiles.pushTrade(addr, {
        ...row,
        status: 'PAID',
        won: true,
        paid: true,
        payoutFailed: false,
        payout,
        exitPrice: exitPriceRaw,
        payoutRetriedAt: Date.now()
      });
    } catch (e) {
      console.warn(`[PayoutRetry] #${id} history update failed:`, e?.message || e);
    }

    this.io.to(addr).emit('payout_completed', { tradeId: id, betId: id, payout, retried: true });

    this.io.emit('global_trade_settled', {
      betId: id,
      id,
      won: true,
      status: 'PAID',
      paid: true,
      payout,
      exitPrice: exitPriceRaw || null,
      userAddr: addr,
      amount: row.amount,
      symbol: row.symbol,
      direction: row.direction,
      duration: row.duration,
      entryPrice: row.entryPrice,
      sharePrice: row.sharePrice,
      settledAt: Date.now(),
      retried: true
    });

    console.log(`[PayoutRetry] #${id} credited ${payout} USDC to ${(addr || '').slice(0, 10)}…; re-broadcasting on-chain settle`);

    // Background: give the chain another chance. Success here only confirms —
    // the wallet credit already happened. Failure reverts exactly like the
    // original attempt and re-flags the row so the retry pill comes back.
    (async () => {
      let retries = 0;
      const maxRetries = 3;
      let exitPriceBigInt;
      try { exitPriceBigInt = ethers.parseUnits(exitPriceRaw.toFixed(8), 8); }
      catch { exitPriceBigInt = ethers.parseUnits("0", 8); }
      let payoutBigInt;
      try { payoutBigInt = ethers.parseEther(payout.toFixed(6)); }
      catch { payoutBigInt = ethers.parseEther("0.000001"); }

      while (retries < maxRetries) {
        try {
          const data = this.contractInterface.encodeFunctionData('settleBet', [id, exitPriceBigInt, payoutBigInt]);
          const nonce = await rpc.getNonce(rpc.wallet.address);
          const txResponse = await rpc.broadcastWithFailover(
            config.PRIVATE_KEY,
            {
              to: config.TREASURY_ADDRESS,
              data,
              gasLimit: 600000,
              gasPrice: STATIC_GAS_PRICE,
              nonce,
              chainId: rpc.chainId
            }
          );
          const receipt = await rpc.waitForReceipt(txResponse.hash, 8, 5000);
          if (receipt && receipt.status === 1) {
            console.log(`[PayoutRetry] #${id} confirmed on-chain`);
            return;
          }
          try {
            const verifyBet = await this.treasuryContract.bets(id);
            if (verifyBet && verifyBet.settled) {
              console.log(`[PayoutRetry] #${id} confirmed via direct check`);
              return;
            }
          } catch {}
          throw new Error("Receipt not found or status 0");
        } catch (err) {
          retries++;
          console.error(`[PayoutRetry] #${id} attempt ${retries}/${maxRetries} failed:`, err?.message?.substring(0, 120) || err);
          if (retries < maxRetries) await new Promise(r => setTimeout(r, 5000 * retries));
        }
      }

      console.error(`[PayoutRetry] #${id} chain delivery failed again after ${maxRetries} attempts. Reverting credit.`);
      const session2 = cache.sessions.get(addr);
      if (session2) {
        session2.balance = Number(Math.max(0, session2.balance - payout).toFixed(6));
        this.syncBalance(addr, session2);
        this.io.to(addr).emit('balance_update', {
          balance: String(session2.balance),
          reason: 'SETTLEMENT_FAILED_REVERT',
          betId: id
        });
      }
      try {
        profiles.pushTrade(addr, {
          ...row,
          status: 'PAYOUT_FAILED',
          won: true,
          paid: false,
          payoutFailed: true,
          payout,
          exitPrice: exitPriceRaw,
          settledAt: Date.now()
        });
      } catch {}
      this.io.to(addr).emit('payout_failed', {
        betId: id,
        message: 'Settlement failed again. The payout retry did not confirm on-chain.'
      });
      this.io.emit('global_trade_settled', {
        betId: id,
        id,
        won: true,
        status: 'PAYOUT_FAILED',
        paid: false,
        payoutFailed: true,
        payout,
        exitPrice: exitPriceRaw || null,
        userAddr: addr,
        amount: row.amount,
        symbol: row.symbol,
        direction: row.direction,
        duration: row.duration,
        entryPrice: row.entryPrice,
        sharePrice: row.sharePrice,
        settledAt: Date.now()
      });
    })();

    return { success: true, alreadyPaid: false, betId: id, payout, userAddr: addr };
  }

  // ── TRADE PLACEMENT ────────────────────────────────────────────────────
  // Sends placeBet on-chain FIRST. Returns real tx hash. Deducts balance
  // after successful broadcast. Verifies confirmation in background.
  async placeTrade(tradeParams, identityPayload) {
    const userAddr = this.normalizeAddr(identityPayload.address);
    const sessionWallet = rpc.deriveSessionWallet(userAddr);

    // Prevent concurrent trades for the same user
    if (this._tradeLocks.has(userAddr)) {
      return { success: false, error: 'A trade is already being placed. Please wait.' };
    }
    this._tradeLocks.add(userAddr);

    try {
      // IDEMPOTENCY, LAYER 1 (in-process): rejects an instant replay cheaply.
      // The frontend generates the betId, and a double-click or a socket replay
      // resends it. cache.trades is in-memory, so this layer only helps within a
      // process lifetime - layer 2 below is the durable one.
      const incomingId = tradeParams?.id ? String(tradeParams.id) : null;
      if (incomingId) {
        const existing = cache.trades.get(incomingId);
        if (existing) {
          console.warn(`[Place] #${incomingId} duplicate submit ignored (already placed for ${userAddr}).`);
          return {
            success: true,
            duplicate: true,
            tradeId: existing.id,
            txHash: existing.stakeTxHash || null,
            amount: existing.amount,
            status: existing.status
          };
        }
      }

      return await this._placeTradeInner(tradeParams, identityPayload, userAddr, sessionWallet);
    } finally {
      this._tradeLocks.delete(userAddr);
    }
  }

  async _placeTradeInner(tradeParams, identityPayload, userAddr, sessionWallet) {

    // `profiles` is NOT in module scope in this file - it is required lazily
    // inside methods to keep the cache <-> profiles require cycle from resolving
    // to a half-initialised module at require time. So it has to be pulled in
    // here, before the first use.
    //
    // It was missing, and that is why every funded trade died with
    // `ReferenceError: profiles is not defined` at the idempotency gate below,
    // which surfaced to the client as HTTP 500 from POST /session/execute. The
    // five call sites here (claimBet and the four recordBetResult ledger writes)
    // all sat in this function's scope, so this one binding covers them,
    // including the receipt callback at the end.
    const profiles = require('./profiles');

    const rawAmount = tradeParams.amount;
    const amount = Number(rawAmount);
    if (!rawAmount || isNaN(amount) || amount <= 0) {
      return { success: false, error: `Invalid trade amount: "${rawAmount}"` };
    }
    if (amount < 0.001) {
      return { success: false, error: 'Minimum trade amount is 0.001 USDC' };
    }

    let generatedId = Date.now().toString() + crypto.randomInt(100000, 999999).toString();
    const rawId = tradeParams.id && /^\d+$/.test(String(tradeParams.id)) ? String(tradeParams.id) : generatedId;
    const numericId = BigInt(rawId);

    // IDEMPOTENCY, LAYER 2 (durable): the bet id is claimed in Postgres further
    // down, immediately before the on-chain broadcast, so that a validation
    // failure above does not burn the user's id.

    const direction = this.resolveDirection(tradeParams.direction);
    if (direction === null) {
      return { success: false, error: `Invalid direction: "${tradeParams.direction}"` };
    }
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Math.max(0, Number(tradeParams.marketId || 0));
    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp', 'avax'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';

    // ENTRY PRICE = price at the EXACT moment the user clicked YES/NO.
    // The frontend reads the live price in the same frame as the click and sends
    // it here (scaled integer: SOL=1e6, other assets=1e2). Prefer that precise
    // click-time price over this engine's own (slightly later) feed read so the
    // entry matches exactly what the user saw when they pressed the button.
    const SCALE = marketId === 2 ? 1000000 : 100;
    let entryPrice = 0;
    const clientPriceRaw = Number(tradeParams.entryPrice);
    if (clientPriceRaw && isFinite(clientPriceRaw) && clientPriceRaw > 0) {
      entryPrice = Number((clientPriceRaw / SCALE).toFixed(12));
    }
    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      entryPrice = Number(cache.prices[symbol]);
    }
    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      return { success: false, error: 'Price feed not available. Please wait and retry.' };
    }

    const currentOdds = cache.liveOdds?.[symbol]?.[duration];
    let sharePrice = 0.50;
    if (currentOdds) {
      sharePrice = direction === 1 ? currentOdds.LONG : currentOdds.SHORT;
    }
    sharePrice = Math.max(0.03, Math.min(0.97, sharePrice));

    const contractPrice = ethers.parseUnits(Math.max(0, entryPrice).toFixed(8), 8);
    const contractDir = direction === 1 ? 0 : 1;

    let stakeWei;
    try {
      stakeWei = ethers.parseEther(amount.toFixed(6));
    } catch (e) {
      return { success: false, error: `Invalid amount format: ${e.message}` };
    }

    // Check balance BEFORE sending on-chain
    const session = cache.sessions.get(userAddr);
    if (!session || session.balance < amount) {
      return { success: false, error: 'Insufficient balance' };
    }

    // ── IDEMPOTENCY GATE ────────────────────────────────────────────────
    // Claimed here, as late as possible: every validation above has passed and
    // the next statement is the first irreversible side effect. cache.trades and
    // _tradeLocks are in-process and lost on restart, so without a durable claim
    // a replay after a deploy broadcasts a second real placeBet.
    //
    // Fails closed. If we cannot prove the bet is not a replay we must not place
    // it, because a duplicate costs the house real money.
    const claim = await profiles.claimBet(rawId, userAddr, amount, {
      duration,
      symbol,
      direction,
      marketId,
      sharePrice
    });
    if (!claim.claimed) {
      if (claim.reason === 'already-placed') {
        // Replay of a bet id we already accepted. Return the original outcome so
        // the client converges on one trade instead of showing a second one.
        const prior = cache.trades.get(rawId);
        console.warn(`[Place] #${rawId} replay rejected: bet id already placed.`);
        return {
          success: true,
          duplicate: true,
          tradeId: rawId,
          txHash: prior?.stakeTxHash || null,
          amount: prior?.amount ?? amount,
          status: prior?.status || 'PENDING'
        };
      }
      console.error(`[Place] #${rawId} REFUSED (claim failed: ${claim.reason}). Apply supabase/migrations/005_trade_idempotency.sql.`);
      return { success: false, error: 'Trade could not be verified as unique. Please try again.' };
    }

    // ── SEND ON-CHAIN FIRST ──────────────────────────────────────────────
    let realHash;
    try {
      // Ensure session wallet has native ARC for gas + stake
      await this._ensureSessionWalletFunded(sessionWallet, stakeWei, userAddr);

      // Re-check the balance under the same conditions we will deduct in.
      // _ensureSessionWalletFunded awaits, so a concurrent trade could have spent
      // the balance since the check above.
      const freshSession = cache.sessions.get(userAddr);
      if (!freshSession || freshSession.balance < amount) {
        console.warn(`[Place] #${numericId} balance moved during placement, aborting before broadcast.`);
        // We own the claim and nothing hit the chain, so release it.
        profiles.recordBetResult(rawId, { status: 'CANCELLED', settled_at: new Date().toISOString() });
        return { success: false, error: 'Insufficient balance' };
      }

      const data = this.contractInterface.encodeFunctionData('placeBet', [
        numericId, contractDir, duration, contractPrice, marketId, sessionWallet.address
      ]);
      const nonce = await rpc.getNonce(sessionWallet.address);

      const txResponse = await rpc.broadcastWithFailover(
        sessionWallet.privateKey,
        {
          to: config.TREASURY_ADDRESS,
          data,
          value: stakeWei,
          gasLimit: 400000,
          gasPrice: STATIC_GAS_PRICE,
          nonce,
          chainId: rpc.chainId
        }
      );

      realHash = txResponse.hash;
      console.log(`[Place] #${numericId} broadcasted | Tx: ${realHash}`);
    } catch (err) {
      console.error(`[Place] #${numericId} broadcast failed:`, err.message?.substring(0, 150));
      // Nothing reached the chain, so release the claim or this id is burned.
      profiles.recordBetResult(rawId, { status: 'CANCELLED', settled_at: new Date().toISOString() });
      return { success: false, error: `Trade broadcast failed: ${err.message?.substring(0, 100)}` };
    }

    // ── DEDUCT BALANCE AFTER SUCCESSFUL BROADCAST ────────────────────────
    session.balance = Number((session.balance - amount).toFixed(6));
    session.lastTradeAt = Date.now();
    this.syncBalance(userAddr, session);

    const trade = {
      id: numericId.toString(),
      userAddr,
      sessionAddress: sessionWallet.address.toLowerCase(),
      direction,
      duration,
      marketId,
      amount,
      symbol,
      entryPrice,
      sharePrice,
      status: 'PENDING',
      createdAt: Date.now(),
      settleAt: Date.now() + (duration * 1000),
      settleRetries: 0,
      stakeTxHash: realHash,
    };
    cache.trades.set(trade.id, trade);
    await cache.pushHistory(userAddr, trade);
    // Register in the durable open-trade set. cache.trades is in-memory, so this
    // is the only record that survives a restart and lets the settlement engine
    // pick this bet back up if the process dies before it resolves. Awaited and
    // retried: a silently-dropped registration used to strand the bet PENDING
    // forever. On persistent failure the trade is queued in the file-backed
    // outbox and a replayer keeps trying — an outage delays, never drops.
    if (!(await cache.registerOpenTradeWithRetry(trade))) {
      profiles.enqueueUnregistered(trade);
      console.error(`[Place] #${trade.id} NOT in durable registry — queued for retry. Settles late, never lost.`);
    }
    // Attach the tx hash to the claim row for audit and reconciler lookups.
    profiles.recordBetResult(trade.id, { stake_tx_hash: realHash, symbol });
    // Shared balance snapshot, so a cold instance (or a different device) can be
    // served the same number without waiting on a chain read.
    cache.saveSessionSnapshot(userAddr, session.balance);

    this.io.to(userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'TRADE_PLACED',
      betId: numericId.toString()
    });

    // ── VERIFY CONFIRMATION IN BACKGROUND ────────────────────────────────
    rpc.waitForReceipt(realHash, 8, 3000).then(async receipt => {
      if (!receipt || receipt.status !== 1) {
        console.error(`[Place] #${numericId} tx NOT confirmed. Reverting balance.`);
        cache.trades.delete(trade.id);
        cache.deleteCachedTradeResult(trade.id);
        // Out of the durable registry too. A PENDING registry entry for a bet
        // that never went live would be picked up by recovery and settled as
        // if it were real — money moving on a dead trade.
        await cache.resolveOpenTrade(trade.id);
        cache.pushHistory(userAddr, {
          ...trade,
          status: 'CANCELLED',
          won: false,
          settledAt: Date.now(),
          cancelledAt: Date.now()
        });
        // Mark the claim cancelled too, so the ledger agrees with the revert and
        // an operator can see the bet was never really live.
        profiles.recordBetResult(trade.id, { status: 'CANCELLED', settled_at: new Date().toISOString() });
        const sess = cache.sessions.get(userAddr);
        if (sess) {
          sess.balance = Number(Math.max(0, sess.balance + amount).toFixed(6));
          this.syncBalance(userAddr, sess);
          this.io.to(userAddr).emit('balance_update', {
            balance: String(sess.balance),
            reason: 'TRADE_FAILED_REVERT',
            betId: String(numericId)
          });
        }
        this.io.to(userAddr).emit('trade_failed', {
          betId: String(numericId),
          message: "Trade failed on-chain. Balance restored.",
          txHash: realHash
        });
      } else {
        console.log(`[Place] #${numericId} confirmed on-chain`);
      }
    }).catch(() => {});

    // Return REAL tx hash — verifiable on ArcScan
    return { success: true, txHash: realHash, tradeId: trade.id };
  }

  settleTradeLocally(trade) {
    // Guard against a double settle re-crediting. The payout cap bounds the size
    // of any single overpay, but a repeated credit is the same house loss twice,
    // so refuse rather than stack it.
    if (trade.settledAt || trade.status === 'LOST' || trade.status === 'WON') {
      console.warn(`[Engine] #${trade.id} duplicate settle ignored (already ${trade.status}).`);
      // The engine already returned its verdict for this trade, but the
      // indexed history row may still say PENDING (crash between the verdict
      // and the record write) and the row may still squat in the live cache —
      // which left the admin console staring at a PENDING beam for a trade
      // whose result existed. Reconcile quietly: flip the history row and
      // evict the live row WITHOUT re-crediting or re-notifying anyone.
      try {
        const profiles = require('./profiles');
        profiles.pushTrade(trade.userAddr, {
          ...trade,
          status: trade.status === 'WON' ? 'PAID' : 'LOST',
          won: trade.status === 'WON',
          exitPrice: trade.lockedExitPrice,
          settledAt: trade.settledAt || Date.now()
        });
      } catch (e) {
        console.error(`[Engine] #${trade.id} history reconcile failed:`, e?.message || e);
      }
      try {
        const cache = require('./cache');
        cache.resolveOpenTrade(String(trade.id));
        for (const [key, t] of cache.trades) {
          if (String(t.id) === String(trade.id)) cache.trades.delete(key);
        }
      } catch (e2) {
        console.error(`[Engine] #${trade.id} cache reconcile failed:`, e2?.message || e2);
      }
      return;
    }
    trade.status = 'LOST';
    trade.settledAt = Date.now();

    // Phone + in-app notification for lost trades
    try {
      const notifier = require('./services/notificationService');
      notifier.notifyUserWithPush(trade.userAddr, "Trade Lost", `Your ${trade.symbol?.toUpperCase() || 'BTC'} ${trade.direction === 1 ? 'LONG' : 'SHORT'} trade lost. -${(Number(trade.amount) || 0).toFixed(2)} USDC.`, "error");
    } catch (e) {}

    this.io.to(trade.userAddr).emit('trade_settled', {
      betId: trade.id,
      won: false,
      status: 'LOST',
      exitPrice: trade.lockedExitPrice,
      stakeTxHash: trade.stakeTxHash || null,
      userAddr: trade.userAddr,
      entryPrice: trade.entryPrice,
      amount: trade.amount,
      symbol: trade.symbol,
      direction: trade.direction,
      duration: trade.duration
    });

    cache.pushHistory(trade.userAddr, {
      ...trade,
      won: false,
      exitPrice: trade.lockedExitPrice,
      settledAt: Date.now()
    });
    cache.resolveOpenTrade(trade.id);
    cache.saveSessionSnapshot(trade.userAddr, cache.sessions.get(trade.userAddr)?.balance);

    this.settleCopyTrades(trade, 0);

    this.io.emit('global_trade_settled', {
      betId: trade.id,
      id: trade.id,
      won: false,
      status: 'LOST',
      paid: false,
      payout: 0,
      exitPrice: trade.lockedExitPrice,
      userAddr: trade.userAddr,
      amount: trade.amount,
      symbol: trade.symbol,
      direction: trade.direction,
      duration: trade.duration,
      entryPrice: trade.entryPrice,
      sharePrice: trade.sharePrice,
      settledAt: Date.now()
    });
  }

  settleCopyTrades(providerTrade, payout) {
    try {
      const profiles = require('./profiles');
      const providerAddr = providerTrade.userAddr?.toLowerCase();
      if (!providerAddr) return;
      const provider = profiles.get(providerAddr);
      if (!provider?.isProvider) return;
      const providerTradeId = String(providerTrade.id);
      const won = providerTrade.won || providerTrade.status === 'WON' || providerTrade.status === 'PAID';
      for (const addr in profiles.profiles) {
        const investor = profiles.get(addr);
        if (!investor?.copyTrades || !investor.copyTradingWallet) continue;
        let updated = false;
        let settledTrade = null;
        investor.copyTrades = investor.copyTrades.map(ct => {
          if (ct.providerTradeId === providerTradeId && ct.result === 'PENDING') {
            updated = true;
            const ratio = providerTrade.amount > 0 ? (payout / providerTrade.amount) : 0;
            // Cap the copier's payout with the same duration multiplier the
            // provider was paid on. copyTrades carry their own amount and no
            // duration, so borrow the provider's; an uncapped ratio inherits the
            // provider's overpay and pays the copier too.
            const copyCap = Number(ct.amount || 0) * this.multiplierFor(providerTrade.duration) * 0.99;
            const rawCopy = won ? (ct.amount * ratio) : 0;
            const payoutAmount = won ? Math.min(rawCopy, copyCap) : 0;
            if (won && rawCopy > copyCap + 0.000001) {
              console.error(
                `[Engine] #${providerTradeId} COPY PAYOUT CAPPED: would pay ${rawCopy.toFixed(6)} but caps at ${copyCap.toFixed(6)}.`
              );
            }
            settledTrade = { ...ct, result: won ? 'WON' : 'LOST', payout: payoutAmount, settledAt: Date.now() };
            return settledTrade;
          }
          return ct;
        });
        if (updated && settledTrade) {
          if (won) {
            investor.copyTradingWallet.balance = (parseFloat(investor.copyTradingWallet.balance) || 0) + settledTrade.payout;
          }
          if (investor.activeCopies) {
            const rel = investor.activeCopies.find(c => c.providerAddress === providerAddr);
            if (rel) {
              const pnl = won ? (settledTrade.payout - settledTrade.amount) : -settledTrade.amount;
              rel.pnl = (rel.pnl || 0) + pnl;
            }
          }
          profiles.upsert(addr, investor);
          this.io.to(addr).emit('copy_trade_update', {
            trade: {
              providerAddress: providerAddr,
              result: settledTrade.result,
              amount: settledTrade.amount,
              payout: settledTrade.payout
            }
          });
          this.io.to(addr).emit('balance_update', {
            balance: String(investor.copyTradingWallet.balance),
            available: String(investor.copyTradingWallet.balance),
            reason: won ? 'COPY_WIN' : 'COPY_LOSS'
          });

          try {
            const notifier = require('./services/notificationService');
            const providerName = provider?.providerApplication?.contactInfo?.name || provider?.username || providerAddr.substring(0, 6);
            if (won) {
              notifier.notifyUserWithPush(addr, "Copy Trade Won 🎉", `${providerName}'s copy trade won! +${settledTrade.payout.toFixed(2)} USDC on ${settledTrade.asset?.toUpperCase() || 'BTC'}.`, "success");
            } else {
              notifier.notifyUserWithPush(addr, "Copy Trade Lost", `${providerName}'s copy trade lost. -${settledTrade.amount.toFixed(2)} USDC on ${settledTrade.asset?.toUpperCase() || 'BTC'}.`, "error");
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[CopyTrading] settleCopyTrades error:', err.message);
    }
  }

  async _reclaimIdleSessionArc() {
    if (!rpc.wallet) return;

    const MIN_TO_KEEP = 0.05;
    const MAX_RECLAIM = 50;

    // The platform's own gas float, tracked in the reconciler. It is the ONLY
    // money in a session wallet that belongs to us; everything above it is the
    // user's trading balance.
    const chainReconciler = require('./services/chainReconciler');

    for (const [userAddr, session] of cache.sessions.entries()) {
      if (!session || !session.wallet) continue;
      try {
        const bal = await rpc.getBalance(session.wallet.address);
        const balNum = parseFloat(bal || '0');
        if (balNum <= MIN_TO_KEEP) continue;

        // Sum up active trade stakes for this user
        let lockedAmount = 0;
        for (const trade of cache.trades.values()) {
          if (trade.sessionAddress === session.wallet.address.toLowerCase() && trade.status === 'PENDING') {
            lockedAmount += trade.amount;
          }
        }

        // ── SAFETY CAPS ────────────────────────────────────────────────────
        // This used to reclaim `balNum - lockedAmount - MIN_TO_KEEP`, i.e.
        // everything above the pending stakes. That is the user's trading
        // balance: with no trade pending, a 30 USDC balance was swept whole to
        // the operator wallet, every 5 minutes. The user's principal is not
        // ours to take, so the sweep is now bounded by three things:
        //
        //   1. the gas float we actually put in (our money, and nothing more),
        //   2. the headroom above locked stakes and the gas buffer,
        //   3. the user's own ledger balance.
        //
        // Cap 1 fails CLOSED: if the float did not persist we recorded none, and
        // we then take nothing rather than guessing. Cap 3 means we would rather
        // leak a little gas than touch a balance, which is the correct direction
        // to be wrong in.
        const gasFloatOwed = chainReconciler.getGasFloatOwed(userAddr);
        const userPrincipal = Number(session.balance || 0);
        const headroom = balNum - lockedAmount - MIN_TO_KEEP;

        const reclaimable = Math.max(0, Math.min(
          MAX_RECLAIM,
          gasFloatOwed,
          headroom,
          isFinite(userPrincipal) ? userPrincipal : 0
        ));
        if (reclaimable < 0.01) continue;

        // Refuse rather than sweep a balance we cannot reconcile. If the float
        // exceeds what the user actually has, the accounting has drifted and
        // taking our full number would come out of their funds.
        if (gasFloatOwed > balNum + 0.01) {
          console.warn(
            `[Reclaim] SKIPPED ${userAddr.slice(0, 10)}...: gas float ${gasFloatOwed} exceeds ` +
            `on-chain ${balNum} — accounting drifted, not touching the balance`
          );
          continue;
        }

        console.log(`[Reclaim] ${session.wallet.address.slice(0, 10)}... has ${balNum} ARC, reclaiming ${reclaimable} of our gas float`);

        const nonce = await rpc.getNonce(session.wallet.address);
        const txResponse = await rpc.broadcastWithFailover(
          session.wallet.privateKey,
          {
            to: rpc.wallet.address,
            value: ethers.parseEther(reclaimable.toFixed(6)),
            gasLimit: 21000,
            gasPrice: STATIC_GAS_PRICE,
            nonce,
            chainId: rpc.chainId
          }
        );
        await rpc.waitForReceipt(txResponse.hash);
        // Only now is the money actually back with us. Recording the reclaim is
        // what stops the next pass from taking the same float again.
        chainReconciler.recordGasReclaim(userAddr, reclaimable);
        console.log(`[Reclaim] Reclaimed ${reclaimable} ARC from ${session.wallet.address.slice(0, 10)}`);
      } catch (e) {
        // Skip this wallet on error, move on
      }
    }
  }

  async _ensureSessionWalletFunded(sessionWallet, requiredWei, userAddr) {
    const sessionBal = await rpc.getBalance(sessionWallet.address);
    const sessionBalNum = parseFloat(sessionBal || '0');
    const requiredNum = parseFloat(ethers.formatEther(requiredWei));
    const GAS_BUFFER = 0.05; // 0.05 ARC buffer for gas

    if (sessionBalNum >= requiredNum + GAS_BUFFER) return;

    const needed = Math.max(0, requiredNum + GAS_BUFFER - sessionBalNum);
    if (needed <= 0) return;

    // Fund with at least 2 ARC to avoid frequent re-funding (reduces RPC calls)
    const sendAmount = Math.max(2, Math.ceil(needed * 100) / 100);
    if (sendAmount <= 0) return;

    console.log(`[SessionFunder] Session wallet ${sessionWallet.address.slice(0, 10)}... needs ${sendAmount} ARC (has ${sessionBalNum})`);

    try {
      // Register this inflow BEFORE broadcasting. chainReconciler watches the
      // session EOA for deposits and would otherwise credit our own gas money
      // back to the user as trading balance on the next poll.
      if (userAddr) {
        try {
          require('./services/chainReconciler').recordGasFunding(
            userAddr,
            ethers.parseEther(sendAmount.toFixed(6))
          );
        } catch (reconErr) {
          console.warn('[SessionFunder] Could not record gas funding:', reconErr.message);
        }
      }

      const operatorBal = await rpc.getBalance(rpc.wallet.address);
      if (parseFloat(operatorBal || '0') < sendAmount + 0.1) {
        console.error(`[SessionFunder] Operator insufficient balance (${operatorBal}) to fund ${sendAmount} ARC`);
        throw new Error(`Operator has ${operatorBal || 0} ARC, needs ${sendAmount + 0.1} ARC to fund session wallet. Refill operator or treasury.`);
      }

      const nonce = await rpc.getNonce(rpc.wallet.address);
      const txResponse = await rpc.broadcastWithFailover(
        config.PRIVATE_KEY,
        {
          to: sessionWallet.address,
          value: ethers.parseEther(sendAmount.toFixed(6)),
          gasLimit: 21000,
          gasPrice: STATIC_GAS_PRICE,
          nonce,
          chainId: rpc.chainId
        }
      );
      console.log(`[SessionFunder] Sent ${sendAmount} ARC to ${sessionWallet.address.slice(0, 10)}... | Tx: ${txResponse.hash}`);
      // Don't wait for receipt — save an RPC call, the tx will confirm in background
    } catch (e) {
      console.error(`[SessionFunder] Failed to fund session wallet:`, e.message?.substring(0, 120));
      throw new Error(`Session wallet funding failed: ${e.message?.substring(0, 100)}`);
    }
  }

  async ensureOperatorFunded() {
    try {
      const balStr = await rpc.getBalance(rpc.wallet.address);
      if (balStr === null || balStr === "0") return;

      const bal = parseFloat(balStr);
      if (bal < 5) {
        const tBalStr = await rpc.getBalance(config.TREASURY_ADDRESS);
        const treasuryBal = parseFloat(tBalStr || "0");
        if (treasuryBal < 20) {
           console.log(`[GasTank] Treasury low (${treasuryBal} ARC). Cannot refill Operator.`);
           return;
        }

        console.log(`[GasTank] Low (${bal} ARC). Refilling 20 ARC...`);
        const data = this.contractInterface.encodeFunctionData('withdraw', [ethers.parseUnits("20", 18)]);
        const nonce = await rpc.getNonce(rpc.wallet.address);
        const txResponse = await rpc.broadcastWithFailover(
          config.PRIVATE_KEY,
          {
            to: config.TREASURY_ADDRESS,
            data,
            gasLimit: 150000,
            gasPrice: STATIC_GAS_PRICE,
            nonce,
            chainId: rpc.chainId
          }
        );
        const receipt = await rpc.waitForReceipt(txResponse.hash);
        if (!receipt || receipt.status !== 1) {
          console.error("[GasTank] Refill tx reverted on-chain");
        }
      }
    } catch (e) {
      console.error("[GasTank] Refill failed:", e.message);
    }
  }
}

module.exports = ClassicEngine;
