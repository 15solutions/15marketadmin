// Single source of truth for "does this trade have a verdict yet?".
//
// Enumerating the SETTLED states and treating everything else as in-flight is
// deliberate. The previous logic listed the pending states (PENDING,
// RESOLVING, PUSH, QUEUED, OPEN) and treated the rest as settled, which
// mis-classified two real live states: LOCKED, set the moment a trade is placed
// before any outcome exists, and TIMEOUT, set when the backend is unreachable
// with payout '0.00' and won undefined. Both rendered a red LOST card.
//
// Any status the backend adds later defaults to in-flight, so an unknown value
// can never surface as a fabricated win or loss.
const SETTLED_STATUSES = ['WON', 'PAID', 'LOST', 'RESOLVED', 'PAYOUT_FAILED', 'CANCELLED'];
const WIN_STATUSES = ['WON', 'PAID'];
const IN_FLIGHT_STATUSES = ['PENDING', 'RESOLVING'];

// How long past its countdown a trade may stay unsettled before the platform is
// considered to have failed it.
//
// This is NOT a settlement deadline - the backend still owes a real verdict and
// the trade stays PENDING in the list until it arrives or an admin clears it in
// disputes. Nothing here ever invents a win or a loss. It only decides how long
// an unsettled trade may keep HOLDING THE TRADING CONTROLS.
//
// A trade that is still running legitimately blocks the widget so the user
// cannot stack a second stake on top of an unresolved one. A trade the backend
// has already failed to settle must not: it used to hold the widget forever,
// leaving the user unable to trade at all with no way out and nothing on screen
// to explain why.
export const SETTLE_GRACE_MS = 30000;

export function isTradeSettled(trade) {
  if (!trade) return false;
  if (trade.isPending) return false;
  const status = String(trade.status || '').toUpperCase();
  if (!status) return false; // no status yet — the verdict has not landed
  return SETTLED_STATUSES.includes(status);
}

// True while the trade is still running. The receipt card and its share button
// only exist for settled trades; everything else shows a disclaimer instead.
export function isTradeInFlight(trade) {
  return !!trade && !isTradeSettled(trade);
}

// A trade the backend has had ample time to settle and has not.
export function isTradeOverdue(trade, now = Date.now()) {
  if (!trade) return false;
  if (isTradeSettled(trade)) return false;
  if (!IN_FLIGHT_STATUSES.includes(String(trade.status || '').toUpperCase())) return false;

  // Timestamps reach us as seconds from the backend and as milliseconds from
  // the optimistic rows we create locally, so normalise before comparing.
  const rawStart = Number(trade.startTime || trade.timestamp || 0);
  if (!rawStart) return false; // no timing information — never guess
  const start = rawStart > 1e12 ? rawStart : rawStart * 1000;
  const duration = Number(trade.duration || 15);
  const expiry = Number(trade.expiryMs || 0) || (start + duration * 1000);

  return now > expiry + SETTLE_GRACE_MS;
}

export function isWinningTrade(trade) {
  if (!isTradeSettled(trade)) return false;
  if (WIN_STATUSES.includes(String(trade.status || '').toUpperCase())) return true;
  return Number(trade.payout) > 0;
}

// How many shares the stake bought, and what each share cost at entry.
// A share costs the side's odds at entry (e.g. 61¢) and redeems $1 at
// settlement, so:
//   · a WON trade's payout IS the share count (payout = shares × $1)
//   · a LOST trade has no payout but the duration's payout multiplier is
//     exactly 1/odds, so shares = amount × multiplier
// and in both cases price = amount / shares — the same convention the
// receipt and PnL cards already print.
export function tradeShares(trade) {
  if (!trade) return { shares: null, price: null };
  const amt = Number(trade.amount);
  if (!amt || isNaN(amt) || amt <= 0) return { shares: null, price: null };
  const payout = Number(trade.payout);
  const won = trade.won === true ||
    ['WON', 'PAID'].includes(String(trade.status || '').toUpperCase());
  // Exact backend model when the trade carries its locked share price:
  // gross payout = stake / sharePrice, house keeps 1%, so shares bought =
  // stake / sharePrice × 0.99. Fall back to the duration multiplier
  // (multiplier ≈ 1 / entry odds) when the price never arrived.
  const lockedPrice = Number(trade.sharePrice);
  let shares;
  if (won && !isNaN(payout) && payout > 0) {
    // A won trade's credited payout IS its share count — matches the receipt.
    shares = payout;
  } else if (lockedPrice > 0 && isFinite(lockedPrice)) {
    shares = (amt / Math.max(0.03, Math.min(0.97, lockedPrice))) * 0.99;
  } else {
    shares = amt * (trade.duration <= 5 ? 2.90 : trade.duration <= 10 ? 2.40 : 1.90);
  }
  if (!shares || isNaN(shares) || shares <= 0) return { shares: null, price: null };
  const price = lockedPrice > 0 && isFinite(lockedPrice)
    ? Math.max(0.03, Math.min(0.97, lockedPrice))
    : amt / shares;
  return { shares, price };
}
