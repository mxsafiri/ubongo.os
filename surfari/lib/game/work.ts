// Shifts you play, not wait out.
//
// A shift runs on the real clock through stages — getting there, getting
// ready, on the job, wrapping up. While you're on the job you pick what to
// do: steady work, a hard hustle, showing the boss, a chat, a breather.
// Each has a cooldown and moves your performance, and performance sets the
// pay. Stay at least half the shift to be paid for the part you did.
//
// Pure functions over timestamps, shared by the client (live panel) and the
// server (which enforces every rule) — unit-tested.

import type { Job } from './places';

export type TaskId = 'kazi' | 'chakarika' | 'bosi' | 'stori' | 'pumzika';

export interface Task {
  id: TaskId;
  emoji: string;
  name: string;      // Swahili
  nameEn: string;
  perf: number;      // performance change
  cooldownS: number;
  once?: boolean;    // at most once per shift
  good?: boolean;    // counts toward the star bonus
}

export const TASKS: Task[] = [
  { id: 'kazi', emoji: '🛠️', name: 'Fanya kazi', nameEn: 'Get to work', perf: 6, cooldownS: 5, good: true },
  { id: 'chakarika', emoji: '🔥', name: 'Chakarika', nameEn: 'Hustle hard', perf: 12, cooldownS: 20, good: true },
  { id: 'bosi', emoji: '🤝', name: 'Mwonyeshe bosi', nameEn: 'Show the boss', perf: 16, cooldownS: 45, once: true, good: true },
  { id: 'stori', emoji: '💬', name: 'Piga stori', nameEn: 'Chat with the team', perf: -3, cooldownS: 12 },
  { id: 'pumzika', emoji: '☕', name: 'Pumzika kidogo', nameEn: 'Take a breather', perf: -6, cooldownS: 25 },
];
export const taskById: Record<TaskId, Task> = Object.fromEntries(TASKS.map((t) => [t.id, t])) as Record<TaskId, Task>;

export const WORK = {
  START_PERF: 50,
  STAR_TASKS: 4,          // good tasks for the star bonus
  STAR_BONUS: 0.15,
  MIN_STAY: 0.5,          // leave early after this share of the shift, paid pro rata
  RANK_STEP: 0.25,        // pay per rank
  MAX_RANK: 3,
} as const;

/** [share of the shift, Swahili, English] — tasks unlock at stage 2. */
export const STAGES: [number, string, string][] = [
  [0, 'Njiani kwenda kazini', 'On the way in'],
  [0.06, 'Kujiandaa', 'Getting ready'],
  [0.14, 'Kazini', 'On the job'],
  [0.92, 'Kumalizia', 'Wrapping up'],
];
const ON_THE_JOB = 2;

export interface Shift {
  jobId: string;
  startedAt: number;          // ms
  endsAt: number;             // ms
  perf: number;               // 0…100
  goodDone: number;
  lastUsed: Partial<Record<TaskId, number>>; // ms each task was last used
}

export function newShift(job: Job, now: number): Shift {
  return { jobId: job.id, startedAt: now, endsAt: now + job.shiftS * 1000, perf: WORK.START_PERF, goodDone: 0, lastUsed: {} };
}

export function progress(s: Shift, now: number) {
  return Math.min(1, Math.max(0, (now - s.startedAt) / (s.endsAt - s.startedAt)));
}

export function stage(s: Shift, now: number) {
  const f = progress(s, now);
  let i = 0;
  STAGES.forEach(([at], k) => { if (f >= at) i = k; });
  return i;
}

/** Seconds until a task can be used again (0 = ready). */
export function cooldownLeft(s: Shift, task: TaskId, now: number) {
  const last = s.lastUsed[task];
  if (last === undefined) return 0;
  return Math.max(0, (last + taskById[task].cooldownS * 1000 - now) / 1000);
}

export type TaskError = 'not_on_the_job' | 'cooling_down' | 'already_done' | 'shift_over';

/** Apply a task. Returns the updated shift, or why it can't be done. */
export function doTask(s: Shift, task: TaskId, now: number): Shift | TaskError {
  if (now >= s.endsAt) return 'shift_over';
  const st = stage(s, now);
  if (st !== ON_THE_JOB) return 'not_on_the_job';
  const t = taskById[task];
  if (t.once && s.lastUsed[task] !== undefined) return 'already_done';
  if (cooldownLeft(s, task, now) > 0) return 'cooling_down';
  return {
    ...s,
    perf: Math.max(0, Math.min(100, s.perf + t.perf)),
    goodDone: s.goodDone + (t.good ? 1 : 0),
    lastUsed: { ...s.lastUsed, [task]: now },
  };
}

/** Rank at a job from completed shifts there: 0, 1, 2, 3 at 0, 3, 12, 27 shifts. */
export function rankFor(shiftsDone: number) {
  return Math.min(WORK.MAX_RANK, Math.floor(Math.sqrt(Math.max(0, shiftsDone) / 3)));
}

export function rankTitle(job: Job, shiftsDone: number) {
  return job.ranks[Math.min(rankFor(shiftsDone), job.ranks.length - 1)];
}

/** Performance → pay multiplier: 0.7 at 0, 1.0 at 50, 1.3 at 100, +15% with the star bonus. */
export function perfMultiplier(s: Pick<Shift, 'perf' | 'goodDone'>) {
  const base = 0.7 + (s.perf / 100) * 0.6;
  return s.goodDone >= WORK.STAR_TASKS ? base * (1 + WORK.STAR_BONUS) : base;
}

/** Full-shift pay at this rank and performance. */
export function fullPay(job: Job, s: Pick<Shift, 'perf' | 'goodDone'>, shiftsDone: number) {
  return Math.round(job.pay * (1 + WORK.RANK_STEP * rankFor(shiftsDone)) * perfMultiplier(s));
}

/**
 * What clocking out now pays: the full shift once it's over, pro rata after
 * the minimum stay, nothing before that (you walked off the job).
 */
export function payout(job: Job, s: Shift, shiftsDone: number, now: number) {
  const f = progress(s, now);
  if (f < WORK.MIN_STAY) return 0;
  return Math.round(fullPay(job, s, shiftsDone) * f);
}
