/**
 * ubongo desktop overlay — frontend logic
 *
 * Bridges the Tauri webview to the Python backend via invoke().
 * Falls back to fetch() against http://127.0.0.1:8765 when running
 * outside Tauri (e.g. during browser-based dev).
 */

// ── Tauri bridge ──────────────────────────────────────────────────────────────

let _invoke;

async function getTauriInvoke() {
  if (_invoke) return _invoke;
  try {
    const { invoke } = await import("https://unpkg.com/@tauri-apps/api@2/core");
    _invoke = invoke;
  } catch {
    // Running in browser dev mode — proxy via fetch
    _invoke = async (cmd, args) => {
      const map = {
        query:         { method: "POST", path: "/query" },
        query_agentic: { method: "POST", path: "/query/agentic" },
        get_status:    { method: "GET",  path: "/status" },
        toggle_window: null,
        hide_window:   null,
      };
      const route = map[cmd];
      if (!route) return;
      const opts = { method: route.method, headers: { "Content-Type": "application/json" } };
      if (route.method === "POST") opts.body = JSON.stringify(args);
      const r = await fetch(`http://127.0.0.1:8765${route.path}`, opts);
      return r.json();
    };
  }
  return _invoke;
}

async function invoke(cmd, args = {}) {
  const fn = await getTauriInvoke();
  return fn(cmd, args);
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const queryInput   = document.getElementById("query-input");
const sendBtn      = document.getElementById("send-btn");
const closeBtn     = document.getElementById("close-btn");
const chipsRow     = document.getElementById("chips-row");
const contentArea  = document.getElementById("content-area");
const stepsView    = document.getElementById("steps-view");
const responseText = document.getElementById("response-text");
const placeholder  = document.getElementById("placeholder");
const providerBadge= document.getElementById("provider-badge");
const providerLabel= document.getElementById("provider-label");
const modelTag     = document.getElementById("model-tag");
const usageFill    = document.getElementById("usage-fill");
const usageCount   = document.getElementById("usage-count");
const toast        = document.getElementById("toast");
const liveDot      = document.getElementById("live-dot");

// ── App state ─────────────────────────────────────────────────────────────────

let conversationHistory = [];
let isRunning = false;

// ── Scenario definitions for chips ───────────────────────────────────────────

const SCENARIOS = {
  files: {
    label: "📁 Find file",
    prompt: "Find all PDF files in my Downloads folder and organise them by date.",
    agentic: true,
    steps: [
      { text: "Scanning Downloads folder…",      status: "loading" },
      { text: "Found 23 PDFs",                   status: "done",    meta: "0.3 s" },
      { text: "Sorting by creation date…",       status: "loading" },
      { text: "Creating folder Reports/2026…",   status: "pending" },
      { text: "Moving files",                    status: "pending" },
    ],
  },
  apps: {
    label: "🚀 Open app",
    prompt: "Open Spotify and play my Liked Songs playlist.",
    agentic: true,
    steps: [
      { text: "Checking if Spotify is running…", status: "loading" },
      { text: "Launching Spotify",               status: "done",    meta: "0.6 s" },
      { text: "Opening Liked Songs playlist",    status: "loading" },
    ],
  },
  web: {
    label: "🔍 Search web",
    prompt: "Search for the latest news about Claude AI and summarise the top 3 results.",
    agentic: true,
    steps: [
      { text: "Querying the web…",               status: "loading" },
      { text: "Retrieved 10 results",            status: "done",    meta: "0.8 s" },
      { text: "Summarising with Claude…",        status: "loading" },
    ],
  },
  automate: {
    label: "⚡ Automate",
    prompt: "Every morning at 9 am, open my calendar and my email.",
    agentic: false,
    steps: [],
  },
  status: {
    label: "/status",
    prompt: "/status",
    agentic: false,
    steps: [],
  },
};

// ── Status / provider polling ─────────────────────────────────────────────────

async function refreshStatus() {
  try {
    const data = await invoke("get_status");
    if (!data) return;

    // Provider badge
    const tier = (data.tier_class || data.effective_tier || "free").toLowerCase();
    const cls  = tier === "power" ? "power" : tier === "pro" ? "pro" : "free";
    providerBadge.className = `provider-badge ${cls}`;
    providerLabel.textContent = data.display_name || data.provider_display || "Offline";

    // Usage bar
    const used  = data.monthly_query_count ?? 0;
    const limit = data.query_limit ?? 200;
    const pct   = Math.min(100, Math.round((used / limit) * 100));
    usageFill.style.width = `${pct}%`;
    usageCount.textContent = `${used.toLocaleString()} / ${limit.toLocaleString()}`;

    // Model tag in content header
    if (data.model) modelTag.textContent = data.model;

    // Live dot colour — green if connected, amber if offline
    liveDot.style.background = tier === "free" && !data.internet ? "#f59e0b" : "#22c55e";

  } catch {
    providerLabel.textContent = "Connecting…";
  }
}

// Poll every 30 s; run once immediately
refreshStatus();
setInterval(refreshStatus, 30_000);

// ── Input gate ────────────────────────────────────────────────────────────────

queryInput.addEventListener("input", () => {
  sendBtn.disabled = queryInput.value.trim() === "" || isRunning;
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideOverlay();
  }
  if (e.key === "Enter" && !e.shiftKey && document.activeElement === queryInput) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend();
  }
});

