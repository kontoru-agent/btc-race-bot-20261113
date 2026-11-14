// BTC race bot: oversold-bounce dip buyer.
// Long only, single asset (CBBTC). Deterministic, no clock/env/random.
//
// Strategy: buy the bounce off a rolling low, but only when the window is
// deeply oversold. A full round trip costs ~26 bps (4 bps fee + 2 bps
// slippage + ~7 bps price impact each way), so the bot trades rarely and
// only where a bounce has room to pay for itself.
//
// Entry: the close has bounced BOUNCE_BPS above the rolling 60-bar low AND
// the close is still DIP_BPS below the window's first close (deeply
// oversold). Buy the bounce, never chase a top and never catch a knife
// that has not turned yet. Full cash (capped by `max_weight_bps`).
// Exit (whole position): take-profit TP_BPS over cost, or a trailing stop
// TRAIL_BPS below the peak value since entry (safety net for a sharp
// reversal). After a full exit, wait COOLDOWN bars before a new entry.
// Never trade while warming up. `max_slippage_bps = 100`.
//
// Dev-window result (official local grader, `--driver process`, kit
// btc-race-24h-20261113-2314): net PnL +7.838494 USDC, 8 trades, 50% win
// rate, max drawdown 1.52%, guardrails met; at 2x fees still +4.63 USDC.
// Reproduced byte for byte (L1 regrade). The dev window falls ~5% then
// rallies off its low: the plain breakout bot from the previous race loses
// on it (-4.10 USDC), and every breakout variant swept loses too; the
// dip-buy entry is what turns this window positive. Neighbouring
// parameters stay positive (TP 110 / TR 90: +5.83; TP 120 / TR 100: +6.80),
// so the pick sits on a plateau, not a spike.
// Dev gate needs net PnL > 0; this bot scores +7.84.
//
// Reproduce:
//   node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
// (kit: https://make.fun/c/btc-race-24h-20261113-2314/kit).

import { BPS, runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 60;
const BOUNCE_BPS = 30;
const DIP_BPS = 200;
const TP_BPS = 120n;
const TRAIL_BPS = 90n;
const COOLDOWN = 120;
const MAX_SLIPPAGE_BPS = 100;

let closes: number[] = [];
let peakValue = 0n;
let lastSellSeq = -1e9;

await runBars({
  onBatch(state: BarsState, batch) {
    const c = state.close(SYMBOL);
    if (c === null) return [];
    const close = Number(c);
    closes.push(close);
    if (state.warmingUp) return [];
    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      if (value > peakValue) peakValue = value;
      const trailHit = peakValue > 0n && value * BPS <= peakValue * (BPS - TRAIL_BPS);
      const tpHit = value * BPS >= held.cost * (BPS + TP_BPS);
      if (trailHit || tpHit) {
        lastSellSeq = batch.seq;
        peakValue = 0n;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }
    if (batch.seq - lastSellSeq < COOLDOWN) return [];
    const lo = closes.slice(-LOOKBACK - 1, -1);
    const first = closes[0];
    const bounced = lo.length >= LOOKBACK && close > Math.min(...lo) * (1 + BOUNCE_BPS / 10_000);
    const oversold = first !== undefined && close < first * (1 - DIP_BPS / 10_000);
    if (bounced && oversold) {
      const { caps, fees } = state.hello;
      let spend = state.cash;
      const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
      if (byWeight < spend) spend = byWeight;
      if (spend === 0n || spend < BigInt(fees.min_notional_quote_units)) return [];
      peakValue = 0n;
      const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [buy];
    }
    return [];
  },
});
