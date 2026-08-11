/**
 * Spin Wheel + Scratch Card UI. Reward amounts always come from the backend
 * (drawn from the admin's configured range) — everything drawn here (wheel
 * rotation, which segment it visually stops on, scratch reveal) is cosmetic
 * animation built around the server's response, never a source of truth.
 */
// Curated, professional palette — deep violet/indigo family with a single warm
// gold accent segment, echoing recognizable exchange-app wheels (Ethiopian etc.)
// instead of a clashing full rainbow.
const WHEEL_COLORS = ["#7C3AED", "#4C1D95", "#8B5CF6", "#5B21B6", "#6D28D9", "#4338CA", "#9333EA", "#3730A3"];
const WHEEL_ACCENT_COLOR = "#F0B90B"; // single gold "jackpot" slice for visual anchor, Ethiopian-style

let wheelRotation = 0;
let wheelSpinning = false;
let scratchBusy = false;
// A round in progress. The player picks exactly SCRATCH_TAPS_ALLOWED cells
// (their choice, out of 9) *before* the server decides anything — this keeps
// each round genuinely random instead of a predetermined result the UI just
// animates through. `resolved` is filled in only after the server responds
// to the 3rd pick. Null when no round is in progress.
const SCRATCH_TAPS_ALLOWED = 3;
let scratchPending = null; // { adEvent, selected: number[], resolved: {reward, diamondCells:Set, matchedCells:Set, hits} | null }

function fmtUsdG(n) { return `$${Number(n).toFixed(4)}`; }

// ---------- SPIN WHEEL ----------
function renderSpinWheel(spinStatus) {
  if (!spinStatus) return `<div class="skeleton h-72 w-full"></div>`;
  const segments = spinStatus.segments && spinStatus.segments.length ? spinStatus.segments : [0];
  const n = segments.length;
  const slice = 360 / n;

  const gradientStops = segments.map((val, i) => {
    const isJackpot = val === Math.max(...segments);
    const color = isJackpot ? WHEEL_ACCENT_COLOR : WHEEL_COLORS[i % WHEEL_COLORS.length];
    return `${color} ${i * slice}deg ${(i + 1) * slice}deg`;
  }).join(", ");

  const labels = segments.map((val, i) => {
    const angle = i * slice + slice / 2;
    return `<div class="wheel-label" style="transform: rotate(${angle}deg) translateY(-98px) rotate(${-angle}deg);">${fmtUsdG(val)}</div>`;
  }).join("");

  // Thin divider spokes at each segment boundary so slices read as distinct wedges.
  const spokes = segments.map((_, i) =>
    `<div class="wheel-spoke" style="transform: rotate(${i * slice}deg);"></div>`
  ).join("");

  const canPlayFree = spinStatus.free_spins_left > 0;
  const blocked = spinStatus.max_reached || (!canPlayFree && !spinStatus.needs_ad && spinStatus.cooldown_remaining > 0);
  const btnLabel = spinStatus.max_reached
    ? "Come back tomorrow"
    : spinStatus.cooldown_remaining > 0
      ? `Wait ${spinStatus.cooldown_remaining}s…`
      : canPlayFree
        ? `Spin (${spinStatus.free_spins_left} free left)`
        : spinStatus.needs_ad
          ? "▶ Watch Ad to Spin"
          : "Spin";

  return `
    <div class="card-feature p-5 pt-6 mt-2 text-center">
      <span class="pill-chip mb-2.5">🎡 Spin Wheel</span>
      <p class="text-xs text-gray-400 mb-5 px-2">Every spin wins a random Birr reward — good luck!</p>
      <div class="wheel-wrap">
        <div class="wheel-pointer"></div>
        <div id="spin-wheel" class="wheel" style="background: conic-gradient(${gradientStops}); transform: rotate(${wheelRotation}deg);">
          ${spokes}
          ${labels}
        </div>
        <div class="wheel-hub">🎯</div>
      </div>
      <button id="btn-spin-wheel" class="w-full btn-primary py-3.5 text-sm mt-6 ${blocked || wheelSpinning ? "opacity-40 pointer-events-none" : ""}">
        ${wheelSpinning ? "Spinning…" : btnLabel}
      </button>
      <p class="text-[11px] text-gray-500 mt-2">${spinStatus.played_today} played today${spinStatus.max_daily_spins ? ` · max ${spinStatus.max_daily_spins}/day` : ""}</p>
    </div>
  `;
}

