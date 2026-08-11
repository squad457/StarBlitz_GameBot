/**
 * Admin dashboard controller. Single file: API wrapper, view renderers, event wiring.
 * Auth: an admin key is stored in localStorage and sent as X-Admin-Key on every request.
 */
const API_BASE = "https://starblitzgamebot-production.up.railway.app";

let adminKey = localStorage.getItem("admin_key") || "";

async function adminApi(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data?.detail || `Request failed (${res.status})`);
  return data;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className =
    `fixed left-1/2 -translate-x-1/2 bottom-8 z-50 toast-visible glass-card px-5 py-3 text-sm font-medium ` +
    (type === "error" ? "text-red-400" : "text-neon");
  setTimeout(() => { toast.className = "fixed left-1/2 -translate-x-1/2 bottom-8 z-50 hidden"; }, 2500);
}

function fmtUsd(n) { return `$${Number(n).toFixed(4)}`; }
function fmtDate(s) { return s ? new Date(s + "Z").toLocaleString() : "—"; }

// ---------- Auth ----------
async function tryLogin(key) {
  adminKey = key;
  try {
    await adminApi("/api/admin/stats"); // any admin route validates the key
    localStorage.setItem("admin_key", key);
    document.getElementById("login-gate").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    document.getElementById("login-error").classList.add("hidden");
    switchTab("overview");
  } catch (err) {
    document.getElementById("login-error").classList.remove("hidden");
  }
}

document.getElementById("btn-login").addEventListener("click", () => {
  const key = document.getElementById("input-admin-key").value.trim();
  if (key) tryLogin(key);
});
document.getElementById("input-admin-key").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-login").click();
});
document.getElementById("btn-logout").addEventListener("click", () => {
  localStorage.removeItem("admin_key");
  adminKey = "";
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("login-gate").classList.remove("hidden");
});

// ---------- Tabs ----------
let activeTab = "overview";

document.getElementById("admin-nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll("#admin-nav button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  renderTab(tab);
}

async function renderTab(tab) {
  const body = document.getElementById("admin-body");
  body.innerHTML = `<div class="skeleton h-24 w-full mt-3"></div><div class="skeleton h-24 w-full mt-3"></div>`;
  try {
    if (tab === "overview") await renderOverview(body);
    else if (tab === "withdrawals") await renderWithdrawals(body);
    else if (tab === "users") await renderUsers(body);
    else if (tab === "tasks") await renderTasks(body);
    else if (tab === "games") await renderGamesAdmin(body);
    else if (tab === "settings") await renderSettings(body);
    else if (tab === "broadcast") await renderBroadcast(body);
  } catch (err) {
    body.innerHTML = `<p class="text-sm text-red-400 text-center py-8">${err.message}</p>`;
  }
}

// ---------- Overview ----------
async function renderOverview(body) {
  const s = await adminApi("/api/admin/stats");
  body.innerHTML = `
    <div class="stat-grid mt-2">
      <div class="glass-card stat-card"><p class="v">${s.total_users}</p><p class="l">Total Users</p></div>
      <div class="glass-card stat-card"><p class="v">${s.active_today}</p><p class="l">Active Today</p></div>
      <div class="glass-card stat-card"><p class="v text-neon">${fmtUsd(s.total_user_balance)}</p><p class="l">Total User Balance</p></div>
      <div class="glass-card stat-card"><p class="v">${fmtUsd(s.total_paid_out)}</p><p class="l">Total Paid Out</p></div>
      <div class="glass-card stat-card"><p class="v">${s.pending_withdrawals}</p><p class="l">Pending Withdrawals</p></div>
      <div class="glass-card stat-card"><p class="v">${fmtUsd(s.pending_withdrawal_amount)}</p><p class="l">Pending Amount</p></div>
      <div class="glass-card stat-card"><p class="v">${s.total_ads_watched}</p><p class="l">Ads Watched</p></div>
      <div class="glass-card stat-card"><p class="v">${s.total_referrals}</p><p class="l">Total Referrals</p></div>
      <div class="glass-card stat-card"><p class="v">${s.total_spins}</p><p class="l">Spins Played</p></div>
      <div class="glass-card stat-card"><p class="v">${fmtUsd(s.total_spin_payout)}</p><p class="l">Spin Payout</p></div>
      <div class="glass-card stat-card"><p class="v">${s.total_scratches}</p><p class="l">Scratches Played</p></div>
      <div class="glass-card stat-card"><p class="v">${fmtUsd(s.total_scratch_payout)}</p><p class="l">Scratch Payout</p></div>
    </div>
    ${s.banned_users > 0 ? `<p class="text-xs text-red-400 mt-3">${s.banned_users} banned user${s.banned_users === 1 ? "" : "s"}</p>` : ""}
  `;
}