// ── Close / hide ──────────────────────────────────────────────────────────────

closeBtn.addEventListener("click", hideOverlay);

window.addEventListener("blur", () => {
  // Hide when the window loses focus (user clicks elsewhere on desktop)
  hideOverlay();
});

async function hideOverlay() {
  try {
    await invoke("hide_window");
  } catch {
    // Running in browser dev — just minimise the visual
    document.body.style.opacity = "0";
    setTimeout(() => { document.body.style.opacity = "1"; }, 300);
  }
}

// ── Chip selection ────────────────────────────────────────────────────────────

chipsRow.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;

  // Toggle active class
  chipsRow.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  chip.classList.add("active");

  const scenario = SCENARIOS[chip.dataset.scenario];
  if (!scenario) return;

  queryInput.value = scenario.prompt;
  queryInput.dispatchEvent(new Event("input"));

  // Pre-populate the step view with a preview (not yet running)
  if (scenario.steps.length) {
    renderDemoSteps(scenario.steps);
  }
});

function renderDemoSteps(steps) {
  showStepsView();
  stepsView.innerHTML = steps.map((s, i) => buildStepHTML(i + 1, s.text, s.status, s.meta || "")).join("");
}

// ── Send handler ──────────────────────────────────────────────────────────────

sendBtn.addEventListener("click", handleSend);

async function handleSend() {
  const message = queryInput.value.trim();
  if (!message || isRunning) return;

  setRunning(true);
  clearToast();
  queryInput.value = "";
  sendBtn.disabled = true;

  // Detect if this is an agentic request
  const isAgentic = looksAgentic(message);

  if (isAgentic) {
    await runAgenticQuery(message);
  } else {
    await runSimpleQuery(message);
  }

  setRunning(false);
  await refreshStatus();
}

function looksAgentic(msg) {
  const lower = msg.toLowerCase();
  const signals = [
    "open ", "launch ", "close ", "find ", "search ", "move ", "copy ",
    "delete ", "create ", "organise ", "organize ", "play ", "pause ",
    "screenshot", "automate", "every ", "schedule ", "run ",
  ];
  return signals.some(s => lower.includes(s));
}

// ── Simple query ──────────────────────────────────────────────────────────────

