# Birr Rewards — Telegram Mini App

Watch ads, complete tasks, refer friends → earn real Birr, withdraw via Telebirr or a Birr wallet address.

## Stack

| Layer     | Tech                                            | Deploy  |
|-----------|--------------------------------------------------|---------|
| Frontend  | HTML / vanilla JS / Tailwind (CDN)               | Vercel  |
| Backend   | Python, FastAPI, aiosqlite                       | Railway |
| Bot       | aiogram (separate process from the API)          | Railway |
| Database  | SQLite (file-based, via Railway volume)          | Railway |
| Ads       | Adsgram SDK (rewarded video)                     | —       |

## Project structure

```
birr-tma/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entrypoint, CORS, router registration
│   │   ├── bot.py           # aiogram bot — /start + Mini App launch button (run as its own process)
│   │   ├── auth.py          # Telegram initData HMAC validation + user upsert
│   │   ├── config.py        # env-driven settings
│   │   ├── database.py      # aiosqlite schema + connection helper
│   │   ├── models.py        # pydantic request/response schemas
│   │   └── routers/
│   │       ├── users.py     # /api/user/* — sync, daily check-in, transaction log
│   │       ├── ads.py       # /api/ads/*  — Adsgram claim + server postback + status
│   │       ├── tasks.py     # /api/tasks/* — list + complete custom tasks
│   │       ├── wallet.py    # /api/wallet/* — withdrawal request + history
│   │       ├── referral.py  # /api/referral/* — stats
│   │       └── admin.py     # /api/admin/* — overview stats, live settings, withdrawals, users, tasks, broadcast
│   ├── requirements.txt
│   ├── .env.example
│   ├── Procfile
│   └── railway.json
└── frontend/
    ├── index.html            # user app shell: top bar, 4 views, bottom nav
    ├── admin.html            # admin dashboard shell: key-gated login, 6 tabs
    ├── css/
    │   ├── style.css         # dark Web3 glassmorphism theme (shared)
    │   └── admin.css         # admin-only components: stat grid, tabs, tables, toggles
    ├── js/
    │   ├── api.js            # user-app fetch wrapper, sends X-Telegram-Init-Data header
    │   ├── adsgram.js        # Adsgram SDK wrapper
    │   ├── views.js          # HTML renderers for Home / Earn / Wallet / Invite
    │   ├── app.js             # user-app routing, state, event delegation
    │   └── admin.js          # admin dashboard: auth, API wrapper, all 6 tab views
    └── vercel.json
```

## Database schema

- **users** — telegram_id (PK), balance, total_earned, streak_count, last_checkin_date, referred_by, telebirr_number, is_banned
- **transactions** — immutable ledger; every balance change (ad_reward, task_reward, referral_commission, referral_bonus, checkin, withdrawal, admin_adjust) writes one row here, so the balance is always auditable/reconstructable
- **tasks** — admin-configurable custom tasks (title, url, reward, task_type)
- **user_tasks** — completion record per user/task (UNIQUE constraint prevents double-claiming)
- **withdrawals** — amount, method, payout_id, network, status (pending/approved/rejected)
- **ad_events** — one row per credited ad view; UNIQUE(reward_event) blocks double-crediting the same ad view, and it's queried for daily-limit + cooldown checks
- **referrals** — referrer_id → referred_id edges + running total_commission

Full DDL is in `backend/app/database.py`.

## Security notes

1. **initData validation** (`auth.py`): every request re-derives the HMAC using your bot token per Telegram's official algorithm and rejects stale (`auth_date` older than 24h) or tampered payloads. Nothing about the user is ever trusted from the frontend alone.
2. **Ad reward integrity**: `ad_events.reward_event` has a UNIQUE constraint, so the same Adsgram view can never be credited twice — whether reported by the client or Adsgram's server postback. A daily limit + cooldown (both configurable via env vars) throttle abuse.
3. **Withdrawal funds are reserved immediately**: the amount is deducted from `balance` the moment a withdrawal request is submitted (not on approval), so a user can't submit multiple withdrawals against the same balance while the first is pending. If an admin rejects it, the amount is refunded.
4. **Admin routes** are gated by a shared `X-Admin-Key` header (see `.env.example` → `ADMIN_API_KEY`). Fine for a small internal team; swap for real per-admin auth if you open this up to more people.

## Admin dashboard (`frontend/admin.html`)

A separate, key-gated control panel — same dark glassmorphism look as the user app — covering everything you can tune without redeploying:

