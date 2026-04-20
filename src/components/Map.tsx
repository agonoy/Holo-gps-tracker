import { MapContainer, TileLayer, Polyline, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import type { PathPoint } from '../types';

// Fix for Leaflet default marker icons in Vite
import 'leaflet/dist/leaflet.css';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: markerIconUrl,
    shadowUrl: markerShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  currentLocation?: PathPoint | null;
  currentPath: PathPoint[];
  historyPaths?: PathPoint[][];
  trailPath?: PathPoint[];
  center?: [number, number];
  zoom?: number;
  showBacktrack?: boolean;
  gpsAccuracy?: number;
  recenterTrigger?: number;
  course?: number | null;
  deviceHeading?: number | null;
  mapRotationMode?: 'north-up' | 'heading';
  followMode?: boolean;
  onManualPan?: () => void;
}

function MapActions({ 
  recenterTrigger, 
  currentPoint, 
  trailPath,
  mapRotationMode,
  followMode,
  onManualPan
}: { 
  recenterTrigger: number, 
  currentPoint: [number, number] | null, 
  trailPath?: PathPoint[],
  mapRotationMode?: 'north-up' | 'heading',
  followMode?: boolean,
  onManualPan?: () => void
}) {
  const map = useMap();
  const shouldFollow = followMode || mapRotationMode === 'heading';

  useEffect(() => {
    // Fix for iOS PWA layout shifts causing off-center markers
    const timer = setTimeout(() => map.invalidateSize(), 500);
    return () => clearTimeout(timer);
  }, [map]);

  useMapEvents({
    movestart: (e) => {
      const originalEvent = (
        e as L.LeafletEvent & {
          originalEvent?: MouseEvent | TouchEvent | WheelEvent;
        }
      ).originalEvent;

      if (mapRotationMode !== 'north-up' || !originalEvent || !onManualPan) {
        return;
      }

      // Ignore zoom gestures (wheel, pinch)
      if (originalEvent.type === 'wheel' || originalEvent.type === 'dblclick') return;
      if ('touches' in originalEvent && originalEvent.touches.length > 1) return;
      onManualPan();
    }
  });
  
  const lat = currentPoint ? currentPoint[0] : null;
  const lng = currentPoint ? currentPoint[1] : null;

  useEffect(() => {
    if (recenterTrigger > 0 && lat !== null && lng !== null) {
      map.setView([lat, lng], map.getZoom(), { animate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTrigger, map]);

  useEffect(() => {
    if (shouldFollow && lat !== null && lng !== null) {
      map.setView([lat, lng], map.getZoom(), { animate: false });
    }
  }, [shouldFollow, lat, lng, map]);

  useEffect(() => {
    if (trailPath && trailPath.length > 0) {
      const bounds = L.latLngBounds(trailPath.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [trailPath, map]);

  return null;
}

export default function Map({ 
  currentLocation = null,
  currentPath, 
  historyPaths = [], 
  trailPath = [], 
  center = [21.4389, -158.0001], 
  zoom = 11, 
  showBacktrack,
  gpsAccuracy = 0,
  recenterTrigger = 0,
  course = null,
  deviceHeading = null,
  mapRotationMode = 'north-up',
  followMode = true,
  onManualPan
}: MapProps) {
  const lastPoint = currentLocation || (currentPath.length > 0 ? currentPath[currentPath.length - 1] : null);

  const travelHeading = course;
  const markerHeading = deviceHeading ?? travelHeading ?? 0;
  const rotation = mapRotationMode === 'heading' ? markerHeading : 0;
  const isSignalLost = lastPoint && (Date.now() - lastPoint.timestamp > 10000);

  const polylineOptions = { color: '#38bdf8', weight: 4, opacity: 0.8 };
  const historyOptions = { color: '#64748b', weight: 2, opacity: 0.4 };
  const backtrackOptions = { color: '#fb923c', weight: 4, opacity: 0.7, dashArray: '10, 10' };
  const trailOptions = { color: '#4ade80', weight: 6, opacity: 0.6 };

  return (
    <div className="relative h-full w-full overflow-hidden bg-brand-surface">
      <div 
        className="absolute transition-transform duration-[150ms] ease-linear"
        style={{ 
          width: '150vmax', 
          height: '150vmax',
          top: '50%',
          left: '50%',
          marginTop: '-75vmax',
          marginLeft: '-75vmax',
          transform: `rotate(${-rotation}deg)` 
        }}
      >
        <MapContainer 
          center={lastPoint ? [lastPoint.lat, lastPoint.lng] : center} 
          zoom={zoom} 
          scrollWheelZoom={true} 
          dragging={mapRotationMode === 'north-up'}
          className="h-full w-full bg-transparent border-0"
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
              width: 120px; 
              height: 120px; 
              display: flex;
              align-items: center;
              justify-content: center;
              transform: rotate(${markerHeading}deg);
              transition: transform 0.3s ease-out;
              position: relative;
            ">
              <!-- Vision Cone -->
              <svg viewBox="0 0 100 100" width="120" height="120" style="position: absolute; top: -10px; left: 0; pointer-events: none; opacity: ${deviceHeading !== null ? 0.4 : 0};">
                <defs>
                  <radialGradient id="cone-grad" cx="50%" cy="100%" r="100%">
                    <stop offset="0%" stop-color="${isSignalLost ? '#94a3b8' : '#38bdf8'}" stop-opacity="0.8" />
                    <stop offset="100%" stop-color="${isSignalLost ? '#94a3b8' : '#38bdf8'}" stop-opacity="0" />
                  </radialGradient>
                </defs>
                <!-- A cone that originates at the center (50, 50) and spreads upward -->
                <path d="M50 50 L 10 0 Q 50 -10 90 0 Z" fill="url(#cone-grad)" />
              </svg>
              
              <!-- Blue Dot Container -->
              <div style="
                position: absolute;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <!-- Pulse ring -->
                <div style="
                  position: absolute;
                  width: 48px;
                  height: 48px;
                  background: radial-gradient(circle, ${isSignalLost ? 'rgba(148, 163, 184, 0.4)' : 'rgba(56, 189, 248, 0.4)'}, transparent);
                  border-radius: 50%;
                  animation: pulse 2s infinite;
                "></div>
                
                <!-- Center Arrow -->
                <svg viewBox="0 0 24 24" width="24" height="24" fill="${isSignalLost ? '#94a3b8' : '#38bdf8'}" stroke="white" stroke-width="2" style="position: absolute; z-index: 10; transform: rotate(${markerHeading - (mapRotationMode === 'heading' ? (travelHeading ?? 0) : 0)}deg);">
                  <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
                </svg>
              </div>
            </div>`,
            iconSize: [120, 120],
            iconAnchor: [60, 60]
          })}
        />
      )}
    </MapContainer>
      </div>
    </div>
  );
}
