import React from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { Radio, ShieldCheck, MapPin, CheckCircle2, RotateCcw, Clock, Lock, Sparkles } from 'lucide-react';

export const ProximitySimulator: React.FC = () => {
  const {
    proximityStage,
    advanceProximityStage,
    resetProximity,
    triggerBeaconScan,
    triggerDwellComplete,
    isBeaconDetected,
    dwellTimerSeconds,
    attendanceRecords,
    auditLogs,
  } = useEkklesphere();

  const isAmaCheckedIn = attendanceRecords.some((r) => r.personId === 'm1');
  const amaRecord = attendanceRecords.find((r) => r.personId === 'm1');

  // Calculate coordinates for the simulated person marker
  // Stage 0: (x: 440, y: 70) - far outside 300m ring
  // Stage 1: (x: 360, y: 150) - on 300m outer ring
  // Stage 2: (x: 280, y: 220) - inside 100m inner ring
  // Stage 3: (x: 250, y: 250) - at the entrance / checked in
  const markerCoords =
    proximityStage === 0
      ? { x: 420, y: 80 }
      : proximityStage === 1
      ? { x: 350, y: 150 }
      : proximityStage === 2
      ? { x: 290, y: 215 }
      : { x: 250, y: 250 };

  const formatDwellTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="max-w-[1100px] mx-auto py-6 px-4">
      {/* Title & Privacy Guarantee Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
              Proximity & Geofencing Radar
            </h1>
            <span className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Signature Feature
            </span>
          </div>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] max-w-[65ch] mt-1 leading-relaxed">
            Simulates the on-device approach pipeline for Accra Central Church. Raw GPS coordinates are never uploaded;
            only signed arrival events inside active service windows trigger check-in.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#DDF5EC] dark:bg-[#16382F] text-[#1E7A5F] dark:text-[#5FD3AB] px-3.5 py-2 rounded-2xl text-xs font-bold border border-[#7AD3B6]/30">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Ghana Data Protection Act (Act 843) Compliant</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 2D Radar Canvas (Span 7) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3 text-xs">
            <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#6D5CF2]" />
              Accra Central Campus (5.5560° N, 0.1969° W)
            </span>
            <span className="text-[#666A86] dark:text-[#A9ACC8] font-mono">Zoom: 1:1000m</span>
          </div>

          {/* Interactive SVG Radar Canvas */}
          <div className="relative w-full aspect-square max-w-[480px] bg-[#F6F7FC] dark:bg-[#14142E] rounded-3xl border border-[#E9EBF5] dark:border-[#2D2D55] overflow-hidden flex items-center justify-center shadow-inner">
            <svg className="w-full h-full" viewBox="0 0 500 500">
              {/* Radar Grid Lines */}
              <circle cx="250" cy="250" r="230" fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />
              <circle cx="250" cy="250" r="160" fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx="250" cy="250" r="80" fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="250" y1="20" x2="250" y2="480" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />
              <line x1="20" y1="250" x2="480" y2="250" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />

              {/* 300m Outer Geofence Ring */}
              <circle
                cx="250"
                cy="250"
                r="180"
                fill="none"
                stroke="#6D5CF2"
                strokeWidth="2"
                strokeDasharray="6 6"
                className="opacity-70 animate-pulse"
              />
              <text x="255" y="80" fill="#6D5CF2" fontSize="11" fontWeight="700">
                Outer Geofence Ring (300m)
              </text>

              {/* 100m Inner Geofence Ring */}
              <circle
                cx="250"
                cy="250"
                r="90"
                fill="rgba(109, 92, 242, 0.08)"
                stroke="#4FBF98"
                strokeWidth="2.5"
              />
              <text x="255" y="170" fill="#4FBF98" fontSize="11" fontWeight="700">
                Inner Dwell Ring (100m)
              </text>

              {/* Church Sanctuary Center Marker */}
              <g transform="translate(235, 235)">
                <rect width="30" height="30" rx="8" fill="#1D1B3A" />
                <path
                  d="M15 6v18M9 12h12"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </g>
              <text x="220" y="280" fill="#1D1B3A" className="dark:fill-white" fontSize="11" fontWeight="700">
                Sanctuary
              </text>

              {/* Entrance BLE Beacon radius */}
              <circle cx="230" cy="265" r="30" fill="rgba(89, 224, 174, 0.2)" stroke="#59E0AE" strokeWidth="1" />
              <circle cx="230" cy="265" r="4" fill="#59E0AE" />
              <text x="145" y="270" fill="#1E7A5F" className="dark:fill-[#5FD3AB]" fontSize="10" fontWeight="600">
                BLE Beacon (Door)
              </text>

              {/* Dynamic Member Marker (Ama Owusu's device) */}
              <g
                transform={`translate(${markerCoords.x - 16}, ${markerCoords.y - 16})`}
                className="transition-all duration-700 ease-out cursor-pointer"
              >
                <circle cx="16" cy="16" r="18" fill="rgba(109, 92, 242, 0.25)" className="animate-ping" />
                <circle cx="16" cy="16" r="14" fill="#6D5CF2" />
                <text x="16" y="20" fill="#fff" fontSize="10" fontWeight="800" textAnchor="middle">
                  AO
                </text>
              </g>
              <text
                x={markerCoords.x - 30}
                y={markerCoords.y + 26}
                fill="#1D1B3A"
                className="dark:fill-white font-bold text-[11px]"
              >
                Ama Owusu
              </text>
            </svg>
          </div>

          {/* Current Status Pill */}
          <div className="w-full mt-4 p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] flex items-center justify-between text-xs">
            <span className="text-[#666A86] dark:text-[#A9ACC8]">Current Stage:</span>
            <span className="font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
              {proximityStage === 0
                ? 'Outside Campus (> 300 m)'
                : proximityStage === 1
                ? 'Approaching Campus (~300 m Outer Ring)'
                : proximityStage === 2
                ? `Inside Inner Ring (~100 m) · Dwell Timer ${formatDwellTime(dwellTimerSeconds)}`
                : 'Checked In · Arrival Validated'}
            </span>
          </div>
        </div>

        {/* Right Column: Interactive Triggers & Pipeline Telemetry (Span 5) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Simulation Controls Card */}
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
            <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-3 flex items-center justify-between">
              <span>Interactive Approach Controls</span>
              <button
                onClick={resetProximity}
                className="text-xs text-[#666A86] dark:text-[#A9ACC8] hover:text-[#EF5A6F] flex items-center gap-1 font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </h2>

            <div className="space-y-2">
              <button
                onClick={advanceProximityStage}
                className="w-full py-2.5 px-3 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-bold hover:bg-[#6D5CF2] hover:text-white transition-all text-left flex items-center justify-between"
              >
                <span>1. Step Person Toward Campus</span>
                <span className="text-[10px] font-mono opacity-80">Next Ring</span>
              </button>

              <button
                onClick={triggerDwellComplete}
                className="w-full py-2.5 px-3 rounded-xl bg-[#DDF5EC] dark:bg-[#16382F] text-[#1E7A5F] dark:text-[#5FD3AB] text-xs font-bold hover:bg-[#1E7A5F] hover:text-white transition-all text-left flex items-center justify-between"
              >
                <span>2. Simulate 5-Min Dwell Complete</span>
                <span className="text-[10px] font-mono opacity-80">Medium Conf (85%)</span>
              </button>

              <button
                onClick={triggerBeaconScan}
                className="w-full py-2.5 px-3 rounded-xl bg-[#1D1B3A] text-white text-xs font-bold hover:bg-[#2a2752] transition-all text-left flex items-center justify-between shadow-sm"
              >
                <span>3. Detect Entrance BLE Beacon</span>
                <span className="text-[10px] font-mono text-emerald-400">High Conf (95%)</span>
              </button>
            </div>
          </div>

          {/* Device Cryptography & Privacy Verification Card */}
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm text-xs space-y-3">
            <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#6D5CF2]" />
              Device Payload & Verification
            </h2>

            <div className="space-y-2 font-mono text-[11px] bg-[#F6F7FC] dark:bg-[#14142E] p-3 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
              <div className="flex justify-between">
                <span className="text-[#666A86]">Tenant ID:</span>
                <span className="text-[#1D1B3A] dark:text-[#F2F2FA]">tenant-accra</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666A86]">Campus:</span>
                <span className="text-[#1D1B3A] dark:text-[#F2F2FA]">campus-accra-central</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666A86]">Idempotency UUID:</span>
                <span className="text-[#1D1B3A] dark:text-[#F2F2FA] truncate max-w-[150px]">
                  {isAmaCheckedIn ? amaRecord?.id : 'c87f39b1-...'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666A86]">Mock Location Flag:</span>
                <span className="text-emerald-500 font-bold">REJECTED (Mock: False)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666A86]">Attestation:</span>
                <span className="text-emerald-500 font-bold">Play Integrity Verified</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666A86]">Method:</span>
                <span className="text-[#6D5CF2] font-bold uppercase">{amaRecord?.method || 'Pending'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666A86]">Confidence Score:</span>
                <span className="text-[#1D1B3A] dark:text-[#F2F2FA] font-bold">
                  {amaRecord?.confidence ? `${amaRecord.confidence}%` : '0%'}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] leading-relaxed">
              * The device uploads only an arrival or departure event tied to Accra Central, never a location history trail.
            </div>
          </div>

          {/* Real-time Server Audit Stream */}
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm text-xs">
            <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-3 flex items-center justify-between">
              <span>Attendance Audit Log</span>
              <span className="text-[10px] text-emerald-500 font-bold">Live Stream</span>
            </h2>

            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {auditLogs.slice(0, 4).map((log) => (
                <div key={log.id} className="p-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] text-[11px]">
                  <div className="flex items-center justify-between font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    <span>{log.action}</span>
                    <span className="text-[#666A86] font-normal">{log.timestamp}</span>
                  </div>
                  <div className="text-[#666A86] dark:text-[#A9ACC8] mt-0.5">{log.details}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