async function handleSpinClick() {
  if (wheelSpinning) return;
  const s = state.spinStatus;
  if (!s || s.max_reached) return;

  try {
    let adEvent = null;
    if (s.free_spins_left <= 0 && s.needs_ad) {
      adEvent = await showRewardedAd();
    }
    wheelSpinning = true;
    renderActiveTab();

    const res = await Api.spinPlay(adEvent);

    const segments = res.segments;
    const n = segments.length;
    const slice = 360 / n;
    // The pointer is fixed at the top (0deg). To land the chosen segment there,
    // the wheel's *normalized* rotation must end at (360 - segmentCenterAngle).
    // Rotation is cumulative (never reset to a small absolute value) — always
    // spin forward several full turns from wherever the wheel currently sits,
    // so every spin feels powerful and never looks like a short backward flick.
    const segmentCenterAngle = res.landed_index * slice + slice / 2;
    const desiredNormalized = (360 - segmentCenterAngle + 360) % 360;
    const currentNormalized = ((wheelRotation % 360) + 360) % 360;
    let forwardDelta = desiredNormalized - currentNormalized;
    if (forwardDelta <= 0) forwardDelta += 360;
    const EXTRA_FULL_TURNS = 7;
    wheelRotation += forwardDelta + 360 * EXTRA_FULL_TURNS;

    const wheelEl = document.getElementById("spin-wheel");
    if (wheelEl) {
      wheelEl.style.transition = "transform 3.6s cubic-bezier(0.11, 0.82, 0.1, 1)";
      wheelEl.style.transform = `rotate(${wheelRotation}deg)`;
    }

    setTimeout(async () => {
      wheelSpinning = false;
      showToast(`🎉 You won ${res.reward.toFixed(4)} Birr!`);
      state.user = await Api.syncUser();
      state.spinStatus = await Api.spinStatus();
      renderActiveTab();
    }, 3700);
  } catch (err) {
    wheelSpinning = false;
    renderActiveTab();
    showToast(err.message, "error");
  }
}

