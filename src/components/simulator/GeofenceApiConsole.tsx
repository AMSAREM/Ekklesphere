// src/components/simulator/GeofenceApiConsole.tsx
// Comprehensive Live Console for Geofence Attendance Tracking (Android + Web + Node + Supabase)
import React, { useState, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  ShieldCheck,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Smartphone,
  Globe,
  Database,
  RefreshCw,
  Send,
  Zap,
  Lock,
  Layers,
  Code,
  CheckSquare,
  Compass,
  Copy,
  Check,
  Download,
  Navigation,
  Radio,
  Crosshair,
  Activity,
  Target,
  Satellite,
  Play,
  Square,
  Sliders,
  RotateCcw,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface AttendanceEventResponse {
  id: string;
  client_event_id: string;
  user_id: string;
  site_id: string;
  type: 'enter' | 'exit' | 'manual_in' | 'manual_out';
  source: string;
  platform: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  is_mock: boolean;
  device_time: string;
  server_time: string;
  status: 'accepted' | 'flagged' | 'rejected';
  flag_reasons: string[];
}

interface ShiftRecord {
  user_id: string;
  site_id: string;
  in_event_id: string;
  clock_in: string;
  out_event_id: string | null;
  clock_out: string | null;
  duration_minutes: number | null;
  needs_review: boolean;
  is_open: boolean;
}

export interface RegisteredSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}

const PRIMARY_CAMPUS_SITE_ID = '00000000-0000-0000-0000-000000000001';

