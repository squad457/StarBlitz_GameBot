/**
 * App bootstrap: tab routing, data fetching, and event delegation.
 * Keeps a single `state` object and re-renders the active tab's HTML on change.
 */
const state = {
  activeTab: "home",
  user: null,
  adStatus: null,
  tasks: null,
  walletConfig: null,
  withdrawals: null,
  referral: null,
  transactions: null,
  spinStatus: null,
  scratchStatus: null,
};

const views = {
  home: () => document.getElementById("view-home"),
  earn: () => document.getElementById("view-earn"),
  games: () => document.getElementById("view-games"),
  wallet: () => document.getElementById("view-wallet"),
  invite: () => document.getElementById("view-invite"),
};

const renderers = { home: renderHome, earn: renderEarn, games: renderGames, wallet: renderWallet, invite: renderInvite };

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className =
    `fixed left-1/2 -translate-x-1/2 bottom-24 z-50 toast-visible card px-5 py-3 text-sm font-medium ` +
    (type === "error" ? "text-red-400" : "text-violet");
  setTimeout(() => { toast.className = "fixed left-1/2 -translate-x-1/2 bottom-24 z-50 hidden"; }, 2500);
}

// Preloads an image before it ever touches the DOM, so the avatar shows up
// fully-formed the instant it appears instead of popping in a beat later
// (which is what let the plain background flash behind it). Bounded by a
// timeout so a slow/broken image can never hang the app.
function preloadImage(src, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    const img = new Image();
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
    setTimeout(() => finish(false), timeoutMs);
  });
}

async function setAvatar(user) {
  const avatarEl = document.getElementById("user-avatar");
  const nameEl = document.getElementById("user-name-label");
  if (!avatarEl) return;

  if (user?.avatar_url) {
    const src = `${API_BASE}${user.avatar_url}`;
    const loaded = await preloadImage(src);
    if (loaded) {
      avatarEl.innerHTML = `<img src="${src}" alt="Profile" />`;
    } else {
      avatarEl.textContent = user.first_name?.[0]?.toUpperCase() || "U";
    }
  } else {
    avatarEl.textContent = user?.first_name?.[0]?.toUpperCase() || "U";
  }

  if (nameEl) nameEl.textContent = user?.first_name || "";
}

function renderActiveTab() {
  const el = views[state.activeTab]();
  el.innerHTML = renderers[state.activeTab](state);
}

function switchTab(tab) {
  state.activeTab = tab;
  Object.entries(views).forEach(([name, getEl]) => getEl().classList.toggle("hidden", name !== tab));
  document.querySelectorAll(".nav-btn").forEach(btn =>
    btn.classList.toggle("active-nav", btn.dataset.tab === tab)
  );
  renderActiveTab();
  loadTabData(tab); // lazy-load data the first time a tab is opened, and refresh balances each visit
}

async function loadTabData(tab) {
  try {
    if (tab === "home") {
      const [user, transactions] = await Promise.all([Api.syncUser(), Api.transactions()]);
      state.user = user;
      state.transactions = transactions.slice(0, 6);
      if (user?.avatar_url) {
        // Preload profile image during initial load so it appears instantly without any delay
        await preloadImage(`${API_BASE}${user.avatar_url}`, 2500);
      }
    } else if (tab === "earn") {
      const [adStatus, tasks] = await Promise.all([Api.adStatus(), Api.listTasks()]);
      state.adStatus = adStatus;
      state.tasks = tasks;
    } else if (tab === "games") {
      const [spinStatus, scratchStatus] = await Promise.all([Api.spinStatus(), Api.scratchStatus()]);
      state.spinStatus = spinStatus;
      state.scratchStatus = scratchStatus;
    } else if (tab === "wallet") {
      const [user, walletConfig, withdrawals] = await Promise.all([
        Api.syncUser(), Api.walletConfig(), Api.withdrawalHistory(),
      ]);
      state.user = user;
      state.walletConfig = walletConfig;
      state.withdrawals = withdrawals;
    } else if (tab === "invite") {
      state.referral = await Api.referralStats();
    }
    const streakEl = document.getElementById("streak-count");
    if (streakEl) streakEl.textContent = state.user?.streak_count ?? 0;
    if (state.user) {
      await setAvatar(state.user);
    }
    renderActiveTab();

    // Hide splash successfully once data is fully ready
    const splash = document.getElementById("splash");
    if (splash) splash.classList.add("hide");
  } catch (err) {
    showToast(err.message, "error");
    // Also hide splash on error after a moment so user isn't stuck forever
    const splash = document.getElementById("splash");
    if (splash) setTimeout(() => splash.classList.add("hide"), 2000);
  }
}