// ---------- Withdrawals ----------
async function renderWithdrawals(body) {
  const items = await adminApi("/api/admin/withdrawals");
  body.innerHTML = `
    <div class="flex gap-2 mt-2 mb-3" id="wd-filter">
      <button data-status="" class="btn-xs ghost active-filter">All</button>
      <button data-status="pending" class="btn-xs ghost">Pending</button>
      <button data-status="approved" class="btn-xs ghost">Approved</button>
      <button data-status="rejected" class="btn-xs ghost">Rejected</button>
    </div>
    <div class="glass-card p-4" id="wd-list">${renderWithdrawalRows(items)}</div>
  `;
  document.getElementById("wd-filter").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#wd-filter button").forEach(b => b.classList.remove("active-filter"));
    btn.classList.add("active-filter");
    const status = btn.dataset.status;
    const filtered = status ? await adminApi(`/api/admin/withdrawals?status=${status}`) : await adminApi("/api/admin/withdrawals");
    document.getElementById("wd-list").innerHTML = renderWithdrawalRows(filtered);
  });
}

function renderWithdrawalRows(items) {
  if (!items.length) return `<p class="text-sm text-gray-500 text-center py-6">No withdrawals found.</p>`;
  return items.map(w => `
    <div class="admin-row">
      <div class="main">
        <p class="title">$${w.amount.toFixed(2)} · ${w.first_name || "User"} ${w.username ? "@" + w.username : ""}</p>
        <p class="sub">${w.payout_id} ${w.network ? `(${w.network})` : ""} · ${fmtDate(w.requested_at)}</p>
      </div>
      ${w.status === "pending" ? `
        <div class="flex gap-1.5 shrink-0">
          <button class="btn-xs approve" data-wd-approve="${w.id}">Approve</button>
          <button class="btn-xs reject" data-wd-reject="${w.id}">Reject</button>
        </div>
      ` : `<span class="badge ${w.status}">${w.status}</span>`}
    </div>
  `).join("");
}

// ---------- Users ----------
async function renderUsers(body) {
  const items = await adminApi("/api/admin/users");
  body.innerHTML = `
    <div class="mt-2 mb-3">
      <input id="user-search" type="text" placeholder="Search by ID, username, or name…"
        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-neon/50" />
    </div>
    <div class="glass-card p-4" id="user-list">${renderUserRows(items)}</div>
  `;
  let debounce;
  document.getElementById("user-search").addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const results = await adminApi(`/api/admin/users?search=${encodeURIComponent(e.target.value)}`);
      document.getElementById("user-list").innerHTML = renderUserRows(results);
    }, 300);
  });
}

