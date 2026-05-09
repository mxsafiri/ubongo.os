'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useGameStore } from '@/store/game';
import { DAR_ZONES, ZONE_TIER_COLORS, ZONE_STATE_COLORS } from '@/lib/game/zones';
import { MAP_CONFIG } from '@/lib/map/style';

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

  // Zone pulse ring
  map.addLayer({
    id: 'zones-pulse',
    type: 'circle',
    source: 'zones',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 14, 16, 32],
      'circle-color': ['get', 'tierColor'],
      'circle-opacity': 0.15,
      'circle-blur': 1.2,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': ['get', 'stateColor'],
      'circle-stroke-opacity': 0.5,
    },
  });

  // Zone core dot
  map.addLayer({
    id: 'zones-core',
    type: 'circle',
    source: 'zones',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 11],
      'circle-color': ['get', 'tierColor'],
      'circle-opacity': 0.95,
      'circle-stroke-width': 2,
      'circle-stroke-color': ['get', 'stateColor'],
      'circle-stroke-opacity': 1,
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
      'text-color': '#F0F4FF',
      'text-halo-color': '#060810',
      'text-halo-width': 1.5,
      'text-opacity': 0.9,
    },
  });

  // Ambient player traces
  map.addLayer({
    id: 'ambient-players',
    type: 'circle',
    source: 'ambient-players',
    paint: {
      'circle-radius': 3,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.45,
      'circle-blur': 0.5,
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

  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
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
      // Darken the base map to match Surfari palette
      if (map.getLayer('background')) {
        map.setPaintProperty('background', 'background-color', '#060810');
      }
      if (map.getLayer('water')) {
        map.setPaintProperty('water', 'fill-color', '#0A1628');
      }
      if (map.getLayer('land')) {
        map.setPaintProperty('land', 'background-color', '#0D1520');
      }

      addZoneLayers(map);

      // Zone click
      map.on('click', 'zones-core', (e) => {
        if (!e.features?.[0]) return;
        const zoneId = e.features[0].properties?.id as string;
        const zone = DAR_ZONES.find((z) => z.id === zoneId);
        if (zone) selectZone(zone);
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
    <div
      ref={mapContainer}
      className="absolute inset-0 w-full h-full"
      style={{ background: '#060810' }}
    />
  );
}
