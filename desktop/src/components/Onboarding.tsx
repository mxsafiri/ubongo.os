/**
 * Onboarding — first-launch screen for beta users.
 *
 * Shown instead of OrbitalView until the user activates a valid invite
 * code. The code is validated against the ubongo proxy server; once
 * accepted, it's persisted to ~/.ubongo/config.json and the app
 * transitions to the main orb view.
 *
 * Design notes:
 *  - Single focused flow, no tabs or modes
 *  - Paste-friendly input (big, monospace, autofocus)
 *  - Clear error/success feedback inline
 *  - "Get an invite" link for people who don't have a code yet
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { KeyRound, Loader2, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { invoke } from "@/lib/tauri";

type Phase = "idle" | "validating" | "success" | "error";

interface Props {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: Props) {
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus the input on mount so users can paste immediately
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Paste your invite code first.");
      setPhase("error");
      return;
    }

    setPhase("validating");
    setError(null);

    try {
      const result: any = await invoke("onboarding_activate", { code: trimmed });
      if (result?.detail) {
        setError(result.detail);
        setPhase("error");
        return;
      }
      setPhase("success");
      // small delay so the success tick is visible
      setTimeout(onComplete, 900);
    } catch (err: any) {
      const msg =
        typeof err === "string"
          ? err
          : err?.message || "Could not validate invite code. Try again.";
      setError(msg);
      setPhase("error");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && phase !== "validating") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <motion.div
      className="liquid-glass w-[560px] max-w-full rounded-[28px] px-8 py-9 flex flex-col items-center gap-6"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.2, 0.65, 0.3, 0.9] }}
    >
      {/* ── Orb + headline ── */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="color-orb-mini scale-[1.8]" />
          <div className="absolute inset-0 -z-10 rounded-full bg-indigo-500/25 blur-2xl scale-[2.5]" />
        </div>

        <div className="flex flex-col items-center gap-1 mt-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-100">
            Welcome to ubongo
          </h1>
          <p className="text-[13px] text-slate-400 text-center max-w-[380px] leading-snug">
            ubongo is in closed beta. Paste your invite code below to activate.
          </p>
        </div>
      </div>

      {/* ── Invite code input ── */}
      <div className="w-full flex flex-col gap-2">
        <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 pl-1">
          Invite code
        </label>

        <div
          className={`
            relative flex items-center gap-2.5 rounded-xl border px-3.5 py-3
            transition-colors
            ${phase === "error" ? "border-rose-500/40 bg-rose-500/[0.04]"
              : phase === "success" ? "border-emerald-500/40 bg-emerald-500/[0.04]"
              : "border-white/[0.08] bg-white/[0.02] focus-within:border-indigo-400/50 focus-within:bg-indigo-500/[0.04]"}
          `}
        >
          <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (phase === "error") setPhase("idle");
            }}
            onKeyDown={onKeyDown}
            placeholder="UBONGO-XXXX-XXXX"
            disabled={phase === "validating" || phase === "success"}
            spellCheck={false}
            autoComplete="off"
            className="
              flex-1 bg-transparent outline-none border-0
              text-[15px] font-mono tracking-wider text-slate-100
              placeholder:text-slate-600 placeholder:font-sans placeholder:tracking-normal
              disabled:opacity-60
            "
          />

          {/* Status icon */}
          <AnimatePresence mode="wait">
            {phase === "validating" && (
              <motion.div key="v" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              </motion.div>
            )}
            {phase === "success" && (
              <motion.div key="s" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </motion.div>
            )}
            {phase === "error" && (
              <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <AlertCircle className="w-4 h-4 text-rose-400" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && phase === "error" && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[12px] text-rose-400 pl-1"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* ── Activate button ── */}
      <button
        onClick={handleSubmit}
        disabled={phase === "validating" || phase === "success" || !code.trim()}
        className="
          w-full inline-flex items-center justify-center gap-2
          rounded-xl py-3 px-5
          bg-gradient-to-r from-indigo-500 to-violet-500
          text-white text-[14px] font-semibold
          shadow-[0_8px_24px_-8px_rgba(99,102,241,0.6)]
          hover:shadow-[0_12px_32px_-8px_rgba(99,102,241,0.8)]
          hover:brightness-110
          active:scale-[0.98]
          transition-all
          disabled:opacity-50 disabled:cursor-not-allowed disabled:brightness-75
        "
      >
        {phase === "validating" && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Validating…</span>
          </>
        )}
        {phase === "success" && (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span>Welcome in</span>
          </>
        )}
        {(phase === "idle" || phase === "error") && (
          <>
            <span>Activate</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* ── Footer ── */}
      <div className="flex flex-col items-center gap-1.5 pt-1">
        <p className="text-[12px] text-slate-500">
          Don't have a code yet?
        </p>
        <a
          href="https://mxsafiri.github.io/ubongo.os/#access"
          onClick={(e) => {
            e.preventDefault();
            invoke("open_url", { url: "https://mxsafiri.github.io/ubongo.os/#access" }).catch(() => {});
          }}
          className="text-[12px] text-indigo-400/90 hover:text-indigo-300 transition-colors cursor-pointer"
        >
          Request an invite →
        </a>
      </div>
    </motion.div>
  );
}

export default Onboarding;