function renderUserRows(items) {
  if (!items.length) return `<p class="text-sm text-gray-500 text-center py-6">No users found.</p>`;
  return items.map(u => `
    <div class="admin-row">
      <div class="main">
        <p class="title">${u.first_name || "User"} ${u.username ? "@" + u.username : ""} <span class="text-gray-500 font-normal">#${u.telegram_id}</span></p>
        <p class="sub">${fmtUsd(u.balance)} balance · ${fmtUsd(u.total_earned)} earned · streak ${u.streak_count}</p>
      </div>
      <div class="flex gap-1.5 shrink-0 items-center">
        ${u.is_banned ? `<span class="badge banned">banned</span>` : ""}
        <button class="btn-xs ghost" data-adjust-balance="${u.telegram_id}">Adjust</button>
        <button class="btn-xs ${u.is_banned ? "approve" : "reject"}" data-toggle-ban="${u.telegram_id}" data-currently-banned="${u.is_banned}">
          ${u.is_banned ? "Unban" : "Ban"}
        </button>
      </div>
    </div>
  `).join("");
}

// ---------- Tasks ----------
async function renderTasks(body) {
  const items = await adminApi("/api/admin/tasks");
  body.innerHTML = `
    <div class="glass-card p-5 mt-2">
      <h3 class="font-display font-semibold mb-3 text-sm">Create New Task</h3>
      <div class="admin-field"><label>Title</label><input id="task-title" type="text" placeholder="Join our channel" /></div>
      <div class="admin-field"><label>Description</label><input id="task-desc" type="text" placeholder="Short description" /></div>
      <div class="admin-field"><label>URL</label><input id="task-url" type="text" placeholder="https://t.me/..." /></div>
      <div class="admin-field"><label>Reward (USDT)</label><input id="task-reward" type="number" step="0.001" value="0.01" /></div>
      <div class="admin-field">
        <label>Type</label>
        <select id="task-type">
          <option value="link">Link</option>
          <option value="telegram_join">Telegram Join</option>
        </select>
      </div>
      <button id="btn-create-task" class="w-full btn-primary py-3 text-sm">+ Create Task</button>
    </div>
    <h3 class="admin-sect">All Tasks</h3>
    <div class="glass-card p-4" id="task-list">${renderTaskRows(items)}</div>
  `;
}

function renderTaskRows(items) {
  if (!items.length) return `<p class="text-sm text-gray-500 text-center py-6">No tasks yet.</p>`;
  return items.map(t => `
    <div class="admin-row">
      <div class="main">
        <p class="title">${t.title} <span class="badge ${t.is_active ? "active" : "inactive"}">${t.is_active ? "active" : "off"}</span></p>
        <p class="sub">+${t.reward.toFixed(3)} USDT · ${t.task_type}</p>
      </div>
      <div class="flex gap-1.5 shrink-0">
        <button class="btn-xs ghost" data-toggle-task="${t.id}">${t.is_active ? "Disable" : "Enable"}</button>
        <button class="btn-xs reject" data-delete-task="${t.id}">Delete</button>
      </div>
    </div>
  `).join("");
}

