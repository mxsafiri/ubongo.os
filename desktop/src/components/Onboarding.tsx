/**
 * Onboarding — first-launch wizard for beta users.
 *
 * Three steps, in order:
 *
 *   001 · WELCOME   one-breath intro + orb
 *   002 · NAME      user picks what to call the assistant
 *   003 · TONE      conversational register (concise / warm / formal)
 *
 * START waits for the local server to come up (first launch can take a
 * few seconds), asks it to set up access (/onboarding/start) and goes
 * straight in. There are no invite codes, and access never blocks the
 * user: if it can't be set up yet, the server keeps retrying on its own.
 *
 * The first three steps are pure-frontend: choices land in
 * `localStorage['ubongo.profile.v1']` and App.tsx reads them later.
 * This keeps onboarding decoupled from the Python backend — the
 * profile is available to the LLM runtime whenever it catches up.
 *
 * Aesthetic mirrors the landing page: monospace, uppercase tracking,
 * section-number dividers, hairline accents. Stays inside the desktop
 * app's existing `liquid-glass` surface so it feels native to Ubongo.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Pencil,
} from "lucide-react";
import { invoke } from "@/lib/tauri";

// ── profile shape persisted to localStorage ─────────────────────────

export type Tone = "concise" | "warm" | "formal";
/** Which language voice expects: "auto" hears Swahili, English or a mix. */
export type VoiceLanguage = "auto" | "sw" | "en";

export interface OnboardingProfile {
  agentName: string;
  tone:      Tone;
  language:  VoiceLanguage;
  /** UNIX seconds when the user completed onboarding. */
  completedAt: number;
}

const PROFILE_KEY = "ubongo.profile.v1";

export function loadProfile(): OnboardingProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingProfile>;
    if (!parsed?.agentName || !parsed?.tone) return null;
    return {
      agentName:   String(parsed.agentName),
      tone:        (parsed.tone as Tone) ?? "concise",
      language:    (["auto", "sw", "en"].includes(String(parsed.language)) ? parsed.language : "auto") as VoiceLanguage,
      completedAt: Number(parsed.completedAt ?? 0),
    };
  } catch {
    return null;
  }
}

function saveProfile(p: OnboardingProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // Ignore — tauri webview keeps localStorage but a read-only mode
    // shouldn't block the user from finishing onboarding.
  }
}

// ── step state ──────────────────────────────────────────────────────

type Step = 1 | 2 | 3;
type Phase = "idle" | "validating" | "success" | "error";

const STEP_LABELS: Record<Step, string> = {
  1: "WELCOME",
  2: "NAME",
  3: "TONE",
};
const LADDER: Step[] = [1, 2, 3];

const NAME_SUGGESTIONS = ["Ubongo", "Mshikaji", "Akili"] as const;

const LANGUAGES: { value: VoiceLanguage; label: string }[] = [
  { value: "auto", label: "BOTH" },
  { value: "sw",   label: "KISWAHILI" },
  { value: "en",   label: "ENGLISH" },
];

const TONES: { value: Tone; label: string; blurb: string }[] = [
  { value: "concise", label: "CONCISE", blurb: "Short, direct, no preambles." },
  { value: "warm",    label: "WARM",    blurb: "Conversational, friendly, natural." },
  { value: "formal",  label: "FORMAL",  blurb: "Professional, precise, polite."   },
];

