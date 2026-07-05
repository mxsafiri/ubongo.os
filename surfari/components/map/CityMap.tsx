'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useGameStore } from '@/store/game';
import { DAR_ZONES, ZONE_TIER_COLORS, ZONE_STATE_COLORS } from '@/lib/game/zones';
import { MAP_CONFIG } from '@/lib/map/style';
import { ZonePopup } from '@/components/game/ZonePopup';
import { SurfRun } from './SurfRun';
import { selectActiveTab } from '@/store/game';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

// Real-time Dar es Salaam (EAT, UTC+3) light cycle
function darLightPreset(): 'dawn' | 'day' | 'dusk' | 'night' {
  const now = new Date();
  const h = (now.getUTCHours() + now.getUTCMinutes() / 60 + 3) % 24;
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19.5) return 'dusk';
  return 'night';
}

// Beam height per tier — crown zones tower over the city
const TIER_BEAM_HEIGHT: Record<string, number> = {
  crown: 900,
  jungle_deep: 700,
  coral_ridge: 600,
  savanna: 500,
  shoreline: 420,
};

// Generate a circle polygon (meters → degrees) for extrusion layers
function circleCoords(lng: number, lat: number, radiusM: number, points = 40): number[][] {
  const dx = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusM / 110574;
  const coords: number[][] = [];
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    coords.push([lng + dx * Math.cos(theta), lat + dy * Math.sin(theta)]);
  }
  return coords;
}

function buildZonesGeoJSON(zones: typeof DAR_ZONES): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      id: z.id,
      geometry: { type: 'Point', coordinates: [z.lng, z.lat] },
      properties: {
        id: z.id,
        name: z.name,
        tier: z.tier,
        state: z.state,
        tierColor: ZONE_TIER_COLORS[z.tier] ?? '#4A5A7A',
        stateColor: ZONE_STATE_COLORS[z.state] ?? '#4A5A7A',
        radius: z.radius_meters,
      },
    })),
  };
}

// Volumetric light beams — thin glowing pillars rising from each zone core.
// Built-up zones (level II–V) grow taller: an empire you can see across town.
function buildBeamsGeoJSON(zones: typeof DAR_ZONES): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      id: `beam-${z.id}`,
      geometry: { type: 'Polygon', coordinates: [circleCoords(z.lng, z.lat, 26, 24)] },
      properties: {
        id: z.id,
        tierColor: ZONE_TIER_COLORS[z.tier] ?? '#4A5A7A',
        beamHeight: (TIER_BEAM_HEIGHT[z.tier] ?? 450) + ((z.level ?? 1) - 1) * 180,
      },
    })),
  };
}

// Territory domes — low translucent discs covering the zone's actual radius
function buildTerritoryGeoJSON(zones: typeof DAR_ZONES): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      id: `territory-${z.id}`,
      geometry: { type: 'Polygon', coordinates: [circleCoords(z.lng, z.lat, z.radius_meters)] },
      properties: {
        id: z.id,
        tierColor: ZONE_TIER_COLORS[z.tier] ?? '#4A5A7A',
      },
    })),
  };
}

function buildAmbientPlayers(): GeoJSON.FeatureCollection {
  const center = { lng: 39.2083, lat: -6.7924 };
  const colors = ['#00C2FF', '#FF7A35', '#00E096', '#FFB800', '#7C5CFC', '#FF4757', '#00C2FF', '#00E096'];
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: 8 }, (_, i) => ({
      type: 'Feature' as const,
      id: `ambient-${i}`,
      geometry: {
        type: 'Point' as const,
        coordinates: [
          center.lng + (Math.random() - 0.5) * 0.06,
          center.lat + (Math.random() - 0.5) * 0.06,
        ],
      },
      properties: { color: colors[i % colors.length] },
    })),
  };
}

