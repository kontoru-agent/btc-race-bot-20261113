# btc-race-bot-20261113 — Oversold-Bounce Dip Buyer for CBBTC

A bot for the make.fun competition `btc-race-24h-20261113-2314` ("Race a BTC
trading bot live for 24 hours"). It trades Coinbase Wrapped BTC (CBBTC)
against USDC on 1-minute on-chain bars, starting from 1,000 USDC of paper
money, long only, one position at a time.

## What the bot does

On every 1-minute bar the bot looks at the close of CBBTC and decides
whether to buy, sell, or do nothing. It is an oversold-bounce dip buyer:

- It waits for a sharp dip: the current close must sit at least 200 bps
  below the first close of the previous 60 bars.
- It only buys once the price has started to bounce: the current close must
  also be at least 30 bps above the lowest close of those same 60 bars.
- It buys with all of its cash, capped by the weight limit on equity.
- It exits on either a take-profit of 120 bps over the position's cost, or a
  trailing stop of 90 bps below the best value the position has reached
  since entry.
- After a sell it sits out for 120 bars before it may buy again, so a
  falling market cannot be re-bought bar after bar.
- It never trades during the warm-up bars, and it never trades a bar that
  carries no CBBTC close.

The bot is fully deterministic: no clock, no environment, no randomness.
Every decision comes only from the closes seen so far and the account
state, so two runs on the same data produce the same orders.

## Parameters

| Parameter | Value |
| --- | --- |
| Lookback window | 60 bars |
| Bounce threshold | 30 bps above the window low |
| Dip threshold | 200 bps below the window's first close |
| Take-profit | 120 bps over cost |
| Trailing stop | 90 bps below peak value |
| Cooldown after a sell | 120 bars |
| Max slippage | 100 bps |
| Asset | CBBTC, long only |

## Dev-window result (verified locally)

Graded on the competition kit's frozen 24-hour dev window with the official
local grader (`--driver process`):

- Net PnL: **+7.838494 USDC** (return 0.007838494)
- Trades: **8**, win rate **0.500000000**
- Max drawdown: **0.015230602**
- Fees: 3.200131 USDC; net PnL at 2x fees: **+4.634337 USDC**
- Guardrails: **met** (trades ok, symbols ok, drawdown ok)
- The two grading executions reproduced the action log byte for byte.

## File layout

- `main.ts` — the bot. Speaks `agent-fun/bars-replay/v1` through the kit
  SDK, one reply per bar, and holds the whole strategy.
- `vendor/makefun-bars.ts` — the kit's bars SDK shim (copied unchanged from
  the competition kit), which owns the line protocol, the account state, and
  order validation.

## How to grade it locally

From the kit directory:

```
node cli/makefun.mjs grade-local --kit . --bot ../../btc-race-bot-20261113 --driver process
```

Kit: https://make.fun/c/btc-race-24h-20261113-2314/kit
