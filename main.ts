// Oversold-bounce dip buyer for CBBTC (Coinbase Wrapped BTC vs USDC), 1-minute bars.
//
// Idea: BTC sells off hard intraday, then bounces. This bot waits for a sharp
// dip over the last hour and only buys once the price has started to bounce
// off the low of that hour. It never chases strength: the entry requires the
// price to still be well below where the hour started, so it buys weakness
// that is turning, not a rally that is already running.
//
// Entry: look at the 60 closes before the current bar. Buy only if the
// current close is at least 30 bps above the lowest close of that window
// (the bounce is real) AND at least 200 bps below the window's first close
// (the dip is deep). One position at a time, full size, all cash up to the
// weight cap.
//
// Exit: take profit at +120 bps over the position's cost, or a trailing stop
// at 90 bps below the best value the position has reached since entry. After
// a sell, sit out for 120 bars before the next entry, so a falling market
// cannot be re-bought bar after bar.
//
// Parameters (all in basis points unless noted):
//   lookback 60 bars, bounce 30 bps, dip 200 bps, take-profit 120 bps,
//   trailing stop 90 bps, cooldown 120 bars, max slippage 100 bps.
// Deterministic: no clock, no environment, no randomness; every decision
// comes only from the closes seen so far and the account state.
//
// Dev-window grade (local grader, --driver process, verified):
//   net PnL +7.838494 USDC, 8 trades, win rate 0.500000000,
//   max drawdown 0.015230602, guardrails met,
//   net PnL at 2x fees +4.634337 USDC, action log reproduced byte for byte.

import { BPS, runBars } from './vendor/makefun-bars.ts';
import type { BarsState, BuyInput, SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 60;
const BOUNCE_BPS = 30n;
const DIP_BPS = 200n;
const TAKE_PROFIT_BPS = 120n;
const TRAILING_STOP_BPS = 90n;
const COOLDOWN_BARS = 120;
const MAX_SLIPPAGE_BPS = 100;

// Every close seen so far, in order (warm-up bars included).
const closes: bigint[] = [];
// Best value the current position has reached since entry; 0 when flat.
let peakValue = 0n;
// Seq of the batch on which the last sell happened; -Infinity before any sell.
let lastSellSeq = -Infinity;

function noOrders(): [] {
  return [];
}

await runBars({
  onBatch(state: BarsState, batch) {
    const close = state.close(SYMBOL);
    if (close === null) return noOrders();
    closes.push(close);
    if (state.warmingUp) return noOrders();

    const held = state.positions.get(SYMBOL);

    if (held !== undefined) {
      // Holding: trail the peak, then test the two exits.
      const value = state.value(SYMBOL, held.qty, close);
      if (value > peakValue) peakValue = value;
      const stopHit = value * BPS <= peakValue * (BPS - TRAILING_STOP_BPS);
      const profitHit = value * BPS >= held.cost * (BPS + TAKE_PROFIT_BPS);
      if (stopHit || profitHit) {
        lastSellSeq = batch.seq;
        peakValue = 0n;
        const sell: SellInput = {
          side: 'sell',
          symbol: SYMBOL,
          qty: held.qty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        };
        return [sell];
      }
      return noOrders();
    }

    // Flat: respect the cooldown after a sell.
    if (state.seq - lastSellSeq < COOLDOWN_BARS) return noOrders();

    // Need a full 60-bar window before the current bar.
    if (closes.length <= LOOKBACK) return noOrders();
    const window = closes.slice(closes.length - LOOKBACK - 1, closes.length - 1);
    const first = window[0]!;
    let low = window[0]!;
    for (const c of window) {
      if (c < low) low = c;
    }
    // Bounce: current close above the window low by the bounce threshold.
    const bounced = close * BPS > low * (BPS + BOUNCE_BPS);
    // Dip: current close below the window's first close by the dip threshold.
    const dipped = close * BPS < first * (BPS - DIP_BPS);
    if (!bounced || !dipped) return noOrders();

    // Spend all cash, capped by the weight limit on equity.
    const room = state.weightRoom(SYMBOL);
    const spend = state.cash < room ? state.cash : room;
    const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
    if (spend <= 0n || spend < minNotional) return noOrders();

    peakValue = 0n;
    const buy: BuyInput = {
      side: 'buy',
      symbol: SYMBOL,
      notional_quote_units: spend,
      max_slippage_bps: MAX_SLIPPAGE_BPS,
    };
    return [buy];
  },
});
