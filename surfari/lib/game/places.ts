// Real Dar es Salaam places you can go to, and the work each one offers.
//
// Coordinates are approximate street-level positions (WGS84); tune them
// here — everything else (map pins, travel, the server's "are you there?"
// check) reads from this one list. Pay is in Tide per full shift at rank 0.

export interface Job {
  id: string;
  title: string;          // Swahili
  titleEn: string;
  ranks: string[];        // promotion titles, rank 0 first
  pay: number;            // Tide for a full shift at rank 0
  shiftS: number;         // real seconds for a full shift
  emoji: string;
}

export interface Place {
  id: string;
  name: string;
  district: string;
  blurb: string;          // Swahili
  blurbEn: string;
  icon: string;
  lat: number;
  lng: number;
  jobs: Job[];
}

const job = (j: Job) => j;

export const PLACES: Place[] = [
  {
    id: 'kariakoo', name: 'Soko la Kariakoo', district: 'Kariakoo', icon: '🧺',
    lat: -6.8189, lng: 39.2745,
    blurb: 'Soko kubwa la Afrika Mashariki — kila mchongo uko hapa.',
    blurbEn: "East Africa's biggest market — every hustle starts here.",
    jobs: [job({ id: 'machinga', title: 'Machinga', titleEn: 'Street trader', emoji: '🛍️',
      ranks: ['Machinga', 'Muuzaji mzoefu', 'Mwenye meza', 'Dalali wa soko'], pay: 140, shiftS: 120 })],
  },
  {
    id: 'mama-ntilie', name: 'Genge la Mama Ntilie', district: 'Kariakoo', icon: '🍛',
    lat: -6.8201, lng: 39.2770,
    blurb: 'Chipsi mayai, wali maharage na stori za mtaa.',
    blurbEn: 'Chipsi mayai, rice and beans, and the street gossip.',
    jobs: [job({ id: 'jikoni', title: 'Msaidizi wa jikoni', titleEn: 'Kitchen helper', emoji: '🍳',
      ranks: ['Mwosha vyombo', 'Mpishi msaidizi', 'Mpishi mkuu'], pay: 130, shiftS: 120 })],
  },
  {
    id: 'posta', name: 'Ofisi za Posta', district: 'Posta', icon: '🏢',
    lat: -6.8148, lng: 39.2878,
    blurb: 'Minara ya ofisi, AC na tai — kazi ya kishua.',
    blurbEn: 'Office towers, AC and ties — the corporate life.',
    jobs: [job({ id: 'karani', title: 'Karani wa ofisi', titleEn: 'Office clerk', emoji: '🗂️',
      ranks: ['Karani', 'Afisa', 'Meneja', 'Mkurugenzi'], pay: 260, shiftS: 150 })],
  },
  {
    id: 'tech-hub', name: 'Kijiwe cha Tech', district: 'Posta', icon: '💻',
    lat: -6.8131, lng: 39.2843,
    blurb: 'Startups, code na kahawa — ndoto kubwa za Bongo.',
    blurbEn: "Startups, code and coffee — Bongo's big dreams.",
    jobs: [job({ id: 'developer', title: 'Developer', titleEn: 'Developer', emoji: '🧑‍💻',
      ranks: ['Junior dev', 'Developer', 'Senior dev', 'CTO'], pay: 380, shiftS: 180 })],
  },
  {
    id: 'kivukoni', name: 'Kivukoni Feri', district: 'Kivukoni', icon: '⛴️',
    lat: -6.8162, lng: 39.2932,
    blurb: 'Pantoni za Kigamboni na samaki fresh wa asubuhi.',
    blurbEn: 'Ferries to Kigamboni and fresh morning fish.',
    jobs: [job({ id: 'mvuvi', title: 'Mvuvi', titleEn: 'Fisher', emoji: '🎣',
      ranks: ['Mvuvi', 'Nahodha', 'Mwenye mashua'], pay: 200, shiftS: 150 })],
  },
  {
    id: 'muhimbili', name: 'Hospitali ya Muhimbili', district: 'Upanga', icon: '🏥',
    lat: -6.8030, lng: 39.2733,
    blurb: 'Hospitali kuu ya taifa — kazi ya kuokoa maisha.',
    blurbEn: 'The national hospital — the work of saving lives.',
    jobs: [job({ id: 'nesi', title: 'Nesi', titleEn: 'Nurse', emoji: '🩺',
      ranks: ['Nesi mwanafunzi', 'Nesi', 'Nesi mkuu'], pay: 340, shiftS: 180 })],
  },
  {
    id: 'ubungo', name: 'Stendi ya Ubungo', district: 'Ubungo', icon: '🚌',
    lat: -6.7892, lng: 39.2182,
    blurb: 'Daladala na mabasi ya mikoani — konda anakuita!',
    blurbEn: 'Daladalas and upcountry buses — the conductor is calling!',
    jobs: [job({ id: 'konda', title: 'Konda wa daladala', titleEn: 'Daladala conductor', emoji: '🎫',
      ranks: ['Konda', 'Dereva', 'Mwenye daladala'], pay: 170, shiftS: 120 })],
  },
  {
    id: 'udsm', name: 'Chuo Kikuu cha Dar', district: 'Mlimani', icon: '🎓',
    lat: -6.7790, lng: 39.2050,
    blurb: 'Mlimani — vitabu, maktaba na mijadala.',
    blurbEn: 'The Hill — books, the library and big debates.',
    jobs: [job({ id: 'mtafiti', title: 'Msaidizi wa utafiti', titleEn: 'Research assistant', emoji: '🔬',
      ranks: ['Msaidizi', 'Mtafiti', 'Mhadhiri'], pay: 290, shiftS: 150 })],
  },
  {
    id: 'mlimani-city', name: 'Mlimani City', district: 'Mlimani', icon: '🛒',
    lat: -6.7716, lng: 39.2299,
    blurb: 'Mall, sinema na food court — mtoko wa kishua.',
    blurbEn: 'Mall, cinema and food court — a classy day out.',
    jobs: [job({ id: 'cashier', title: 'Cashier', titleEn: 'Cashier', emoji: '🧾',
      ranks: ['Cashier', 'Supervisor', 'Meneja wa duka'], pay: 190, shiftS: 120 })],
  },
  {
    id: 'sinza', name: 'Sinza Mori', district: 'Sinza', icon: '🪩',
    lat: -6.7790, lng: 39.2335,
    blurb: 'Club, bar na nyama choma — starehe mpaka asubuhi.',
    blurbEn: 'Clubs, bars and nyama choma — fun till sunrise.',
    jobs: [job({ id: 'dj', title: 'DJ', titleEn: 'DJ', emoji: '🎧',
      ranks: ['DJ chipukizi', 'Resident DJ', 'DJ bingwa'], pay: 300, shiftS: 150 })],
  },
  {
    id: 'coco-beach', name: 'Coco Beach', district: 'Oyster Bay', icon: '🏖️',
    lat: -6.7610, lng: 39.2932,
    blurb: 'Mihogo ya kuchoma, madafu na upepo wa bahari.',
    blurbEn: 'Roast cassava, fresh coconuts and the ocean breeze.',
    jobs: [job({ id: 'madafu', title: 'Muuza madafu', titleEn: 'Coconut seller', emoji: '🥥',
      ranks: ['Muuza madafu', 'Mwenye kibanda', 'Bosi wa ufukwe'], pay: 120, shiftS: 90 })],
  },
  {
    id: 'masaki', name: 'Masaki Grill', district: 'Masaki', icon: '🦞',
    lat: -6.7490, lng: 39.2826,
    blurb: 'Kamba, pweza na machweo ya Msasani.',
    blurbEn: 'Prawns, octopus and the Msasani sunset.',
    jobs: [job({ id: 'chef', title: 'Chef', titleEn: 'Chef', emoji: '👨‍🍳',
      ranks: ['Commis chef', 'Sous chef', 'Head chef'], pay: 330, shiftS: 150 })],
  },
];

