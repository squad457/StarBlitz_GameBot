/**
 * Preview-mode fallback.
 *
 * When the app is opened outside Telegram (no `Telegram.WebApp.initData` —
 * e.g. a reviewer opening the raw URL in a desktop browser, or a developer
 * working on layout), the real backend can never authenticate the session
 * (it verifies Telegram's HMAC signature server-side — see backend/app/auth.py
 * — and there is no way to fake that from the client, nor should there be).
 *
 * Instead of crashing or showing a blank/gated screen, the app switches to
 * PREVIEW_MODE: every Api.* call below resolves with realistic sample data
 * so the full UI renders, and a visible banner (#preview-banner in index.html)
 * makes it unmistakable that nothing here is a real account or real money.
 * Actions that would normally touch a wallet (withdrawals, ad claims, game
 * plays) are also simulated locally — nothing is sent anywhere.
 */
const PREVIEW_MODE = !(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);

function mockDelay(ms = 220) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mutable in-memory state so preview interactions (check-in, claim, spin,
// scratch, withdraw) feel real within the session without touching a server.
const __mock = {
  user: {
    telegram_id: 0,
    first_name: "Guest",
    username: "preview_user",
    avatar_url: null,
    balance: 0.4215,
    total_earned: 1.882,
    streak_count: 3,
    checked_in_today: false,
    telebirr_number: "",
  },
  transactions: [
    { type: "task_reward", amount: 0.01, created_at: new Date(Date.now() - 3600e3).toISOString().slice(0, 19) },
    { type: "spin_reward", amount: 0.0032, created_at: new Date(Date.now() - 9000e3).toISOString().slice(0, 19) },
    { type: "checkin", amount: 0.002, created_at: new Date(Date.now() - 86400e3).toISOString().slice(0, 19) },
  ],
  tasks: [
    { id: 1, title: "Join our announcement channel", description: "Stay updated", url: "https://t.me/", reward: 5.0, completed: false },
    { id: 2, title: "Follow us on X", description: "Quick follow", url: "https://x.com/", reward: 4.0, completed: true },
  ],
  ad: { reward_per_ad: 5.0, watched_today: 1, daily_limit: 10 },
  wallet: { tiers: [5, 10, 25], min_withdrawal: 5, support_username: "supportbot" },
  withdrawals: [{ amount: 5, status: "approved", requested_at: new Date(Date.now() - 5 * 86400e3).toISOString().slice(0, 19) }],
  referral: {
    referral_link: "https://t.me/TapQuestBot/app?startapp=preview",
    total_referrals: 4,
    total_commission_earned: 0.021,
    referral_fixed_reward: 5.0,
    commission_percent: 5,
    recent_referrals: [{ first_name: "Sam", username: "sam", total_commission: 0.006 }],
  },
  spin: { enabled: true, segments: [0.001, 0.003, 0.34, 0.002, 0.005, 0.001, 0.002, 0.004], min_reward: 0.001, max_reward: 0.005, played_today: 1, free_spins_left: 2, max_daily_spins: 5, max_reached: false, needs_ad: false, cooldown_remaining: 0 },
  scratch: { enabled: true, played_today: 0, free_plays_left: 1, max_daily: 5, max_reached: false, needs_ad: false, taps_allowed: 3, winning_cells_needed: 3 },
};

async function mockApiRequest(path, { method = "GET", body } = {}) {
  await mockDelay();

  if (path === "/api/user/sync") return { ...__mock.user };
  if (path === "/api/user/checkin") {
    if (__mock.user.checked_in_today) throw new Error("Already checked in today");
    __mock.user.checked_in_today = true;
    __mock.user.streak_count += 1;
    const reward = 0.002;
    __mock.user.balance += reward;
    __mock.user.total_earned += reward;
    return { reward, new_balance: __mock.user.balance };
  }
  if (path === "/api/user/transactions") return __mock.transactions;

  if (path === "/api/ads/status") return { ...__mock.ad };
  if (path === "/api/ads/claim") {
    __mock.ad.watched_today += 1;
    __mock.user.balance += __mock.ad.reward_per_ad;
    __mock.user.total_earned += __mock.ad.reward_per_ad;
    return { reward: __mock.ad.reward_per_ad, new_balance: __mock.user.balance };
  }

  if (path === "/api/tasks") return __mock.tasks;
  if (path === "/api/tasks/complete") {
    const task = __mock.tasks.find((t) => t.id === body.task_id);
    if (task && !task.completed) {
      task.completed = true;
      __mock.user.balance += task.reward;
      __mock.user.total_earned += task.reward;
    }
    return { reward: task ? task.reward : 0, new_balance: __mock.user.balance };
  }

  if (path === "/api/wallet/config") return __mock.wallet;
  if (path === "/api/wallet/withdrawals") return __mock.withdrawals;
  if (path === "/api/wallet/withdraw") {
    throw new Error("Withdrawals are disabled in Preview Mode. Open this app via Telegram to withdraw for real.");
  }

  if (path === "/api/referral/stats") return __mock.referral;

  if (path === "/api/games/spin/status") return { ...__mock.spin };
  if (path === "/api/games/spin/play") {
    const idx = Math.floor(Math.random() * __mock.spin.segments.length);
    const reward = __mock.spin.segments[idx];
    __mock.user.balance += reward;
    __mock.user.total_earned += reward;
    return { reward, new_balance: __mock.user.balance, landed_index: idx, segments: __mock.spin.segments };
  }

  if (path === "/api/games/scratch/status") return { ...__mock.scratch };
  if (path === "/api/games/scratch/play") {
    const tapped = body.cells || [];
    const diamonds = new Set();
    while (diamonds.size < 3) diamonds.add(Math.floor(Math.random() * 9));
    const matched = tapped.filter((c) => diamonds.has(c));
    const hits = matched.length;
    const reward = hits === 0 ? 0 : hits === 1 ? 0.001 : hits === 2 ? 0.003 : 0.006;
    if (reward > 0) { __mock.user.balance += reward; __mock.user.total_earned += reward; }
    return { reward, new_balance: __mock.user.balance, tapped_cells: tapped, diamond_cells: [...diamonds].sort(), matched_cells: matched, hits };
  }

  throw new Error(`Preview Mode has no mock for ${path}`);
}