async function runSimpleQuery(message) {
  showResponseText();
  responseText.innerHTML = `<span class="thinking-dots">Thinking</span>`;

  try {
    const result = await invoke("query", {
      message,
      history: conversationHistory,
    });

    if (result?.content) {
      responseText.textContent = result.content;
      if (result.model) modelTag.textContent = result.model;

      // Append to history
      conversationHistory.push({ role: "user",      content: message });
      conversationHistory.push({ role: "assistant", content: result.content });
      // Keep last 20 turns
      if (conversationHistory.length > 40) conversationHistory = conversationHistory.slice(-40);
    } else {
      showError(result?.detail || "Empty response from server.");
    }
  } catch (err) {
    showError(String(err));
  }
}

// ── Agentic query ─────────────────────────────────────────────────────────────

async function runAgenticQuery(message) {
  // Show a single animated "planning" step immediately
  showStepsView();
  stepsView.innerHTML = buildStepHTML(1, "Planning task…", "loading", "");

  try {
    const result = await invoke("query_agentic", {
      message,
      history: conversationHistory,
    });

    if (!result) {
      showError("No response from server.");
      return;
    }

    if (result.detail) {
      showError(result.detail);
      return;
    }

    // Render executed steps
    const steps = result.steps || [];
    if (steps.length > 0) {
      stepsView.innerHTML = steps
        .map((s, i) =>
          buildStepHTML(i + 1, s.tool ? `${s.tool}: ${s.result}` : s.result, s.success ? "done" : "error", "")
        )
        .join("");
    }

    // Append final AI response below steps
    if (result.content) {
      const div = document.createElement("div");
      div.className = "response-text";
      div.style.borderTop = "1px solid rgba(255,255,255,.05)";
      div.textContent = result.content;
      contentArea.appendChild(div);
    }

    if (result.model) modelTag.textContent = result.model;

    conversationHistory.push({ role: "user",      content: message });
    conversationHistory.push({ role: "assistant", content: result.content || "" });
    if (conversationHistory.length > 40) conversationHistory = conversationHistory.slice(-40);

  } catch (err) {
    showError(String(err));
  }
}

// ── Step HTML builder ─────────────────────────────────────────────────────────

function buildStepHTML(index, text, status, meta) {
  const icons = {
    done:    `<svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.2 2.2 3.8-4" stroke="#4ade80" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    loading: ``,
    pending: `<span style="font-size:9px;color:var(--text-3)">${index}</span>`,
    error:   `<svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="#fca5a5" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  };

  return `
    <div class="step">
      <div class="step-icon ${status}">${icons[status] || ""}</div>
      <span class="step-text ${status}">${escapeHtml(text)}</span>
      ${meta ? `<span class="step-meta ${status}">${escapeHtml(meta)}</span>` : ""}
    </div>`;
}

// ── View helpers ──────────────────────────────────────────────────────────────

function showStepsView() {
  placeholder.style.display    = "none";
  responseText.style.display   = "none";
  stepsView.style.display      = "block";
  // Remove any dynamically appended response divs
  contentArea.querySelectorAll(".response-text:not(#response-text)").forEach(el => el.remove());
}

function showResponseText() {
  placeholder.style.display  = "none";
  stepsView.style.display    = "none";
  responseText.style.display = "block";
}

function setRunning(val) {
  isRunning = val;
  sendBtn.disabled = val;
  queryInput.disabled = val;
  if (val) {
    sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="white" opacity=".6"/></svg>`;
  } else {
    sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12 7L2 2l2.5 5L2 12l10-5z" fill="white"/></svg>`;
    queryInput.disabled = false;
    queryInput.focus();
  }
}

// ── Toast error ───────────────────────────────────────────────────────────────

function showError(msg) {
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(clearToast, 6000);
}

function clearToast() {
  toast.classList.remove("visible");
}

// ── Misc utilities ────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Focus input as soon as the window appears (Tauri fires a 'focus' event)
window.addEventListener("focus", () => {
  queryInput.focus();
  queryInput.select();
});

queryInput.focus();
