/**
 * Each render_X(state) function returns an HTML string for its tab.
 * `state` is the shared app state object maintained in app.js.
 */

function fmtUsd(n) {
  return `$${Number(n).toFixed(4)}`;
}

function timeAgo(iso) {
  const d = new Date(iso + "Z");
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

const TXN_META = {
  ad_reward:           { icon: "▶", label: "Watched an ad",     cls: "bg-mint/10 border-mint/40 text-mint" },
  checkin:             { icon: "🔥", label: "Daily check-in",    cls: "bg-violet/10 border-violet/40 text-violet" },
  task_reward:         { icon: "✓", label: "Completed a task",  cls: "bg-mint/10 border-mint/40 text-mint" },
  referral_commission: { icon: "👥", label: "Referral commission", cls: "bg-magenta/10 border-magenta/40 text-magenta" },
  referral_bonus:      { icon: "🎁", label: "Referral bonus",    cls: "bg-magenta/10 border-magenta/40 text-magenta" },
  signup_bonus:        { icon: "🎉", label: "Welcome bonus",     cls: "bg-magenta/10 border-magenta/40 text-magenta" },
  spin_reward:         { icon: "🎡", label: "Spin wheel win",    cls: "bg-violet/10 border-violet/40 text-violet" },
  scratch_reward:      { icon: "🎫", label: "Scratch card win",  cls: "bg-mint/10 border-mint/40 text-mint" },
  withdrawal:          { icon: "↑", label: "Withdrawal",        cls: "bg-white/5 border-white/15 text-gray-300" },
  admin_adjust:        { icon: "•", label: "Balance adjustment", cls: "bg-white/5 border-white/15 text-gray-300" },
};

// In-game currency is a display-only view of the same real balance — Coins
// and XP shown here are not a separate ledger, just a game-friendly framing.
// The exact USDT figure always lives in the Wallet tab (see renderWallet),
// never hidden, just not the headline on Home.
const COIN_RATE = 1000; // 1 USDT = 1000 Coins, disclosed in the Wallet tab
const XP_PER_LEVEL = 0.05; // USDT of lifetime earnings per level

function fmtCoins(usdt) {
  return Math.round(Number(usdt) * COIN_RATE).toLocaleString();
}

function levelInfo(totalEarned) {
  const raw = Number(totalEarned) / XP_PER_LEVEL;
  const level = Math.floor(raw) + 1;
  const progressPct = Math.round((raw % 1) * 100);
  return { level, progressPct };
}

// ---------- HOME ----------
function renderHome(state) {
  const { user, transactions } = state;
  if (!user) return skeletonBlock();

  const streakDots = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const cls = day < ((user.streak_count % 7) || 7) || (day <= user.streak_count && user.checked_in_today)
      ? "done"
      : (day === ((user.streak_count % 7) || 7) && !user.checked_in_today ? "today" : "");
    return `<div class="streak-dot ${cls}">${day}</div>`;
  }).join("");

  const { level, progressPct } = levelInfo(user.total_earned);

  const tasksCompleted = (state.tasks || []).filter(t => t.completed).length;
  const achievements = [
    { done: user.streak_count >= 3, icon: "🔥", label: "3-day streak", detail: `${Math.min(user.streak_count, 3)}/3 days` },
    { done: user.streak_count >= 7, icon: "🏅", label: "7-day streak", detail: `${Math.min(user.streak_count, 7)}/7 days` },
    { done: tasksCompleted >= 1, icon: "✓", label: "First task complete", detail: tasksCompleted >= 1 ? "Unlocked" : "Complete a task" },
    { done: level >= 5, icon: "⭐", label: "Reach Level 5", detail: `Level ${Math.min(level, 5)}/5` },
  ];
  const achievementRows = achievements.map(a => `
    <div class="row-item">
      <div class="w-9 h-9 rounded-lg border flex items-center justify-center text-sm shrink-0 ${a.done ? "bg-mint/10 border-mint/40 text-mint" : "bg-white/5 border-white/15 text-gray-500"}">${a.icon}</div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate ${a.done ? "" : "text-gray-400"}">${a.label}</p>
        <p class="text-xs text-gray-500">${a.detail}</p>
      </div>
      ${a.done ? '<span class="text-mint text-xs font-semibold">✓</span>' : ""}
    </div>`).join("");

  return `
    <!-- Level + Coins card (gamified framing of the same real balance;
         the actual USDT amount is always visible in Wallet) -->
    <div class="card-hero p-6 mt-2">
      <div class="text-center">
        <span class="pill-chip mb-3">⭐ Level ${level}</span>
        <p class="text-[11px] uppercase tracking-[0.14em] text-gray-500 mt-3">Your Coins</p>
        <h1 class="font-display text-4xl font-bold grad-text mt-1 font-mono">🪙 ${fmtCoins(user.balance)}</h1>
        <div class="flex items-center gap-2 mt-3 px-6">
          <div class="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-violet to-magenta rounded-full" style="width:${progressPct}%"></div>
          </div>
          <span class="text-[10px] text-gray-500 font-mono shrink-0">${progressPct}% to Lvl ${level + 1}</span>
        </div>
      </div>

      <div class="border-t border-white/10 mt-5 pt-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-display font-semibold text-sm">Daily Streak</h3>
          <span class="text-xs text-violet font-mono font-medium">${user.streak_count} day${user.streak_count === 1 ? "" : "s"}</span>
        </div>
        <div class="flex justify-between gap-1.5 mb-4">${streakDots}</div>
        <button id="btn-checkin" class="w-full btn-primary py-3 text-sm ${user.checked_in_today ? "opacity-40 pointer-events-none" : "pulse"}">
          ${user.checked_in_today ? "✓ Checked in today" : "🎁 Claim Daily Boost"}
        </button>
      </div>
    </div>

    <!-- Quick actions -->
    <div class="grid grid-cols-3 gap-2.5 mt-4">
      <button data-goto="earn" class="card p-3.5 text-center">
        <div class="w-8 h-8 mx-auto rounded-lg bg-mint/10 border border-mint/40 flex items-center justify-center text-mint text-sm mb-2">⚡</div>
        <p class="font-semibold text-[11.5px]">Refill Energy</p>
      </button>
      <button data-goto="invite" class="card p-3.5 text-center">
        <div class="w-8 h-8 mx-auto rounded-lg bg-violet/10 border border-violet/40 flex items-center justify-center text-violet text-sm mb-2">+</div>
        <p class="font-semibold text-[11.5px]">Invite</p>
      </button>
      <button id="btn-support" class="card p-3.5 text-center">
        <div class="w-8 h-8 mx-auto rounded-lg bg-magenta/10 border border-magenta/40 flex items-center justify-center text-magenta text-sm mb-2">?</div>
        <p class="font-semibold text-[11.5px]">Support</p>
      </button>
    </div>

    <!-- Quests / Achievements (progress-based, not a payout ledger) -->
    <h3 class="font-display font-semibold mt-5 mb-2.5 text-sm uppercase tracking-[0.1em] text-gray-500">Achievements</h3>
    <div class="card px-4">${achievementRows}</div>
  `;
}

