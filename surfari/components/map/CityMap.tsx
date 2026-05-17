'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useGameStore } from '@/store/game';
import { DAR_ZONES, ZONE_TIER_COLORS, ZONE_STATE_COLORS } from '@/lib/game/zones';
import { MAP_CONFIG } from '@/lib/map/style';
import { ZonePopup } from '@/components/game/ZonePopup';
import { selectActiveTab } from '@/store/game';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

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
  map.addSource('ambient-players', { type: 'geojson', data: buildAmbientPlayers() });
  map.addSource('real-players', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Outer glow halo
  map.addLayer({
    id: 'zones-halo',
    type: 'circle',
    source: 'zones',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 15, 52],
      'circle-color': ['get', 'tierColor'],
      'circle-opacity': 0.07,
      'circle-blur': 1.6,
    },
  });

  // Zone pulse ring
  map.addLayer({
    id: 'zones-pulse',
    type: 'circle',
    source: 'zones',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 26],
      'circle-color': ['get', 'tierColor'],
      'circle-opacity': 0.18,
      'circle-blur': 0.8,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': ['get', 'tierColor'],
      'circle-stroke-opacity': 0.4,
    },
  });

  // Zone core dot
  map.addLayer({
    id: 'zones-core',
    type: 'circle',
    source: 'zones',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 10],
      'circle-color': ['get', 'tierColor'],
      'circle-opacity': 1,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#0A0E1A',
      'circle-stroke-opacity': 0.9,
    },
  });

  // Inner bright core
  map.addLayer({
    id: 'zones-inner',
    type: 'circle',
    source: 'zones',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 4],
      'circle-color': '#ffffff',
      'circle-opacity': 0.75,
    },
  });

  // Zone label
  map.addLayer({
    id: 'zones-label',
    type: 'symbol',
    source: 'zones',
    minzoom: 13,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 11,
      'text-offset': [0, 1.8],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': '#F0F6FF',
      'text-halo-color': '#0A0E1A',
      'text-halo-width': 2,
      'text-opacity': 0.9,
    },
  });

  // Ambient player traces
  map.addLayer({
    id: 'ambient-players',
    type: 'circle',
    source: 'ambient-players',
    paint: {
      'circle-radius': 3.5,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.5,
      'circle-blur': 0.6,
    },
  });

  // Real players
  map.addLayer({
    id: 'real-players',
    type: 'circle',
    source: 'real-players',
    paint: {
      'circle-radius': 6,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.9,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#F0F4FF',
      'circle-stroke-opacity': 0.8,
    },
  });
}

export default function CityMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { mapView, nearby_players, setMapLoaded, setMapView, selectZone } = useGameStore();
  const selected_zone = useGameStore((s) => s.selected_zone);
  const activeTab = useGameStore(selectActiveTab);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [mapView.longitude, mapView.latitude],
      zoom: mapView.zoom,
      pitch: mapView.pitch,
      bearing: mapView.bearing,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: MAP_CONFIG.maxBounds,
      antialias: true,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Tune light-v11 to match the app's blue-white palette
      const setFill = (id: string, color: string) => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'fill-color', color);
      };
      const setLine = (id: string, color: string) => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', color);
      };

      setFill('water', '#B8D4E8');
      setFill('water-shadow', '#B8D4E8');
      setLine('waterway', '#99BCD6');
      setLine('waterway-shadow', '#99BCD6');
      setFill('landcover-wood', '#C8DDB8');
      setFill('national-park', '#C4DAB4');

      addZoneLayers(map);

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
        // On desktop, route to surf tab so the sidebar shows zone detail
        if (window.innerWidth >= 1024) state.setActiveTab('surf');
      });

      map.on('mouseenter', 'zones-core', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'zones-core', () => { map.getCanvas().style.cursor = ''; });

      setMapLoaded(true);
    });

    // Fallback — mark loaded even on style error so the UI isn't stuck
    map.on('error', () => setMapLoaded(true));

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

    map.flyTo({
      center: [selected_zone.lng, selected_zone.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 600,
      essential: true,
    });

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

  return (
    <div className="absolute inset-0" style={{ background: 'var(--color-bg)' }}>
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
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
