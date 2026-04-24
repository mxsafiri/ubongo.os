import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { invoke } from "@/lib/tauri";
import type { StatusData, QueryResult, ResponseCard } from "@/lib/types";
import { OrbitalView } from "@/components/OrbitalView";
import { AskBar, type AskBarHandle } from "@/components/ui/ai-input";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import Plan, { type Task } from "@/components/ui/agent-plan";
import { ActionBar } from "@/components/ActionBar";
import { ResponseRenderer } from "@/components/ResponseRenderer";
import { Onboarding, loadProfile, type OnboardingProfile } from "@/components/Onboarding";
import { UpgradeBanner } from "@/components/ui/upgrade-banner";
import { useUpdateCheck } from "@/lib/useUpdateCheck";

/**
 * App states:
 * - "orbital"     → spinning orbit view, orb + ask bar
 * - "responding"  → AI processing / showing results, ask bar still pinned at bottom
 *
 * The AskBar is ALWAYS visible, anchored at the bottom of the window.
 */
type AppView = "orbital" | "responding";

export default function App() {
  const [view, setView] = useState<AppView>("orbital");
  const [status, setStatus] = useState<StatusData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [responseModel, setResponseModel] = useState<string | null>(null);
  const [responseCards, setResponseCards] = useState<ResponseCard[]>([]);
  const [agentTasks, setAgentTasks] = useState<Task[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const historyRef = useRef<Array<{ role: string; content: string }>>([]);
  const askBarRef = useRef<AskBarHandle>(null);

  // ── Onboarding gate ──────────────────────────────────────────────
  // `null` while checking, `true` once validated, `false` → show Onboarding
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(() => loadProfile());

  // ── Update notifications ─────────────────────────────────────────
  // Polls GitHub releases on mount and every 4h. When a newer tag than
  // the running build is published, the banner appears at the top of
  // the window. Click → opens the DMG download. The user can dismiss
  // a release once and never get nagged about it again.
  const update = useUpdateCheck();

  useEffect(() => {
    invoke<{ onboarded: boolean }>("onboarding_status")
      .then((d) => setOnboarded(Boolean(d?.onboarded)))
      .catch(() => setOnboarded(false)); // if server unreachable, show onboarding
  }, []);

  // Chosen agent name drives the ask-bar placeholder; fallback stays neutral.
  const agentName = profile?.agentName?.trim() || "ubongo";
  const askPlaceholder = `Ask ${agentName}`;

  // ── Draggable orb position ────────────────────────────────────────
  // The Tauri window is fullscreen transparent, so we float the orb
  // widget within the screen using CSS position. Position persists to
  // localStorage between sessions.

  const ORB_POS_KEY = "ubongo.orb.pos.v1";

  const loadOrbPos = () => {
    try {
      const raw = localStorage.getItem(ORB_POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (typeof p.x === "number" && typeof p.y === "number") return p;
      }
    } catch {}
    // Default: horizontally centred, slightly above middle
    return { x: window.innerWidth / 2, y: Math.round(window.innerHeight * 0.42) };
  };

  const [orbPos, setOrbPos] = useState<{ x: number; y: number }>(loadOrbPos);
  const [isDraggingOrb, setIsDraggingOrb] = useState(false);
  const dragStartRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const handleOrbDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag from the ring/background area — not from buttons, inputs, or
    // the response card ([data-no-drag]).
    if ((e.target as HTMLElement).closest("button, input, textarea, [data-no-drag]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation(); // prevent Tauri window drag region from taking over
    dragStartRef.current = { px: e.clientX, py: e.clientY, ox: orbPos.x, oy: orbPos.y };
    setIsDraggingOrb(true);
  }, [orbPos]);

  const handleOrbDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.px;
    const dy = e.clientY - dragStartRef.current.py;
    const half = 265; // half of max widget width (520px response card) + buffer
    const nx = Math.max(half, Math.min(window.innerWidth  - half, dragStartRef.current.ox + dx));
    const ny = Math.max(half, Math.min(window.innerHeight - half, dragStartRef.current.oy + dy));
    setOrbPos({ x: nx, y: ny });
  }, []);

  const handleOrbDragEnd = useCallback(() => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    setIsDraggingOrb(false);
    try {
      localStorage.setItem(ORB_POS_KEY, JSON.stringify(orbPos));
    } catch {}
  }, [orbPos]);

  // Status polling
  const refreshStatus = useCallback(async () => {
    try {
      const data = await invoke<StatusData>("get_status");
      if (data) setStatus(data);
    } catch {}
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 30_000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // Handle command submission — ALWAYS uses agentic route.
  // The LLM decides whether to call tools or just respond with text.
  const handleSubmit = useCallback(
    async (message: string) => {
      if (!message.trim() || isRunning) return;

      setIsRunning(true);
      setResponse(null);
      setResponseCards([]);
      setAgentTasks([]);
      setCurrentPrompt(message);
      setView("responding");

      // Brief "thinking" state
      setAgentTasks([
        {
          id: "thinking",
          title: "Thinking…",
          description: message,
          status: "in-progress",
          priority: "high",
          level: 0,
          dependencies: [],
          subtasks: [],
        },
      ]);

      try {
        const result = await invoke<QueryResult>("query_agentic", {
          message,
          history: historyRef.current,
        });

        if (result?.detail) {
          setAgentTasks([
            {
              id: "error",
              title: "Error",
              description: result.detail,
              status: "failed",
              priority: "high",
              level: 0,
              dependencies: [],
              subtasks: [],
            },
          ]);
        } else {
          // Convert steps to tasks (only show if there were actual tool calls)
          const tasks: Task[] = [];
          if (result?.steps?.length) {
            tasks.push({
              id: "execution",
              title: result.steps.length === 1 ? result.steps[0].tool || "Task" : "Task Execution",
              description: message,
              status: result.steps.every((s) => s.success)
                ? "completed"
                : result.steps.some((s) => !s.success)
                  ? "need-help"
                  : "in-progress",
              priority: "high",
              level: 0,
              dependencies: [],
              subtasks: result.steps.length > 1
                ? result.steps.map((s, i) => ({
                    id: `step-${i}`,
                    title: s.tool || `Step ${i + 1}`,
                    description: s.result,
                    status: s.success ? "completed" : "failed",
                    priority: "medium" as const,
                    tools: s.tool ? [s.tool] : undefined,
                  }))
                : [],
            });
          }

          setAgentTasks(tasks);

          // Rich cards are the PRIMARY response
          if (result?.cards?.length) {
            setResponseCards(result.cards);
          }

          // Text is the SECONDARY footnote
          if (result?.content) {
            setResponse(result.content);
            setResponseModel(result.model || null);
          }

          historyRef.current.push(
            { role: "user", content: message },
            { role: "assistant", content: result?.content || "" }
          );
          if (historyRef.current.length > 40)
            historyRef.current = historyRef.current.slice(-40);
        }
      } catch (err) {
        setResponse(String(err));
        setAgentTasks([
          {
            id: "error",
            title: "Connection Error",
            description: String(err),
            status: "failed",
            priority: "high",
            level: 0,
            dependencies: [],
            subtasks: [],
          },
        ]);
      }

      setIsRunning(false);
      refreshStatus();
    },
    [isRunning, refreshStatus]
  );

  // Node click → submit directly
  const handleNodeClick = useCallback(
    (prompt: string) => {
      handleSubmit(prompt);
    },
    [handleSubmit]
  );

  // Orb click → focus the always-visible ask bar
  const handleOrbClick = useCallback(() => {
    askBarRef.current?.focus();
  }, []);

  // ── Voice push-to-talk (MediaRecorder → Whisper) ─────────────────
  // The macOS WKWebView Tauri ships with does NOT implement
  // webkitSpeechRecognition, so we capture audio with MediaRecorder and
  // POST the resulting blob to the sidecar's /transcribe endpoint, which
  // forwards to Groq Whisper (or the user's own Groq key). The returned
  // text drops into handleSubmit — same path as typed input.
  //
  // Hold the orb → request mic access → start recording.
  // Release the orb → stop, upload, transcribe, submit.

  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const cancelTranscribeRef = useRef(false);

  const stopMediaTracks = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* ignore */ }
      });
    }
    mediaStreamRef.current = null;
  }, []);

  const handleOrbHoldStart = useCallback(async () => {
    if (mediaRecorderRef.current) return; // already recording

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      console.warn("voice: MediaRecorder/getUserMedia unavailable");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      cancelTranscribeRef.current = false;

      // Pick whichever container the WebView supports — webm/opus on
      // Chromium/WebView2, mp4/aac on WKWebView (macOS).
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType =
        candidates.find((m) =>
          (window as any).MediaRecorder?.isTypeSupported?.(m)
        ) ?? "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const tracks = mediaStreamRef.current;
        stopMediaTracks();
        mediaRecorderRef.current = null;
        setIsListening(false);

        if (cancelTranscribeRef.current) return;
        if (audioChunksRef.current.length === 0) {
          // Quiet release — no audio captured. Suppress.
          return;
        }

        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        // Anything under ~2 KB is essentially silence — skip.
        if (blob.size < 2048) return;

        const ext =
          blob.type.includes("mp4") ? "m4a"
          : blob.type.includes("ogg") ? "ogg"
          : "webm";
        const form = new FormData();
        form.append("file", blob, `clip.${ext}`);

        try {
          const r = await fetch("http://127.0.0.1:8765/transcribe", {
            method: "POST",
            body: form,
          });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            console.warn("voice: transcribe failed", r.status, err);
            return;
          }
          const { text } = (await r.json()) as { text?: string };
          const cleaned = (text ?? "").trim();
          if (cleaned) handleSubmit(cleaned);
        } catch (e) {
          console.warn("voice: transcribe network error", e);
        } finally {
          audioChunksRef.current = [];
          // Silence unused-locals lint
          void tracks;
        }
      };

      recorder.start();
      setIsListening(true);
    } catch (e) {
      console.warn("voice: mic permission denied or unavailable", e);
      stopMediaTracks();
      mediaRecorderRef.current = null;
      setIsListening(false);
    }
  }, [handleSubmit, stopMediaTracks]);

  const handleOrbHoldEnd = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      stopMediaTracks();
      setIsListening(false);
      return;
    }
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      stopMediaTracks();
      mediaRecorderRef.current = null;
      setIsListening(false);
    }
  }, [stopMediaTracks]);

  // Keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "responding") {
          setView("orbital");
          setResponse(null);
          setResponseCards([]);
          setAgentTasks([]);
        } else {
          invoke("hide_window").catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view]);

  // ── Onboarding: show first-launch screen until the user activates ──
  if (onboarded === false) {
    return (
      <div
        data-tauri-drag-region
        className="fixed inset-0 flex items-center justify-center px-6 z-10 cursor-grab active:cursor-grabbing"
      >
        <div onMouseDown={(e) => e.stopPropagation()}>
          <Onboarding
            onComplete={() => {
              setProfile(loadProfile());
              setOnboarded(true);
            }}
          />
        </div>
      </div>
    );
  }

  // While we're still checking, render nothing (transparent — orb drifts in after)
  if (onboarded === null) {
    return <div className="fixed inset-0" />;
  }

  return (
    // Transparent fullscreen backdrop — Tauri drag region for OS-level drags
    // outside the widget. The widget itself stops propagation so it doesn't
    // fight the OS drag when the user repositions the orb.
    <div
      data-tauri-drag-region
      className="fixed inset-0 z-10"
    >
      {/* ── Update banner ─────────────────────────────────────────────
          Floats at the top, visible above everything else. Only renders
          when a newer release tag is detected. Click opens the DMG.
      ─────────────────────────────────────────────────────────────── */}
      {update.updateAvailable && update.info && (
        <div
          className="fixed left-1/2 top-3 z-40 -translate-x-1/2"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <UpgradeBanner
            buttonText={`Update to v${update.info.latest}`}
            description="— new features and fixes ready"
            onClick={() => {
              invoke("open_url", { url: update.info!.downloadUrl }).catch(
                () => window.open(update.info!.downloadUrl, "_blank")
              );
            }}
            onClose={update.dismiss}
          />
        </div>
      )}

      {/* ── SINGLE FLOATING WIDGET ────────────────────────────────────
          Orb · response card · ask bar all travel together.
          Drag from the ring area (non-button, non-input) to reposition.
      ─────────────────────────────────────────────────────────────── */}
      <motion.div
        className="fixed z-20 flex flex-col items-center gap-3 select-none"
        style={{
          left: orbPos.x,
          top: orbPos.y,
          x: "-50%",
          y: "-50%",
          cursor: isDraggingOrb ? "grabbing" : "default",
        }}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.2, 0.65, 0.3, 0.9] }}
        onPointerDown={handleOrbDragStart}
        onPointerMove={handleOrbDragMove}
        onPointerUp={handleOrbDragEnd}
        onPointerCancel={handleOrbDragEnd}
      >
        {/* ── Orbital orb + tiles / responding card ── */}
        <AnimatePresence mode="wait">
          {view === "orbital" && (
            <motion.div
              key="orbital"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] }}
            >
              <OrbitalView
                onNodeClick={handleNodeClick}
                onOrbClick={handleOrbClick}
                onOrbHoldStart={handleOrbHoldStart}
                onOrbHoldEnd={handleOrbHoldEnd}
                isRunning={isRunning}
                isListening={isListening}
              />
            </motion.div>
          )}

          {view === "responding" && (
            <motion.div
              key="responding"
              className="liquid-glass flex flex-col items-center w-[520px] max-w-[90vw] max-h-[65vh] rounded-[28px] py-5 px-5 gap-3 overflow-y-auto"
              data-no-drag
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] }}
            >
              {/* Small orb at top — click to dismiss and return to orbital */}
              <motion.div
                className="cursor-pointer"
                onClick={() => {
                  if (!isRunning) {
                    setView("orbital");
                    setResponse(null);
                    setResponseCards([]);
                    setAgentTasks([]);
                  }
                }}
                whileHover={{ scale: 1.1 }}
              >
                <div className="relative">
                  <div className="color-orb-mini" />
                  <div className="absolute inset-0 -z-10 rounded-full bg-indigo-500/15 blur-xl scale-[2]" />
                </div>
              </motion.div>

              {/* Thinking indicator */}
              {isRunning &&
                responseCards.length === 0 &&
                (agentTasks.length === 0 ||
                  agentTasks[0].id === "thinking") && (
                  <motion.div
                    className="w-full"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] }}
                  >
                    <ThinkingIndicator prompt={currentPrompt} />
                  </motion.div>
                )}

              {/* Agent plan */}
              {agentTasks.length > 0 &&
                agentTasks[0].id !== "thinking" &&
                responseCards.length === 0 && (
                  <div className="w-full">
                    <Plan tasks={agentTasks} />
                  </div>
                )}

              {/* Cards — primary response */}
              {responseCards.length > 0 && (
                <motion.div
                  className="w-full"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] }}
                >
                  <ResponseRenderer
                    cards={responseCards}
                    fallbackText={null}
                    model={null}
                    onActionTap={handleSubmit}
                    onMusicAction={(action) => {
                      handleSubmit(
                        action === "pause" ? "pause music"
                        : action === "next" ? "next track"
                        : action === "previous" ? "previous track"
                        : "play music"
                      );
                    }}
                  />
                </motion.div>
              )}

              {/* Text footnote */}
              {response && (
                <motion.div
                  className="w-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: responseCards.length > 0 ? 0.3 : 0.1 }}
                >
                  <ResponseRenderer
                    cards={[]}
                    fallbackText={response}
                    model={responseModel}
                    onActionTap={handleSubmit}
                    onMusicAction={() => {}}
                  />
                </motion.div>
              )}

              <ActionBar hasResults={true} status={status} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Ask bar — always visible, travels with the widget ── */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full flex justify-center"
        >
          <AskBar
            ref={askBarRef}
            onSubmit={handleSubmit}
            isRunning={isRunning}
            placeholder={askPlaceholder}
            width={480}
          />
        </div>
      </motion.div>
    </div>
  );
}
