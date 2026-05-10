'use client';

import { motion } from 'framer-motion';
import { ListChecks, Clock, Trophy, ChevronRight } from 'lucide-react';
import { useGameStore, selectNearbyZones } from '@/store/game';
import type { TaskDemand, Zone } from '@/types';

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TasksScreen() {
  const nearbyZones = useGameStore(selectNearbyZones);

  const tasks: Array<{ task: TaskDemand; zone: Zone }> = nearbyZones
    .filter((z) => z.task_demand !== null)
    .map((z) => ({ task: z.task_demand!, zone: z }));

  return (
    <motion.div
      className="absolute inset-0 z-[15] flex flex-col"
      style={{ paddingTop: 'calc(var(--safe-top) + 72px)', paddingBottom: 'calc(var(--safe-bottom) + 88px)' }}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
    >
      <div className="px-4 pb-4">
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '24px',
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          marginBottom: '2px',
        }}>
          Tasks
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {tasks.length > 0 ? `${tasks.length} active demands` : 'Zone demands appear as the city comes alive'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {tasks.length === 0 ? (
          <EmptyTasks />
        ) : (
          <div className="space-y-3">
            {tasks.map(({ task, zone }) => (
              <TaskCard key={task.id} task={task} zone={zone} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TaskCard({ task, zone }: { task: TaskDemand; zone: Zone }) {
  const pct = task.current_leader_score
    ? Math.min(100, Math.round((task.current_leader_score / task.claim_threshold) * 100))
    : 0;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--surface-panel)',
        border: '1px solid rgba(217,119,6,0.18)',
        backdropFilter: 'blur(20px)',
        boxShadow: 'var(--shadow-card)',
      }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {task.title}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {zone.name} · {zone.district}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '14px', color: 'var(--color-gold)' }}>
              {task.reward_tokens.toLocaleString()}T
            </span>
            <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <Clock size={10} />
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>{timeLeft(task.expires_at)}</span>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex justify-between mb-1">
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>PROGRESS</span>
            <span style={{ fontSize: '10px', color: 'var(--color-gold)', fontFamily: 'var(--font-mono)' }}>{pct}%</span>
          </div>
          <div className="h-1 rounded-full" style={{ background: 'var(--border-mid)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-gold), var(--color-secondary))', transition: 'width 0.4s ease' }}
            />
          </div>
        </div>

        {task.current_leader_handle && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Trophy size={11} style={{ color: 'var(--color-gold)' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Leading: <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>@{task.current_leader_handle}</span>
              </span>
            </div>
            <button className="flex items-center gap-1" style={{ color: 'var(--color-primary)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              BEAT THEM <ChevronRight size={11} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyTasks() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
        style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.14)' }}
      >
        <ListChecks size={32} style={{ color: 'var(--color-gold)', opacity: 0.6 }} />
      </div>

      <p style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: '18px',
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        marginBottom: '8px',
      }}>
        No active tasks
      </p>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '240px' }}>
        Task demands appear when zones heat up. Surf zones to trigger activity.
      </p>
    </div>
  );
}