function addZoneLayers(map: mapboxgl.Map) {
  map.addSource('zones', { type: 'geojson', data: buildZonesGeoJSON(DAR_ZONES) });
  map.addSource('zone-beams', { type: 'geojson', data: buildBeamsGeoJSON(DAR_ZONES) });
  map.addSource('zone-territory', { type: 'geojson', data: buildTerritoryGeoJSON(DAR_ZONES) });
  map.addSource('ambient-players', { type: 'geojson', data: buildAmbientPlayers() });
  map.addSource('real-players', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addSource('shockwave', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addSource('plant-site', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Territory dome — translucent disc over the zone's real radius, depth-sorted with buildings
  map.addLayer({
    id: 'zones-territory',
    type: 'fill-extrusion',
    source: 'zone-territory',
    slot: 'middle',
    paint: {
      'fill-extrusion-color': ['get', 'tierColor'],
      'fill-extrusion-height': 22,
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.16,
      'fill-extrusion-emissive-strength': 0.7,
    },
  });

  // Volumetric light beam — the zone beacon, visible across the whole city
  map.addLayer({
    id: 'zones-beam',
    type: 'fill-extrusion',
    source: 'zone-beams',
    slot: 'middle',
    paint: {
      'fill-extrusion-color': ['get', 'tierColor'],
      'fill-extrusion-height': ['get', 'beamHeight'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.45,
      'fill-extrusion-emissive-strength': 1.4,
    },
  });

  // Outer glow halo
  map.addLayer({
    id: 'zones-halo',
    type: 'circle',
    source: 'zones',
    slot: 'top',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 15, 52],
      'circle-color': ['get', 'tierColor'],
      'circle-opacity': 0.08,
      'circle-blur': 1.6,
      'circle-emissive-strength': 1,
    },
  });

  // Zone pulse ring
  map.addLayer({
    id: 'zones-pulse',
    type: 'circle',
    source: 'zones',
    slot: 'top',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 26],
      'circle-color': ['get', 'tierColor'],
      'circle-opacity': 0.18,
      'circle-blur': 0.8,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': ['get', 'tierColor'],
      'circle-stroke-opacity': 0.4,
      'circle-emissive-strength': 1,
    },
  });

  // Zone core dot — the click target
  map.addLayer({
    id: 'zones-core',
    type: 'circle',
    source: 'zones',
    slot: 'top',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 10],
      'circle-color': ['get', 'tierColor'],
      'circle-opacity': 1,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#0A0E1A',
      'circle-stroke-opacity': 0.9,
      'circle-emissive-strength': 1,
    },
  });

  // Inner bright core
  map.addLayer({
    id: 'zones-inner',
    type: 'circle',
    source: 'zones',
    slot: 'top',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 4],
      'circle-color': '#ffffff',
      'circle-opacity': 0.75,
      'circle-emissive-strength': 1,
    },
  });

  // Zone label
  map.addLayer({
    id: 'zones-label',
    type: 'symbol',
    source: 'zones',
    slot: 'top',
    minzoom: 13,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-size': 11,
      'text-offset': [0, 1.8],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': '#F0F6FF',
      'text-halo-color': '#0A0E1A',
      'text-halo-width': 2,
      'text-opacity': 0.9,
      'text-emissive-strength': 1,
    },
  });

  // Ambient player traces
  map.addLayer({
    id: 'ambient-players',
    type: 'circle',
    source: 'ambient-players',
    slot: 'top',
    paint: {
      'circle-radius': 3.5,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.5,
      'circle-blur': 0.6,
      'circle-emissive-strength': 1,
    },
  });

  // Real players
  map.addLayer({
    id: 'real-players',
    type: 'circle',
    source: 'real-players',
    slot: 'top',
    paint: {
      'circle-radius': 6,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.9,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#F0F4FF',
      'circle-stroke-opacity': 0.8,
      'circle-emissive-strength': 1,
    },
  });

  // Plant-site marker — pulsing target where the player wants to build turf
  map.addLayer({
    id: 'plant-site-glow',
    type: 'circle',
    source: 'plant-site',
    slot: 'top',
    paint: {
      'circle-radius': 26,
      'circle-color': '#00E096',
      'circle-opacity': 0.18,
      'circle-blur': 0.9,
      'circle-emissive-strength': 1,
    },
  });
  map.addLayer({
    id: 'plant-site-ring',
    type: 'circle',
    source: 'plant-site',
    slot: 'top',
    paint: {
      'circle-radius': 13,
      'circle-color': 'transparent',
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#00E096',
      'circle-stroke-opacity': 0.9,
      'circle-emissive-strength': 1,
    },
  });
  map.addLayer({
    id: 'plant-site-core',
    type: 'circle',
    source: 'plant-site',
    slot: 'top',
    paint: {
      'circle-radius': 4,
      'circle-color': '#00E096',
      'circle-emissive-strength': 1,
    },
  });

  // Capture shockwave — expanding ring + glow, animated via rAF on ownership change
  map.addLayer({
    id: 'shockwave-glow',
    type: 'circle',
    source: 'shockwave',
    slot: 'top',
    paint: {
      'circle-radius': 5,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0,
      'circle-blur': 1,
      'circle-emissive-strength': 1,
    },
  });
  map.addLayer({
    id: 'shockwave-ring',
    type: 'circle',
    source: 'shockwave',
    slot: 'top',
    paint: {
      'circle-radius': 10,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0,
      'circle-stroke-width': 3,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-opacity': 0,
      'circle-emissive-strength': 1,
    },
  });
}