// ---------- EARN ----------
function renderEarn(state) {
  const { adStatus, tasks } = state;

  const adSection = adStatus
    ? `
      <div class="card-feature p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-3 min-w-0 pr-2">
            <div class="w-9 h-9 rounded-lg bg-mint/10 border border-mint/40 flex items-center justify-center text-mint text-sm shrink-0">⚡</div>
            <div class="min-w-0">
              <p class="font-semibold text-xs tracking-wide">Refill Energy</p>
              <p class="text-[11px] text-violet mt-0.5 font-mono">${fmtUsd(adStatus.reward_per_ad)} <span class="text-gray-500 font-body">per refill</span></p>
            </div>
          </div>
          <button id="btn-watch-ad" class="btn-task shrink-0 ${adStatus.watched_today >= adStatus.daily_limit ? "btn-secondary opacity-40 pointer-events-none" : "btn-primary"} px-3.5 py-2 text-xs font-semibold">
            ${adStatus.watched_today >= adStatus.daily_limit ? "✓ Done" : "▶ Watch"}
          </button>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-violet to-magenta rounded-full" style="width:${Math.min(100, (adStatus.watched_today / adStatus.daily_limit) * 100)}%"></div>
          </div>
          <span class="text-[11px] text-gray-500 font-mono shrink-0">${adStatus.watched_today}/${adStatus.daily_limit}</span>
        </div>
      </div>
    `
    : skeletonBlock();

  const taskList = tasks
    ? `<div class="card px-4">` + tasks.map(t => `
        <div class="row-item">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm truncate">${t.title}</p>
            <p class="text-xs text-gray-500 truncate">${t.description || ""}</p>
          </div>
          <button data-task-id="${t.id}" data-task-url="${t.url}"
            class="btn-task shrink-0 font-mono ${t.completed ? "btn-secondary opacity-40 pointer-events-none" : "btn-primary"} px-4 py-2 text-xs font-semibold">
            ${t.completed ? "✓ Done" : `+${t.reward.toFixed(3)}`}
          </button>
        </div>
      `).join("") + `</div>`
    : skeletonBlock();

  return `
    <div class="mt-1">${adSection}</div>
    <h3 class="font-display font-semibold mt-5 mb-2.5 text-sm uppercase tracking-[0.1em] text-gray-500">Tasks</h3>
    ${tasks && tasks.length === 0 ? emptyState("No tasks right now — check back soon.") : taskList}
  `;
}

