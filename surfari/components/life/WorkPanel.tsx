'use client';

import { useState } from 'react';
import { useGameStore } from '@/store/game';
import { findJob } from '@/lib/game/places';
import { STAGES, TASKS, WORK, cooldownLeft, fullPay, payout, progress, rankTitle, stage, type TaskId } from '@/lib/game/work';
import { sfx } from '@/lib/game/sfx';
import { useServerNow } from './useLife';

const STAGE_ON_JOB = 2;

/**
 * The live shift: where you are in it, how well it's going, what to do
 * next and what you've earned so far. `compact` is the floating version
 * over the map; the full one lives in the WORK tab.
 */
export function WorkPanel({ compact = false }: { compact?: boolean }) {
  const shift = useGameStore((s) => s.life.shift);
  const xp = useGameStore((s) => s.life.xp);
  const doWorkTask = useGameStore((s) => s.doWorkTask);
  const finishShift = useGameStore((s) => s.finishShift);
  const addNotification = useGameStore((s) => s.addNotification);
  const now = useServerNow(250);
  const [busy, setBusy] = useState<TaskId | 'finish' | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (!shift) return null;
  const found = findJob(shift.jobId);
  if (!found) return null;
  const { job, place } = found;
  const done = xp[job.id] ?? 0;
  const f = progress(shift, now);
  const st = stage(shift, now);
  const onJob = st === STAGE_ON_JOB;
  const over = f >= 1;
  const earned = payout(job, shift, done, now);
  const full = fullPay(job, shift, done);
  const accrued = Math.round(full * f);   // what the shift is worth so far
  const locked = f < WORK.MIN_STAY;      // …but it only pays from halfway
  const canLeavePaid = f >= WORK.MIN_STAY;
  const secsLeft = Math.max(0, Math.ceil((shift.endsAt - now) / 1000));

  const task = async (id: TaskId) => {
    setBusy(id);
    const err = await doWorkTask(id);
    setBusy(null);
    if (err) {
      setResult(err === 'cooling_down' ? 'Subiri kidogo — not ready yet' : err === 'not_on_the_job' ? 'Not on the job yet' : err);
      sfx.miss();
    } else {
      const t = TASKS.find((x) => x.id === id)!;
      setResult(`${t.emoji} ${t.perf >= 0 ? '+' : ''}${t.perf} performance`);
      if (t.perf > 0) sfx.hit(2); else sfx.pop();
    }
  };

  const clockOut = async () => {
    if (!over && !canLeavePaid && !window.confirm('Leave now? Walking off before half the shift pays nothing.')) return;
    setBusy('finish');
    const r = await finishShift();
    setBusy(null);
    if ('error' in r) {
      addNotification({ type: 'system', title: 'Shift', message: r.error });
      return;
    }
    sfx.win();
    addNotification({
      type: 'token_earned',
      title: r.payout > 0 ? `💼 Shift done — +${r.payout} Tide` : 'Shift ended',
      message: r.payout > 0 ? `${job.titleEn} at ${place.name}` : 'You left before half the shift, so it paid nothing.',
    });
  };

  const perfColor = shift.perf >= 70 ? '#00E096' : shift.perf >= 40 ? '#FFB800' : '#FF4757';

  if (compact) {
    // Slim floating version: one header row, a progress line, the task buttons
    return (
      <div className="flex flex-col gap-2" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-mid)', borderRadius: 14, boxShadow: 'var(--shadow-card)', padding: 10, backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 18 }}>{job.emoji}</span>
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: 16, letterSpacing: '0.05em', color: 'var(--text-primary)', lineHeight: 1 }}>{rankTitle(job, done).toUpperCase()}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: onJob ? 'var(--color-primary)' : 'var(--text-muted)', marginTop: 2 }}>
              {over ? 'SHIFT OVER' : STAGES[st][2].toUpperCase()} · {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')} · <span style={{ color: perfColor }}>PERF {shift.perf}</span>
            </p>
          </div>
          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: 18, color: locked ? 'var(--text-muted)' : 'var(--color-gold)' }}>+{over ? earned : accrued}</span>
          <button onClick={clockOut} disabled={busy !== null} aria-label={over ? 'Clock out' : 'Leave the shift'}
            style={{ padding: '5px 9px', borderRadius: 8, fontFamily: 'var(--font-arcade)', fontSize: 13, letterSpacing: '0.08em',
              background: over ? 'linear-gradient(135deg, #00E096, #00C2FF)' : 'transparent', color: over ? '#04121C' : 'var(--text-secondary)',
              border: over ? 'none' : '1px solid var(--border-mid)' }}>
            {over ? 'CLOCK OUT' : 'LEAVE'}
          </button>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-subtle)', overflow: 'hidden' }}>
          <div style={{ width: `${f * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))' }} />
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {TASKS.map((t) => {
            const cd = cooldownLeft(shift, t.id, now);
            const used = t.once && shift.lastUsed[t.id] !== undefined;
            const disabled = !onJob || cd > 0 || !!used || busy !== null;
            return (
              <button key={t.id} onClick={() => task(t.id)} disabled={disabled} aria-label={t.nameEn}
                className="relative overflow-hidden flex items-center justify-center"
                style={{ padding: '7px 0', borderRadius: 10, opacity: used ? 0.35 : 1,
                  background: disabled ? 'var(--surface-subtle)' : t.perf > 0 ? 'rgba(0,224,150,0.14)' : 'rgba(255,184,0,0.14)',
                  border: `1px solid ${disabled ? 'var(--border-subtle)' : t.perf > 0 ? 'rgba(0,224,150,0.45)' : 'rgba(255,184,0,0.45)'}` }}>
                {cd > 0 && <span className="absolute left-0 bottom-0 h-[3px]" style={{ width: `${(cd / t.cooldownS) * 100}%`, background: 'var(--color-primary)' }} />}
                <span style={{ fontSize: 18 }}>{t.emoji}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{
      background: 'var(--surface-card)', border: '1px solid var(--border-mid)', borderRadius: 16,
      boxShadow: 'var(--shadow-card)', padding: compact ? 12 : 16,
    }}>
      {/* Job and place */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,194,255,0.12)', fontSize: 22 }}>
          {job.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: 20, letterSpacing: '0.05em', color: 'var(--text-primary)', lineHeight: 1 }}>
            {rankTitle(job, done).toUpperCase()}
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-muted)', marginTop: 4 }}>
            {place.icon} {place.name.toUpperCase()}
          </p>
        </div>
        <div className="text-right">
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: 22, color: locked ? 'var(--text-muted)' : 'var(--color-gold)', lineHeight: 1 }}>+{over ? earned : accrued}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>{locked ? 'PAID FROM HALFWAY' : `OF ${full} TIDE`}</p>
        </div>
      </div>

      {/* Stage and progress */}
      <div>
        <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', marginBottom: 5 }}>
          <span style={{ color: onJob ? 'var(--color-primary)' : 'var(--text-secondary)' }}>
            {over ? 'SHIFT OVER · CLOCK OUT' : `${STAGES[st][1].toUpperCase()} · ${STAGES[st][2].toUpperCase()}`}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{over ? '' : `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}`}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-subtle)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: `${f * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))', transition: 'width .25s linear' }} />
          <div style={{ position: 'absolute', left: `${WORK.MIN_STAY * 100}%`, top: -2, bottom: -2, width: 2, background: 'var(--text-muted)', opacity: 0.6 }} />
        </div>
      </div>

      {/* Performance */}
      <div className="flex items-center gap-2">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-muted)', width: 92 }}>PERFORMANCE</span>
        <div className="flex-1" style={{ height: 6, borderRadius: 3, background: 'var(--surface-subtle)', overflow: 'hidden' }}>
          <div style={{ width: `${shift.perf}%`, height: '100%', background: perfColor, transition: 'width .3s' }} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: perfColor, width: 30, textAlign: 'right' }}>{shift.perf}</span>
        <span title="Star bonus at 4 good tasks" style={{ fontSize: 12, opacity: shift.goodDone >= WORK.STAR_TASKS ? 1 : 0.35 }}>⭐</span>
      </div>

      {/* What to do */}
      <div className={`grid gap-2 ${compact ? 'grid-cols-5' : 'grid-cols-2'}`}>
        {TASKS.map((t) => {
          const cd = cooldownLeft(shift, t.id, now);
          const used = t.once && shift.lastUsed[t.id] !== undefined;
          const disabled = !onJob || cd > 0 || !!used || busy !== null;
          return (
            <button key={t.id} onClick={() => task(t.id)} disabled={disabled}
              aria-label={`${t.nameEn}${cd > 0 ? `, ready in ${Math.ceil(cd)} seconds` : ''}`}
              className="relative flex items-center gap-2 overflow-hidden"
              style={{
                padding: compact ? '8px 4px' : '10px 12px', borderRadius: 12, justifyContent: compact ? 'center' : 'flex-start',
                background: disabled ? 'var(--surface-subtle)' : t.perf > 0 ? 'rgba(0,224,150,0.12)' : 'rgba(255,184,0,0.12)',
                border: `1px solid ${disabled ? 'var(--border-subtle)' : t.perf > 0 ? 'rgba(0,224,150,0.4)' : 'rgba(255,184,0,0.4)'}`,
                opacity: used ? 0.4 : 1,
              }}>
              {cd > 0 && <span className="absolute left-0 bottom-0 h-[3px]" style={{ width: `${(cd / t.cooldownS) * 100}%`, background: 'var(--color-primary)' }} />}
              <span style={{ fontSize: compact ? 20 : 18 }}>{t.emoji}</span>
              {!compact && (
                <span className="flex flex-col items-start min-w-0">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    {cd > 0 ? `${Math.ceil(cd)}s` : `${t.perf > 0 ? '+' : ''}${t.perf} perf`}{t.once ? ' · once' : ''}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {result && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>{result}</p>}

      <button onClick={clockOut} disabled={busy !== null}
        className="w-full"
        style={{
          padding: compact ? '9px' : '12px', borderRadius: 12,
          fontFamily: 'var(--font-arcade)', fontSize: 16, letterSpacing: '0.12em',
          background: over ? 'linear-gradient(135deg, #00E096, #00C2FF)' : 'transparent',
          color: over ? '#04121C' : canLeavePaid ? 'var(--text-primary)' : 'var(--text-muted)',
          border: over ? 'none' : '1px solid var(--border-mid)',
        }}>
        {over ? `CLOCK OUT · +${earned} TIDE` : canLeavePaid ? `LEAVE EARLY · +${earned}` : 'LEAVE (UNPAID)'}
      </button>
    </div>
  );
}
