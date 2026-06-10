# APEX Autobot Agent — Operations Manual

This file defines how the APEX autobot agent operates, what it does on every run, and how to diagnose failures. Every automated task the bot performs is described here.

---

## Architecture Overview

```
Fly.io apex-cron-bot (always-on scheduler)
  └─► POST /api/cron/scan    every 15 min  → signal generation + trade execution
  └─► POST /api/cron/monitor every  5 min  → TP/SL checks + P&L updates

Vercel apex-web-kohl.vercel.app (Next.js App Router)
  ├─ /api/cron/scan       — scan 13 pairs × 6 timeframes, generate signals, auto-execute
  ├─ /api/cron/monitor    — price-check all open trades, close at TP/SL, reset daily P&L
  ├─ /api/cron/congressional — scrape US congressional stock disclosures (weekdays 14:00 UTC)
  ├─ /api/auth/login      — re-authenticate returning users (API key matching)
  ├─ /api/auth/setup      — onboard new users (creates account + validates exchange)
  ├─ /api/auth/logout     — destroy session
  ├─ /api/balance         — fetch live exchange balance
  ├─ /api/prices          — fetch live ticker prices for open positions
  ├─ /api/signals         — list signals for current user
  ├─ /api/positions       — list open/closed trades
  ├─ /api/trade           — manual trade open/close
  ├─ /api/settings        — read/update user settings
  └─ /api/chart/live      — OHLCV + indicators + trade markers for TradingView chart

Vercel KV (Upstash Redis)
  Keys: user:{id}, users (set), trade:{id}, trades:{userId} (list),
        open_trades:{userId} (set), bot_state:{userId}, signals:{userId} (list),
        signal_sources, external_signals

Fly.io kucoin-proxy-apex.fly.dev (Singapore)
  — Reverse proxy to api.kucoin.com, bypasses US geo-block (error 400302)
```

---

## Cron Task 1: `/api/cron/scan` — Signal Generation + Auto-Execute

**Runs:** Every 15 minutes via Fly.io apex-cron-bot
**Auth:** `Authorization: Bearer $CRON_SECRET`

### What it does (in order):

1. **Load all users** from Vercel KV (`getAllUsers`)
2. **Create exchange client** using the first user's credentials (public OHLCV data only)
3. **For each of 13 pairs** (`BTC/USDT ETH/USDT SOL/USDT LTC/USDT BNB/USDT ADA/USDT MATIC/USDT LINK/USDT AVAX/USDT ATOM/USDT DOT/USDT ARB/USDT OP/USDT`):
   - Fetch 500 candles on 6 timeframes: `5m 15m 1h 4h 1d 1w`
   - Run enabled **external signal sources** (funding rate, whale transactions, open interest, social sentiment)
   - Run **technical signal generation** for every user via `generateSignal()`
4. **Signal scoring** (0–100 points):
   - Trend: EMA9 > EMA21 > EMA50 > EMA200 alignment (30 pts)
   - Momentum: RSI 55–80 bullish / MACD cross (30 pts)
   - Volume: above 20-candle average (20 pts)
   - Timeframe alignment: 3+ of 4 timeframes agree (20 pts)
   - Tiers: `ULTRA_HIGH` ≥ 80 · `HIGH` ≥ 65 · `MODERATE` ≥ 50
5. **Save signal** to KV if score ≥ 70
6. **Auto-execute** (if `user.execMode === 'auto'` AND tier is `HIGH` or `ULTRA_HIGH`):
   - Check risk gates (`checkCanTrade`): halted flag, consecutive losses ≥ 4, daily loss > 5%, weekly loss > 10%, max positions reached, duplicate pair
   - Fetch real-time ticker price
   - Calculate position size using Kelly-scaled risk: `riskAmount / stopDistance`
     - Consecutive losses reduce size: 2 losses → 75%, 3 losses → 50%
   - Set ATR-based levels: SL = entry ± 1.5×ATR, TP1 = ±2.25×ATR, TP2 = ±3.75×ATR, TP3 = ±6×ATR
   - Place market order on exchange via CCXT
   - Save trade to KV, mark signal executed, increment `totalTrades`