// ---------- Event delegation (handles buttons rendered dynamically) ----------
document.addEventListener("click", async (e) => {
  // Bottom nav + "go to tab" shortcuts
  const navBtn = e.target.closest(".nav-btn");
  if (navBtn) { switchTab(navBtn.dataset.tab); return; }

  const gotoBtn = e.target.closest("[data-goto]");
  if (gotoBtn) { switchTab(gotoBtn.dataset.goto); return; }

  // Daily check-in
  if (e.target.closest("#btn-checkin")) {
    try {
      const res = await Api.checkin();
      showToast(`+${res.reward.toFixed(4)} Birr claimed!`);
      state.user = await Api.syncUser();
      renderActiveTab();
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Watch ad
  if (e.target.closest("#btn-watch-ad")) {
    try {
      const rewardEvent = await showRewardedAd();
      const res = await Api.claimAdReward(rewardEvent);
      showToast(`+${res.reward.toFixed(4)} Birr earned!`);
      state.adStatus = await Api.adStatus();
      state.user = await Api.syncUser();
      renderActiveTab();
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Spin the wheel
  if (e.target.closest("#btn-spin-wheel")) {
    handleSpinClick();
    return;
  }

  // Play the scratch card
  if (e.target.closest("#btn-scratch-play")) {
    handleScratchClick();
    return;
  }

  // Tap an individual scratch card to reveal it
  const scratchCell = e.target.closest(".scratch-cell.armed");
  if (scratchCell) {
    handleScratchCellTap(Number(scratchCell.dataset.cell));
    return;
  }

  // Complete a custom task: open the link, then mark complete
  const taskBtn = e.target.closest(".btn-task");
  if (taskBtn) {
    const taskId = Number(taskBtn.dataset.taskId);
    const url = taskBtn.dataset.taskUrl;
    if (url) tg?.openLink ? tg.openLink(url) : window.open(url, "_blank");
    try {
      const res = await Api.completeTask(taskId);
      showToast(`+${res.reward.toFixed(4)} Birr earned!`);
      state.tasks = await Api.listTasks();
      renderActiveTab();
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Select payout method
  const methodBtn = e.target.closest(".method-btn");
  if (methodBtn) {
    const method = methodBtn.dataset.method;
    state.selectedMethod = method;
    document.querySelectorAll(".method-btn").forEach(b => {
      const active = b === methodBtn;
      b.className = `method-btn card py-2.5 text-xs font-semibold text-center ${active ? 'border-violet text-violet bg-violet/10' : 'text-gray-400'}`;
    });
    const label = document.getElementById("payout-label");
    const input = document.getElementById("input-payout-id");
    if (label && input) {
      if (method === 'telebirr') {
        label.textContent = "Enter Telebirr Phone Number";
        input.placeholder = "e.g. 123456789";
      } else {
        label.textContent = "Enter CBE Birr Account Number";
        input.placeholder = "e.g. 0x...";
      }
    }
    return;
  }

  // Withdrawal tier selection
  const tierBtn = e.target.closest(".tier-btn");
  if (tierBtn) {
    document.querySelectorAll(".tier-btn").forEach(b => b.classList.remove("card-feature"));
    tierBtn.classList.add("card-feature");
    tierBtn.dataset.selected = "true";
    document.querySelectorAll(".tier-btn").forEach(b => { if (b !== tierBtn) delete b.dataset.selected; });
    const amtInput = document.getElementById("input-withdraw-amount");
    if (amtInput) amtInput.value = tierBtn.dataset.amount;
    return;
  }

  // Submit withdrawal
  if (e.target.closest("#btn-withdraw")) {
    const amtInput = document.getElementById("input-withdraw-amount");
    const selectedTier = document.querySelector(".tier-btn[data-selected='true']");
    const amount = parseFloat(amtInput?.value || selectedTier?.dataset?.amount);
    const payoutId = document.getElementById("input-payout-id").value.trim();
    if (!amount || isNaN(amount) || amount <= 0) { showToast("Enter or select a valid withdrawal amount", "error"); return; }
    if (!payoutId) { showToast("Enter your Telebirr phone number or CBE account", "error"); return; }
    if (state.selectedMethod === "telebirr" && !/^(09|07)\d{8}$/.test(payoutId)) {
      showToast("Enter a valid Ethiopian phone number starting with 09 or 07, 10 digits total", "error");
      return;
    }

    try {
      await Api.withdraw({
        amount: amount,
        method: state.selectedMethod || "telebirr",
        payout_id: payoutId,
      });
      showToast("Withdrawal submitted!");
      await loadTabData("wallet");
    } catch (err) { showToast(err.message, "error"); }
    return;
  }

  // Contact support (uses the bot's configured support_username)
  if (e.target.closest("#btn-support")) {
    const handle = state.user?.support_username || state.walletConfig?.support_username;
    if (handle) {
      const url = `https://t.me/${handle.replace("@", "")}`;
      tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, "_blank");
    } else {
      showToast("Support is not configured yet", "error");
    }
    return;
  }

  // Copy / share referral link
  if (e.target.closest("#btn-copy-link")) {
    navigator.clipboard?.writeText(state.referral.referral_link);
    showToast("Link copied!");
    return;
  }
  if (e.target.closest("#btn-share-link")) {
    const url = `https://t.me/share/url?url=${encodeURIComponent(state.referral.referral_link)}&text=${encodeURIComponent("Join me and start earning Ethiopian Birr! 💰")}`;
    tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, "_blank");
    return;
  }
});

// ---------- Boot ----------
(function init() {
  if (typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE) {
    document.body.innerHTML = `
      <div style="background:#0D0B1A; color:#fff; font-family:'Inter', sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; text-align:center; padding:24px;">
        <div style="width:76px; height:76px; border-radius:50%; background:linear-gradient(135deg, rgba(139,92,246,0.15), rgba(34,211,238,0.15)); display:flex; align-items:center; justify-content:center; margin-bottom:20px; border:1px solid rgba(139,92,246,0.3); box-shadow:0 0 25px rgba(139,92,246,0.15);">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="#8B5CF6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.73-.53.36-1.01.54-1.44.53-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.25.38-.51 1.06-.78 4.15-1.8 6.92-2.99 8.31-3.57 3.96-1.66 4.78-1.95 5.32-1.96.12 0 .39.03.56.17.14.12.18.28.2.45-.02.07-.02.13-.04.25z"/></svg>
        </div>
        <h2 style="font-size:22px; font-weight:700; margin-bottom:10px; font-family:'Sora', sans-serif;">Telegram Access Required</h2>
        <p style="color:#9B95B8; margin-bottom:28px; font-size:14px; max-width:340px; line-height:1.6;">This Mini App is designed exclusively for Telegram. Please open our official bot to launch the application safely.</p>
        <a href="https://t.me/StarBlitzGameBot" style="background:linear-gradient(135deg, #8B5CF6, #EC4899); color:#fff; padding:14px 32px; border-radius:14px; text-decoration:none; font-weight:600; font-size:15px; box-shadow:0 10px 25px rgba(139,92,246,0.4); display:inline-flex; align-items:center; gap:8px;">
          <span>Open Bot in Telegram</span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </div>
    `;
    return;
  } else {
    tg?.ready();
    tg?.expand();
    tg?.setHeaderColor?.("#0D0B1A");
    tg?.setBackgroundColor?.("#0D0B1A");
  }

  // Safety net: hide splash quickly after 800ms
  setTimeout(() => document.getElementById("splash")?.classList.add("hide"), 800);

  switchTab("home");
})();
