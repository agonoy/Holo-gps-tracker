import { MapContainer, TileLayer, Polyline, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import type { PathPoint } from '../types';

// Fix for Leaflet default marker icons in Vite
import 'leaflet/dist/leaflet.css';

const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  currentPath: PathPoint[];
  historyPaths?: PathPoint[][];
  trailPath?: PathPoint[];
  center?: [number, number];
  zoom?: number;
  showBacktrack?: boolean;
  gpsAccuracy?: number;
  recenterTrigger?: number;
  heading?: number | null;
  mapRotationMode?: 'north-up' | 'heading';
  followMode?: boolean;
  onManualPan?: () => void;
}

function MapActions({ 
  recenterTrigger, 
  currentPoint, 
  trailPath,
  mapRotationMode,
  heading,
  followMode,
  onManualPan
}: { 
  recenterTrigger: number, 
  currentPoint: [number, number] | null, 
  trailPath?: PathPoint[],
  mapRotationMode?: 'north-up' | 'heading',
  heading?: number | null,
  followMode?: boolean,
  onManualPan?: () => void
}) {
  const map = useMap();

  useMapEvents({
    dragstart: () => {
      if (onManualPan) onManualPan();
    },
    zoomstart: () => {
      if (onManualPan) onManualPan();
    }
  });
  
  useEffect(() => {
    if (recenterTrigger > 0 && currentPoint) {
      map.setView(currentPoint, map.getZoom());
    }
  }, [recenterTrigger, currentPoint, map]);

  useEffect(() => {
    if (followMode && currentPoint) {
      map.panTo(currentPoint, { animate: true });
    }
  }, [followMode, heading, mapRotationMode, currentPoint, map]);

  useEffect(() => {
    if (trailPath && trailPath.length > 0) {
      const bounds = L.latLngBounds(trailPath.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [trailPath, map]);

  return null;
}

export default function Map({ 
  currentPath, 
  historyPaths = [], 
  trailPath = [], 
  center = [21.4389, -158.0001], 
  zoom = 11, 
  showBacktrack,
  gpsAccuracy = 0,
  recenterTrigger = 0,
  heading = null,
  mapRotationMode = 'north-up',
  followMode = true,
  onManualPan
}: MapProps) {
  const lastPoint = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;

  const rotation = mapRotationMode === 'heading' && heading !== null ? -heading : 0;
  const isSignalLost = lastPoint && (Date.now() - lastPoint.timestamp > 10000);

  const polylineOptions = { color: '#38bdf8', weight: 4, opacity: 0.8 };
  const historyOptions = { color: '#64748b', weight: 2, opacity: 0.4 };
  const backtrackOptions = { color: '#fb923c', weight: 4, opacity: 0.7, dashArray: '10, 10' };
  const trailOptions = { color: '#4ade80', weight: 6, opacity: 0.6 };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapContainer 
        center={lastPoint ? [lastPoint.lat, lastPoint.lng] : center} 
        zoom={zoom} 
        scrollWheelZoom={true} 
        className="h-full w-full bg-brand-surface border-0 transition-transform duration-500 ease-out"
        style={{ transform: `rotate(${-rotation}deg) scale(${mapRotationMode === 'heading' ? 1.4 : 1})` }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapActions 
          recenterTrigger={recenterTrigger} 
          currentPoint={lastPoint ? [lastPoint.lat, lastPoint.lng] : null}
          trailPath={trailPath}
          mapRotationMode={mapRotationMode}
          heading={heading}
          followMode={followMode}
          onManualPan={onManualPan}
        />
      
      {/* Saved Trail to follow */}
      {trailPath.length > 1 && (
        <Polyline positions={trailPath.map(p => [p.lat, p.lng])} pathOptions={trailOptions} />
      )}

      {/* History Paths */}
      {historyPaths.map((path, idx) => (
        <Polyline key={idx} positions={path.map(p => [p.lat, p.lng])} pathOptions={historyOptions} />
      ))}

      {/* Current Active Path */}
      {currentPath.length > 1 && (
        <Polyline positions={currentPath.map(p => [p.lat, p.lng])} pathOptions={polylineOptions} />
      )}

      {/* Backtrack Guide */}
      {showBacktrack && currentPath.length > 1 && (
        <Polyline positions={currentPath.map(p => [p.lat, p.lng])} pathOptions={backtrackOptions} />
      )}

      {/* Accuracy Radius */}
      {lastPoint && gpsAccuracy > 0 && (
        <Circle 
          center={[lastPoint.lat, lastPoint.lng]} 
          radius={gpsAccuracy}
          pathOptions={{ 
            color: isSignalLost ? '#ef4444' : '#38bdf8', 
            fillColor: isSignalLost ? '#ef4444' : '#38bdf8', 
            fillOpacity: 0.1, 
            weight: 1 
          }} 
        />
      )}

      {/* Starting Point Marker */}
      {currentPath.length > 0 && (
        <Marker 
          position={[currentPath[0].lat, currentPath[0].lng]}
          icon={L.divIcon({
            className: 'start-marker',
            html: `
              <div style="
                transform: rotate(${rotation}deg); 
                background-color: #ef4444; 
                width: 24px; 
                height: 24px; 
                border-radius: 6px; 
                border: 2px solid white; 
                box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })}
        />
      )}

      {/* Trail End Point Marker */}
      {trailPath.length > 0 && currentPath.length === 0 && (
        <Marker 
          position={[trailPath[trailPath.length - 1].lat, trailPath[trailPath.length - 1].lng]}
          icon={L.divIcon({
            className: 'end-marker',
            html: `<div style="transform: rotate(${rotation}deg); background-color: #22c55e; width: 12px; height: 12px; border-radius: 2px; border: 2px solid white; box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          })}
        />
      )}

      {/* Current Position Marker / Last Known */}
      {lastPoint && (
        <Marker 
          position={[lastPoint.lat, lastPoint.lng]}
          icon={L.divIcon({
            className: 'current-marker',
            html: `<div style="
              width: 32px; 
              height: 32px; 
              display: flex;
              align-items: center;
              justify-content: center;
              transform: rotate(${mapRotationMode === 'heading' ? 0 : (heading || 0)}deg);
              transition: transform 0.3s ease-out;
            ">
              <div style="
                position: absolute;
                width: 100%;
                height: 100%;
                background: radial-gradient(circle, rgba(56, 189, 248, 0.4), transparent);
                animation: pulse 2s infinite;
              "></div>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="${isSignalLost ? '#94a3b8' : '#38bdf8'}" stroke="white" stroke-width="2">
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
              </svg>
            </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })}
        />
      )}
    </MapContainer>
    </div>
  );
}
