'use client';

import type mapboxgl from 'mapbox-gl';

// Render-resolution cap for the map canvas.
//
// Phones report devicePixelRatio 3 (9× the pixels of 1×) — for a 3D map plus
// characters that's the single biggest GPU cost, and above 2 it's barely
// visible. Mapbox GL has no public pixel-ratio setter: it reads
// window.devicePixelRatio when it sizes its canvas. So we serve a capped
// value from that property and call map.resize() to apply it. The real
// value stays available via realPixelRatio(). Nothing else on the page
// reads it (CSS isn't affected — this is only the JS property).

let cap = 2;
let realGet: (() => number) | null = null;

function install() {
  if (realGet || typeof window === 'undefined') return;
  const own = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'devicePixelRatio');
  const desc = own ?? proto;
  const initial = window.devicePixelRatio || 1;
  realGet = desc?.get ? () => desc.get!.call(window) as number : () => initial;
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      get: () => Math.min(realGet!(), cap),
    });
  } catch {
    realGet = null; // locked down — leave the browser's value alone
  }
}

export function realPixelRatio() {
  if (typeof window === 'undefined') return 1;
  return realGet ? realGet() : window.devicePixelRatio || 1;
}

/** Cap the map's render resolution and re-size its canvas if the effective ratio changed. */
export function setMapPixelRatioCap(nextCap: number, map?: mapboxgl.Map | null) {
  install();
  const before = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  cap = Math.max(1, nextCap);
  if (map && typeof window !== 'undefined' && window.devicePixelRatio !== before) forceResize(map);
}

// map.resize() is a no-op when the container size hasn't changed, so a new
// pixel ratio would never reach the canvas. Nudge the container 1px and back
// (public API only) to make Mapbox re-size its drawing buffer.
function forceResize(map: mapboxgl.Map) {
  const el = map.getContainer();
  const prev = el.style.width;
  el.style.width = `${Math.max(el.clientWidth - 1, 1)}px`;
  map.resize();
  el.style.width = prev;
  map.resize();
}
