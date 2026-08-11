/**
 * Thin fetch wrapper. Every request carries the raw Telegram initData string
 * in a header so the backend can verify it (see backend/app/auth.py).
 *
 * Set API_BASE to your Railway backend URL after deployment.
 *
 * PREVIEW_MODE (see mock-data.js) is true when there's no Telegram context —
 * in that case every call below is answered locally instead of hitting the
 * real backend with an unauthenticatable request.
 */
const API_BASE = "https://starblitzgamebot-production.up.railway.app";

const tg = window.Telegram?.WebApp;
const initData = tg?.initData || "";

async function apiRequest(path, opts = {}, retries = 3, delay = 1200) {
  if (typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE) {
    return mockApiRequest(path, opts);
  }
  const { method = "GET", body } = opts;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      let data = null;
      try { data = await res.json(); } catch (_) { /* no body */ }

      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, delay * attempt));
          continue;
        }
        const message = data?.detail || `Request failed (${res.status})`;
        throw new Error(message);
      }
      return data;
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delay * attempt));
        continue;
      }
      throw new Error("Connecting to server... please wait a moment.");
    }
  }
}

const Api = {
  syncUser: () => apiRequest("/api/user/sync"),
  checkin: () => apiRequest("/api/user/checkin", { method: "POST" }),
  transactions: () => apiRequest("/api/user/transactions"),

  adStatus: () => apiRequest("/api/ads/status"),
  claimAdReward: (reward_event) =>
    apiRequest("/api/ads/claim", { method: "POST", body: { reward_event } }),

  listTasks: () => apiRequest("/api/tasks"),
  completeTask: (task_id) =>
    apiRequest("/api/tasks/complete", { method: "POST", body: { task_id } }),

  walletConfig: () => apiRequest("/api/wallet/config"),
  withdraw: (payload) => apiRequest("/api/wallet/withdraw", { method: "POST", body: payload }),
  withdrawalHistory: () => apiRequest("/api/wallet/withdrawals"),

  referralStats: () => apiRequest("/api/referral/stats"),

  spinStatus: () => apiRequest("/api/games/spin/status"),
  spinPlay: (ad_reward_event) =>
    apiRequest("/api/games/spin/play", { method: "POST", body: { ad_reward_event } }),

  scratchStatus: () => apiRequest("/api/games/scratch/status"),
  scratchPlay: (ad_reward_event, cells) =>
    apiRequest("/api/games/scratch/play", { method: "POST", body: { ad_reward_event, cells } }),
};