// ---------- SCRATCH CARD ----------
// Pressing the button starts a round locally: the player picks exactly
// SCRATCH_TAPS_ALLOWED (3) of the 9 cells, blind. Only once all 3 picks are
// in do we call the server — which then places the diamonds at random and
// scores the round — so the diamond layout is never known (by anyone) ahead
// of the player's choice, and every round it lands somewhere new. Whatever
// happens, the full board is revealed afterwards so the player can see
// exactly where the diamonds were, win or lose.
function renderScratchCard(scratchStatus) {
  if (!scratchStatus) return `<div class="skeleton h-56 w-full mt-4"></div>`;

  const canPlayFree = scratchStatus.free_plays_left > 0;
  const inRound = !!scratchPending;
  const resolved = inRound && scratchPending.resolved;
  const selected = inRound ? scratchPending.selected : [];
  const tapsAllowed = scratchStatus.taps_allowed || SCRATCH_TAPS_ALLOWED;

  const btnLabel = resolved
    ? "Revealing…"
    : inRound
      ? `Pick ${tapsAllowed - selected.length} more 👆`
      : scratchStatus.max_reached
        ? "Come back tomorrow"
        : canPlayFree
          ? `Scratch (${scratchStatus.free_plays_left} free left)`
          : scratchStatus.needs_ad
            ? "▶ Watch Ad to Scratch"
            : "Scratch";
  const blocked = scratchStatus.max_reached && !inRound;

  const cells = Array.from({ length: 9 }, (_, i) => {
    const isSelected = selected.includes(i);
    let symbol = "❓";
    let cls = ["scratch-cell"];
    if (resolved) {
      const isDiamond = resolved.diamondCells.has(i);
      const isMatch = isSelected && isDiamond;
      symbol = isDiamond ? "💎" : "✖";
      cls.push("revealed");
      if (isMatch) cls.push("win");
      else if (isDiamond) cls.push("missed"); // a diamond the player didn't pick
      if (isSelected) cls.push("picked");
    } else if (inRound) {
      if (isSelected) {
        symbol = "👆";
        cls.push("picked");
      } else if (selected.length < tapsAllowed) {
        cls.push("armed");
      }
    }
    return `<div class="${cls.join(" ")}" data-cell="${i}"><span>${symbol}</span></div>`;
  }).join("");

  return `
    <div class="card-feature p-5 mt-4 text-center">
      <span class="pill-chip mb-3">🎫 Scratch &amp; Win</span>
      <p class="text-xs text-gray-400 mb-4">${inRound
        ? `Choose ${tapsAllowed} boxes — the more diamonds you hit, the bigger your prize.`
        : `Pick any ${tapsAllowed} of the 9 boxes. Hit diamonds to win — the positions shuffle every round.`}</p>
      <div id="scratch-grid" class="scratch-grid">${cells}</div>
      <button id="btn-scratch-play" class="w-full btn-primary py-3.5 text-sm mt-5 ${blocked || scratchBusy || inRound ? "opacity-40 pointer-events-none" : ""}">
        ${scratchBusy ? "Starting…" : btnLabel}
      </button>
      <p class="text-[11px] text-gray-500 mt-2">${scratchStatus.played_today} played today${scratchStatus.max_daily ? ` · max ${scratchStatus.max_daily}/day` : ""}</p>
    </div>
  `;
}

async function handleScratchClick() {
  if (scratchBusy || scratchPending) return;
  const s = state.scratchStatus;
  if (!s || s.max_reached) return;

  try {
    let adEvent = null;
    if (s.free_plays_left <= 0 && s.needs_ad) {
      adEvent = await showRewardedAd();
    }
    scratchBusy = true;
    renderActiveTab();

    // No server call yet — just open the board for the player to pick from.
    scratchPending = { adEvent, selected: [], resolved: null };
    scratchBusy = false;
    renderActiveTab();
  } catch (err) {
    scratchBusy = false;
    renderActiveTab();
    showToast(err.message, "error");
  }
}

async function handleScratchCellTap(index) {
  if (!scratchPending || scratchPending.resolved) return;
  const tapsAllowed = (state.scratchStatus && state.scratchStatus.taps_allowed) || SCRATCH_TAPS_ALLOWED;
  if (scratchPending.selected.includes(index) || scratchPending.selected.length >= tapsAllowed) return;

  scratchPending.selected.push(index);
  renderActiveTab();

  if (scratchPending.selected.length < tapsAllowed) return;

  // All picks made — now (and only now) ask the server to place the
  // diamonds and score the round.
  try {
    const res = await Api.scratchPlay(scratchPending.adEvent, scratchPending.selected);
    scratchPending.resolved = {
      reward: res.reward,
      diamondCells: new Set(res.diamond_cells),
      matchedCells: new Set(res.matched_cells),
      hits: res.hits,
    };
    renderActiveTab();

    setTimeout(async () => {
      const { reward, hits } = scratchPending.resolved;
      scratchPending = null;
      if (reward > 0) {
        showToast(`🎉 ${hits} diamond${hits === 1 ? "" : "s"} — you won ${reward.toFixed(4)} Birr!`);
      } else {
        showToast("No diamonds this round — try again!", "error");
      }
      state.user = await Api.syncUser();
      state.scratchStatus = await Api.scratchStatus();
      renderActiveTab();
    }, 1400);
  } catch (err) {
    scratchPending = null;
    renderActiveTab();
    showToast(err.message, "error");
  }
}
