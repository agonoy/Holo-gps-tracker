/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bike, Play, Square, RotateCcw, Plus, Navigation, Settings, Trash2, Save, Map as MapIcon, ChevronRight, Satellite, Download, FileJson, Pause, Copy, Pencil, Target, Compass, ArrowUp, Menu, X } from 'lucide-react';
import Map from './components/Map';
import { getDistance, formatMileage, getAddress, getBearing, getCardinalDirection, getFullDirection } from './lib/geo';
import { exportToGPX, exportToKML, downloadFile } from './lib/export';
import type { Vehicle, PathPoint, Ride, VehicleType, Trail } from './types';
import { createLocalId, loadLocalData, saveLocalData } from './lib/localData';

const LOCAL_USER_ID = 'local-device';
const LOCAL_MODE_LABEL = 'Local Only';
const METERS_PER_MILE = 1609.344;
const MIN_COURSE_DISTANCE_METERS = 4;
const MAX_COURSE_DISTANCE_METERS = 15;

function getShortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function useContinuousAngle(target: number): number {
  const [angle, setAngle] = useState(target);

  useEffect(() => {
    setAngle((previous) => previous + getShortestAngleDelta(previous, target));
  }, [target]);

  return angle;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [activeRide, setActiveRide] = useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<PathPoint[]>([]);
  const [currentLocation, setCurrentLocation] = useState<PathPoint | null>(null);
  const lastSavedPointRef = useRef<PathPoint | null>(null);
  const lastHeadingPointRef = useRef<PathPoint | null>(null);
  const [currentDistance, setCurrentDistance] = useState<number>(0);
  const [historyRides, setHistoryRides] = useState<PathPoint[][]>([]);
  const [ridesMetadata, setRidesMetadata] = useState<Ride[]>([]);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('Searching...');
  const [backtrackEnabled, setBacktrackEnabled] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(0);
  const [lastGpsUpdate, setLastGpsUpdate] = useState<number>(Date.now());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPaused, setIsPaused] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editingVehicleName, setEditingVehicleName] = useState('');
  
  const [showSaveTrailModal, setShowSaveTrailModal] = useState(false);
  const [trailName, setTrailName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleType, setNewVehicleType] = useState<VehicleType>('bike');
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [followMode, setFollowMode] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [useHighAccuracy, setUseHighAccuracy] = useState(true);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  
  const vehicleInputRef = useRef<HTMLInputElement>(null);
  const trailInputRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState<number | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [mapRotationMode, setMapRotationMode] = useState<'north-up' | 'heading'>('heading');
  const [showDirectionPanel, setShowDirectionPanel] = useState(true);
  const [showHeadingPanel, setShowHeadingPanel] = useState(true);

  // Helper for consistent error logging
  const formatError = (e: any): string => {
    if (!e) return "Unknown Error";
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    const str = JSON.stringify(e);
    return str === '{}' ? String(e) : str;
  };

  const requestCompassPermission = async (): Promise<boolean> => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        return permission === 'granted';
      } catch (err) {
        console.error("Error requesting compass permission:", err);
        return false;
      }
    }

    return window.DeviceOrientationEvent !== undefined;
  };

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if ((e as any).webkitCompassTrueHeading !== undefined && (e as any).webkitCompassTrueHeading >= 0) {
        setDeviceHeading((e as any).webkitCompassTrueHeading);
      } else if ((e as any).webkitCompassHeading !== undefined) {
        setDeviceHeading((e as any).webkitCompassHeading);
      } else if (e.absolute && e.alpha !== null) {
        setDeviceHeading((360 - e.alpha) % 360);
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
      window.addEventListener('deviceorientation', handleOrientation as any, true);
    }
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as any);
      window.removeEventListener('deviceorientation', handleOrientation as any);
    };
  }, []);
  
  const watchId = useRef<number | null>(null);
  const addressTimeout = useRef<number | null>(null);
  const addressRequest = useRef<AbortController | null>(null);
  const highAccuracyRef = useRef(useHighAccuracy);

  useEffect(() => {
    highAccuracyRef.current = useHighAccuracy;
  }, [useHighAccuracy]);

  useEffect(() => {
    if (showVehicleModal) {
      setTimeout(() => vehicleInputRef.current?.focus(), 100);
    }
  }, [showVehicleModal]);

  useEffect(() => {
    if (showSaveTrailModal) {
      setTimeout(() => trailInputRef.current?.focus(), 100);
    }
  }, [showSaveTrailModal]);

  // Update address periodically
  useEffect(() => {
    if (currentPath.length > 0 && activeRide) {
      if (addressTimeout.current) clearTimeout(addressTimeout.current);
      addressTimeout.current = window.setTimeout(async () => {
        const last = currentPath[currentPath.length - 1];
        addressRequest.current?.abort();
        const controller = new AbortController();
        addressRequest.current = controller;

        const addr = await getAddress(last.lat, last.lng, controller.signal);
        if (!controller.signal.aborted) {
          setCurrentAddress(addr);
        }
      }, 5000);
    }
    return () => {
      if (addressTimeout.current) clearTimeout(addressTimeout.current);
      addressRequest.current?.abort();
    };
  }, [currentPath.length, activeRide]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      if (addressTimeout.current) {
        clearTimeout(addressTimeout.current);
      }
      addressRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    const localData = loadLocalData();
    setVehicles(localData.vehicles);
    setRides(localData.rides);
    setTrails(localData.trails);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) {
      saveLocalData({ vehicles, rides, trails });
    }
  }, [vehicles, rides, trails, loading]);

  useEffect(() => {
    if (vehicles.length === 0) {
      setSelectedVehicleId(null);
      return;
    }

    setSelectedVehicleId((current) =>
      current && vehicles.some((vehicle) => vehicle.id === current)
        ? current
        : vehicles[0].id,
    );
  }, [vehicles]);

  useEffect(() => {
    if (!selectedVehicleId) {
      setRidesMetadata([]);
      setHistoryRides([]);
      return;
    }

    const recentRides = rides
      .filter((ride) => ride.vehicleId === selectedVehicleId)
      .sort((left, right) => right.startTime - left.startTime)
      .slice(0, 5);

    setRidesMetadata(recentRides);
    setHistoryRides(recentRides.map((ride) => ride.path));
  }, [rides, selectedVehicleId]);

  // Session Persistence
  useEffect(() => {
    const saved = localStorage.getItem('holoholo_session');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.activeRide) {
          setActiveRide(true);
          setIsPaused(data.isPaused || false);
          setCurrentPath(data.currentPath || []);
          if (data.currentPath && data.currentPath.length > 0) {
            lastSavedPointRef.current = data.currentPath[data.currentPath.length - 1];
            lastHeadingPointRef.current = data.currentPath[data.currentPath.length - 1];
            setCurrentLocation(data.currentPath[data.currentPath.length - 1]);
          }
          setCurrentDistance(data.currentDistance || 0);
          setSelectedVehicleId(data.selectedVehicleId || null);
          if (!data.isPaused && data.activeRide) {
            resumeWatching();
          }
        }
      } catch (e) {
        console.error("Failed to restore session:", formatError(e));
      }
    }
  }, []);

  useEffect(() => {
    if (activeRide) {
      localStorage.setItem('holoholo_session', JSON.stringify({
        activeRide,
        isPaused,
        currentPath,
        currentDistance,
        selectedVehicleId
      }));
    } else {
      localStorage.removeItem('holoholo_session');
    }
  }, [activeRide, isPaused, currentPath, currentDistance, selectedVehicleId]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const startRide = () => {
    if (!selectedVehicleId || activeRide) return;
    setUseHighAccuracy(true); // Reset to high accuracy for new attempt
    setActiveRide(true);
    setIsPaused(false);
    setFollowMode(true);
    setMapRotationMode('north-up');
    setCurrentPath([]);
    setCurrentLocation(null);
    lastSavedPointRef.current = null;
    lastHeadingPointRef.current = null;
    setCourse(null);
    setCurrentDistance(0);
    resumeWatching();
  };

  const resumeWatching = (forceHighAccuracy?: boolean) => {
    if ("geolocation" in navigator) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }

      const enableHighAccuracy = forceHighAccuracy ?? highAccuracyRef.current;
      
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPoint: PathPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: pos.timestamp,
            accuracy: pos.coords.accuracy
          };

          setGpsAccuracy(pos.coords.accuracy);
          setLastGpsUpdate(Date.now());
          setGpsError(null); // Clear error on success

          const reportedHeading = pos.coords.heading;
          const isValidHeading =
            reportedHeading !== null &&
            !Number.isNaN(reportedHeading);

          if (isValidHeading) {
            setCourse((reportedHeading + 360) % 360);
            lastHeadingPointRef.current = newPoint;
          } else if (lastHeadingPointRef.current) {
            const lastHeadingPoint = lastHeadingPointRef.current;
            const headingDistance = getDistance(
              lastHeadingPoint.lat,
              lastHeadingPoint.lng,
              newPoint.lat,
              newPoint.lng,
            );
            const headingThresholdMiles =
              Math.min(
                MAX_COURSE_DISTANCE_METERS,
                Math.max(
                  MIN_COURSE_DISTANCE_METERS,
                  Math.max(lastHeadingPoint.accuracy ?? 0, newPoint.accuracy ?? 0),
                ),
              ) / METERS_PER_MILE;

            if (headingDistance >= headingThresholdMiles) {
              setCourse(
                getBearing(
                  lastHeadingPoint.lat,
                  lastHeadingPoint.lng,
                  newPoint.lat,
                  newPoint.lng,
                ),
              );
              lastHeadingPointRef.current = newPoint;
            }
          } else {
            lastHeadingPointRef.current = newPoint;
          }

          setCurrentLocation(newPoint);

          const last = lastSavedPointRef.current;
          if (last) {
            const dist = getDistance(last.lat, last.lng, newPoint.lat, newPoint.lng);
            
            if (!isValidHeading && dist > 0.005) {
              setCourse(getBearing(last.lat, last.lng, newPoint.lat, newPoint.lng));
            }

            if (dist > 0.005) {
              lastSavedPointRef.current = newPoint;
              setCurrentDistance(d => d + dist);
              setCurrentPath(prev => [...prev, newPoint]);
            }
          } else {
            lastSavedPointRef.current = newPoint;
            setCurrentPath([newPoint]);
          }
        },
        (err) => {
          let msg = "GPS Signal Lost";
          if (err.code === 1) msg = "Location Permission Denied";
          if (err.code === 2) {
            msg = "GPS Signal Lost (Unavailable)";
            setTimeout(() => resumeWatching(true), 2000);
          }
          if (err.code === 3) msg = "GPS Location Timeout";
          
          setGpsError(msg);
          console.warn(`GPS Warning (${err.code}): ${err.message || msg}`);
        },
        { 
          enableHighAccuracy, 
          maximumAge: 0, 
          timeout: 10000 // Increased timeout to 10s
        }
      );
    }
  };

  const pauseRide = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsPaused(true);
  };

  const resumeRide = () => {
    setIsPaused(false);
    setFollowMode(true);
    resumeWatching();
  };

  const stopRide = async () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    
    const finalPath = [...currentPath];
    const finalDistance = currentDistance;
    
    setActiveRide(false);
    setIsPaused(false);
    setBacktrackEnabled(false);
    setGpsAccuracy(0);
    setCurrentLocation(null);
    setCourse(null);
    lastSavedPointRef.current = null;
    lastHeadingPointRef.current = null;
    setCurrentAddress('Searching...');

    if (finalPath.length < 2 || finalDistance < 0.01) return;

    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;

    try {
      const startTime = finalPath[0].timestamp;
      const endTime = finalPath[finalPath.length - 1].timestamp;
      const duration = Math.floor((endTime - startTime) / 1000);
      const newRide: Ride = {
        id: createLocalId('ride'),
        userId: LOCAL_USER_ID,
        vehicleId: selectedVehicleId,
        distance: finalDistance,
        path: finalPath,
        startTime,
        endTime,
        duration,
      };

      setRides((previous) =>
        [newRide, ...previous].sort((left, right) => right.startTime - left.startTime),
      );
      setVehicles((previous) =>
        previous.map((entry) =>
          entry.id === selectedVehicleId
            ? {
                ...entry,
                totalMileage: vehicle.totalMileage + finalDistance,
                tripMileage: vehicle.tripMileage + finalDistance,
              }
            : entry,
        ),
      );
    } catch (e) {
      console.error("Error saving ride:", formatError(e));
    }
  };

  const resetTrip = async () => {
    if (!selectedVehicleId) return;
    try {
      setVehicles((previous) =>
        previous.map((entry) =>
          entry.id === selectedVehicleId ? { ...entry, tripMileage: 0 } : entry,
        ),
      );
    } catch (e) {
      console.error("Error resetting trip:", formatError(e));
    }
  };

  const deleteVehicle = async (id: string) => {
    try {
      setRides((previous) => previous.filter((ride) => ride.vehicleId !== id));
      setVehicles((previous) => previous.filter((vehicle) => vehicle.id !== id));
      
      if (selectedVehicleId === id) {
        setSelectedVehicleId(null);
      }
      setShowDeleteConfirm(null);
    } catch (e) {
      console.error("Error deleting vehicle:", formatError(e));
    }
  };

  const saveTrailFromCurrent = async () => {
    if (currentPath.length < 2 || !trailName) return;
    try {
      const newTrail: Trail = {
        id: createLocalId('trail'),
        userId: LOCAL_USER_ID,
        name: trailName,
        path: currentPath,
        distance: currentDistance,
        createdAt: Date.now(),
      };

      setTrails((previous) =>
        [newTrail, ...previous].sort((left, right) => right.createdAt - left.createdAt),
      );
      setShowSaveTrailModal(false);
      setTrailName('');
    } catch (e) {
      console.error("Error saving trail:", formatError(e));
    }
  };

  const deleteTrail = async (id: string) => {
    try {
      setTrails((previous) => previous.filter((trail) => trail.id !== id));
      if (selectedTrailId === id) setSelectedTrailId(null);
    } catch (e) {
      console.error("Error deleting trail:", formatError(e));
    }
  };

  const deleteRide = async (id: string) => {
    try {
      setRides((previous) => previous.filter((ride) => ride.id !== id));
    } catch (e) {
      console.error("Error deleting ride:", formatError(e));
    }
  };

  const renameVehicle = async () => {
    if (!editingVehicleId || !editingVehicleName.trim()) return;
    try {
      setVehicles((previous) =>
        previous.map((entry) =>
          entry.id === editingVehicleId
            ? { ...entry, name: editingVehicleName.trim() }
            : entry,
        ),
      );
      setEditingVehicleId(null);
    } catch (e) {
      console.error("Error renaming vehicle:", formatError(e));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const createVehicle = async () => {
    if (!newVehicleName) return;
    
    try {
      const vehicle: Vehicle = {
        id: createLocalId('vehicle'),
        userId: LOCAL_USER_ID,
        name: newVehicleName,
        type: newVehicleType,
        totalMileage: 0,
        tripMileage: 0,
        createdAt: Date.now(),
      };

      setVehicles((previous) =>
        [...previous, vehicle].sort((left, right) => right.createdAt - left.createdAt),
      );
      setShowVehicleModal(false);
      setNewVehicleName('');
    } catch (e) {
      console.error("Error creating vehicle:", formatError(e));
    }
  };

  const currentVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const displayedHeading = deviceHeading ?? course;
  const mapHeadingReference = mapRotationMode === 'heading' ? displayedHeading : null;
  const directionToBaseRotationTarget =
    currentPath.length > 0
      ? getBearing(
          currentPath[currentPath.length - 1].lat,
          currentPath[currentPath.length - 1].lng,
          currentPath[0].lat,
          currentPath[0].lng,
        ) - (mapHeadingReference ?? 0)
      : 0;
  const directionToBaseRotation = useContinuousAngle(directionToBaseRotationTarget);
  const headingNeedleRotationTarget =
    mapHeadingReference !== null ? -mapHeadingReference : 0;
  const headingNeedleRotation = useContinuousAngle(headingNeedleRotationTarget);

  if (loading) return <div className="flex items-center justify-center h-screen bg-bg text-white font-mono">LOADING_LOCAL_RECORDS...</div>;

  // Helper to split mileage for odometer display
  const getOdoDigits = (totalMileage: number) => {
    const str = totalMileage.toFixed(1).padStart(7, '0');
    return str.split('');
  };

  const getDurationString = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? hrs + 'h ' : ''}${mins}m ${secs}s`;
  };

  const gpsSignalStrength = Date.now() - lastGpsUpdate < 10000 ? 'GOOD' : 'LOST';

  const getDirectDist = () => {
    if (currentPath.length < 2) return 0;
    const start = currentPath[0];
    const current = currentPath[currentPath.length - 1];
    return getDistance(start.lat, start.lng, current.lat, current.lng);
  };

  const getETA = () => {
    const direct = getDirectDist();
    if (direct === 0 || currentDistance === 0) return '---';
    const totalTimeSec = (currentPath[currentPath.length - 1].timestamp - currentPath[0].timestamp) / 1000;
    const avgSpeed = currentDistance / (totalTimeSec / 3600); // mph
    if (avgSpeed < 1) return 'Walking distance';
    const etaHours = direct / avgSpeed;
    const etaMins = Math.round(etaHours * 60);
    return `~${etaMins} mins`;
  };

  return (
    <div className="h-screen h-[100dvh] w-screen flex flex-col overflow-hidden bg-bg text-text selection:bg-accent/30">
      {/* Header */}
      <header className="h-16 bg-panel border-b border-border flex items-center px-4 sm:px-6 justify-between shrink-0 z-[110]">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setIsLeftSidebarOpen(!isLeftSidebarOpen);
              if (!isLeftSidebarOpen) setIsRightSidebarOpen(false);
            }}
            className="lg:hidden p-2 -ml-2 text-text-dim hover:text-accent transition-colors"
          >
            {isLeftSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="flex items-center gap-2 font-extrabold text-base sm:text-xl tracking-tight">
            HOLOHOLO<span className="text-accent">TRACKER</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-6">
          <button 
            onClick={() => {
              setIsRightSidebarOpen(!isRightSidebarOpen);
              if (!isRightSidebarOpen) setIsLeftSidebarOpen(false);
            }}
            className="lg:hidden p-2 text-text-dim hover:text-accent transition-colors"
            title="Activity & Stats"
          >
            <ChevronRight size={24} className={isRightSidebarOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <div className="flex items-center gap-4 hidden sm:flex">
            {!isOnline && (
              <div className="flex items-center gap-2 text-orange-400">
                <div className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest">Offline Mode</span>
              </div>
            )}
            <div className={`flex items-center gap-2 ${gpsSignalStrength === 'GOOD' && !gpsError ? 'text-green-400' : 'text-red-500'}`}>
              <Satellite size={16} className={gpsSignalStrength === 'GOOD' && !gpsError && activeRide ? 'animate-bounce' : ''} />
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                  {gpsError ? 'Signal Error' : `GPS ${gpsSignalStrength}`}
                </span>
                {gpsError ? (
                  <span className="text-[7px] font-bold opacity-80 uppercase">{gpsError}</span>
                ) : (
                  gpsAccuracy > 0 && <span className="text-[8px] opacity-70">±{gpsAccuracy.toFixed(1)}m</span>
                )}
              </div>
            </div>
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="text-[10px] text-text-dim font-bold uppercase tracking-widest hidden sm:block">
            {LOCAL_MODE_LABEL} | This Browser
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Mobile Sidebar Overlays */}
        <AnimatePresence>
          {(isLeftSidebarOpen || isRightSidebarOpen) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsLeftSidebarOpen(false);
                setIsRightSidebarOpen(false);
              }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1500] lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* Left Sidebar (Management) */}
        <motion.aside 
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(_, info) => {
            if (info.offset.x < -100) setIsLeftSidebarOpen(false);
          }}
          className={`
            fixed inset-y-0 left-0 z-[2000] w-72 bg-panel border-r border-border p-6 flex flex-col gap-6 overflow-y-auto transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-0
            ${isLeftSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="lg:hidden absolute top-1/2 -right-1 bg-accent/20 h-12 w-1.5 rounded-l-full -translate-y-1/2" />
          <div className="sleek-card">
            <div className="sleek-label">My Trackers</div>
            <div className="flex flex-col gap-2">
              {vehicles.map(v => (
                <div key={v.id} className="group relative">
                  {editingVehicleId === v.id ? (
                    <div className="flex items-center gap-2 p-1 bg-panel border border-accent rounded-lg">
                      <input 
                        className="bg-transparent text-base p-1 outline-none w-full"
                        value={editingVehicleName}
                        onChange={(e) => setEditingVehicleName(e.target.value)}
                        autoFocus
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                      />
                      <button onClick={renameVehicle} className="p-1 text-green-400"><Save size={14} /></button>
                      <button onClick={() => setEditingVehicleId(null)} className="p-1 text-red-400"><RotateCcw size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex-1 relative">
                      <button
                        onClick={() => !activeRide && setSelectedVehicleId(v.id)}
                        className={`w-full text-left p-3 pr-16 rounded-lg border text-xs font-semibold flex justify-between items-center transition-all ${
                          selectedVehicleId === v.id 
                            ? 'bg-accent/10 border-accent text-text' 
                            : 'bg-transparent border-border text-text-dim hover:border-text-dim'
                        } ${activeRide ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="truncate">{v.name}</span>
                        {selectedVehicleId === v.id && <small className="text-accent text-[9px] uppercase font-bold shrink-0">Active</small>}
                      </button>
                      
                      {!activeRide && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-100 transition-all z-10">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingVehicleId(v.id); setEditingVehicleName(v.name); }}
                            className="p-1 text-text-dim hover:text-accent transition-all bg-panel/80 rounded-md"
                            title="Rename"
                          >
                            <Pencil size={12} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(v.id); }}
                            className="p-1 text-text-dim hover:text-red-500 transition-all bg-panel/80 rounded-md"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <button 
                onClick={() => setShowVehicleModal(true)}
                className="w-full p-3 rounded-lg border border-dashed border-border text-text-dim text-[10px] font-black uppercase hover:border-accent hover:text-accent transition-all"
              >
                + Add Profile
              </button>
            </div>
          </div>

          {currentVehicle && (
            <>
              <div className="sleek-card">
                <div className="sleek-label">Lifetime Odometer (OVR)</div>
                <div className="sleek-odometer">
                  {getOdoDigits(currentVehicle.totalMileage).map((d, i) => (
                    <div key={i} className={`odo-digit ${d === '.' ? 'bg-transparent w-auto text-text-dim' : i === 6 ? 'decimal' : ''}`}>
                      {d}
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-text-dim mt-3 text-center uppercase tracking-widest font-medium">Verified Logged Mileage</p>
              </div>

              <div className="sleek-card">
                <div className="sleek-label">Current Trip Meter</div>
                <div className="trip-meter-text">
                  {formatMileage(currentVehicle.tripMileage)}<span className="text-sm ml-1 text-text-dim uppercase">mi</span>
                </div>
                <button 
                  onClick={resetTrip}
                  className="mt-3 bg-border hover:bg-slate-700 text-text text-[10px] font-bold px-3 py-1.5 rounded transition-all uppercase tracking-wider"
                >
                  Reset Trip
                </button>
              </div>

              <div className="mt-auto">
                {!activeRide ? (
                  <button
                    disabled={!selectedVehicleId}
                    onClick={startRide}
                    className="w-full bg-accent hover:bg-sky-400 text-bg font-black py-4 rounded-xl shadow-lg shadow-accent/20 active:scale-95 transition-all text-xs uppercase tracking-widest"
                  >
                    Start Recording
                  </button>
                ) : (
                  <button
                    onClick={stopRide}
                    className="w-full bg-white text-bg font-black py-4 rounded-xl active:scale-95 transition-all text-xs uppercase tracking-widest"
                  >
                    Stop & Save
                  </button>
                )}
              </div>
            </>
          )}
        </motion.aside>

        {/* Map Center */}
        <section className="flex-1 bg-[#0c111d] relative group/map">
          <Map 
            currentLocation={currentLocation}
            currentPath={currentPath} 
            historyPaths={historyRides}
            trailPath={trails.find(t => t.id === selectedTrailId)?.path}
            showBacktrack={backtrackEnabled}
            gpsAccuracy={gpsAccuracy}
            recenterTrigger={recenterTrigger}
            course={course}
            deviceHeading={deviceHeading}
            mapRotationMode={mapRotationMode}
            followMode={followMode}
            onManualPan={() => {
              setMapRotationMode('north-up');
              setFollowMode(true);
            }}
          />

          <div className="absolute top-6 left-4 z-[1000] flex flex-col gap-2 pointer-events-none md:left-6">
            {showDirectionPanel && activeRide && currentPath.length > 0 && (
              <motion.div 
                drag
                dragMomentum={false}
                className="bg-panel/90 backdrop-blur border border-border px-3 py-2 rounded-lg shadow-xl flex flex-col gap-1 pointer-events-auto transition-shadow hover:shadow-2xl cursor-grab active:cursor-grabbing touch-none"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black uppercase text-accent tracking-tighter">Direction to Base</span>
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  </div>
                  <button 
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onClick={() => setShowDirectionPanel(false)}
                    className="p-0.5 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X size={12} className="text-text-dim" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-green-500/10 p-1.5 rounded-full">
                    <ArrowUp 
                      className="text-green-500 transition-transform duration-300 ease-linear" 
                      size={16} 
                      style={{ transform: `rotate(${directionToBaseRotation}deg)` }} 
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[12px] font-black leading-none">{formatMileage(getDirectDist())} mi</span>
                    <span className="text-[7px] font-bold text-text-dim uppercase">Direct Line</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <div className="absolute top-6 right-4 z-[1000] flex flex-col items-end gap-2 pointer-events-none md:right-6">
            {showHeadingPanel && (
              <motion.div 
                drag
                dragMomentum={false}
                className="flex flex-col gap-2 items-end pointer-events-auto cursor-grab active:cursor-grabbing touch-none"
              >
                <div className="bg-panel/90 backdrop-blur border border-border px-3 py-2 rounded-lg shadow-xl flex items-center gap-3 transition-all">
                  <button 
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onClick={() => setShowHeadingPanel(false)}
                    className="absolute -top-1.5 -right-1.5 p-1 bg-panel border border-border rounded-full hover:bg-white/10 transition-colors"
                  >
                    <X size={10} className="text-text-dim hover:text-white" />
                  </button>
                  <div 
                    className="relative h-8 w-8 rounded-full border border-border/50 flex items-center justify-center transition-transform duration-300 ease-linear"
                    style={{ transform: `rotate(${headingNeedleRotation}deg)` }}
                  >
                    <span className="absolute top-0.5 text-[7px] font-black text-red-500">N</span>
                    <div className="w-px h-full bg-border/30 absolute" />
                    <div className="w-full h-px bg-border/30 absolute" />
                    <div className="w-1 h-3 bg-red-500 absolute top-1 rounded-full" />
                    <div className="w-1 h-3 bg-white/30 absolute bottom-1 rounded-full" />
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-black tracking-widest text-accent uppercase">
                      {displayedHeading !== null ? `${getCardinalDirection(displayedHeading)} ${Math.round(displayedHeading)}°` : '---°'}
                    </span>
                    <span className="text-[8px] font-bold text-text-dim uppercase leading-none">
                      {displayedHeading !== null ? getFullDirection(displayedHeading) : 'Compass Off'}
                    </span>
                  </div>
                  <div className="w-px h-6 bg-border" />
                  <button 
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onClick={async () => {
                      if (mapRotationMode === 'north-up') {
                        await requestCompassPermission();
                        setFollowMode(true);
                        setMapRotationMode('heading');
                      } else {
                        setMapRotationMode('north-up');
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md border font-black text-[9px] uppercase tracking-wider transition-all ${
                      mapRotationMode === 'heading' 
                        ? 'bg-accent text-bg border-accent shadow-lg shadow-accent/20' 
                        : 'bg-bg/50 text-text-dim border-border hover:text-text'
                    }`}
                  >
                    <Navigation size={10} className={mapRotationMode === 'heading' ? 'fill-current' : ''} />
                    {mapRotationMode === 'heading' ? 'Heading' : 'North'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
          
          <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-[1000]">
            <button 
              onClick={() => {
                setRecenterTrigger(t => t + 1);
                setFollowMode(true);
              }}
              className="bg-panel/90 backdrop-blur border border-border p-3 rounded-full shadow-lg hover:text-accent transition-all active:scale-90"
              title="Recenter"
            >
              <Target size={20} />
            </button>
            {selectedTrailId && (
              <button 
                onClick={() => {
                  // The Map component's useEffect for trailPath will handle fitting bounds
                  const temp = selectedTrailId;
                  setSelectedTrailId(null);
                  setTimeout(() => setSelectedTrailId(temp), 10);
                }}
                className="bg-panel/90 backdrop-blur border border-border p-3 rounded-full shadow-lg hover:text-accent transition-all active:scale-90"
                title="Fit trail to screen"
              >
                <MapIcon size={20} />
              </button>
            )}
          </div>
        </section>

        {/* Right Sidebar (Stats + History) */}
        <motion.aside 
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={(_, info) => {
            if (info.offset.x > 100) setIsRightSidebarOpen(false);
          }}
          className={`
            fixed inset-y-0 right-0 z-[2000] w-80 bg-panel border-l border-border flex flex-col shadow-2xl lg:shadow-none transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-0
            ${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="lg:hidden absolute top-1/2 -left-1 bg-accent/20 h-12 w-1.5 rounded-r-full -translate-y-1/2" />
          <div className="shrink-0 lg:hidden p-4 border-b border-border flex justify-between items-center bg-bg/20">
            <span className="text-xs font-black uppercase tracking-widest text-accent">Activity & Stats</span>
            <button onClick={() => setIsRightSidebarOpen(false)} className="p-1 hover:text-accent"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
          {activeRide && (
            <div className="p-6 border-b border-border bg-accent/5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="sleek-label text-accent m-0 italic">Active Session</div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[9px] font-black tracking-widest uppercase text-red-500">Live</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg/40 p-3 rounded-lg border border-border/50">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-[8px] text-text-dim uppercase font-bold">Session Mi</p>
                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${isPaused ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>
                      {isPaused ? 'Paused' : 'Live'}
                    </span>
                  </div>
                  <p className="font-bold text-xl">{formatMileage(currentDistance)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={isPaused ? resumeRide : pauseRide}
                    className="p-2 rounded-lg border border-accent text-accent font-black uppercase text-[8px] hover:bg-accent/10 transition-all flex items-center justify-center gap-2"
                  >
                    {isPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button 
                    onClick={() => setShowSaveTrailModal(true)}
                    className="p-2 rounded-lg border border-white/20 text-white/50 font-black uppercase text-[8px] hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={12} />
                    Save Trail
                  </button>
                </div>
              </div>

              <div className="bg-bg/40 p-4 rounded-lg border border-border/50 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="sleek-label m-0 text-text-dim">Real-Time Coordinates</div>
                  <button 
                    onClick={() => {
                      const last = currentPath[currentPath.length - 1];
                      if (last) copyToClipboard(`${last.lat.toFixed(6)}, ${last.lng.toFixed(6)}`);
                    }}
                    className="p-1 hover:text-accent transition-all"
                    title="Copy coordinates"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <div className="flex justify-between items-center bg-black/20 p-2 rounded border border-white/5 font-mono">
                  <div className="text-center flex-1">
                    <p className="text-[7px] text-text-dim uppercase pb-1">Lat</p>
                    <p className="text-xs text-white">{currentPath[currentPath.length - 1]?.lat.toFixed(6) || '---'}</p>
                  </div>
                  <div className="w-px h-6 bg-border mx-2" />
                  <div className="text-center flex-1">
                    <p className="text-[7px] text-text-dim uppercase pb-1">Long</p>
                    <p className="text-xs text-white">{currentPath[currentPath.length - 1]?.lng.toFixed(6) || '---'}</p>
                  </div>
                </div>
                
                <div className="pt-2 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-[8px] font-bold uppercase text-text-dim">
                    <span>Backtrack Info</span>
                    <button 
                      onClick={() => setBacktrackEnabled(!backtrackEnabled)}
                      className={`px-2 py-0.5 rounded border transition-all ${backtrackEnabled ? 'bg-orange-500 border-orange-500 text-bg' : 'border-border'}`}
                    >
                      {backtrackEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {backtrackEnabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-black/20 p-2 rounded border border-white/5">
                        <p className="text-[7px] text-text-dim uppercase">ETA Back</p>
                        <p className="text-[10px] font-black">{getETA()}</p>
                      </div>
                      <div className="bg-black/20 p-2 rounded border border-white/5">
                        <p className="text-[7px] text-text-dim uppercase">Direct Dist</p>
                        <p className="text-[10px] font-black">{formatMileage(getDirectDist())} mi</p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[8px] text-text-dim uppercase font-bold mb-1">Physical Address</p>
                  <p className="text-[10px] font-medium leading-normal text-white/80 italic">{currentAddress}</p>
                </div>
              </div>
            </div>
          )}

          <div className="px-6 mt-4 flex flex-col gap-4">
            <div className="sleek-label">Display Options</div>
            <div className="bg-bg/40 p-4 rounded-lg border border-border/50 space-y-3">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase">
                <span className="text-text-dim">Direction Panel</span>
                <button 
                  onClick={() => setShowDirectionPanel(!showDirectionPanel)}
                  className={`px-3 py-1 rounded border transition-all ${showDirectionPanel ? 'bg-accent border-accent text-bg' : 'border-border text-text-dim hover:text-white'}`}
                >
                  {showDirectionPanel ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold uppercase">
                <span className="text-text-dim">Heading Panel</span>
                <button 
                  onClick={() => setShowHeadingPanel(!showHeadingPanel)}
                  className={`px-3 py-1 rounded border transition-all ${showHeadingPanel ? 'bg-accent border-accent text-bg' : 'border-border text-text-dim hover:text-white'}`}
                >
                  {showHeadingPanel ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 mt-4 flex flex-col gap-4">
            <div className="sleek-label">Activity Log</div>
            <div className="flex flex-col gap-3">
              {ridesMetadata.map(ride => (
                <div key={ride.id} className="group border-b border-border pb-3 last:border-0 relative">
                  <div className="text-xs font-bold text-text mb-1 flex justify-between items-center">
                    <span>
                      {new Date(ride.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <button 
                      onClick={() => deleteRide(ride.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-text-dim hover:text-red-500 transition-all"
                      title="Delete entry"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <div className="flex justify-between text-[10px] text-text-dim font-medium uppercase tracking-tight">
                    <div className="flex flex-col">
                      <span>Ride Session</span>
                      {ride.duration && <span className="text-[8px] opacity-70 italic lowercase leading-none">{getDurationString(ride.duration)}</span>}
                    </div>
                    <span>{formatMileage(ride.distance)} mi</span>
                  </div>
                </div>
              ))}
              {ridesMetadata.length === 0 && (
                <p className="text-[10px] text-text-dim italic text-center py-8">No rides recorded yet</p>
              )}
            </div>
          </div>

          {/* Saved Trails Section */}
          <div className="px-6 pb-6 flex flex-col gap-4">
            <div className="sleek-label">Saved Trails</div>
            <div className="flex flex-col gap-2">
              {trails.map(trail => (
                <div 
                  key={trail.id}
                  className={`group p-3 rounded-lg border transition-all cursor-pointer ${
                    selectedTrailId === trail.id 
                      ? 'bg-green-500/10 border-green-500' 
                      : 'bg-bg/20 border-border hover:border-text-dim'
                  }`}
                  onClick={() => setSelectedTrailId(selectedTrailId === trail.id ? null : trail.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold ${selectedTrailId === trail.id ? 'text-green-400' : 'text-text'}`}>
                      {trail.name}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteTrail(trail.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-text-dim hover:text-red-500"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-text-dim uppercase italic mb-2">
                    <span>Follow Trail</span>
                    <span>{formatMileage(trail.distance)} mi</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); downloadFile(exportToGPX(trail.path, trail.name), `${trail.name}.gpx`, 'application/gpx+xml'); }}
                      className="flex-1 bg-bg/40 border border-border p-1.5 rounded text-[8px] font-bold uppercase hover:bg-border transition-all flex items-center justify-center gap-1"
                    >
                      <Download size={10} /> GPX
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); downloadFile(exportToKML(trail.path, trail.name), `${trail.name}.kml`, 'application/vnd.google-earth.kml+xml'); }}
                      className="flex-1 bg-bg/40 border border-border p-1.5 rounded text-[8px] font-bold uppercase hover:bg-border transition-all flex items-center justify-center gap-1"
                    >
                      <FileJson size={10} /> KML
                    </button>
                  </div>
                </div>
              ))}
              {trails.length === 0 && (
                <p className="text-[10px] text-text-dim italic text-center py-4 border border-dashed border-border rounded-lg">No saved trails found</p>
              )}
            </div>
          </div>
          </div>

          <div className="mt-auto pt-6 border-t border-border">
            <div className="sleek-label">Device Status</div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#4ade80]" />
              <span className="text-[10px] font-bold text-text-dim uppercase">Saved In Browser</span>
            </div>
          </div>
        </motion.aside>
      </main>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-6"
          >
            <div className="bg-panel border border-red-500/30 p-8 rounded-2xl max-w-sm w-full text-center">
              <Trash2 className="mx-auto text-red-500 mb-4" size={40} />
              <h3 className="text-lg font-bold mb-2">Delete Profile?</h3>
              <p className="text-xs text-text-dim mb-6 leading-relaxed">
                This will permanently delete the profile and all its associated mileage records and activity history. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 bg-border p-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteVehicle(showDeleteConfirm)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white p-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                >
                  Permanently Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSaveTrailModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-panel w-[92%] sm:w-full sm:max-w-sm rounded-2xl border border-border p-6 sm:p-8 shadow-2xl relative -top-10 sm:top-0"
            >
              <MapIcon className="text-accent mb-4 mx-auto" size={32} />
              <h3 className="text-lg font-bold mb-4 text-center uppercase tracking-tight">Save This Trail</h3>
              <div className="space-y-4">
                <div>
                  <label className="sleek-label">Trail Name</label>
                  <input 
                    ref={trailInputRef}
                    value={trailName}
                    onChange={(e) => setTrailName(e.target.value)}
                    placeholder="e.g. Diamond Head Loop"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    className="w-full bg-bg border border-border rounded-lg p-3 text-base focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowSaveTrailModal(false)}
                    className="flex-1 bg-border p-3 rounded-xl text-xs font-bold uppercase transition-all"
                  >
                    Discard
                  </button>
                  <button 
                    onClick={saveTrailFromCurrent}
                    disabled={!trailName || currentPath.length < 2}
                    className="flex-1 bg-accent text-bg font-black p-3 rounded-xl text-xs uppercase transition-all disabled:opacity-50"
                  >
                    Save Path
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVehicleModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-panel w-[92%] sm:w-full sm:max-w-sm rounded-2xl border border-border p-6 sm:p-8 shadow-2xl relative -top-10 sm:top-0"
            >
              <h3 className="text-lg font-bold mb-6 uppercase tracking-tight text-center">Add New Profile</h3>
              <div className="space-y-4">
                <div>
                  <label className="sleek-label block">Profile Name</label>
                  <input 
                    ref={vehicleInputRef}
                    value={newVehicleName}
                    onChange={(e) => setNewVehicleName(e.target.value)}
                    placeholder="e.g. My Onewheel GT"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck="false"
                    className="w-full bg-bg border border-border rounded-lg p-3 text-base focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="sleek-label block">Type</label>
                  <select 
                    value={newVehicleType}
                    onChange={(e) => setNewVehicleType(e.target.value as VehicleType)}
                    className="w-full bg-bg border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-accent appearance-none"
                  >
                    <optgroup label="Vehicles">
                      <option value="bike">Bike</option>
                      <option value="ebike">E-Bike</option>
                      <option value="onewheel">Onewheel</option>
                    </optgroup>
                    <optgroup label="People">
                      <option value="hiker">Hiker</option>
                    </optgroup>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setShowVehicleModal(false)}
                    className="flex-1 bg-border hover:bg-slate-700 text-text text-xs font-bold py-3 rounded-xl uppercase tracking-wider transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={createVehicle}
                    disabled={!newVehicleName}
                    className="flex-1 bg-accent hover:bg-sky-400 text-bg font-black text-xs py-3 rounded-xl uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    Add Profile
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