// ---------- GAMES ----------
function renderGames(state) {
  return `
    <div class="mt-1">
      ${renderSpinWheel(state.spinStatus)}
      ${renderScratchCard(state.scratchStatus)}
    </div>
  `;
}

// ---------- WALLET ----------
function renderWallet(state) {
  const { user, walletConfig, withdrawals } = state;
  if (!user || !walletConfig) return skeletonBlock();

  const totalWithdrawn = (withdrawals || [])
    .filter(w => w.status === "approved")
    .reduce((sum, w) => sum + w.amount, 0);

  const tierButtons = walletConfig.tiers.map(t => `
    <button data-amount="${t}" class="tier-btn card py-3 text-sm font-semibold text-center">$${t}</button>
  `).join("");

  const historyRows = withdrawals
    ? withdrawals.map(w => `
        <div class="row-item">
          <div>
            <p class="text-sm font-medium font-mono">$${w.amount.toFixed(2)}</p>
            <p class="text-xs text-gray-500">${new Date(w.requested_at + "Z").toLocaleDateString()}</p>
          </div>
          ${statusBadge(w.status)}
        </div>
      `).join("")
    : "";

  const selectedMethod = state.selectedMethod || 'binance_pay';
  const isBinance = selectedMethod === 'binance_pay';

  return `
    <div class="card-hero p-5 mt-2 text-center">
      <p class="text-[11px] uppercase tracking-[0.14em] text-gray-500">Available to Withdraw</p>
      <h2 class="font-display text-3xl font-bold mt-1 font-mono grad-text">${fmtUsd(user.balance)}</h2>
      <p class="text-[10.5px] text-gray-500 mt-1">🪙 ${fmtCoins(user.balance)} Coins shown on Home — same balance, ${COIN_RATE.toLocaleString()} Coins = 1 USDT</p>
      <div class="grid grid-cols-2 gap-2.5 mt-4 pt-4 border-t border-white/10">
        <div>
          <p class="font-mono text-sm font-semibold">${fmtUsd(user.total_earned)}</p>
          <p class="text-[10.5px] text-gray-500 mt-0.5">Total earned</p>
        </div>
        <div>
          <p class="font-mono text-sm font-semibold">$${totalWithdrawn.toFixed(2)}</p>
          <p class="text-[10.5px] text-gray-500 mt-0.5">Total withdrawn</p>
        </div>
      </div>
    </div>

    <div class="card p-5 mt-4">
      <h3 class="font-display font-semibold mb-3">Request Withdrawal</h3>

      <label class="text-xs text-gray-400 mb-1.5 block">Quick Select Amount</label>
      <div class="grid grid-cols-3 gap-2 mb-3" id="tier-buttons">${tierButtons}</div>

      <label class="text-xs text-gray-400 mb-1.5 block">Or Enter Amount (USDT)</label>
      <input id="input-withdraw-amount" type="number" step="0.01" placeholder="e.g. 15.50"
        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm mb-3 outline-none focus:border-violet/50 font-mono" />

      <label class="text-xs text-gray-400 mb-1.5 block">Select Payout Method</label>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <button data-method="binance_pay" class="method-btn card py-2.5 text-xs font-semibold text-center ${isBinance ? 'border-violet text-violet bg-violet/10' : 'text-gray-400'}">Binance Pay ID</button>
        <button data-method="usdt_address" class="method-btn card py-2.5 text-xs font-semibold text-center ${!isBinance ? 'border-violet text-violet bg-violet/10' : 'text-gray-400'}">USDT (BEP20)</button>
      </div>

      <label class="text-xs text-gray-400 mb-1.5 block" id="payout-label">${isBinance ? 'Enter Binance Pay ID' : 'Enter USDT (BEP20) Wallet Address'}</label>
      <input id="input-payout-id" type="text" placeholder="${isBinance ? 'e.g. 123456789' : 'e.g. 0x...'}"
        value="${user.binance_pay_id || ""}"
        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm mb-4 outline-none focus:border-violet/50 font-mono" />

      <button id="btn-withdraw" class="w-full btn-primary py-3.5 text-sm">Submit Withdrawal</button>
      <p class="text-xs text-gray-500 mt-2 text-center">Minimum withdrawal: <span class="font-mono">$${walletConfig.min_withdrawal}</span></p>
    </div>

    <div class="card p-5 mt-4">
      <h3 class="font-display font-semibold mb-1">Payout History</h3>
      ${withdrawals && withdrawals.length === 0 ? emptyState("No withdrawals yet.") : `<div>${historyRows}</div>`}
    </div>

    ${walletConfig.support_username ? `
    <button id="btn-support" class="w-full card p-4 mt-4 flex items-center gap-3 text-left">
      <div class="w-9 h-9 rounded-lg bg-magenta/10 border border-magenta/40 flex items-center justify-center text-magenta text-sm shrink-0">?</div>
      <div class="min-w-0">
        <p class="text-sm font-semibold">Need help with a withdrawal?</p>
        <p class="text-xs text-gray-500">Contact @${walletConfig.support_username.replace('@','')}</p>
      </div>
    </button>` : ""}
  `;
}