export const placeById: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));

export function findJob(jobId: string): { job: Job; place: Place } | null {
  for (const place of PLACES) for (const job of place.jobs) if (job.id === jobId) return { job, place };
  return null;
}

/** Where you stand at a place: just in front of it (south of the pin), so the pin doesn't hide you. */
export function doorOf(place: { lat: number; lng: number }) {
  return { lat: place.lat - 28 / 110574, lng: place.lng };
}

/** How close (m) you must be to a place to work or do things there. */
export const AT_PLACE_M = 150;

const M_PER_DEG_LAT = 110574;

/** Ground distance in meters between two lng/lat points. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT;
  const dx = (a.lng - b.lng) * 111320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** The place you're standing at, if any. */
export function placeAt(pos: { lat: number; lng: number }, within = AT_PLACE_M): Place | null {
  let best: Place | null = null;
  let bestD = within;
  for (const p of PLACES) {
    const d = distanceM(pos, p);
    if (d <= bestD) { bestD = d; best = p; }
  }
  return best;
}

/* ── Getting around ── */

export const TRAVEL = {
  walk: { label: 'Tembea', labelEn: 'Walk', emoji: '🚶', base: 0, perKm: 0, mps: 55, minS: 4, maxS: 22 },
  boda: { label: 'Bodaboda', labelEn: 'Boda', emoji: '🏍️', base: 10, perKm: 6, mps: 140, minS: 3, maxS: 12 },
} as const;
export type TravelModeId = keyof typeof TRAVEL;

/** Tide for a trip of `meters` (walking is free). */
export function travelFare(mode: TravelModeId, meters: number) {
  const t = TRAVEL[mode];
  return t.base === 0 && t.perKm === 0 ? 0 : Math.round(t.base + (t.perKm * meters) / 1000);
}

/** Seconds a trip takes in game time — compressed so crossing town stays snappy. */
export function travelSeconds(mode: TravelModeId, meters: number) {
  const t = TRAVEL[mode];
  return Math.min(t.maxS, Math.max(t.minS, meters / t.mps));
}