| Tab | Controls |
|-----|----------|
| **Overview** | Total users, active today, total user balance, total paid out, pending withdrawals (count + amount), ads watched, referrals |
| **Withdrawals** | Filter by status, approve or reject pending requests (rejecting auto-refunds the user) |
| **Users** | Search by ID/username/name, ban or unban, manually adjust a user's balance (credit or debit, logged as an `admin_adjust` transaction) |
| **Tasks** | Create custom tasks, enable/disable, delete |
| **Settings** | Ads on/off + Adsgram block ID + reward/limit/cooldown, referral commission % + signup bonus, min withdrawal + amount tiers, daily check-in on/off + 7-day streak reward schedule, support username, maintenance mode + message |
| **Broadcast** | Send a text message to every non-banned user via the bot |

All of these read/write the new `settings` table (see `database.py` → `get_settings()` / `DEFAULT_SETTINGS`), which every user-facing endpoint now reads live — so changing "Reward per Ad" in the dashboard takes effect on the next ad watched, with zero redeploy. `config.py`'s env vars are only the first-boot seed values.

**Access it** at `https://<your-vercel-domain>/admin.html`, enter the `ADMIN_API_KEY` you set in Railway. The key is stored in the browser's `localStorage` after a successful login — treat that browser as trusted, or log out (top-right) when done. Update `API_BASE` at the top of `frontend/js/admin.js` the same way you did in `js/api.js`.

## Setup

### 1. Backend (Railway)

```bash
cd backend
cp .env.example .env      # fill in BOT_TOKEN, ALLOWED_ORIGINS, ADSGRAM_*, etc.
pip install -r requirements.txt
uvicorn app.main:app --reload   # local dev
```

Deploy to Railway:
1. Push this repo, create a new Railway project, point it at `backend/`.
2. Add all variables from `.env.example` under Railway → Variables.
3. Railway auto-detects `railway.json` / `Procfile` and runs `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
4. Add a **second** Railway service (same repo, same folder) with start command `python -m app.bot` to run the Telegram bot independently of the API — so a bot crash/restart never takes the withdrawal/ad endpoints down.
5. Attach a Railway **volume** mounted at the backend's working directory so `app_data.db` (SQLite) persists across deploys.

### 2. Frontend (Vercel)

```bash
cd frontend
# edit js/api.js  -> API_BASE = "https://<your-railway-backend>.up.railway.app"
# edit js/adsgram.js -> ADSGRAM_BLOCK_ID = "<your Adsgram block id>"
```
Deploy the `frontend/` folder as a static site on Vercel (no build step needed).

### 3. Telegram

1. Message @BotFather → `/newapp` → attach your Vercel URL as the Mini App.
2. In `backend/app/bot.py`, set `MINI_APP_URL` to `https://t.me/<bot_username>/<mini_app_short_name>`.
3. In Adsgram's dashboard, create a block for your bot and set the **Postback URL** to
   `https://<your-backend>.up.railway.app/api/ads/postback` if you want server-to-server verification (recommended) — otherwise the client-reported `/api/ads/claim` path (already wired into the frontend) works out of the box.

## API endpoints

| Method | Path                          | Purpose |
|--------|-------------------------------|---------|
| GET    | `/api/user/sync`              | Fetch/create user, return dashboard snapshot |
| POST   | `/api/user/checkin`           | Claim today's streak reward |
| GET    | `/api/user/transactions`      | Recent transaction ledger |
| GET    | `/api/ads/status`             | Ads watched today / limit / cooldown |
| POST   | `/api/ads/claim`              | Client-reported ad reward (validated + rate-limited) |
| GET    | `/api/ads/postback`           | Server-to-server Adsgram postback (signed) |
| GET    | `/api/tasks`                  | List active tasks + completion state |
| POST   | `/api/tasks/complete`         | Mark a task complete, credit reward |
| GET    | `/api/wallet/config`          | Min withdrawal + amount tiers |
| POST   | `/api/wallet/withdraw`        | Submit a withdrawal request |
| GET    | `/api/wallet/withdrawals`     | User's withdrawal history |
| GET    | `/api/referral/stats`         | Referral link, count, commission earned |
| GET/PATCH/POST/DELETE | `/api/admin/*` | Stats overview, live settings, withdrawals list/approve/reject, users list/ban/adjust-balance, tasks CRUD, broadcast (all require `X-Admin-Key`) |

## Tuning the economy

All reward amounts, limits, and thresholds live in `backend/app/config.py` (env-overridable): `AD_REWARD_Birr`, `AD_DAILY_LIMIT`, `AD_COOLDOWN_SECONDS`, `REFERRAL_COMMISSION_PERCENT`, `REFERRAL_SIGNUP_BONUS`, `STREAK_REWARDS` (7-day escalating array), `MIN_WITHDRAWAL_Birr`, `WITHDRAWAL_TIERS`.