// ---------- Settings ----------
async function renderSettings(body) {
  const s = await adminApi("/api/admin/settings");
  body.innerHTML = `
    <h3 class="admin-sect mt-2">Ads (Adsgram)</h3>
    <div class="glass-card p-5">
      ${toggleRow("set-ads-enabled", "Ads Enabled", "Turn rewarded ads on/off app-wide", s.ads_enabled)}
      <div class="admin-field"><label>Adsgram Block ID</label><input id="set-block-id" type="text" value="${s.adsgram_block_id}" /></div>
      <div class="admin-field"><label>Reward per Ad (USDT)</label><input id="set-ad-reward" type="number" step="0.0001" value="${s.ad_reward_usdt}" /></div>
      <div class="admin-field"><label>Daily Limit per User</label><input id="set-ad-limit" type="number" value="${s.ad_daily_limit}" /></div>
      <div class="admin-field"><label>Cooldown Between Ads (seconds)</label><input id="set-ad-cooldown" type="number" value="${s.ad_cooldown_seconds}" /></div>
      ${toggleRow("set-adsgram-debug", "Debug / Test Mode", "⚠️ Leave OFF in production — Adsgram never counts debug views or fires your Reward URL for them. This is a common cause of an account showing 0 real conversions.", s.adsgram_debug)}
      <p class="text-xs text-gray-500 mt-2">Set your Adsgram block's <b>Postback / Reward URL</b> to:<br><code class="text-[11px] break-all">https://your-backend/api/ads/p?userid=[userId]</code><br>No signature needed — that's the only macro Adsgram actually sends.</p>
    </div>

    <h3 class="admin-sect">Referrals</h3>
    <div class="glass-card p-5">
      <div class="admin-field"><label>Commission %</label><input id="set-ref-commission" type="number" step="0.1" value="${s.referral_commission_percent}" /></div>
      <div class="admin-field"><label>Signup Bonus (USDT)</label><input id="set-ref-bonus" type="number" step="0.001" value="${s.referral_signup_bonus}" /></div>
      <div class="admin-field"><label>Referral Fixed Reward (USDT)</label><input id="set-ref-fixed" type="number" step="0.001" value="${s.referral_fixed_reward}" /></div>
    </div>

    <h3 class="admin-sect">Withdrawals</h3>
    <div class="glass-card p-5">
      <div class="admin-field"><label>Minimum Withdrawal (USDT)</label><input id="set-min-wd" type="number" step="1" value="${s.min_withdrawal_usdt}" /></div>
      <div class="admin-field"><label>Amount Tiers (comma-separated)</label><input id="set-tiers" type="text" value="${s.withdrawal_tiers.join(",")}" /></div>
    </div>

    <h3 class="admin-sect">Daily Check-in</h3>
    <div class="glass-card p-5">
      ${toggleRow("set-checkin-enabled", "Daily Check-in Enabled", "", s.daily_checkin_enabled)}
      <div class="admin-field"><label>7-Day Streak Rewards (comma-separated, USDT)</label><input id="set-streak" type="text" value="${s.streak_rewards.join(",")}" /></div>
    </div>

    <h3 class="admin-sect">General</h3>
    <div class="glass-card p-5">
      <div class="admin-field"><label>Support Telegram Username (no @)</label><input id="set-support" type="text" value="${s.support_username}" /></div>
      ${toggleRow("set-maintenance", "Maintenance Mode", "Blocks all non-admin users from the app", s.maintenance_mode)}
      <div class="admin-field"><label>Maintenance Message</label><textarea id="set-maint-msg" rows="2">${s.maintenance_message}</textarea></div>
    </div>

    <button id="btn-save-settings" class="w-full btn-primary py-3.5 text-sm mt-2 mb-4">💾 Save All Settings</button>
  `;
}

function toggleRow(id, label, sub, checked) {
  return `
    <div class="toggle-row">
      <div>
        <p class="toggle-label">${label}</p>
        ${sub ? `<p class="toggle-sub">${sub}</p>` : ""}
      </div>
      <label class="switch">
        <input type="checkbox" id="${id}" ${checked ? "checked" : ""} />
        <span class="slider"></span>
      </label>
    </div>
  `;
}