### Expected response:
```json
{ "success": true, "scanned": 13, "signalsFound": N, "executedCount": N, "externalSignalsAdded": N, "usersScanned": N }
```

---

## Cron Task 2: `/api/cron/monitor` — TP/SL Monitor + Daily Reset

**Runs:** Every 5 minutes via Fly.io apex-cron-bot
**Auth:** `Authorization: Bearer $CRON_SECRET`

### What it does (in order):

1. **Daily P&L reset**: For each user, if `lastDailyResetAt` ≠ today UTC date → set `dailyPnl = 0`
2. **Load all open trades** across all users (`getAllOpenTrades`)
3. **Group trades by user**
4. **For each user's open trades**:
   - Fetch current price for each unique pair via exchange ticker
   - **Check TP/SL conditions**:
     - Long: close if `price >= tp3` (tp3) / `>= tp2` (tp2) / `>= tp1` (tp1) / `<= sl` (sl)
     - Short: close if `price <= tp3` / `<= tp2` / `<= tp1` / `>= sl`
   - On close: calculate P&L → update trade `status: 'closed'`, `exitPrice`, `pnlUsd`, `pnlPct`, `closedAt`
   - Update `botState`: `dailyPnl`, `weeklyPnl`, `consecutiveLosses`, `winCount`, `lossCount`, `lastTradeAt`

### Expected response:
```json
{ "success": true, "message": "Monitored N trades", "closedCount": N }
```

---

## Cron Task 3: `/api/cron/congressional` — Congress Trade Mirror

**Runs:** 14:00 UTC weekdays only
**Auth:** `Authorization: Bearer $CRON_SECRET`

Scrapes US House/Senate financial disclosure filings, scores politicians by committee power + trade history, and mirrors high-conviction trades via Alpaca (paper or live).

---

## Signal Generation Logic (`lib/signals.ts`)

### `generateSignal(userId, pair, candlesByTF)`

Analyzes 4 timeframes: `15m 1h 4h 1d`

For each timeframe via `analyzeTimeframe()`:
- EMA alignment: price vs EMA9 vs EMA21 vs EMA50 vs EMA200
- RSI(14): bullish zone 55–80, bearish 20–45
- MACD(12,26,9): line above/below signal line
- Returns `direction: long | short | neutral` + scores

**Requires 3/4 timeframes aligned** to generate a signal (or 2/2 if fewer available).
Uses 1h candles as primary for price levels. ATR(14) for stop/target placement.

---

## Risk Management (`lib/risk.ts`)

| Rule | Limit |
|------|-------|
| Max daily loss | 5% of balance |
| Max weekly loss | 10% of balance |
| Max consecutive losses | 4 (then halt) |
| Position scaling on losses | 2 losses → 75% size · 3 losses → 50% size |
| Max concurrent positions | User-configurable (default 5) |
| Duplicate pair | Blocked — one position per pair |

---

## Exchange Support (`lib/exchange.ts`)

| Exchange | Notes |
|----------|-------|
| Binance | Default, spot + futures |
| Bybit | Spot + futures |
| OKX | Requires passphrase |
| Kraken | Spot only |
| KuCoin | Requires passphrase · US geo-blocked → routed through `kucoin-proxy-apex.fly.dev` (Singapore) |

All API keys are AES-256-GCM encrypted at rest in Vercel KV. Encryption key derived from `SESSION_SECRET`.

---

## Authentication Flow

### New user (onboard):
`/onboard` → POST `/api/auth/setup` → validates exchange balance → saves encrypted user to KV → sets iron-session cookie (30-day TTL) → `/dashboard`

### Returning user (login):
`/login` → POST `/api/auth/login` → decrypts all users' API keys, finds match → restores session → `/dashboard`

### Logout:
Navbar logout → POST `/api/auth/logout` → destroys session → `/login`

---

## Storage Schema (Vercel KV / Upstash Redis)

