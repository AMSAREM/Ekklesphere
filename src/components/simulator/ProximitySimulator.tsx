import React, { useState, useEffect, useRef } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  MapPin,
  Lock,
  Server,
  Radar,
  Play,
  Square,
  Navigation,
  AlertTriangle,
  Target,
} from 'lucide-react';
import { GeofenceApiConsole } from './GeofenceApiConsole';

const PRIMARY_CAMPUS_SITE_ID = '00000000-0000-0000-0000-000000000001';

function computeDistanceAndBearing(
  premiseLat: number,
  premiseLng: number,
  userLat: number,
  userLng: number
): { distanceM: number; dxRatio: number; dyRatio: number } {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(userLat - premiseLat);
  const dLon = toRad(userLng - premiseLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(premiseLat)) * Math.cos(toRad(userLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceM = Math.round(R * c * 10) / 10;

  // East-West & North-South displacement in meters for accurate 2D radar plotting
  const northMeters = (userLat - premiseLat) * 111320;
  const eastMeters = (userLng - premiseLng) * 111320 * Math.cos(toRad(premiseLat));

  return {
    distanceM,
    dxRatio: eastMeters,
    dyRatio: -northMeters, // SVG y-axis points down
  };
}

export const ProximitySimulator: React.FC = () => {
  const [viewMode, setViewMode] = useState<'radar' | 'apiConsole'>('apiConsole');
  const {
    systemSettings,
    currentUser,
    currentService,
    attendanceRecords,
    auditLogs,
    checkInPerson,
    setChurchPremiseLocation,
    refreshLivePremise,
    showToast,
  } = useEkklesphere();

  const [isRadarWatching, setIsRadarWatching] = useState(false);
  const [radarVerifying, setRadarVerifying] = useState(false);
  const [radarFeedback, setRadarFeedback] = useState<string | null>(null);
  const [liveGps, setLiveGps] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, []);

  const targetPersonId = currentUser?.memberId || currentUser?.id || 'live-device-user';
  const userInitials = currentUser?.initials || 'ME';
  const userName = currentUser?.name || 'Active Device';
  const myRecord = attendanceRecords.find((r) => r.personId === targetPersonId);

  const isPremiseConfigured =
    systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null;

  const outerRadiusM = systemSettings.outerGeofenceMeters || 300;
  const innerRadiusM = systemSettings.innerGeofenceMeters || 100;

  const telemetry =
    isPremiseConfigured && liveGps
      ? computeDistanceAndBearing(
          systemSettings.campusLatitude!,
          systemSettings.campusLongitude!,
          liveGps.lat,
          liveGps.lng
        )
      : null;

  // Map real meters onto SVG radar (outer ring radius = 180px corresponds to outerRadiusM)
  const markerCoords = (() => {
    if (!telemetry) return null;
    const scalePxPerMeter = 180 / Math.max(outerRadiusM, 50);
    const rawX = telemetry.dxRatio * scalePxPerMeter;
    const rawY = telemetry.dyRatio * scalePxPerMeter;
    const mag = Math.hypot(rawX, rawY);
    const maxRadiusPx = 222;
    if (mag > maxRadiusPx) {
      return {
        x: 250 + (rawX / mag) * maxRadiusPx,
        y: 250 + (rawY / mag) * maxRadiusPx,
      };
    }
    return {
      x: 250 + rawX,
      y: 250 + rawY,
    };
  })();

  const innerRingSvgRadius = Math.max(
    36,
    Math.min(155, Math.round((innerRadiusM / Math.max(outerRadiusM, innerRadiusM + 10)) * 180))
  );

  const startLiveRadar = () => {
    if (!navigator.geolocation) {
      setRadarFeedback('Geolocation is not supported by this browser.');
      return;
    }
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    setRadarFeedback('Acquiring live device GPS coordinates...');
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy * 10) / 10,
        });
        setIsRadarWatching(true);
        setRadarFeedback(null);
      },
      (err) => {
        setIsRadarWatching(false);
        setRadarFeedback(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    watchRef.current = id;
  };

  const stopLiveRadar = () => {
    if (watchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setIsRadarWatching(false);
    setRadarFeedback('Live radar paused.');
  };

  const handleSetPremiseFromRadar = async () => {
    if (!liveGps) {
      setRadarFeedback('Start Live Radar first to capture your device coordinates.');
      return;
    }
    const ok = await setChurchPremiseLocation({
      lat: liveGps.lat,
      lng: liveGps.lng,
      accuracyM: liveGps.accuracy,
      churchName: systemSettings.churchName || 'PIWC KWADASO',
      campusName: systemSettings.campusName || 'PIWC KWADASO',
      innerGeofenceMeters: innerRadiusM,
      outerGeofenceMeters: outerRadiusM,
    });
    if (ok) {
      setRadarFeedback(
        `Church premise pinned to (${liveGps.lat.toFixed(6)}, ${liveGps.lng.toFixed(6)}).`
      );
    }
  };

  const handleVerifyArrivalOnServer = async () => {
    if (!isPremiseConfigured) {
      setRadarFeedback('Church premise coordinates must be set by Admin before verifying arrival.');
      return;
    }
    if (!liveGps) {
      setRadarFeedback('Start Live Radar first to acquire a fresh GPS fix.');
      return;
    }

    setRadarVerifying(true);
    try {
      const res = await fetch('/api/attendance/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEventId: crypto.randomUUID(),
          siteId: PRIMARY_CAMPUS_SITE_ID,
          personId: targetPersonId,
          personName: userName,
          serviceInstanceId: currentService.id,
          type: 'enter',
          source: 'geofence',
          platform: 'web',
          lat: liveGps.lat,
          lng: liveGps.lng,
          accuracyM: Math.round(liveGps.accuracy),
          isMock: false,
          deviceTime: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const accepted =
          data.status === 'accepted' ||
          (data.status === 'flagged' && !data.flag_reasons?.includes('outside_site'));
        if (accepted) {
          checkInPerson(
            targetPersonId,
            'geofence',
            Math.max(70, Math.min(99, Math.round(100 - liveGps.accuracy / 3))),
            `Live Radar GPS (${data.distance_m ?? 0}m)`
          );
          await refreshLivePremise();
          setRadarFeedback(`Server accepted check-in (${data.distance_m ?? 0}m from premise).`);
          showToast(`Verified inside premise (${data.distance_m ?? 0}m)`);
        } else {
          setRadarFeedback(
            `Server rejected arrival: ${data.distance_m ?? '?'}m away (flags: ${data.flag_reasons?.join(', ') || 'outside_site'}).`
          );
        }
      } else {
        setRadarFeedback(data.message || data.error || 'Verification failed.');
      }
    } catch (err: unknown) {
      setRadarFeedback(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRadarVerifying(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto py-6 px-4 space-y-6">
      {/* Title & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Geofence & Live Premise Verification
          </h1>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] max-w-[65ch] mt-1 leading-relaxed">
            Pin your real church premise GPS coordinates and verify live device arrivals against your configured perimeter.
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
          <button
            onClick={() => setViewMode('apiConsole')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              viewMode === 'apiConsole'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Live GPS Console & Shifts</span>
          </button>
          <button
            onClick={() => setViewMode('radar')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              viewMode === 'radar'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A]'
            }`}
          >
            <Radar className="w-3.5 h-3.5" />
            <span>Live 2D Premise Radar</span>
          </button>
        </div>
      </div>

      {viewMode === 'apiConsole' ? (
        <GeofenceApiConsole />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: 2D Live Radar Canvas (Span 7) */}
          <div className="lg:col-span-7 bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm flex flex-col items-center">
            <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
              <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#6D5CF2]" />
                {isPremiseConfigured ? (
                  <span>
                    {systemSettings.campusName} ({systemSettings.campusLatitude?.toFixed(5)}°,{' '}
                    {systemSettings.campusLongitude?.toFixed(5)}°)
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">
                    Church Premise GPS Not Configured
                  </span>
                )}
              </span>
              <span className="text-[#666A86] dark:text-[#A9ACC8] font-mono">
                Outer: {outerRadiusM}m · Inner: {innerRadiusM}m
              </span>
            </div>

            {/* Live SVG Radar Canvas */}
            <div className="relative w-full aspect-square max-w-[480px] bg-[#F6F7FC] dark:bg-[#14142E] rounded-3xl border border-[#E9EBF5] dark:border-[#2D2D55] overflow-hidden flex items-center justify-center shadow-inner">
              <svg className="w-full h-full" viewBox="0 0 500 500">
                {/* Radar Grid Lines */}
                <circle
                  cx="250"
                  cy="250"
                  r="230"
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                />
                <circle
                  cx="250"
                  cy="250"
                  r="135"
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <line
                  x1="250"
                  y1="20"
                  x2="250"
                  y2="480"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                />
                <line
                  x1="20"
                  y1="250"
                  x2="480"
                  y2="250"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                />

                {isPremiseConfigured && (
                  <>
                    {/* Outer Geofence Ring */}
                    <circle
                      cx="250"
                      cy="250"
                      r="180"
                      fill="none"
                      stroke="#6D5CF2"
                      strokeWidth="2"
                      strokeDasharray="6 6"
                      className="opacity-70"
                    />
                    <text x="256" y="82" fill="#6D5CF2" fontSize="11" fontWeight="700">
                      Outer Approach ({outerRadiusM}m)
                    </text>

                    {/* Inner Check-in Geofence Ring */}
                    <circle
                      cx="250"
                      cy="250"
                      r={innerRingSvgRadius}
                      fill="rgba(109, 92, 242, 0.08)"
                      stroke="#4FBF98"
                      strokeWidth="2.5"
                    />
                    <text
                      x="256"
                      y={250 - innerRingSvgRadius + 16}
                      fill="#4FBF98"
                      fontSize="11"
                      fontWeight="700"
                    >
                      Premise Perimeter ({innerRadiusM}m)
                    </text>

                    {/* Church Premise Center Marker */}
                    <g transform="translate(235, 235)">
                      <rect width="30" height="30" rx="8" fill="#1D1B3A" />
                      <path
                        d="M15 6v18M9 12h12"
                        stroke="#fff"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </g>
                    <text
                      x="250"
                      y="282"
                      textAnchor="middle"
                      fill="#1D1B3A"
                      className="dark:fill-white"
                      fontSize="11"
                      fontWeight="700"
                    >
                      {systemSettings.campusName}
                    </text>
                  </>
                )}

                {/* Real Device GPS Marker */}
                {markerCoords && (
                  <g
                    transform={`translate(${markerCoords.x - 16}, ${markerCoords.y - 16})`}
                    className="transition-all duration-500 ease-out"
                  >
                    <circle
                      cx="16"
                      cy="16"
                      r="18"
                      fill="rgba(109, 92, 242, 0.25)"
                      className="animate-ping"
                    />
                    <circle cx="16" cy="16" r="14" fill="#6D5CF2" />
                    <text
                      x="16"
                      y="20"
                      fill="#fff"
                      fontSize="10"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {userInitials}
                    </text>
                  </g>
                )}
              </svg>

              {!isPremiseConfigured && (
                <div className="absolute inset-x-6 bg-white/95 dark:bg-[#1D1D3D]/95 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 text-center space-y-2 shadow-lg">
                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
                  <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    No Church Premise Pinned Yet
                  </p>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    Start Live Radar on the right and click "Pin Current GPS as Church Premise" (or configure in Admin Settings).
                  </p>
                </div>
              )}
            </div>

            {/* Live Distance Readout */}
            <div className="w-full mt-4 p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] flex items-center justify-between text-xs">
              <span className="text-[#666A86] dark:text-[#A9ACC8]">Live Hardware Distance:</span>
              <span className="font-bold font-mono text-[#6D5CF2] dark:text-[#8C7DFF]">
                {!isPremiseConfigured
                  ? 'Premise Not Set'
                  : !telemetry
                  ? 'Start Live Radar to Measure'
                  : `${telemetry.distanceM.toLocaleString()} m (±${liveGps?.accuracy}m)`}
              </span>
            </div>
          </div>

          {/* Right Column: Live Hardware Controls & Audit Stream (Span 5) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Live Hardware GPS Radar Controls
              </h2>

              {radarFeedback && (
                <div className="p-2.5 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {radarFeedback}
                </div>
              )}

              <div className="space-y-2">
                {!isRadarWatching ? (
                  <button
                    onClick={startLiveRadar}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Live Hardware GPS Radar</span>
                  </button>
                ) : (
                  <button
                    onClick={stopLiveRadar}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Live Radar</span>
                  </button>
                )}

                {currentUser?.role === 'admin' && (
                  <button
                    onClick={handleSetPremiseFromRadar}
                    disabled={!liveGps}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Target className="w-3.5 h-3.5" />
                    <span>Pin Current GPS as Church Premise</span>
                  </button>
                )}

                <button
                  onClick={handleVerifyArrivalOnServer}
                  disabled={!liveGps || !isPremiseConfigured || radarVerifying}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#1D1B3A] hover:bg-[#2a2752] text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{radarVerifying ? 'Verifying on Server...' : 'Verify Arrival on Server'}</span>
                </button>
              </div>
            </div>

            {/* Live Device & Premise Telemetry Card */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm text-xs space-y-3">
              <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#6D5CF2]" />
                Live Telemetry State
              </h2>

              <div className="space-y-2 font-mono text-[11px] bg-[#F6F7FC] dark:bg-[#14142E] p-3 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] tabular-nums">
                <div className="flex justify-between gap-2">
                  <span className="text-[#666A86]">Premise:</span>
                  <span className="text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                    {isPremiseConfigured ? systemSettings.campusName : 'Unconfigured'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#666A86]">Premise Coords:</span>
                  <span className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                    {isPremiseConfigured
                      ? `${systemSettings.campusLatitude?.toFixed(5)}, ${systemSettings.campusLongitude?.toFixed(5)}`
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#666A86]">Device Coords:</span>
                  <span className="text-[#1D1B3A] dark:text-[#F2F2FA]">
                    {liveGps ? `${liveGps.lat.toFixed(5)}, ${liveGps.lng.toFixed(5)}` : 'Awaiting GPS'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#666A86]">Check-In Status:</span>
                  <span className="text-[#6D5CF2] font-bold uppercase">
                    {myRecord ? `VERIFIED (${myRecord.checkedInAt})` : 'NOT CHECKED IN'}
                  </span>
                </div>
              </div>
            </div>

            {/* Real-time Audit Log */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm text-xs">
              <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-3 flex items-center justify-between">
                <span>Session Audit Log</span>
                <span className="text-[10px] text-[#666A86] font-mono">{auditLogs.length} events</span>
              </h2>

              {auditLogs.length > 0 ? (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {auditLogs.slice(0, 6).map((log) => (
                    <div key={log.id} className="p-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] text-[11px]">
                      <div className="flex items-center justify-between font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        <span>{log.action}</span>
                        <span className="text-[#666A86] font-normal font-mono">{log.timestamp}</span>
                      </div>
                      <div className="text-[#666A86] dark:text-[#A9ACC8] mt-0.5">{log.details}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] py-2">
                  No attendance actions recorded yet in this live session.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