// Expanding ring + fading glow at a capture point, ~1.4s
function fireShockwave(map: mapboxgl.Map, lng: number, lat: number, color: string) {
  const src = map.getSource('shockwave') as mapboxgl.GeoJSONSource | undefined;
  if (!src || !map.getLayer('shockwave-ring')) return;
  src.setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { color },
    }],
  });
  const start = performance.now();
  const DUR = 1400;
  const step = () => {
    if (!map.getLayer('shockwave-ring')) return;
    const t = (performance.now() - start) / DUR;
    if (t >= 1) {
      map.setPaintProperty('shockwave-ring', 'circle-stroke-opacity', 0);
      map.setPaintProperty('shockwave-glow', 'circle-opacity', 0);
      return;
    }
    const ease = 1 - Math.pow(1 - t, 3);
    map.setPaintProperty('shockwave-ring', 'circle-radius', 8 + ease * 120);
    map.setPaintProperty('shockwave-ring', 'circle-stroke-opacity', 0.9 * (1 - t));
    map.setPaintProperty('shockwave-glow', 'circle-radius', 5 + ease * 80);
    map.setPaintProperty('shockwave-glow', 'circle-opacity', 0.4 * (1 - t));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function CityMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { mapView, nearby_players, setMapLoaded, setMapView, selectZone } = useGameStore();
  const selected_zone = useGameStore((s) => s.selected_zone);
  const activeTab = useGameStore(selectActiveTab);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [mapObj, setMapObj] = useState<mapboxgl.Map | null>(null);
  const [surfMode, setSurfMode] = useState(false);
  const surfModeRef = useRef(false);
  surfModeRef.current = surfMode;
  const introDone = useRef(false);
  const prevOwnersRef = useRef<Map<string, string | null>>(new Map());
  const wanderersRef = useRef<{ lng: number; lat: number; heading: number; speed: number; color: string }[]>([]);

  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard',
      config: {
        basemap: {
          lightPreset: darLightPreset(),
          showPointOfInterestLabels: false,
          showTransitLabels: false,
        },
      },
      // Start high and flat — the intro flight brings us down into the city
      center: [mapView.longitude, mapView.latitude],
      zoom: Math.min(mapView.zoom, 11.8),
      pitch: 0,
      bearing: 0,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: MAP_CONFIG.maxBounds,
      antialias: true,
    });

    mapRef.current = map;
    let pulseRaf: number | null = null;

    map.on('style.load', () => {
      addZoneLayers(map);

      // Cinematic intro — dive from orbit into the dusk city, banking as we descend
      if (!introDone.current) {
        introDone.current = true;
        map.flyTo({
          center: [mapView.longitude, mapView.latitude],
          zoom: 14.6,
          pitch: 62,
          bearing: -24,
          duration: 4200,
          curve: 1.6,
          essential: true,
        });
      }

      // Breathing beacons — beams pulse slowly like a heartbeat
      const pulse = () => {
        if (!map.getLayer('zones-beam')) return;
        const t = performance.now() / 1000;
        map.setPaintProperty('zones-beam', 'fill-extrusion-opacity', 0.38 + 0.16 * Math.sin(t * 1.6));
        pulseRaf = requestAnimationFrame(pulse);
      };
      pulseRaf = requestAnimationFrame(pulse);

      // Zone click — prefer live store data (ownership), fall back to static
      map.on('click', 'zones-core', (e) => {
        if (!e.features?.[0]) return;
        const zoneId = e.features[0].properties?.id as string;
        const state = useGameStore.getState();
        const zone =
          state.nearby_zones.find((z) => z.id === zoneId) ??
          DAR_ZONES.find((z) => z.id === zoneId);
        if (!zone) return;
        state.selectZone(zone);
        // On desktop, route to surf tab and pop the sidebar open if collapsed
        if (window.innerWidth >= 1024) { state.setActiveTab('surf'); state.setSidebarCollapsed(false); }
      });

      // Beams are big click targets too — tapping a beacon selects its zone
      map.on('click', 'zones-beam', (e) => {
        if (!e.features?.[0]) return;
        const zoneId = e.features[0].properties?.id as string;
        const state = useGameStore.getState();
        const zone =
          state.nearby_zones.find((z) => z.id === zoneId) ??
          DAR_ZONES.find((z) => z.id === zoneId);
        if (!zone) return;
        state.selectZone(zone);
        if (window.innerWidth >= 1024) { state.setActiveTab('surf'); state.setSidebarCollapsed(false); }
      });

      map.on('mouseenter', 'zones-core', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'zones-core', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'zones-beam', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'zones-beam', () => { map.getCanvas().style.cursor = ''; });

      // Empty-map click → drop a plant-site target (build-your-own-turf flow).
      // Zone layer clicks take priority; only open plant mode on bare ground.
      // Disabled while riding in Surf Run.
      map.on('click', (e) => {
        if (surfModeRef.current) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: ['zones-core', 'zones-beam'] });
        if (hits.length > 0) return;
        const state = useGameStore.getState();
        if (!state.player) return;
        state.setPlantSite({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      });

      setMapObj(map);

      setMapLoaded(true);
    });

    // Fallback — mark loaded even on style error so the UI isn't stuck
    map.on('error', () => setMapLoaded(true));

    // Follow real Dar es Salaam time — re-check the light preset every 5 minutes
    const lightInterval = setInterval(() => {
      try {
        map.setConfigProperty('basemap', 'lightPreset', darLightPreset());
      } catch { /* style not ready yet */ }
    }, 5 * 60 * 1000);

    // Ambient wanderers — city dwellers drifting through the streets
    const wanderInterval = setInterval(() => {
      if (!map.getSource('ambient-players')) return;
      if (wanderersRef.current.length === 0) {
        const center = { lng: 39.2083, lat: -6.7924 };
        const colors = ['#00C2FF', '#FF7A35', '#00E096', '#FFB800', '#7C5CFC', '#FF4757', '#00C2FF', '#00E096'];
        wanderersRef.current = Array.from({ length: 8 }, (_, i) => ({
          lng: center.lng + (Math.random() - 0.5) * 0.06,
          lat: center.lat + (Math.random() - 0.5) * 0.06,
          heading: Math.random() * Math.PI * 2,
          speed: 0.000045 + Math.random() * 0.00005,
          color: colors[i % colors.length],
        }));
      }
      const bounds = { minLng: 39.16, maxLng: 39.32, minLat: -6.85, maxLat: -6.74 };
      for (const w of wanderersRef.current) {
        w.heading += (Math.random() - 0.5) * 0.5; // gentle meandering
        w.lng += Math.cos(w.heading) * w.speed;
        w.lat += Math.sin(w.heading) * w.speed;
        // Turn around at the city edge
        if (w.lng < bounds.minLng || w.lng > bounds.maxLng || w.lat < bounds.minLat || w.lat > bounds.maxLat) {
          w.heading += Math.PI;
          w.lng = Math.min(Math.max(w.lng, bounds.minLng), bounds.maxLng);
          w.lat = Math.min(Math.max(w.lat, bounds.minLat), bounds.maxLat);
        }
      }
      const src = map.getSource('ambient-players') as mapboxgl.GeoJSONSource | undefined;
      src?.setData({
        type: 'FeatureCollection',
        features: wanderersRef.current.map((w, i) => ({
          type: 'Feature',
          id: `ambient-${i}`,
          geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
          properties: { color: w.color },
        })),
      });
    }, 150);

    map.on('moveend', () => {
      const center = map.getCenter();
      setMapView({
        longitude: center.lng,
        latitude: center.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
    });

    return () => {
      if (pulseRaf !== null) cancelAnimationFrame(pulseRaf);
      clearInterval(lightInterval);
      clearInterval(wanderInterval);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track selected zone screen position and fly camera to it
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (!selected_zone) {
      setPopupPos(null);
      return;
    }

    // Cinematic approach — swoop in low with a slight orbit toward the beacon.
    // Skipped in Surf Run: the chase cam owns the camera while riding.
    if (!surfModeRef.current) {
      map.flyTo({
        center: [selected_zone.lng, selected_zone.lat],
        zoom: Math.max(map.getZoom(), 15.6),
        pitch: 62,
        bearing: map.getBearing() + 18,
        duration: 1500,
        curve: 1.4,
        essential: true,
      });
    }

    const updatePos = () => {
      const pt = map.project([selected_zone.lng, selected_zone.lat]);
      setPopupPos({ x: Math.round(pt.x), y: Math.round(pt.y) });
    };

    updatePos();
    map.on('move', updatePos);
    map.on('zoom', updatePos);
    return () => {
      map.off('move', updatePos);
      map.off('zoom', updatePos);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected_zone]);

  // Watch live zone data — refresh map sources and fire a capture shockwave
  // whenever any zone changes hands
  const nearby_zones = useGameStore((s) => s.nearby_zones);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || nearby_zones.length === 0) return;

    const prev = prevOwnersRef.current;
    const firstRun = prev.size === 0;
    for (const z of nearby_zones) {
      const old = prev.get(z.id);
      if (!firstRun && old !== undefined && old !== (z.owner_id ?? null)) {
        fireShockwave(map, z.lng, z.lat, z.owner_color ?? '#00E096');
      }
      prev.set(z.id, z.owner_id ?? null);
    }

    // Keep zone properties (state, ownership) current on the map — and rebuild
    // beams + territory so newly planted player turf gets its beacon instantly
    const src = map.getSource('zones') as mapboxgl.GeoJSONSource | undefined;
    src?.setData(buildZonesGeoJSON(nearby_zones));
    const beamSrc = map.getSource('zone-beams') as mapboxgl.GeoJSONSource | undefined;
    beamSrc?.setData(buildBeamsGeoJSON(nearby_zones));
    const terrSrc = map.getSource('zone-territory') as mapboxgl.GeoJSONSource | undefined;
    terrSrc?.setData(buildTerritoryGeoJSON(nearby_zones));
  }, [nearby_zones]);

  // Show/hide the plant-site target marker
  const plant_site = useGameStore((s) => s.plant_site);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('plant-site') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: plant_site
        ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [plant_site.lng, plant_site.lat] }, properties: {} }]
        : [],
    });
  }, [plant_site]);

  // Update real-players source when nearby_players changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource('real-players') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: nearby_players
        .filter((p) => p.geo_lat != null && p.geo_lng != null)
        .map((p) => ({
          type: 'Feature',
          id: p.id,
          geometry: { type: 'Point', coordinates: [p.geo_lng!, p.geo_lat!] },
          properties: { color: p.avatar_color },
        })),
    });
  }, [nearby_players]);

  const player = useGameStore((s) => s.player);

  return (
    <div className="absolute inset-0" style={{ background: '#0A0E1A' }}>
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Surf Run toggle — ride the city as your avatar */}
      {player && mapObj && !surfMode && (
        <button
          onClick={() => setSurfMode(true)}
          className="absolute z-30 flex items-center gap-2 px-3.5 py-2.5"
          style={{
            right: 16,
            bottom: 'calc(var(--screen-pad-bottom, 24px) + 16px)',
            background: 'rgba(9,13,24,0.85)',
            border: '1px solid rgba(0,224,150,0.45)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.45), 0 0 20px rgba(0,224,150,0.15)',
          }}
          aria-label="Enter Surf Run"
        >
          <span style={{ fontSize: '17px', lineHeight: 1 }}>🏄</span>
          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', letterSpacing: '0.14em', color: '#00E096', lineHeight: 1 }}>
            SURF RUN
          </span>
        </button>
      )}

      {surfMode && mapObj && (
        <SurfRun map={mapObj} onExit={() => setSurfMode(false)} />
      )}

      {/* Floating popup — mobile only; desktop uses the sidebar */}
      <AnimatePresence>
        {selected_zone && popupPos && activeTab === 'map' && typeof window !== 'undefined' && window.innerWidth < 1024 && (
          <ZonePopup
            key={selected_zone.id}
            zone={selected_zone}
            x={popupPos.x}
            y={popupPos.y}
            onClose={() => selectZone(null)}
            onSurf={() => selectZone(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
