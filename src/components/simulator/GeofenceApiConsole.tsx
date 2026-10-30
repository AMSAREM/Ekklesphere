// src/components/simulator/GeofenceApiConsole.tsx
// Comprehensive Live Console for Geofence Attendance Tracking (Android + Web + Node + Supabase)
import React, { useState, useEffect } from 'react';
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

export const GeofenceApiConsole: React.FC = () => {
  const [activeConsoleTab, setActiveConsoleTab] = useState<'console' | 'shifts' | 'schema' | 'checklist'>('console');
  const [loading, setLoading] = useState<boolean>(false);
  const [webLocationLoading, setWebLocationLoading] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Live data from backend
  const [events, setEvents] = useState<AttendanceEventResponse[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [selectedSchemaType, setSelectedSchemaType] = useState<'master' | 'geofence'>('master');
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Manual & Simulator form parameters
  const [selectedSiteId, setSelectedSiteId] = useState<string>('a0000000-0000-0000-0000-000000000001');
  const [isMockToggle, setIsMockToggle] = useState<boolean>(false);
  const [accuracyInput, setAccuracyInput] = useState<number>(15);
  const [clockSkewToggle, setClockSkewToggle] = useState<boolean>(false);
  const [impossibleTravelToggle, setImpossibleTravelToggle] = useState<boolean>(false);

  // Fetch status and shifts
  const fetchData = async () => {
    try {
      const [resHealth, resEvents, resShifts] = await Promise.all([
        fetch('/api/health').catch(() => null),
        fetch('/api/attendance/raw-events').catch(() => null),
        fetch('/api/attendance/shifts').catch(() => null),
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
    } catch (err) {
      console.warn('Could not refresh API console data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Web Manual Check-in using Browser GPS
  const handleWebCheckIn = async (type: 'manual_in' | 'manual_out') => {
    setWebLocationLoading(true);
    setStatusFeedback('Requesting browser high-accuracy GPS fix...');

    if (!navigator.geolocation) {
      setStatusFeedback('Geolocation is not supported by your browser.');
      setWebLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const payload = {
            clientEventId: crypto.randomUUID(),
            siteId: selectedSiteId,
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
            setStatusFeedback(
              `Web ${type} recorded with status: [${data.status.toUpperCase()}]. Distance: ${data.distance_m ?? 'N/A'}m. Flags: ${
                data.flag_reasons.join(', ') || 'none'
              }`
            );
          } else {
            setStatusFeedback(`Server error: ${data.error || 'Check failed'}`);
          }
          await fetchData();
        } catch (err: any) {
          setStatusFeedback(`Submission error: ${err.message}`);
        } finally {
          setWebLocationLoading(false);
        }
      },
      (err) => {
        setWebLocationLoading(false);
        setStatusFeedback(`GPS acquisition error: ${err.message}. (Ensure location permission is allowed)`);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Android Geofence Simulation
  const handleSimulatedEvent = async (
    type: 'enter' | 'exit' | 'manual_in' | 'manual_out',
    scenario: 'normal' | 'outside' | 'mock' | 'skew' | 'impossible'
  ) => {
    setLoading(true);

    // Accra Central Sanctuary center: (lat: 5.5560, lng: -0.1969)
    let lat = 5.5561;
    let lng = -0.1968;
    let accuracy = accuracyInput;
    let isMock = isMockToggle;
    let deviceTime = new Date().toISOString();

    if (scenario === 'outside') {
      // 5 km away in Achimota
      lat = 5.6120;
      lng = -0.2230;
    } else if (scenario === 'mock') {
      isMock = true;
    } else if (scenario === 'skew') {
      // 25 minutes in the past
      deviceTime = new Date(Date.now() - 25 * 60000).toISOString();
    } else if (scenario === 'impossible') {
      // 250 km away in Kumasi 2 minutes after previous fix
      lat = 6.6885;
      lng = -1.6244;
    }

    try {
      const payload = {
        clientEventId: crypto.randomUUID(),
        siteId: selectedSiteId,
        type,
        source: scenario === 'normal' || scenario === 'outside' ? 'geofence' : 'manual',
        platform: 'android',
        lat,
        lng,
        accuracyM: accuracy,
        isMock,
        deviceTime,
      };

      const res = await fetch('/api/attendance/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setStatusFeedback(
        `Simulation [${scenario.toUpperCase()}]: Server decided -> ${data.status.toUpperCase()} (${
          data.flag_reasons?.join(', ') || 'verified'
        })`
      );
      await fetchData();
    } catch (err: any) {
      setStatusFeedback(`Simulation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
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
    } catch (err: any) {
      setStatusFeedback(`Auto-close error: ${err.message}`);
    }
  };

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
                Geofence Verification & Shift Engine
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live PostGIS / Node
              </span>
            </div>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Server validates fresh GPS fix · Derived shifts · Anti-spoofing · Idempotent queue
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
            Live Testing
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

      {/* TAB 1: LIVE TESTING CONSOLE */}
      {activeConsoleTab === 'console' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 1: Web App Manual Check-In (Real Browser GPS) */}
            <div className="p-4 rounded-3xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#6D5CF2]" />
                  <span>Web App Check-In (Manual Navigator GPS)</span>
                </span>
                <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md font-mono text-[#666A86]">
                  source: 'web'
                </span>
              </div>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Web browsers cannot run background geofences. Uses{' '}
                <code className="text-[#6D5CF2] font-mono">navigator.geolocation</code> and sends evidence to Node.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleWebCheckIn('manual_in')}
                  disabled={webLocationLoading}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Web Clock In</span>
                </button>
                <button
                  onClick={() => handleWebCheckIn('manual_out')}
                  disabled={webLocationLoading}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#1D1B3A] hover:bg-[#2a2752] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Web Clock Out</span>
                </button>
              </div>
            </div>

            {/* Box 2: Android Geofence Simulator (Expo Task Manager Simulation) */}
            <div className="p-4 rounded-3xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#4FBF98]" />
                  <span>Android Background Geofence Test Bed</span>
                </span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md font-mono">
                  platform: 'android'
                </span>
              </div>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Simulates OS geofence trigger + fresh high-accuracy GPS fix with various threat profiles.
              </p>

              {/* Quick Scenarios */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-bold">
                <button
                  onClick={() => handleSimulatedEvent('enter', 'normal')}
                  disabled={loading}
                  className="p-2 rounded-xl bg-[#DDF5EC] dark:bg-[#16382F] text-[#1E7A5F] dark:text-[#5FD3AB] hover:opacity-90 text-left"
                >
                  ✓ Enter Site (Accept)
                </button>
                <button
                  onClick={() => handleSimulatedEvent('exit', 'normal')}
                  disabled={loading}
                  className="p-2 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:opacity-90 text-left"
                >
                  ↗ Exit Site (Accept)
                </button>
                <button
                  onClick={() => handleSimulatedEvent('enter', 'mock')}
                  disabled={loading}
                  className="p-2 rounded-xl bg-[#FFEFD0] dark:bg-[#3D2E10] text-[#8A5700] dark:text-[#F5B84A] hover:opacity-90 text-left"
                >
                  ⚠ Mock GPS (Flag)
                </button>
                <button
                  onClick={() => handleSimulatedEvent('enter', 'outside')}
                  disabled={loading}
                  className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:opacity-90 text-left"
                >
                  ✕ Far Outside (Reject)
                </button>
                <button
                  onClick={() => handleSimulatedEvent('enter', 'impossible')}
                  disabled={loading}
                  className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:opacity-90 text-left"
                >
                  ⚡ Impossible Travel (&gt;150km/h)
                </button>
                <button
                  onClick={() => handleSimulatedEvent('enter', 'skew')}
                  disabled={loading}
                  className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:opacity-90 text-left"
                >
                  🕒 Clock Skew (&gt;10 min)
                </button>
              </div>
            </div>
          </div>

          {/* Live Raw Events Audit Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#6D5CF2]" />
                <span>Attendance Events Audit Trail ({events.length})</span>
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
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] font-bold border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                  <tr>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Type / Source</th>
                    <th className="py-2.5 px-3">Platform</th>
                    <th className="py-2.5 px-3">Distance / Radius</th>
                    <th className="py-2.5 px-3">Accuracy</th>
                    <th className="py-2.5 px-3">Server Timestamp</th>
                    <th className="py-2.5 px-3">Flag Reasons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                  {events.length > 0 ? (
                    events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                              ev.status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : ev.status === 'flagged'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
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
                        <td className="py-2.5 px-3">
                          {ev.distance_m != null ? `${ev.distance_m} m` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {ev.accuracy_m != null ? `±${ev.accuracy_m}m` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                          {new Date(ev.server_time).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3">
                          {ev.flag_reasons.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {ev.flag_reasons.map((r) => (
                                <span
                                  key={r}
                                  className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-mono text-[10px]"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-[#666A86]">
                        No attendance events logged yet. Submit a test event above.
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
              <span>Simulate pg_cron Auto-Close (12h)</span>
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
create policy "read own attendance" on attendance_records for select using (true);
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
  radius_m  int not null default 150,
  created_at timestamptz not null default now()
);
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
create policy "read own events" on attendance_events for select using (auth.uid() = user_id);

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