async function saveAllSettings() {
  const payload = {
    ads_enabled: document.getElementById("set-ads-enabled").checked,
    adsgram_block_id: document.getElementById("set-block-id").value.trim(),
    ad_reward_usdt: parseFloat(document.getElementById("set-ad-reward").value),
    ad_daily_limit: parseInt(document.getElementById("set-ad-limit").value, 10),
    ad_cooldown_seconds: parseInt(document.getElementById("set-ad-cooldown").value, 10),
    adsgram_debug: document.getElementById("set-adsgram-debug").checked,
    referral_commission_percent: parseFloat(document.getElementById("set-ref-commission").value),
    referral_signup_bonus: parseFloat(document.getElementById("set-ref-bonus").value),
    referral_fixed_reward: parseFloat(document.getElementById("set-ref-fixed").value),
    min_withdrawal_usdt: parseFloat(document.getElementById("set-min-wd").value),
    withdrawal_tiers: document.getElementById("set-tiers").value.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n)),
    daily_checkin_enabled: document.getElementById("set-checkin-enabled").checked,
    streak_rewards: document.getElementById("set-streak").value.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n)),
    support_username: document.getElementById("set-support").value.trim().replace(/^@/, ""),
    maintenance_mode: document.getElementById("set-maintenance").checked,
    maintenance_message: document.getElementById("set-maint-msg").value.trim(),
  };
  try {
    await adminApi("/api/admin/settings", { method: "POST", body: payload });
    showToast("Settings saved!");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------- Games (Spin & Scratch) ----------
async function renderGamesAdmin(body) {
  const s = await adminApi("/api/admin/settings");
  body.innerHTML = `
    <h3 class="admin-sect mt-2">🎡 Spin Wheel</h3>
    <div class="glass-card p-5">
      ${toggleRow("set-spin-enabled", "Spin Wheel Enabled", "", s.spin_enabled)}
      <div class="admin-field"><label>Reward Range — Min (USDT)</label><input id="set-spin-min" type="number" step="0.0001" value="${s.spin_min_reward}" /></div>
      <div class="admin-field"><label>Reward Range — Max (USDT)</label><input id="set-spin-max" type="number" step="0.0001" value="${s.spin_max_reward}" /></div>
      <p class="text-xs text-gray-500 -mt-1 mb-3">The wheel can only land on — and pay — a segment number inside this range. Segments outside the range still show on the wheel but can never actually be won.</p>
      <div class="admin-field"><label>Wheel Segment Numbers (comma-separated, 6-8+ slots)</label><input id="set-spin-segments" type="text" value="${s.spin_segments.join(",")}" /></div>
      <div class="admin-field"><label>Free Spins per Day</label><input id="set-spin-free" type="number" value="${s.spin_daily_free_spins}" /></div>
      <div class="admin-field"><label>Max Spins per Day (0 = unlimited via ads)</label><input id="set-spin-max-daily" type="number" value="${s.spin_max_daily_spins}" /></div>
      ${toggleRow("set-spin-require-ad", "Require Ad After Free Spins", "User must watch a rewarded ad to spin again once free spins are used", s.spin_require_ad_after_free)}
      <div class="admin-field"><label>Cooldown Between Spins (seconds)</label><input id="set-spin-cooldown" type="number" value="${s.spin_cooldown_seconds}" /></div>
    </div>

    <h3 class="admin-sect">🎫 Scratch Card</h3>
    <div class="glass-card p-5">
      ${toggleRow("set-scratch-enabled", "Scratch Card Enabled", "", s.scratch_enabled)}
      <div class="admin-field"><label>Payout Range — Min (USDT)</label><input id="set-scratch-min" type="number" step="0.0001" value="${s.scratch_min_reward}" /></div>
      <div class="admin-field"><label>Payout Range — Max (USDT)</label><input id="set-scratch-max" type="number" step="0.0001" value="${s.scratch_max_reward}" /></div>
      <div class="admin-field"><label>Free Plays per Day</label><input id="set-scratch-free" type="number" value="${s.scratch_daily_free}" /></div>
      <div class="admin-field"><label>Max Plays per Day (0 = unlimited via ads)</label><input id="set-scratch-max-daily" type="number" value="${s.scratch_max_daily}" /></div>
      <div class="admin-field"><label>Hidden Diamonds per Card (out of 9 — players always get exactly 3 taps; more diamonds = easier to hit some)</label><input id="set-scratch-winning-cells" type="number" min="1" max="9" value="${s.scratch_winning_cells}" /></div>
      ${toggleRow("set-scratch-require-ad", "Require Ad After Free Plays", "", s.scratch_require_ad_after_free)}
    </div>

    <button id="btn-save-games" class="w-full btn-primary py-3.5 text-sm mt-2 mb-4">💾 Save Game Settings</button>
  `;

  // Note: no live-swap on blur here — that used to compare a freshly typed
  // value against whatever stale value still sat in the other field and
  // silently rewrite it before the admin had finished editing. Any min/max
  // range correction now happens once, at Save time, using only the values
  // actually submitted together (see saveGameSettings below).
}

async function saveGameSettings() {
  const payload = {
    spin_enabled: document.getElementById("set-spin-enabled").checked,
    spin_min_reward: parseFloat(document.getElementById("set-spin-min").value),
    spin_max_reward: parseFloat(document.getElementById("set-spin-max").value),
    spin_segments: document.getElementById("set-spin-segments").value.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n)),
    spin_daily_free_spins: parseInt(document.getElementById("set-spin-free").value, 10),
    spin_max_daily_spins: parseInt(document.getElementById("set-spin-max-daily").value, 10),
    spin_require_ad_after_free: document.getElementById("set-spin-require-ad").checked,
    spin_cooldown_seconds: parseInt(document.getElementById("set-spin-cooldown").value, 10),

    scratch_enabled: document.getElementById("set-scratch-enabled").checked,
    scratch_min_reward: parseFloat(document.getElementById("set-scratch-min").value),
    scratch_max_reward: parseFloat(document.getElementById("set-scratch-max").value),
    scratch_daily_free: parseInt(document.getElementById("set-scratch-free").value, 10),
    scratch_max_daily: parseInt(document.getElementById("set-scratch-max-daily").value, 10),
    scratch_winning_cells: parseInt(document.getElementById("set-scratch-winning-cells").value, 10),
    scratch_require_ad_after_free: document.getElementById("set-scratch-require-ad").checked,
  };
  if (payload.spin_segments.length < 2) { showToast("Add at least a couple of wheel segments", "error"); return; }
  if (payload.scratch_winning_cells < 1 || payload.scratch_winning_cells > 9) { showToast("Winning cells must be between 1 and 9", "error"); return; }
  // Correct a reversed range using only the two values being submitted
  // together right now — never mixed with whatever was previously stored.
  if (payload.spin_min_reward > payload.spin_max_reward) {
    [payload.spin_min_reward, payload.spin_max_reward] = [payload.spin_max_reward, payload.spin_min_reward];
  }
  if (payload.scratch_min_reward > payload.scratch_max_reward) {
    [payload.scratch_min_reward, payload.scratch_max_reward] = [payload.scratch_max_reward, payload.scratch_min_reward];
  }
  try {
    const saved = await adminApi("/api/admin/settings", { method: "POST", body: payload });
    const wasSwapped = saved.spin_min_reward !== payload.spin_min_reward
      || saved.scratch_min_reward !== payload.scratch_min_reward;
    // The backend auto-fits spin_segments to the range when fewer than 2
    // distinct rewards would otherwise be eligible (see update_settings) —
    // reflect that back into the field so the admin sees what actually got
    // saved instead of the numbers they typed.
    const segmentsAutoFit = saved.spin_segments.join(",") !== payload.spin_segments.join(",");
    showToast(
      segmentsAutoFit
        ? "Saved — wheel segments were auto-adjusted to fit the new reward range."
        : wasSwapped
          ? "Saved — a reversed min/max range was auto-corrected."
          : "Game settings saved!"
    );
    await renderGamesAdmin(document.getElementById("admin-body"));
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------- Broadcast ----------
async function renderBroadcast(body) {
  body.innerHTML = `
    <div class="glass-card p-5 mt-2">
      <h3 class="font-display font-semibold mb-3 text-sm">Broadcast to All Users</h3>
      <textarea id="broadcast-text" rows="6" placeholder="Type your announcement…"
        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm mb-4 outline-none focus:border-neon/50"></textarea>
      <button id="btn-send-broadcast" class="w-full btn-primary py-3.5 text-sm">📢 Send to All Users</button>
      <p class="text-xs text-gray-500 mt-2">Sends immediately — banned users are skipped.</p>
    </div>
  `;
}

// ---------- Event delegation ----------
document.addEventListener("click", async (e) => {
  // Withdrawal approve/reject
  const wdApprove = e.target.closest("[data-wd-approve]");
  if (wdApprove) {
    try {
      await adminApi(`/api/admin/withdrawals/${wdApprove.dataset.wdApprove}`, { method: "PATCH", body: { status: "approved" } });
      showToast("Withdrawal approved");
      renderTab("withdrawals");
    } catch (err) { showToast(err.message, "error"); }
    return;
  }
  const wdReject = e.target.closest("[data-wd-reject]");
  if (wdReject) {
    const note = prompt("Reason for rejection (optional):") || null;
    try {
      await adminApi(`/api/admin/withdrawals/${wdReject.dataset.wdReject}`, { method: "PATCH", body: { status: "rejected", admin_note: note } });
      showToast("Withdrawal rejected");
      renderTab("withdrawals");
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // User ban toggle
  const banBtn = e.target.closest("[data-toggle-ban]");
  if (banBtn) {
    const telegramId = Number(banBtn.dataset.toggleBan);
    const currentlyBanned = banBtn.dataset.currentlyBanned === "true";
    try {
      await adminApi("/api/admin/users/ban", { method: "POST", body: { telegram_id: telegramId, is_banned: !currentlyBanned } });
      showToast(currentlyBanned ? "User unbanned" : "User banned");
      renderTab("users");
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Adjust balance
  const adjustBtn = e.target.closest("[data-adjust-balance]");
  if (adjustBtn) {
    const telegramId = Number(adjustBtn.dataset.adjustBalance);
    const raw = prompt("Adjustment amount (use negative to deduct):");
    if (raw === null) return;
    const amount = parseFloat(raw);
    if (isNaN(amount)) { showToast("Enter a valid number", "error"); return; }
    try {
      await adminApi("/api/admin/users/adjust-balance", { method: "POST", body: { telegram_id: telegramId, amount } });
      showToast("Balance updated");
      renderTab("users");
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Task create
  if (e.target.closest("#btn-create-task")) {
    const title = document.getElementById("task-title").value.trim();
    const description = document.getElementById("task-desc").value.trim();
    const url = document.getElementById("task-url").value.trim();
    const reward = parseFloat(document.getElementById("task-reward").value);
    const task_type = document.getElementById("task-type").value;
    if (!title || !url || isNaN(reward)) { showToast("Fill in title, URL, and reward", "error"); return; }
    try {
      await adminApi("/api/admin/tasks", { method: "POST", body: { title, description, url, reward, task_type } });
      showToast("Task created");
      renderTab("tasks");
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Task toggle
  const toggleTaskBtn = e.target.closest("[data-toggle-task]");
  if (toggleTaskBtn) {
    try {
      await adminApi(`/api/admin/tasks/${toggleTaskBtn.dataset.toggleTask}/toggle`, { method: "PATCH" });
      renderTab("tasks");
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Task delete
  const deleteTaskBtn = e.target.closest("[data-delete-task]");
  if (deleteTaskBtn) {
    if (!confirm("Delete this task permanently?")) return;
    try {
      await adminApi(`/api/admin/tasks/${deleteTaskBtn.dataset.deleteTask}`, { method: "DELETE" });
      showToast("Task deleted");
      renderTab("tasks");
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Save settings
  if (e.target.closest("#btn-save-settings")) {
    saveAllSettings();
    return;
  }

  // Save game settings
  if (e.target.closest("#btn-save-games")) {
    saveGameSettings();
    return;
  }

  // Send broadcast
  if (e.target.closest("#btn-send-broadcast")) {
    const text = document.getElementById("broadcast-text").value.trim();
    if (!text) { showToast("Enter a message first", "error"); return; }
    if (!confirm("Send this message to ALL users?")) return;
    const btn = document.getElementById("btn-send-broadcast");
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      const res = await adminApi("/api/admin/broadcast", { method: "POST", body: { text } });
      showToast(`Sent to ${res.sent}/${res.total} users`);
      document.getElementById("broadcast-text").value = "";
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "📢 Send to All Users";
    }
    return;
  }
});

// ---------- Boot ----------
(function init() {
  if (adminKey) tryLogin(adminKey);
})();