// ── component ───────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: Props) {
  const [step, setStep]           = useState<Step>(1);
  const [agentName, setAgentName] = useState<string>("Ubongo");
  const [tone, setTone]           = useState<Tone>("concise");
  const [language, setLanguage]   = useState<VoiceLanguage>("auto");

  const [phase, setPhase]         = useState<Phase>("idle");
  const [error, setError]         = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the right field when each step mounts.
  useEffect(() => {
    const t = setTimeout(() => {
      if (step === 2) nameInputRef.current?.focus();
    }, 180);
    return () => clearTimeout(t);
  }, [step]);

  // ── navigation ────────────────────────────────────────────────────

  const goNext = () => {
    if (step === 2 && !agentName.trim()) return;
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  };
  const goBack = () => {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  };

  // ── straight in ──────────────────────────────────────────────────

  const handleStart = async () => {
    setPhase("validating");
    setError(null);

    // The local server can take a few seconds to boot on first launch.
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        await invoke("onboarding_status");
        break;
      } catch {
        if (Date.now() > deadline) {
          setError("Ubongo's engine didn't start. Quit the app (⌘Q), open it again and press START.");
          setPhase("error");
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Set up access if we can — if not, the server keeps retrying on its own.
    try {
      await invoke("onboarding_start");
    } catch {
      /* never block the user on this */
    }

    saveProfile({
      agentName:   agentName.trim() || "Ubongo",
      tone,
      language,
      completedAt: Math.floor(Date.now() / 1000),
    });
    setPhase("success");
    setTimeout(onComplete, 700);
  };

  const onNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goNext();
    }
  };

  // ── chrome: step ladder across the top ──────────────────────────

  const StepLadder = () => (
    <div className="flex items-center gap-2 w-full">
      {LADDER.map((num, idx) => {
        const active   = num === step;
        const complete = num < step;
        return (
          <div key={num} className="flex items-center gap-2 flex-1">
            <span
              className={`font-mono text-[9px] tracking-[0.2em] ${
                active ? "text-indigo-300" : complete ? "text-indigo-500/70" : "text-slate-600"
              }`}
            >
              {String(num).padStart(3, "0")}
            </span>
            <span
              className={`font-mono text-[9px] tracking-[0.2em] hidden sm:inline ${
                active ? "text-slate-200" : "text-slate-600"
              }`}
            >
              {STEP_LABELS[num]}
            </span>
            {idx < LADDER.length - 1 && (
              <div
                className={`flex-1 h-px ${
                  complete ? "bg-indigo-400/40" : "bg-white/[0.06]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // ── framing ──────────────────────────────────────────────────────

  return (
    <motion.div
      className="liquid-glass w-[560px] max-w-full rounded-[28px] px-8 py-8 flex flex-col gap-7"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.2, 0.65, 0.3, 0.9] }}
    >
      <StepLadder />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`step-${step}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {step === 1 && <StepWelcome onNext={goNext} />}
          {step === 2 && (
            <StepName
              value={agentName}
              onChange={setAgentName}
              inputRef={nameInputRef}
              onKeyDown={onNameKeyDown}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {step === 3 && (
            <StepTone
              agentName={agentName}
              tone={tone}
              onChange={setTone}
              language={language}
              onLanguage={setLanguage}
              onStart={handleStart}
              onBack={goBack}
              phase={phase}
              error={error}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ── individual steps ────────────────────────────────────────────────

function SectionLabel({ num, label }: { num: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-4 h-px bg-indigo-400/60" />
      <span className="font-mono text-[10px] tracking-[0.22em] text-indigo-300">{num}</span>
      <div className="w-3 h-px bg-indigo-400/25" />
      <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-slate-400">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-2">
      <div className="relative">
        <div className="color-orb-mini scale-[1.8]" />
        <div className="absolute inset-0 -z-10 rounded-full bg-indigo-500/25 blur-2xl scale-[2.5]" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center px-2">
        <h1 className="font-mono font-bold text-[22px] tracking-[0.08em] text-slate-100">
          <span className="text-indigo-300">U</span>BONGO
        </h1>
        <p className="text-[12px] font-mono tracking-wider text-slate-500 uppercase">
          An agent you can live with
        </p>
        <p className="text-[13px] text-slate-400 leading-relaxed max-w-[380px] mt-3">
          Let&rsquo;s name your assistant and choose how it should talk.
          Takes under a minute.
        </p>
      </div>

      <div className="w-full flex items-center justify-between pt-2">
        <span className="text-[10px] font-mono tracking-wider text-slate-600">
          BUILT IN TANZANIA
        </span>

        <button
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.08]
                     hover:border-indigo-400/40 hover:bg-indigo-500/[0.06]
                     px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-slate-200
                     transition-colors group"
        >
          BEGIN
          <ArrowRight className="w-3.5 h-3.5 text-indigo-300 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}

function StepName({
  value,
  onChange,
  inputRef,
  onKeyDown,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.Ref<HTMLInputElement>;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canContinue = value.trim().length > 0 && value.trim().length <= 32;
  return (
    <div className="flex flex-col gap-5">
      <SectionLabel num="002" label="NAME" />

      <div className="flex flex-col gap-2">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-100">
          What should we call your assistant?
        </h2>
        <p className="text-[12px] text-slate-400 leading-relaxed max-w-[440px]">
          You can keep the default, or give it a name that fits. Swahili
          names land well — <span className="text-slate-300">Mshikaji</span> (buddy),
          <span className="text-slate-300"> Akili</span> (intellect).
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 pl-1">
          Assistant name
        </label>
        <div
          className="relative flex items-center gap-2.5 rounded-xl border border-white/[0.08]
                     bg-white/[0.02] focus-within:border-indigo-400/50
                     focus-within:bg-indigo-500/[0.04] transition-colors px-3.5 py-3"
        >
          <Pencil className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={32}
            spellCheck={false}
            autoComplete="off"
            placeholder="Ubongo"
            className="flex-1 bg-transparent outline-none border-0
                       text-[15px] font-mono tracking-wide text-slate-100
                       placeholder:text-slate-600 placeholder:tracking-normal"
          />
          <span className="font-mono text-[10px] tracking-wider text-slate-600">
            {value.trim().length}/32
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[9px] tracking-[0.22em] text-slate-600 uppercase">
          TRY
        </span>
        {NAME_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`font-mono text-[11px] tracking-wider rounded-full px-3 py-1
                        border transition-colors ${
                          value === s
                            ? "border-indigo-400/60 bg-indigo-500/[0.1] text-indigo-200"
                            : "border-white/[0.08] text-slate-400 hover:border-indigo-400/30 hover:text-slate-200"
                        }`}
          >
            {s}
          </button>
        ))}
      </div>

      <NavRow onBack={onBack} onNext={onNext} nextDisabled={!canContinue} />
    </div>
  );
}

function StepTone({
  agentName,
  tone,
  onChange,
  language,
  onLanguage,
  onStart,
  onBack,
  phase,
  error,
}: {
  agentName: string;
  tone: Tone;
  onChange: (t: Tone) => void;
  language: VoiceLanguage;
  onLanguage: (l: VoiceLanguage) => void;
  onStart: () => void;
  onBack: () => void;
  phase: Phase;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <SectionLabel num="003" label="TONE" />

      <div className="flex flex-col gap-2">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-100">
          How should {agentName.trim() || "your assistant"} talk to you?
        </h2>
        <p className="text-[12px] text-slate-400 leading-relaxed max-w-[440px]">
          You can change this any time later. It shapes how long the
          replies are and how formal they feel.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {TONES.map((opt) => {
          const selected = tone === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`text-left rounded-xl border px-4 py-3 flex flex-col gap-1.5
                          transition-colors ${
                            selected
                              ? "border-indigo-400/60 bg-indigo-500/[0.07]"
                              : "border-white/[0.08] bg-white/[0.015] hover:border-indigo-400/25"
                          }`}
            >
              <span
                className={`font-mono text-[11px] tracking-[0.22em] ${
                  selected ? "text-indigo-200" : "text-slate-300"
                }`}
              >
                {opt.label}
              </span>
              <span className="text-[11px] leading-snug text-slate-500">
                {opt.blurb}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[9px] tracking-[0.22em] text-slate-600 uppercase mr-1">
          You speak
        </span>
        {LANGUAGES.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => onLanguage(l.value)}
            className={`font-mono text-[11px] tracking-wider rounded-full px-3 py-1 border transition-colors ${
              language === l.value
                ? "border-indigo-400/60 bg-indigo-500/[0.1] text-indigo-200"
                : "border-white/[0.08] text-slate-400 hover:border-indigo-400/30 hover:text-slate-200"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {phase === "error" && error && (
        <div className="flex flex-col gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.05] px-4 py-3">
          <div className="flex items-start gap-2 text-[12px] text-rose-200 leading-snug">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <NavRow
        onBack={onBack}
        onNext={onStart}
        nextDisabled={phase === "validating" || phase === "success"}
        nextLabel={
          phase === "validating" ? "STARTING…" : phase === "success" ? "READY" : phase === "error" ? "TRY AGAIN" : "START"
        }
        busy={phase === "validating"}
        done={phase === "success"}
      />
    </div>
  );
}

// ── shared nav row for the middle steps ──────────────────────────

function NavRow({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "CONTINUE",
  busy = false,
  done = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  nextLabel?: string;
  busy?: boolean;
  done?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.2em]
                   text-slate-500 hover:text-slate-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        BACK
      </button>

      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center gap-2 rounded-full border
                   border-white/[0.08] hover:border-indigo-400/40 hover:bg-indigo-500/[0.06]
                   px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-slate-200
                   transition-colors group disabled:opacity-40 disabled:cursor-not-allowed
                   disabled:hover:border-white/[0.08] disabled:hover:bg-transparent"
      >
        {nextLabel}
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 text-indigo-300 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
        ) : (
          <ArrowRight className="w-3.5 h-3.5 text-indigo-300 group-hover:translate-x-0.5 transition-transform" />
        )}
      </button>
    </div>
  );
}

export default Onboarding;
