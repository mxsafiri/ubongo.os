// One-thumb riding controls.
//
// The board cruises on its own; your thumb only steers and does tricks.
// Put a finger down anywhere and drag: sideways steers (let go and you ride
// straight), up pushes harder, down brakes. A quick tap is the tail-whip,
// a quick flick up is a jump. A second finger can tap or flick while the
// first one steers. Pure logic over pointer samples — unit-tested.

import { clamp } from './motion';

export const THUMB = {
  STEER_PX: 70,      // sideways drag for full lock
  DEADZONE: 0.08,
  PUSH_PX: 90,       // drag up/down for full push or brake
  BRAKE_AT: -0.35,   // drag down past this (share of PUSH_PX) to brake
  CRUISE: 0.72,      // throttle with no input
  FLICK_PX: 48,      // upward travel for a jump flick…
  FLICK_MS: 260,     // …within this long of touching down
  TAP_PX: 12,        // a tap barely moves…
  TAP_MS: 240,       // …and is short
} as const;

export type Gesture = 'whip' | 'jump' | null;

export interface ThumbInput {
  steer: number;     // -1 (left) … 1 (right)
  throttle: number;  // 0 … 1
  brake: boolean;
  steering: boolean; // a finger is down steering
}

interface Finger {
  x0: number; y0: number; t0: number;
  x: number; y: number;
  maxMove: number;
  flicked: boolean;
}

export class ThumbControls {
  private fingers = new Map<number, Finger>();
  private order: number[] = []; // oldest first — the oldest finger steers

  down(id: number, x: number, y: number, t: number) {
    this.fingers.set(id, { x0: x, y0: y, t0: t, x, y, maxMove: 0, flicked: false });
    this.order.push(id);
  }

  /** Returns 'jump' the moment a flick is recognised. */
  move(id: number, x: number, y: number, t: number): Gesture {
    const f = this.fingers.get(id);
    if (!f) return null;
    f.x = x;
    f.y = y;
    f.maxMove = Math.max(f.maxMove, Math.hypot(x - f.x0, y - f.y0));
    const up = f.y0 - y;
    if (!f.flicked && t - f.t0 <= THUMB.FLICK_MS && up >= THUMB.FLICK_PX && up > 1.2 * Math.abs(x - f.x0)) {
      f.flicked = true;
      // Re-anchor vertically so the flick doesn't leave you stuck pushing
      f.y0 = y;
      return 'jump';
    }
    return null;
  }

  /** Returns 'whip' when the finger that lifted was a tap. */
  up(id: number, t: number): Gesture {
    const f = this.fingers.get(id);
    this.cancel(id);
    if (!f || f.flicked) return null;
    return t - f.t0 <= THUMB.TAP_MS && f.maxMove <= THUMB.TAP_PX ? 'whip' : null;
  }

  cancel(id: number) {
    this.fingers.delete(id);
    this.order = this.order.filter((o) => o !== id);
  }

  reset() {
    this.fingers.clear();
    this.order = [];
  }

  /** Where the steering finger touched down and how far it has dragged (px). */
  stick(): { x0: number; y0: number; dx: number; dy: number } | null {
    const f = this.steerFinger();
    return f ? { x0: f.x0, y0: f.y0, dx: f.x - f.x0, dy: f.y - f.y0 } : null;
  }

  input(): ThumbInput {
    const f = this.steerFinger();
    if (!f) return { steer: 0, throttle: THUMB.CRUISE, brake: false, steering: false };
    let steer = clamp((f.x - f.x0) / THUMB.STEER_PX, -1, 1);
    if (Math.abs(steer) < THUMB.DEADZONE) steer = 0;
    const push = clamp((f.y0 - f.y) / THUMB.PUSH_PX, -1, 1);
    const brake = push < THUMB.BRAKE_AT;
    const throttle = brake ? 0 : THUMB.CRUISE + Math.max(0, push) * (1 - THUMB.CRUISE);
    return { steer, throttle, brake, steering: true };
  }

  private steerFinger() {
    const id = this.order[0];
    return id === undefined ? undefined : this.fingers.get(id);
  }
}
