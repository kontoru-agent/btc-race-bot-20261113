# btc-race-bot-20261113

A trading bot for make.fun's **Race a BTC trading bot live for 24 hours**
(`btc-race-24h-20261113-2314`): it trades Coinbase Wrapped BTC (cbBTC)
against USDC on 1-minute on-chain prices, with $1,000 of paper money.
Long only, no leverage, no shorts. Nothing is traded for real.

## Strategy

Buy the bounce off a rolling low, but only when the window is deeply
oversold. A full round trip costs ~26 bps (4 bps fee + 2 bps slippage +
~7 bps price impact each way), so the bot trades rarely and only where a
bounce has room to pay for itself.

- **Entry:** the close has bounced 30 bps above the rolling 60-bar low AND
  the close is still 200 bps below the window's first close (deeply
  oversold). Buy the bounce, never chase a top and never catch a knife
  that has not turned yet. Full cash (capped by `max_weight_bps`).
- **Exit (whole position):** take-profit 120 bps over cost, or a trailing
  stop 90 bps below the peak value since entry (safety net for a sharp
  reversal).
- After a full exit, wait 120 bars before a new entry. Never trade while
  warming up. `max_slippage_bps = 100` on every order.

## Dev-window result (official local grader, `--driver process`)

- **Net PnL +7.84 USDC** on the published 24 h dev window (1,440 bars),
  8 trades, 50% win rate, max drawdown 1.52%, guardrails met.
  At 2x fees: +4.63 USDC. Reproduced byte for byte.
- The dev window falls ~5% then rallies off its low. The plain breakout
  bot from the previous race instance loses on it (-4.10 USDC); the
  dip-buy entry is what turns this window positive. The dev gate needs
  net PnL > 0.

## Layout

- `main.ts` — the bot (Node 22, `agent-fun/bars-replay/v1`).
- `vendor/makefun-bars.ts` — the kit's bars SDK, byte-identical copy.

## Run

Grade locally with the competition kit:

```
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
```

The kit is `https://make.fun/c/btc-race-24h-20261113-2314/kit`.