```
user:{uuid}           → JSON User object (encrypted API keys)
users                 → SET of all user UUIDs
trade:{uuid}          → JSON Trade object
trades:{userId}       → LIST of trade UUIDs (newest first)
open_trades:{userId}  → SET of open trade UUIDs
bot_state:{userId}    → JSON BotState (dailyPnl, winCount, consecutiveLosses, etc.)
signals:{userId}      → LIST of signal UUIDs (newest first, capped at 100)
signal:{uuid}         → JSON Signal object
signal_sources        → JSON array of SignalSource configs
external_signals      → LIST of external signal UUIDs
```

---

## Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | AES-256 key for API key encryption + iron-session |
| `KV_REST_API_URL` | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Upstash Redis token |
| `CRON_SECRET` | Bearer token — Fly.io cron runner uses this to auth against Vercel |
| `WHALE_ALERT_KEY` | (optional) Whale Alert API for on-chain signals |
| `ENCRYPTION_KEY` | (optional, falls back to SESSION_SECRET hash) |

---

## Diagnosing Issues

### Bot not trading
1. Check cron runner logs: `fly logs --app apex-cron-bot`
2. Verify response is `200` not `401` (CRON_SECRET mismatch)
3. Check signal response: `signalsFound` should be > 0 if market conditions align
4. Check user `execMode` is `auto` in settings
5. Check `botState.consecutiveLosses` — if ≥ 4, trading is halted. Reset in /settings.
6. Check `botState.dailyPnl` — if loss > 5% of balance, halted until next UTC day

### Dashboard not updating
- Live prices poll `/api/prices` every 10 seconds
- Open positions poll every 30 seconds via `fetchAll`
- Check browser console for 401/500 errors (session may have expired)

### KuCoin 400302 geo-block
- Verify `kucoin-proxy-apex.fly.dev` is running: `curl https://kucoin-proxy-apex.fly.dev/api/v1/status`
- Expected: `{"code":"200000","data":{"status":"open"}}`
- If down: `fly deploy --app kucoin-proxy-apex`

### "User not found" error
- Vercel KV might be unreachable or cold-starting
- Public API endpoints (chart, prices) use unauthenticated CCXT — no KV needed
- If session cookie is valid but user missing from KV: user must re-onboard

### Cron 401 Unauthorized
- CRON_SECRET on Fly.io doesn't match Vercel env var
- Fix: `fly secrets set CRON_SECRET=<value> --app apex-cron-bot`
- Redeploy Vercel: `vercel --prod`

---

## Fly.io Services

| App | Region | Purpose |
|-----|--------|---------|
| `apex-cron-bot` | Frankfurt (fra) | Cron scheduler — calls Vercel API every 5/15 min |
| `kucoin-proxy-apex` | Singapore (sin) | KuCoin API reverse proxy for non-US exit IP |

---

## Key File Map

```
app/api/cron/scan/route.ts        Signal scan + auto-execute
app/api/cron/monitor/route.ts     TP/SL monitor + daily P&L reset
app/api/cron/congressional/route.ts  Congress trade mirroring
app/api/auth/setup/route.ts       New user onboarding
app/api/auth/login/route.ts       Returning user login
app/api/auth/logout/route.ts      Session destroy
app/api/balance/route.ts          Live exchange balance
app/api/prices/route.ts           Live ticker prices (open positions)
app/api/chart/live/route.ts       OHLCV + indicators for chart
lib/signals.ts                    EMA/RSI/MACD/ATR + signal scoring
lib/risk.ts                       Position sizing + risk gates
lib/exchange.ts                   CCXT wrapper + KuCoin proxy routing
lib/storage.ts                    Vercel KV read/write helpers
lib/crypto.ts                     AES-256-GCM encrypt/decrypt
lib/signal-providers.ts           External: funding rates, whale, OI, sentiment
workers/apex-cron/index.js        Fly.io cron runner (calls Vercel endpoints)
workers/kucoin-proxy-fly/index.js Fly.io KuCoin reverse proxy
```
