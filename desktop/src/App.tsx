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
import { Onboarding } from "@/components/Onboarding";

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

  useEffect(() => {
    invoke<{ onboarded: boolean }>("onboarding_status")
      .then((d) => setOnboarded(Boolean(d?.onboarded)))
      .catch(() => setOnboarded(false)); // if server unreachable, show onboarding
  }, []);

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
          <Onboarding onComplete={() => setOnboarded(true)} />
        </div>
      </div>
    );
  }

  // While we're still checking, render nothing (transparent — orb drifts in after)
  if (onboarded === null) {
    return <div className="fixed inset-0" />;
  }

  return (
    <div
      data-tauri-drag-region
      className="fixed inset-0 flex flex-col z-10 cursor-grab active:cursor-grabbing"
    >
      {/* ── CONTENT AREA (everything above the input) ── */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 pt-6 pb-2 overflow-hidden">
        <AnimatePresence mode="wait">
          {view === "orbital" && (
            <motion.div
              key="orbital"
              className="flex flex-col items-center justify-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] }}
            >
              <OrbitalView
                onNodeClick={handleNodeClick}
                onOrbClick={handleOrbClick}
                isRunning={isRunning}
              />
            </motion.div>
          )}

          {view === "responding" && (
            <motion.div
              key="responding"
              className="liquid-glass flex flex-col items-center w-[680px] max-w-full max-h-full rounded-[28px] py-5 px-5 gap-3 overflow-y-auto"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] }}
            >
              {/* Small orb at top while responding */}
              <motion.div
                className="cursor-pointer"
                onClick={() => {
                  if (!isRunning) setView("orbital");
                }}
                whileHover={{ scale: 1.1 }}
              >
                <div className="relative">
                  <div className="color-orb-mini" />
                  <div className="absolute inset-0 -z-10 rounded-full bg-indigo-500/15 blur-xl scale-[2]" />
                </div>
              </motion.div>

              {/* Thinking indicator — shown during initial phase before tool steps arrive */}
              {isRunning &&
                responseCards.length === 0 &&
                (agentTasks.length === 0 ||
                  (agentTasks.length === 1 && agentTasks[0].id === "thinking")) && (
                  <motion.div
                    className="w-full"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] }}
                  >
                    <ThinkingIndicator prompt={currentPrompt} />
                  </motion.div>
                )}

              {/* Agent plan — show once real tool steps exist, hide when cards arrive */}
              {agentTasks.length > 0 &&
                !(agentTasks.length === 1 && agentTasks[0].id === "thinking") &&
                responseCards.length === 0 && (
                  <div className="w-full">
                    <Plan tasks={agentTasks} />
                  </div>
                )}

              {/* CARDS ARE THE PRIMARY RESPONSE — visual first */}
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
                      handleSubmit(action === "pause" ? "pause music" : action === "next" ? "next track" : action === "previous" ? "previous track" : "play music");
                    }}
                  />
                </motion.div>
              )}

              {/* Text footnote below cards */}
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

              {/* Action bar */}
              <ActionBar hasResults={true} status={status} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── ALWAYS-VISIBLE ASK BAR (pinned to bottom of screen) ── */}
      <div
        className="shrink-0 flex justify-center pb-4 pt-1 px-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <AskBar
          ref={askBarRef}
          onSubmit={handleSubmit}
          isRunning={isRunning}
        />
      </div>
    </div>
  );
}
