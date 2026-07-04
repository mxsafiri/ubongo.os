import type { MapViewState } from '@/types';

export const MAP_CONFIG = {
  minZoom: 11,
  maxZoom: 19,
  maxBounds: [
    [39.0, -7.1],
    [39.6, -6.5],
  ] as [[number, number], [number, number]],
};

export const DEFAULT_VIEW: MapViewState = {
  longitude: 39.2083,
  latitude: -6.7924,
  zoom: 14.6,
  pitch: 62,
  bearing: -24,
};

export const SURFARI_MAP_STYLE = {
  version: 8,
  name: 'Surfari Dark',
  glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}',
  sprite: 'mapbox://sprites/mapbox/dark-v11',
  sources: {
    'mapbox-dem': {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
    },
    'composite': {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#060810',
      },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'composite',
      'source-layer': 'water',
      paint: {
        'fill-color': '#0A1628',
      },
    },
    {
      id: 'landuse',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landuse',
      paint: {
        'fill-color': '#0D1520',
        'fill-opacity': 0.8,
      },
    },
    {
      id: 'roads-secondary',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['in', 'class', 'secondary', 'tertiary', 'residential', 'service'],
      paint: {
        'line-color': '#152030',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 16, 2],
      },
    },
    {
      id: 'roads-major',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['in', 'class', 'primary', 'trunk', 'motorway'],
      paint: {
        'line-color': '#1E3A5F',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 4],
      },
    },
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'composite',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['get', 'height'],
          0, '#111827',
          100, '#1A2235',
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.9,
      },
    },
  ],
};
