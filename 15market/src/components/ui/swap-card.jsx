// components/ui/swap-card.jsx
import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDown, ChevronDown, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/Input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Token shape: { symbol: string, name: string, icon: ({ className }) => ReactNode, decimals?: number }
 *
 * SwapCard sits straight on the platform background (no outer card box); only
 * the Sell / Buy panels are surfaces. Colours come from the `.swap-card-theme`
 * variables in index.css (dark by default, light under `.light`).
 */

const sanitizeAmount = (raw) => {
  const v = String(raw).replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = v.split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
};

const formatAmount = (n, decimals = 4) => {
  if (!Number.isFinite(n) || n <= 0) return "";
  return Number(n.toFixed(decimals)).toString();
};

const usdFormat = (n) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A reusable panel for the "Sell" and "Buy" sections
function CurrencyInputPanel({
  label,
  value,
  onValueChange,
  readOnly = false,
  selectedToken,
  onTokenSelect,
  tokens,
  usdValue,
  balance,
  onMax,
}) {
  return (
    <Card className="bg-muted rounded-3xl border-none shadow-none">
      <CardHeader className="px-4 py-2 flex-row items-center justify-between space-y-0">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {balance !== undefined && (
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
            Balance: {balance}
            {onMax && (
              <button
                type="button"
                onClick={onMax}
                className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary hover:bg-primary/25 transition-colors"
              >
                Max
              </button>
            )}
          </span>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <Input
            type="text"
            inputMode="decimal"
            aria-label={`${label} amount`}
            placeholder="0"
            value={value}
            readOnly={readOnly}
            onChange={(e) => onValueChange?.(sanitizeAmount(e.target.value))}
            className="h-auto min-w-0 flex-1 border-none bg-transparent p-0 text-2xl sm:text-3xl font-semibold tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="h-10 shrink-0 gap-2 rounded-full px-3 sm:px-3.5 text-sm font-bold"
              >
                <selectedToken.icon className="h-5 w-5" />
                {selectedToken.symbol}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="swap-card-theme z-[10000] w-52">
              {tokens.map((token) => (
                <DropdownMenuItem key={token.symbol} onSelect={() => onTokenSelect(token)}>
                  <token.icon className="h-5 w-5" />
                  <span className="flex flex-col leading-tight">
                    <span className="font-bold">{token.symbol}</span>
                    <span className="text-xs text-muted-foreground">{token.name}</span>
                  </span>
                  {token.symbol === selectedToken.symbol && <Check className="ml-auto h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-1 h-4 text-xs text-muted-foreground tabular-nums">
          {usdValue !== null && usdValue !== undefined ? `≈ $${usdValue}` : ""}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Props
 *  - tokens, initialSellToken, initialBuyToken
 *  - rates:    { "USDC-EURC": 0.92, ... } indicative output per 1 unit of the sell token
 *  - balances: { USDC: 12.5 }  (omit a symbol when its balance is unknown)
 *  - feeRate:  fraction, default 0.003
 *  - onSwap({ sellAmount, buyAmount, sellToken, buyToken })
 *  - ctaLabel / ctaDisabled / note: the primary button text, forced-disabled flag, small caption
 */
const SwapCard = React.forwardRef(
  (
    {
      className,
      tokens,
      initialSellToken,
      initialBuyToken,
      rates = {},
      balances = {},
      feeRate = 0.003,
      onSwap,
      onSelectionChange,
      ctaLabel = "Swap",
      ctaDisabled = false,
      note,
      ...props
    },
    ref
  ) => {
    const [sellToken, setSellToken] = React.useState(initialSellToken);
    const [buyToken, setBuyToken] = React.useState(initialBuyToken);
    const [sellAmount, setSellAmount] = React.useState("");
    const [flipped, setFlipped] = React.useState(0);

    // Report selections up so the host can quote live rates through its own
    // price source (Tower quotes need the picked pair + amount).
    React.useEffect(() => {
      onSelectionChange?.({ sellAmount, sellToken, buyToken });
    }, [onSelectionChange, sellAmount, sellToken, buyToken]);

    const rateOf = (from, to) => (from.symbol === to.symbol ? 1 : rates[`${from.symbol}-${to.symbol}`]);
    const rate = rateOf(sellToken, buyToken);
    const sellNum = parseFloat(sellAmount);
    const validAmount = Number.isFinite(sellNum) && sellNum > 0;

    const buyNum = validAmount && rate ? sellNum * rate : 0;
    const buyAmount = formatAmount(buyNum, buyToken.decimals ?? 4);
    const feeAmount = validAmount ? sellNum * feeRate : 0;

    // USD value through the USDC pair when a rate exists (USDC itself = 1).
    const usdPer = (token) => (token.symbol === "USDC" ? 1 : rates[`${token.symbol}-USDC`]);
    const usdOf = (token, amount) => {
      const per = usdPer(token);
      return per && amount > 0 ? usdFormat(amount * per) : null;
    };

    const pickSell = (token) => {
      if (token.symbol === buyToken.symbol) setBuyToken(sellToken);
      setSellToken(token);
    };
    const pickBuy = (token) => {
      if (token.symbol === sellToken.symbol) setSellToken(buyToken);
      setBuyToken(token);
    };
    const flip = () => {
      setSellToken(buyToken);
      setBuyToken(sellToken);
      setFlipped((n) => n + 1);
    };

    const sellBalance = balances[sellToken.symbol];
    const hasBalance = typeof sellBalance === "number" && Number.isFinite(sellBalance);
    const insufficient = hasBalance && validAmount && sellNum > sellBalance;
    const canSubmit = validAmount && !!rate && !insufficient && !ctaDisabled;

    const buttonLabel = insufficient ? `Insufficient ${sellToken.symbol}` : ctaLabel;

    return (
      <Card
        ref={ref}
        className={cn(
          "swap-card-theme w-full max-w-md mx-auto border-none bg-transparent text-foreground shadow-none",
          className
        )}
        {...props}
      >
        <CardContent className="p-0">
          {/* Sell / Buy panels with the flip control between them */}
          <div className="relative flex flex-col gap-1">
            <CurrencyInputPanel
              label="Sell"
              value={sellAmount}
              onValueChange={setSellAmount}
              selectedToken={sellToken}
              onTokenSelect={pickSell}
              tokens={tokens}
              usdValue={usdOf(sellToken, sellNum)}
              balance={hasBalance ? formatAmount(sellBalance, 4) || "0" : undefined}
              onMax={hasBalance && sellBalance > 0 ? () => setSellAmount(formatAmount(sellBalance, 6)) : undefined}
            />
            <CurrencyInputPanel
              label="Buy"
              value={buyAmount}
              readOnly
              selectedToken={buyToken}
              onTokenSelect={pickBuy}
              tokens={tokens}
              usdValue={usdOf(buyToken, buyNum)}
            />

            <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center pointer-events-none">
              <motion.div animate={{ rotate: flipped * 180 }} transition={{ type: "spring", stiffness: 320, damping: 22 }} className="pointer-events-auto">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Switch tokens"
                  className="h-9 w-9 rounded-full border-4 border-background"
                  onClick={flip}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </div>

          {/* Preview rows */}
          <div className="mt-2.5 flex flex-col gap-1 px-1 text-xs tabular-nums">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rate</span>
              <span className="font-semibold">
                {rate ? `1 ${sellToken.symbol} ≈ ${rate} ${buyToken.symbol}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Est. fee ({(feeRate * 100).toFixed(1)}%)</span>
              <span className="font-semibold">
                {validAmount ? `${feeAmount.toFixed(4)} ${sellToken.symbol}` : "—"}
              </span>
            </div>
          </div>

          {/* Primary action */}
          <Button
            type="button"
            size="lg"
            className="mt-3 h-11 w-full rounded-2xl text-sm font-bold"
            disabled={!canSubmit}
            onClick={() => onSwap?.({ sellAmount, buyAmount, sellToken, buyToken })}
          >
            {buttonLabel}
          </Button>

          {note && <p className="mt-1.5 text-center text-[10px] text-muted-foreground">{note}</p>}
        </CardContent>
      </Card>
    );
  }
);

SwapCard.displayName = "SwapCard";

export { SwapCard };