function statusBadge(status) {
  const map = { pending: "pending", approved: "approved", rejected: "rejected" };
  return `<span class="stamp-badge ${map[status] || "pending"}">${status}</span>`;
}

// ---------- INVITE ----------
function renderInvite(state) {
  const { referral } = state;
  if (!referral) return skeletonBlock();

  const recentRows = referral.recent_referrals.length
    ? `<div>` + referral.recent_referrals.map(r => `
        <div class="row-item">
          <div class="w-8 h-8 rounded-lg bg-magenta/10 border border-magenta/40 flex items-center justify-center text-magenta text-xs shrink-0 font-semibold">${(r.first_name || "U")[0].toUpperCase()}</div>
          <p class="text-sm truncate flex-1">${r.first_name || "User"} ${r.username ? "@" + r.username : ""}</p>
          <p class="text-xs text-violet font-mono shrink-0">+${fmtUsd(r.total_commission)}</p>
        </div>
      `).join("") + `</div>`
    : emptyState("No referrals yet — share your link!");

  return `
    <div class="card-hero p-6 mt-2 text-center">
      <span class="pill-chip mb-3">Referral Program</span>
      <h3 class="font-display font-semibold text-lg mt-3 mb-1">Invite &amp; earn <span class="font-mono">${fmtUsd(referral.referral_fixed_reward)}</span> + ${referral.commission_percent}%</h3>
      <p class="text-sm text-gray-400">Get <span class="font-mono">${fmtUsd(referral.referral_fixed_reward)}</span> per invite, plus ${referral.commission_percent}% commission on their activity.</p>
    </div>

    <div class="grid grid-cols-2 gap-3 mt-4">
      <div class="card p-4 text-center">
        <p class="font-display text-2xl font-bold font-mono">${referral.total_referrals}</p>
        <p class="text-xs text-gray-500 mt-0.5">Referrals</p>
      </div>
      <div class="card p-4 text-center">
        <p class="font-display text-2xl font-bold text-violet font-mono">${fmtUsd(referral.total_commission_earned)}</p>
        <p class="text-xs text-gray-500 mt-0.5">Earned</p>
      </div>
    </div>

    <div class="card p-5 mt-4">
      <label class="text-xs text-gray-400 mb-1.5 block">Your Referral Link</label>
      <div class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-3">
        <span id="referral-link-text" class="text-xs text-gray-300 truncate flex-1 font-mono">${referral.referral_link}</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button id="btn-copy-link" class="btn-secondary py-3 text-sm font-medium">Copy Link</button>
        <button id="btn-share-link" class="btn-primary py-3 text-sm font-medium">Share</button>
      </div>
    </div>

    <div class="card p-5 mt-4">
      <h3 class="font-display font-semibold mb-1">Recent Referrals</h3>
      ${recentRows}
    </div>
  `;
}

// ---------- helpers ----------
function skeletonBlock() {
  return `
    <div class="mt-2 space-y-3">
      <div class="skeleton h-28 w-full"></div>
      <div class="skeleton h-20 w-full"></div>
    </div>
  `;
}

function emptyState(text) {
  return `<p class="text-sm text-gray-500 text-center py-6">${text}</p>`;
}