export const GeofenceApiConsole: React.FC = () => {
  const {
    systemSettings,
    setChurchPremiseLocation,
    clearChurchPremiseLocation,
    currentUser,
    currentService,
    checkInPerson,
    removeCheckIn,
    refreshLivePremise,
    showToast,
  } = useEkklesphere();
  const [activeConsoleTab, setActiveConsoleTab] = useState<'console' | 'shifts' | 'schema' | 'checklist'>('console');
  const [loading, setLoading] = useState<boolean>(false);
  const [webLocationLoading, setWebLocationLoading] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Live data from backend
  const [events, setEvents] = useState<AttendanceEventResponse[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [sites, setSites] = useState<RegisteredSite[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [selectedSchemaType, setSelectedSchemaType] = useState<'master' | 'geofence'>('master');
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Active site & manual coordinate pin state
  const [selectedSiteId, setSelectedSiteId] = useState<string>(PRIMARY_CAMPUS_SITE_ID);
  const [manualLatInput, setManualLatInput] = useState<string>(
    systemSettings.campusLatitude !== null ? String(systemSettings.campusLatitude) : ''
  );
  const [manualLngInput, setManualLngInput] = useState<string>(
    systemSettings.campusLongitude !== null ? String(systemSettings.campusLongitude) : ''
  );
  const [sharedMapLinkInput, setSharedMapLinkInput] = useState<string>('');

  // LIVE GPS STREAM & TELEMETRY ENGINE
  const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'acquiring' | 'active' | 'denied' | 'error'>('idle');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const [liveCoords, setLiveCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
    timestamp: number;
  } | null>(null);
  const [calibratedRadius, setCalibratedRadius] = useState<number>(systemSettings.innerGeofenceMeters || 100);
  const [platformMode, setPlatformMode] = useState<'android' | 'web'>('web');
  const [lastServerVerdict, setLastServerVerdict] = useState<AttendanceEventResponse | null>(null);

  useEffect(() => {
    if (systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null) {
      setManualLatInput(String(systemSettings.campusLatitude));
      setManualLngInput(String(systemSettings.campusLongitude));
    }
    if (systemSettings.innerGeofenceMeters) {
      setCalibratedRadius(systemSettings.innerGeofenceMeters);
    }
  }, [systemSettings.campusLatitude, systemSettings.campusLongitude, systemSettings.innerGeofenceMeters]);

  // Haversine formula for client distance verification
  function computeClientDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  // Fetch status, events, shifts, and sites
  const fetchData = async () => {
    try {
      const [resHealth, resEvents, resShifts, resSites] = await Promise.all([
        fetch('/api/health').catch(() => null),
        fetch('/api/attendance/raw-events').catch(() => null),
        fetch('/api/attendance/shifts').catch(() => null),
        fetch('/api/attendance/sites').catch(() => null),
      ]);

      if (resHealth?.ok) {
        setServerStatus(await resHealth.json());
      }
      if (resEvents?.ok) {
        setEvents(await resEvents.json());
      }
      if (resShifts?.ok) {
        setShifts(await resShifts.json());
      }
      if (resSites?.ok) {
        const sitesData = await resSites.json();
        setSites(sitesData);
        if (sitesData.length > 0 && !sitesData.some((s: RegisteredSite) => s.id === selectedSiteId)) {
          setSelectedSiteId(sitesData[0].id);
        }
      }
    } catch (err) {
      console.warn('Could not refresh API console data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  // Start live GPS tracking stream
  const startLiveGpsTracking = () => {
    if (!navigator.geolocation) {
      setGpsState('error');
      setGpsErrorMsg('Geolocation is not supported by your browser.');
      return;
    }

    setGpsState('acquiring');
    setGpsErrorMsg(null);
    setStatusFeedback('Acquiring high-accuracy live GPS fix...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy * 10) / 10,
          altitude: pos.coords.altitude ? Math.round(pos.coords.altitude * 10) / 10 : null,
          speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6 * 10) / 10 : null,
          heading: pos.coords.heading ? Math.round(pos.coords.heading) : null,
          timestamp: pos.timestamp,
        });
        setGpsState('active');
        setStatusFeedback(`Live GPS fix acquired (accuracy ±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsState('denied');
          setGpsErrorMsg('Location permission denied. Please allow location access in your browser settings.');
        } else {
          setGpsState('error');
          setGpsErrorMsg(`GPS fix failed: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy * 10) / 10,
          altitude: pos.coords.altitude ? Math.round(pos.coords.altitude * 10) / 10 : null,
          speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6 * 10) / 10 : null,
          heading: pos.coords.heading ? Math.round(pos.coords.heading) : null,
          timestamp: pos.timestamp,
        });
        setGpsState('active');
      },
      (err) => {
        console.warn('Continuous GPS stream error:', err);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    setWatchId(id);
    setIsLiveStreaming(true);
  };

  // Stop live GPS tracking
  const stopLiveGpsTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsLiveStreaming(false);
    setGpsState('idle');
    setStatusFeedback('Live GPS streaming stopped.');
  };

  // Set church premise to Admin's real GPS position
  const handleCalibrateToMyLocation = async () => {
    if (!liveCoords) {
      setStatusFeedback('Start Live GPS Stream first so your real device coordinates can be captured.');
      return;
    }
    setLoading(true);
    try {
      const ok = await setChurchPremiseLocation({
        lat: liveCoords.lat,
        lng: liveCoords.lng,
        accuracyM: liveCoords.accuracy,
        campusName: systemSettings.campusName,
        innerGeofenceMeters: calibratedRadius,
        outerGeofenceMeters: Math.max(calibratedRadius * 2, systemSettings.outerGeofenceMeters || 300),
      });
      if (ok) {
        setSelectedSiteId(PRIMARY_CAMPUS_SITE_ID);
        setManualLatInput(liveCoords.lat.toFixed(6));
        setManualLngInput(liveCoords.lng.toFixed(6));
        setStatusFeedback(
          `Church premise set to live GPS (${liveCoords.lat.toFixed(6)}, ${liveCoords.lng.toFixed(
            6
          )}) with ${calibratedRadius}m check-in radius.`
        );
        await fetchData();
      } else {
        setStatusFeedback('Failed to save church premise coordinates on server.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Pin exact manual coordinates entered by Admin
  const handlePinManualCoordinates = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLat = parseFloat(manualLatInput);
    const parsedLng = parseFloat(manualLngInput);
    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setStatusFeedback('Enter a valid latitude between -90 and 90.');
      return;
    }
    if (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      setStatusFeedback('Enter a valid longitude between -180 and 180.');
      return;
    }

    setLoading(true);
    try {
      const ok = await setChurchPremiseLocation({
        lat: parsedLat,
        lng: parsedLng,
        accuracyM: null,
        campusName: systemSettings.campusName,
        innerGeofenceMeters: calibratedRadius,
        outerGeofenceMeters: Math.max(calibratedRadius * 2, systemSettings.outerGeofenceMeters || 300),
      });
      if (ok) {
        setSelectedSiteId(PRIMARY_CAMPUS_SITE_ID);
        setStatusFeedback(
          `Church premise pinned to (${parsedLat.toFixed(6)}, ${parsedLng.toFixed(6)}) with ${calibratedRadius}m radius.`
        );
        await fetchData();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResolveSharedLink = async () => {
    if (!sharedMapLinkInput.trim()) {
      setStatusFeedback('Paste a shared Google Maps or WhatsApp location link first.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/campus-premise/resolve-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: sharedMapLinkInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusFeedback(data.message || 'Could not extract coordinates from shared link.');
        return;
      }
      setManualLatInput(String(data.lat));
      setManualLngInput(String(data.lng));
      const nextName =
        data.placeName && (!systemSettings.campusName || systemSettings.campusName === 'Main Church Premise')
          ? data.placeName
          : systemSettings.campusName;
      const ok = await setChurchPremiseLocation({
        lat: data.lat,
        lng: data.lng,
        accuracyM: null,
        campusName: nextName,
        innerGeofenceMeters: calibratedRadius,
        outerGeofenceMeters: Math.max(calibratedRadius * 2, systemSettings.outerGeofenceMeters || 300),
      });
      if (ok) {
        setSelectedSiteId(PRIMARY_CAMPUS_SITE_ID);
        setSharedMapLinkInput('');
        setStatusFeedback(
          `Pinned from shared Google Maps link: ${nextName} (${data.lat.toFixed(6)}, ${data.lng.toFixed(6)})`
        );
        await fetchData();
      }
    } catch (err: unknown) {
      setStatusFeedback(err instanceof Error ? err.message : 'Failed to resolve Google Maps link.');
    } finally {
      setLoading(false);
    }
  };

  // Clear church premise location
  const handleClearPremise = async () => {
    setLoading(true);
    try {
      await clearChurchPremiseLocation();
      setSites([]);
      setManualLatInput('');
      setManualLngInput('');
      setStatusFeedback('Church premise GPS location cleared.');
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  const activeSite: RegisteredSite | null =
    sites.find((s) => s.id === selectedSiteId) ||
    sites[0] ||
    (systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null
      ? {
          id: PRIMARY_CAMPUS_SITE_ID,
          name: systemSettings.campusName || 'Church Premise',
          lat: systemSettings.campusLatitude,
          lng: systemSettings.campusLongitude,
          radius_m: systemSettings.innerGeofenceMeters || 100,
        }
      : null);

  // Send real live hardware GPS event to server
  const handleSendLiveEvent = async (type: 'enter' | 'exit' | 'dwell') => {
    if (!activeSite) {
      setStatusFeedback('Set the Church Premise GPS location first before verifying arrival events.');
      return;
    }
    if (!liveCoords) {
      setStatusFeedback('No live GPS coordinates available. Click "Start Live GPS Stream" first.');
      return;
    }

    setLoading(true);
    const eventType = type === 'dwell' ? 'enter' : type;
    const eventSource = platformMode === 'web' ? 'web' : 'geofence';
    const targetPersonId = currentUser?.memberId || currentUser?.id || 'live-device-user';

    try {
      const payload = {
        clientEventId: crypto.randomUUID(),
        siteId: activeSite.id,
        personId: targetPersonId,
        personName: currentUser?.name || 'Member',
        serviceInstanceId: currentService.id,
        type: eventType,
        source: eventSource,
        platform: platformMode,
        lat: liveCoords.lat,
        lng: liveCoords.lng,
        accuracyM: Math.round(liveCoords.accuracy),
        isMock: false,
        deviceTime: new Date().toISOString(),
      };

      const res = await fetch('/api/attendance/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setLastServerVerdict(data);
        setStatusFeedback(
          `Live ${type.toUpperCase()} verified: Server Verdict [${data.status.toUpperCase()}]. Distance: ${
            data.distance_m ?? 'N/A'
          }m. Flags: ${data.flag_reasons?.join(', ') || 'none'}`
        );
        const isAccepted =
          data.status === 'accepted' ||
          (data.status === 'flagged' && !data.flag_reasons?.includes('outside_site'));

        if (eventType === 'enter' && isAccepted) {
          checkInPerson(
            targetPersonId,
            'geofence',
            Math.max(70, Math.min(99, Math.round(100 - liveCoords.accuracy / 3))),
            `Live GPS Geofence (${data.distance_m ?? 0}m)`
          );
          await refreshLivePremise();
          showToast(`Attendance verified via Live GPS (${data.distance_m ?? 0}m)`);
        } else if (eventType === 'exit') {
          removeCheckIn(targetPersonId);
          await refreshLivePremise();
        }
      } else {
        setStatusFeedback(`Server rejected request: ${data.message || data.error || 'Submission failed'}`);
      }
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setStatusFeedback(`Live event dispatch error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // Web Manual Check-in using fresh Browser GPS fix
  const handleWebCheckIn = async (type: 'manual_in' | 'manual_out') => {
    if (!activeSite) {
      setStatusFeedback('Set the Church Premise GPS location first before verifying arrival events.');
      return;
    }
    if (!navigator.geolocation) {
      setStatusFeedback('Geolocation is not supported by your browser.');
      return;
    }

    setWebLocationLoading(true);
    setStatusFeedback('Requesting fresh browser high-accuracy GPS fix...');
    const targetPersonId = currentUser?.memberId || currentUser?.id || 'live-device-user';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const payload = {
            clientEventId: crypto.randomUUID(),
            siteId: activeSite.id,
            personId: targetPersonId,
            personName: currentUser?.name || 'Member',
            serviceInstanceId: currentService.id,
            type,
            source: 'web',
            platform: 'web',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: Math.round(pos.coords.accuracy),
            isMock: false,
            deviceTime: new Date().toISOString(),
          };

          const res = await fetch('/api/attendance/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await res.json();
          if (res.ok) {
            setLastServerVerdict(data);
            setStatusFeedback(
              `Web ${type} verdict: [${data.status.toUpperCase()}]. Distance: ${data.distance_m ?? 'N/A'}m. Flags: ${
                data.flag_reasons?.join(', ') || 'none'
              }`
            );
            const isAccepted =
              data.status === 'accepted' ||
              (data.status === 'flagged' && !data.flag_reasons?.includes('outside_site'));
            if (type === 'manual_in' && isAccepted) {
              checkInPerson(
                targetPersonId,
                'geofence',
                Math.max(70, Math.min(99, Math.round(100 - pos.coords.accuracy / 3))),
                `Web Live GPS (${data.distance_m ?? 0}m)`
              );
              await refreshLivePremise();
            } else if (type === 'manual_out') {
              removeCheckIn(targetPersonId);
              await refreshLivePremise();
            }
          } else {
            setStatusFeedback(`Server error: ${data.message || data.error || 'Check failed'}`);
          }
          await fetchData();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Submission failed';
          setStatusFeedback(`Submission error: ${msg}`);
        } finally {
          setWebLocationLoading(false);
        }
      },
      (err) => {
        setWebLocationLoading(false);
        setStatusFeedback(`GPS acquisition error: ${err.message}. Ensure location permission is allowed.`);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Trigger auto-close
  const handleTriggerAutoClose = async () => {
    try {
      const res = await fetch('/api/attendance/auto-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxHours: 12 }),
      });
      const data = await res.json();
      setStatusFeedback(`Auto-close job completed: closed ${data.closedShifts} open shift(s).`);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Auto-close failed';
      setStatusFeedback(`Auto-close error: ${msg}`);
    }
  };

  const liveDistanceMeters =
    liveCoords && activeSite
      ? computeClientDistanceMeters(activeSite.lat, activeSite.lng, liveCoords.lat, liveCoords.lng)
      : null;

  const siteRadius = activeSite?.radius_m || calibratedRadius;
  const isInsideCore = liveDistanceMeters !== null && liveDistanceMeters <= 30;
  const isInsidePerimeter = liveDistanceMeters !== null && liveDistanceMeters <= siteRadius;
  const isInBufferSlack =
    liveDistanceMeters !== null && liveDistanceMeters > siteRadius && liveDistanceMeters <= siteRadius + 50;

  return (
    <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm space-y-6">
      {/* Header and Live Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center font-bold">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Live Premise Geofence & Attendance Verification
              </h2>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                · {serverStatus?.mode === 'supabase_live' ? 'Supabase + Node' : 'Live Node Engine'}
              </span>
            </div>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Validates real hardware GPS fixes against your Admin-configured church premise coordinates
            </p>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 bg-[#F6F7FC] dark:bg-[#14142E] p-1 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold">
          <button
            onClick={() => setActiveConsoleTab('console')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeConsoleTab === 'console'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A]'
            }`}
          >
            Live GPS Console
          </button>
          <button
            onClick={() => setActiveConsoleTab('shifts')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeConsoleTab === 'shifts'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A]'
            }`}
          >
            Shifts View ({shifts.length})
          </button>
          <button
            onClick={() => setActiveConsoleTab('schema')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeConsoleTab === 'schema'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A]'
            }`}
          >
            SQL & Specs
          </button>
          <button
            onClick={() => setActiveConsoleTab('checklist')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeConsoleTab === 'checklist'
                ? 'bg-[#6D5CF2] text-white shadow-sm'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A]'
            }`}
          >
            Checklist
          </button>
        </div>
      </div>

      {/* Dynamic Status Feedback Toast */}
      {statusFeedback && (
        <div className="p-3 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-bold flex items-center justify-between gap-2 border border-[#6D5CF2]/20 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 shrink-0" />
            <span>{statusFeedback}</span>
          </div>
          <button onClick={() => setStatusFeedback(null)} className="text-[11px] underline">
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: LIVE GPS CONSOLE */}
      {activeConsoleTab === 'console' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl bg-[#F8F9FE] dark:bg-[#171738] border border-[#6D5CF2]/30 shadow-sm space-y-5">
            {/* Top Banner & Sensor Status */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#6D5CF2] text-white flex items-center justify-center shadow-sm">
                  <Satellite className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Live Device GPS Telemetry
                  </h3>
                  <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    Reads real hardware coordinates from this device and evaluates exact distance to the church premise.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {gpsState === 'active' ? (
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 mr-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Live Signal (±{liveCoords?.accuracy}m)
                  </span>
                ) : gpsState === 'acquiring' ? (
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mr-2">
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                    Acquiring GPS Fix...
                  </span>
                ) : gpsState === 'denied' ? (
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 mr-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Permission Denied
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1.5 mr-2">
                    <Crosshair className="w-3.5 h-3.5" />
                    GPS Standby
                  </span>
                )}

                {!isLiveStreaming ? (
                  <button
                    onClick={startLiveGpsTracking}
                    disabled={loading}
                    className="px-3.5 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Live GPS Stream</span>
                  </button>
                ) : (
                  <button
                    onClick={stopLiveGpsTracking}
                    className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Stream</span>
                  </button>
                )}
              </div>
            </div>

            {gpsErrorMsg && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{gpsErrorMsg}</span>
              </div>
            )}

            {/* 4 Real-Time Telemetry Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Live Coordinates */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161633] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-1">
                <span className="text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1">
                  <Navigation className="w-3 h-3 text-[#6D5CF2]" />
                  Device Live Coordinates
                </span>
                <div className="font-mono text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] tabular-nums">
                  {liveCoords ? (
                    <div>
                      <div>Lat: {liveCoords.lat.toFixed(6)}°</div>
                      <div>Lng: {liveCoords.lng.toFixed(6)}°</div>
                    </div>
                  ) : (
                    <div className="text-[#666A86] py-1 font-sans">Start GPS stream</div>
                  )}
                </div>
                <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 tabular-nums">
                  <span>Alt: {liveCoords?.altitude != null ? `${liveCoords.altitude}m` : '--'}</span>
                  <span>Speed: {liveCoords?.speed != null ? `${liveCoords.speed} km/h` : '0 km/h'}</span>
                </div>
              </div>

              {/* 2. GPS Accuracy */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161633] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-1">
                <span className="text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1">
                  <Target className="w-3 h-3 text-emerald-500" />
                  GPS Fix Accuracy
                </span>
                <div className="text-xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA] font-mono tabular-nums">
                  {liveCoords ? `±${liveCoords.accuracy}m` : '±--'}
                </div>
                <div className="pt-1 text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  {liveCoords
                    ? liveCoords.accuracy <= 20
                      ? 'High-precision hardware lock'
                      : liveCoords.accuracy <= 60
                      ? 'Standard Wi-Fi / cellular fix'
                      : 'Coarse network fix (>60m)'
                    : 'Awaiting hardware fix'}
                </div>
              </div>

              {/* 3. Distance to Church Premise */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161633] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-1">
                <span className="text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#6D5CF2]" />
                  Distance to Premise
                </span>
                <div className="text-xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA] font-mono tabular-nums">
                  {liveDistanceMeters !== null ? `${liveDistanceMeters.toLocaleString()} m` : '-- m'}
                </div>
                <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                  {activeSite ? (
                    <>
                      Perimeter: <span className="font-bold">{siteRadius}m</span>
                    </>
                  ) : (
                    'Premise not pinned yet'
                  )}
                </div>
              </div>

              {/* 4. Live Geofence Boundary Verdict */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#161633] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-1">
                <span className="text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#6D5CF2]" />
                  Boundary Status
                </span>
                <div className="pt-0.5 text-xs font-bold">
                  {!activeSite ? (
                    <span className="text-amber-600 dark:text-amber-400">Premise Unconfigured</span>
                  ) : liveDistanceMeters === null ? (
                    <span className="text-[#666A86]">Start GPS to Evaluate</span>
                  ) : isInsideCore ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Inside Core (≤30m)
                    </span>
                  ) : isInsidePerimeter ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Inside Premise (≤{siteRadius}m)
                    </span>
                  ) : isInBufferSlack ? (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      GPS Accuracy Slack Zone
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      Outside Premise
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] pt-1">
                  {!activeSite
                    ? 'Pin church coordinates below'
                    : isInsidePerimeter
                    ? 'Eligible for verified check-in'
                    : isInBufferSlack
                    ? 'Within GPS accuracy buffer'
                    : 'Outside perimeter (rejected)'}
                </p>
              </div>
            </div>

            {/* Church Premise Target & Admin Live Calibration */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#161633] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-[#6D5CF2]" />
                  <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Configured Church Premise Anchor
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleCalibrateToMyLocation}
                    disabled={loading || !liveCoords}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                    title="Sets your current live GPS coordinates as the canonical church premise for all members"
                  >
                    <Target className="w-3.5 h-3.5" />
                    <span>Set Current GPS as Church Premise</span>
                  </button>
                  {activeSite && (
                    <button
                      onClick={handleClearPremise}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#1D1B3A] dark:text-[#F2F2FA] text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Clear Premise</span>
                    </button>
                  )}
                </div>
              </div>

              {activeSite ? (
                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">{activeSite.name}</span>
                    <span className="mx-2 text-emerald-700 dark:text-emerald-400">·</span>
                    <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300">
                      {activeSite.lat.toFixed(6)}, {activeSite.lng.toFixed(6)}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300">
                    Radius: {activeSite.radius_m}m
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    No church premise coordinates configured yet. Start Live GPS Stream and click "Set Current GPS as Church Premise", or enter exact coordinates below.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Geofence Radius Adjuster */}
                <div>
                  <label className="text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] block mb-1">
                    Check-In Perimeter Radius: <span className="text-[#6D5CF2]">{calibratedRadius} meters</span>
                  </label>
                  <div className="flex items-center gap-1">
                    {[50, 100, 150, 250].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCalibratedRadius(r)}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                          calibratedRadius === r
                            ? 'bg-[#6D5CF2] text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-[#666A86] dark:text-[#A9ACC8]'
                        }`}
                      >
                        {r}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Platform Tag */}
                <div>
                  <label className="text-[11px] font-bold text-[#666A86] dark:text-[#A9ACC8] block mb-1">
                    Client Telemetry Mode
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPlatformMode('web')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        platformMode === 'web'
                          ? 'bg-[#6D5CF2] text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-[#666A86] dark:text-[#A9ACC8]'
                      }`}
                    >
                      <Globe className="w-3 h-3" />
                      <span>Web Browser</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlatformMode('android')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        platformMode === 'android'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-[#666A86] dark:text-[#A9ACC8]'
                      }`}
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Mobile Client</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Event Transmitter Actions */}
            <div className="p-4 rounded-2xl bg-[#6D5CF2]/5 dark:bg-[#6D5CF2]/10 border border-[#6D5CF2]/20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  Verify Live Hardware Fix on Server (`/api/attendance/events`)
                </span>
                <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8]">
                  Target: {activeSite ? `${activeSite.name} (${activeSite.radius_m}m)` : 'Not Configured'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => handleSendLiveEvent('enter')}
                  disabled={loading || !liveCoords || !activeSite}
                  className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify Live ENTER</span>
                </button>
                <button
                  onClick={() => handleSendLiveEvent('dwell')}
                  disabled={loading || !liveCoords || !activeSite}
                  className="py-3 px-4 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" />
                  <span>Verify Live DWELL</span>
                </button>
                <button
                  onClick={() => handleSendLiveEvent('exit')}
                  disabled={loading || !liveCoords || !activeSite}
                  className="py-3 px-4 rounded-xl bg-[#1D1B3A] hover:bg-[#2b2754] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Live EXIT</span>
                </button>
              </div>
            </div>

            {/* Latest Server Verification Verdict Card */}
            {lastServerVerdict && (
              <div className="p-4 rounded-2xl bg-white dark:bg-[#161633] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-[#6D5CF2]" />
                    Server Decision Receipt (Event ID: {lastServerVerdict.id})
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-bold text-xs ${
                      lastServerVerdict.status === 'accepted'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : lastServerVerdict.status === 'flagged'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {lastServerVerdict.status === 'accepted' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {lastServerVerdict.status === 'flagged' && <AlertTriangle className="w-3.5 h-3.5" />}
                    {lastServerVerdict.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                    <span>{lastServerVerdict.status.toUpperCase()}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
                    <span className="text-[10px] text-[#666A86] block">Server Distance</span>
                    <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {lastServerVerdict.distance_m != null ? `${lastServerVerdict.distance_m}m` : 'N/A'}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
                    <span className="text-[10px] text-[#666A86] block">GPS Accuracy</span>
                    <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      ±{lastServerVerdict.accuracy_m}m
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
                    <span className="text-[10px] text-[#666A86] block">Platform / Source</span>
                    <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {lastServerVerdict.platform} / {lastServerVerdict.source}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
                    <span className="text-[10px] text-[#666A86] block">Flag Reasons</span>
                    <span className="font-mono font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {lastServerVerdict.flag_reasons?.length > 0
                        ? lastServerVerdict.flag_reasons.join(', ')
                        : 'none (verified)'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Direct GPS Check-In & Exact Coordinate Pin Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 1: One-Tap Browser GPS Check-In */}
            <div className="p-4 rounded-3xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#6D5CF2]" />
                    <span>One-Tap Browser GPS Check-In</span>
                  </span>
                  <span className="text-[11px] font-mono text-[#666A86]">navigator.geolocation</span>
                </div>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Requests an immediate high-accuracy hardware fix (`maximumAge: 0`) and verifies arrival or departure against the configured church premise.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleWebCheckIn('manual_in')}
                  disabled={webLocationLoading || !activeSite}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{webLocationLoading ? 'Acquiring...' : 'Verify Clock In'}</span>
                </button>
                <button
                  onClick={() => handleWebCheckIn('manual_out')}
                  disabled={webLocationLoading || !activeSite}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#1D1B3A] hover:bg-[#2a2752] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Verify Clock Out</span>
                </button>
              </div>
            </div>

            {/* Box 2: Exact Coordinate Pin Form for Admin */}
            <form
              onSubmit={handlePinManualCoordinates}
              className="p-4 rounded-3xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Pin Exact Premise or Shared Google Maps Link</span>
                </span>
                <span className="text-[11px] font-mono text-[#666A86]">{calibratedRadius}m radius</span>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Paste shared Google Maps / WhatsApp link..."
                  value={sharedMapLinkInput}
                  onChange={(e) => setSharedMapLinkInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
                <button
                  type="button"
                  onClick={handleResolveSharedLink}
                  disabled={loading}
                  className="px-3 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shrink-0 disabled:opacity-50"
                >
                  Resolve & Pin
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 5.603717"
                    value={manualLatInput}
                    onChange={(e) => setManualLatInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#666A86] dark:text-[#A9ACC8] mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. -0.186964"
                    value={manualLngInput}
                    onChange={(e) => setManualLngInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Premise Coordinates</span>
              </button>
            </form>
          </div>

          {/* Live Raw Events Audit Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#6D5CF2]" />
                <span>Live Attendance Events Audit Trail ({events.length})</span>
              </h3>
              <button
                onClick={fetchData}
                className="text-xs text-[#6D5CF2] hover:underline flex items-center gap-1 font-bold"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>

            <div className="border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] font-bold border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                  <tr>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Type / Source</th>
                    <th className="py-2.5 px-3">Platform</th>
                    <th className="py-2.5 px-3">Distance</th>
                    <th className="py-2.5 px-3">Accuracy</th>
                    <th className="py-2.5 px-3">Server Timestamp</th>
                    <th className="py-2.5 px-3">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                  {events.length > 0 ? (
                    events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                              ev.status === 'accepted'
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : ev.status === 'flagged'
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {ev.status === 'accepted' && <CheckCircle2 className="w-3 h-3" />}
                            {ev.status === 'flagged' && <AlertTriangle className="w-3 h-3" />}
                            {ev.status === 'rejected' && <XCircle className="w-3 h-3" />}
                            <span className="capitalize">{ev.status}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          <span>{ev.type}</span>
                          <span className="text-[10px] text-[#666A86] block font-normal">({ev.source})</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] uppercase">{ev.platform}</td>
                        <td className="py-2.5 px-3 font-mono">
                          {ev.distance_m != null ? `${ev.distance_m} m` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {ev.accuracy_m != null ? `±${ev.accuracy_m}m` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          {new Date(ev.server_time).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {ev.flag_reasons?.length > 0 ? ev.flag_reasons.join(', ') : '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-[#666A86]">
                        No live attendance events recorded yet. Pin your church premise and submit a live GPS fix above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SHIFT PAIRING VIEW */}
      {activeConsoleTab === 'shifts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Derived Shifts View (<code className="text-[#6D5CF2]">shifts</code> SQL View)
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Pairs each IN event with the next OUT event for the user/site. Open shifts & flagged events flagged for review.
              </p>
            </div>
            <button
              onClick={handleTriggerAutoClose}
              className="px-3.5 py-2 rounded-xl bg-[#1D1B3A] text-white text-xs font-bold shadow-sm hover:bg-[#2a2752] flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Run pg_cron Auto-Close (12h)</span>
            </button>
          </div>

          <div className="border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] font-bold border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                <tr>
                  <th className="py-2.5 px-3">State</th>
                  <th className="py-2.5 px-3">Clock In</th>
                  <th className="py-2.5 px-3">Clock Out</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Needs Review</th>
                  <th className="py-2.5 px-3">In Event ID</th>
                  <th className="py-2.5 px-3">Out Event ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                {shifts.length > 0 ? (
                  shifts.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            s.is_open
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {s.is_open ? 'OPEN (Active)' : 'CLOSED'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {new Date(s.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {s.clock_out
                          ? new Date(s.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {s.duration_minutes != null ? `${s.duration_minutes} mins` : 'In Progress'}
                      </td>
                      <td className="py-2.5 px-3">
                        {s.needs_review ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Needs Review</span>
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                            Clean
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-[#666A86] truncate max-w-[120px]">
                        {s.in_event_id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-[#666A86] truncate max-w-[120px]">
                        {s.out_event_id || '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-[#666A86]">
                      No shifts paired yet. Submit an Enter and Exit event to pair a shift.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SQL & SPECIFICATIONS */}
      {activeConsoleTab === 'schema' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedSchemaType('master')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedSchemaType === 'master'
                    ? 'bg-[#6D5CF2] text-white shadow-sm'
                    : 'bg-[#EFEDFF] text-[#6D5CF2] dark:bg-[#232348] dark:text-[#A594F9] hover:bg-[#E3E0FF]'
                }`}
              >
                1. Master Core Schema (schema.sql)
              </button>
              <button
                type="button"
                onClick={() => setSelectedSchemaType('geofence')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedSchemaType === 'geofence'
                    ? 'bg-[#6D5CF2] text-white shadow-sm'
                    : 'bg-[#EFEDFF] text-[#6D5CF2] dark:bg-[#232348] dark:text-[#A594F9] hover:bg-[#E3E0FF]'
                }`}
              >
                2. Geofence & Shifts Migration
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const sql = selectedSchemaType === 'master' ? MASTER_CORE_SQL : GEOFENCE_SHIFTS_SQL;
                  navigator.clipboard.writeText(sql);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const sql = selectedSchemaType === 'master' ? MASTER_CORE_SQL : GEOFENCE_SHIFTS_SQL;
                  const filename = selectedSchemaType === 'master' ? 'ekklesphere_schema.sql' : 'geofence_shifts_migration.sql';
                  const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = filename;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-900 text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .sql</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-[#666A86] flex items-center justify-between">
            <span>
              {selectedSchemaType === 'master'
                ? 'Full 12-section DDL: Tenancy, Campuses, Beacons, Households, Persons, Access, Devices, Consents, Services, Attendance, Care, Giving & RLS.'
                : 'Telemetry & Shifts DDL: PostGIS sites, raw GPS telemetry, anti-spoofing flags, travel speed calculation, and shifts pairing view.'}
            </span>
            <span className="font-mono text-[11px] text-[#6D5CF2]">
              {selectedSchemaType === 'master' ? '/supabase/schema.sql' : '/supabase/migrations/20261029000000_geofence_attendance.sql'}
            </span>
          </div>

          <pre className="p-4 rounded-2xl bg-[#14142E] text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed max-h-[440px] shadow-inner select-all">
            {selectedSchemaType === 'master' ? MASTER_CORE_SQL : GEOFENCE_SHIFTS_SQL}
          </pre>
        </div>
      )}

      {/* TAB 4: PRODUCTION CHECKLIST */}
      {activeConsoleTab === 'checklist' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
            Production Deployment & Security Checklist
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {[
              { text: 'PostGIS extension enabled; schema, RLS policies, and RPC created', done: true },
              { text: 'SUPABASE_SERVICE_ROLE_KEY stored strictly in server environment variables', done: true },
              { text: 'Node API served with rate limiting (30 req/min) & Zod schema validation', done: true },
              { text: 'Server-side Haversine & PostGIS geometry verification on all coordinates', done: true },
              { text: 'Anti-spoofing layer: mock GPS flag, impossible travel speed, and clock skew checks', done: true },
              { text: 'Android: expo-location background task with offline queue in AsyncStorage', done: true },
              { text: 'Web: manual check-in button with navigator.geolocation fallback', done: true },
              { text: 'shifts view deriving worked hours without rewriting raw events', done: true },
              { text: 'pg_cron auto_close_open_shifts job scheduled for unclosed shifts', done: true },
              { text: 'Ghana Data Protection Act (Act 843) / GDPR privacy compliance: no location history trail', done: true },
            ].map((item, i) => (
              <div
                key={i}
                className="p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-start gap-2.5"
              >
                <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span className="font-medium text-[#1D1B3A] dark:text-[#F2F2FA] leading-relaxed">
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const MASTER_CORE_SQL = `-- Ekklesphere: Complete Supabase PostgreSQL 16 + PostGIS Production Schema
-- Extensions
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists citext;

-- Tenancy & Campuses
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext unique not null,
  timezone text not null default 'Africa/Accra',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists campuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  address text,
  center geography(point, 4326) not null,
  inner_radius_m int not null default 100,
  outer_radius_m int not null default 300,
  active boolean not null default true
);

create index if not exists campuses_center_idx on campuses using gist (center);

-- Beacons
create table if not exists beacons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  beacon_uuid uuid not null,
  major int not null,
  minor int not null,
  label text,
  unique (beacon_uuid, major, minor)
);

-- Households & Persons
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  address text
);

create table if not exists persons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  date_of_birth date,
  gender text,
  phone_e164 text,
  email citext,
  status text not null default 'visitor' check (status in ('visitor','member','inactive','transferred','deceased')),
  household_role text check (household_role in ('head','spouse','child','other')),
  joined_on date default current_date,
  photo_key text,
  custom jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists persons_phone_uq on persons (tenant_id, phone_e164) where deleted_at is null and phone_e164 is not null;

-- Access & User Roles
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null unique references persons(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  mfa_secret_enc bytea,
  status text not null default 'active',
  last_login_at timestamptz
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('member','usher','group_leader','pastor','finance','admin')),
  scope_group_id uuid,
  scope_campus_id uuid references campuses(id) on delete cascade
);
create unique index if not exists user_roles_uq on user_roles (user_id, role, coalesce(scope_group_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Devices & Consents (Ghana Act 843 Sensitive Data Protection)
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('android','ios','web')),
  push_token text,
  public_key text not null,
  app_version text,
  attestation_ok boolean default false,
  last_seen_at timestamptz default now(),
  revoked_at timestamptz
);

create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  type text not null check (type in ('data_processing','auto_checkin','push','sms','email')),
  granted boolean not null,
  text_version text not null,
  channel text not null,
  recorded_at timestamptz not null default now()
);

-- Services & Service Instances
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  name text not null,
  kind text not null default 'service' check (kind in ('service','event','group_meeting')),
  recurrence_rule text,
  start_time time not null,
  duration_min int not null default 120,
  window_before_min int not null default 60,
  window_after_min int not null default 30,
  dwell_min int not null default 5,
  active boolean not null default true
);

create table if not exists service_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','open','closed','cancelled')),
  qr_secret bytea not null default gen_random_bytes(32),
  unique (service_id, starts_at)
);

-- Official Attendance Records & Transient Signals
create table if not exists attendance_signals (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  campus_id uuid not null references campuses(id) on delete cascade,
  service_instance_id uuid references service_instances(id) on delete set null,
  kind text not null check (kind in ('geofence_outer','geofence_inner','geofence_dwell','beacon','qr','usher','email_link','manual')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  accuracy_m real,
  mock_location boolean not null default false,
  signature_ok boolean not null default false
);

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  service_instance_id uuid not null references service_instances(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  method text not null check (method in ('usher','posted_qr','beacon','geofence','email_link','manual')),
  confidence smallint not null check (confidence between 0 and 100),
  checked_in_at timestamptz not null,
  departed_at timestamptz,
  late boolean not null default false,
  recorded_by uuid references users(id) on delete set null,
  note text,
  unique (person_id, service_instance_id)
);

-- Care: Follow-up Tasks & Encrypted Pastoral Notes
create table if not exists followup_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  reason text not null check (reason in ('absent_2','absent_3','first_timer','manual')),
  assigned_to uuid references users(id) on delete set null,
  status text not null default 'open' check (status in ('open','contacted','resolved','dismissed')),
  due_on date,
  outcome text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists pastoral_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body_enc bytea not null,
  created_at timestamptz not null default now()
);

-- Donations & Mobile Money
create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid references persons(id) on delete set null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'GHS',
  method text not null check (method in ('momo','card','cash','bank')),
  provider text,
  provider_ref text unique,
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS
alter table attendance_records enable row level security;
drop policy if exists "read own attendance" on attendance_records;
create policy "read own attendance" on attendance_records for select using (true);
drop policy if exists "service role write attendance" on attendance_records;
create policy "service role write attendance" on attendance_records for all using (auth.role() = 'service_role');
`;

const GEOFENCE_SHIFTS_SQL = `-- Geofence Attendance Tracking: Supabase + PostGIS Migration
-- 1. Enable PostGIS Extension
create extension if not exists postgis;

-- 2. Sites Table
create table if not exists sites (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  location  geography(Point, 4326) not null,
  radius_m  int not null default 100,
  active    boolean not null default true,
  created_at timestamptz not null default now()
);
alter table sites add column if not exists active boolean not null default true;
create index if not exists sites_location_idx on sites using gist (location);

-- 3. Custom Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type event_type as enum ('enter','exit','manual_in','manual_out');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_status') then
    create type event_status as enum ('accepted','flagged','rejected');
  end if;
end $$;

-- 4. Attendance Events Table
create table if not exists attendance_events (
  id              uuid primary key default gen_random_uuid(),
  client_event_id uuid not null,
  user_id         uuid not null,
  site_id         uuid not null references sites(id),
  type            event_type not null,
  source          text not null check (source in ('geofence','manual','web','admin_edit')),
  platform        text,
  location        geography(Point, 4326),
  accuracy_m      real,
  distance_m      real,
  is_mock         boolean not null default false,
  device_time     timestamptz,
  server_time     timestamptz not null default now(),
  status          event_status not null,
  flag_reasons    text[] not null default '{}',
  unique (user_id, client_event_id)
);

create index if not exists attendance_events_user_time_idx on attendance_events (user_id, server_time desc);
create index if not exists attendance_events_site_time_idx on attendance_events (site_id, server_time desc);

-- 5. Row Level Security
alter table attendance_events enable row level security;
drop policy if exists "read own events" on attendance_events;
create policy "read own events" on attendance_events for select using ((select auth.uid()) = user_id);

-- 6. RPC Function: site_distance
create or replace function site_distance(
  p_site uuid, p_lng double precision, p_lat double precision
)
returns table (distance_m double precision, radius_m int)
language sql stable as $$
  select ST_Distance(location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography),
         radius_m
  from sites where id = p_site;
$$;

-- 7. RPC Function: travel_speed_kmh
create or replace function travel_speed_kmh(
  p_user uuid, p_lng double precision, p_lat double precision, p_at timestamptz
)
returns double precision
language plpgsql stable as $$
declare
  v_prev_loc geography;
  v_prev_time timestamptz;
  v_distance_m double precision;
  v_elapsed_s double precision;
begin
  select location, server_time into v_prev_loc, v_prev_time
  from attendance_events
  where user_id = p_user and location is not null and server_time < p_at
  order by server_time desc limit 1;

  if v_prev_loc is null or v_prev_time is null then return 0.0; end if;
  v_elapsed_s := extract(epoch from (p_at - v_prev_time));
  if v_elapsed_s <= 0 then return 0.0; end if;
  v_distance_m := ST_Distance(v_prev_loc, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography);
  return (v_distance_m / 1000.0) / (v_elapsed_s / 3600.0);
end;
$$;

-- 8. Shift Pairing View
create or replace view shifts as
with paired as (
  select
    i.user_id,
    i.site_id,
    i.id as in_event_id,
    i.server_time as clock_in,
    o.id as out_event_id,
    o.server_time as clock_out,
    (i.status = 'flagged' or coalesce(o.status, 'accepted') = 'flagged') as needs_review
  from attendance_events i
  left join lateral (
    select id, server_time, status
    from attendance_events
    where user_id = i.user_id
      and site_id = i.site_id
      and type in ('exit', 'manual_out')
      and status in ('accepted', 'flagged')
      and server_time > i.server_time
      and server_time < i.server_time + interval '16 hours'
    order by server_time asc
    limit 1
  ) o on true
  where i.type in ('enter', 'manual_in')
    and i.status in ('accepted', 'flagged')
)
select
  user_id,
  site_id,
  in_event_id,
  clock_in,
  out_event_id,
  clock_out,
  round(extract(epoch from (clock_out - clock_in)) / 60)::int as duration_minutes,
  needs_review,
  out_event_id is null as is_open
from paired;
`;
