import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  ShieldCheck,
  MapPin,
  CheckCircle2,
  RotateCcw,
  Clock,
  Lock,
  Sparkles,
  AlertTriangle,
  Play,
  Car,
  ChevronDown,
  ChevronUp,
  Cpu,
  Smartphone,
  Server,
  Zap,
} from 'lucide-react';
import { checkBatteryManagerAdvisor } from '../../geofencing/campusGeofence';

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
    showToast,
    serverDwellJob,
    sendSimulatedSignal,
    fastForwardServerDwellJob,
    simulateDrivePast,
  } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<'controls' | 'server_queue' | 'expo_arch' | 'battery_guide'>('controls');
  const [showArchDetails, setShowArchDetails] = useState<boolean>(false);

  const isAmaCheckedIn = attendanceRecords.some((r) => r.personId === 'm1');
  const amaRecord = attendanceRecords.find((r) => r.personId === 'm1');
  const batteryAdvice = checkBatteryManagerAdvisor();

  // Coordinates for the simulated member marker
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

  const dwellProgressPercent = Math.max(
    0,
    Math.min(100, Math.round(((300 - serverDwellJob.remainingSeconds) / 300) * 100))
  );

  return (
    <div className="max-w-[1140px] mx-auto py-4 sm:py-6 px-3 sm:px-4">
      {/* Title & Privacy Guarantee Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-5 sm:mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
              Proximity & Geofencing Radar
            </h1>
            <span className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
              OS-Level Geofencing
            </span>
          </div>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] max-w-[70ch] mt-1 leading-relaxed">
            Powered by Expo Location & TaskManager background monitoring. Phone wakes on perimeter crossing and sends only boundary events.
            <strong> The 5-minute dwell timer runs reliably on the server (BullMQ)</strong>, preventing background app termination on Tecno, Infinix, and Android Go devices.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#DDF5EC] dark:bg-[#16382F] text-[#1E7A5F] dark:text-[#5FD3AB] px-3.5 py-2 rounded-2xl text-xs font-bold border border-[#7AD3B6]/30 shrink-0">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Ghana Data Protection Act (Act 843) Compliant</span>
        </div>
      </div>

      {/* Main Grid: Left Radar Canvas + Right Multi-Tab Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Left Column: 2D Radar Canvas & Server Queue Monitor (Span 7) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm flex flex-col items-center overflow-hidden">
            <div className="w-full flex items-center justify-between mb-3 text-xs flex-wrap gap-2">
              <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5 truncate">
                <MapPin className="w-4 h-4 text-[#6D5CF2] shrink-0" />
                Accra Central Campus (5.5560° N, 0.1969° W)
              </span>
              <span className="text-[#666A86] dark:text-[#A9ACC8] font-mono shrink-0">OS Region Monitoring</span>
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

                {/* 300m Outer Geofence Ring (Clickable) */}
                <circle
                  cx="250"
                  cy="250"
                  r="180"
                  fill="none"
                  stroke="#6D5CF2"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  className="opacity-70 animate-pulse cursor-pointer"
                  onClick={() => {
                    sendSimulatedSignal('enter_outer');
                  }}
                />
                <text x="255" y="80" fill="#6D5CF2" fontSize="11" fontWeight="700">
                  Outer Ring (300m Approach)
                </text>

                {/* 100m Inner Geofence Ring (Clickable) */}
                <circle
                  cx="250"
                  cy="250"
                  r="90"
                  fill="rgba(109, 92, 242, 0.08)"
                  stroke="#4FBF98"
                  strokeWidth="2.5"
                  className="cursor-pointer"
                  onClick={() => {
                    sendSimulatedSignal('enter_inner');
                  }}
                />
                <text x="255" y="170" fill="#4FBF98" fontSize="11" fontWeight="700">
                  Inner Ring (100m Dwell)
                </text>

                {/* Church Sanctuary Center Marker */}
                <g transform="translate(235, 235)" className="cursor-pointer" onClick={triggerBeaconScan}>
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
                  onClick={advanceProximityStage}
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

            {/* Current Proximity Status Pill */}
            <div className="w-full mt-4 p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] flex items-center justify-between text-xs flex-wrap gap-2">
              <span className="text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1.5 font-medium">
                <Smartphone className="w-3.5 h-3.5 text-[#6D5CF2]" />
                Device State:
              </span>
              <span className="font-bold text-[#6D5CF2] dark:text-[#8C7DFF] truncate">
                {proximityStage === 0
                  ? 'Outside Campus Boundary (> 300 m)'
                  : proximityStage === 1
                  ? 'Approaching Campus (~300 m Outer Ring)'
                  : proximityStage === 2
                  ? `Inside Inner Ring (~100 m) · Server Dwell Active (${formatDwellTime(serverDwellJob.remainingSeconds)})`
                  : 'Checked In · Verified by Server Resolver'}
              </span>
            </div>
          </div>

          {/* Server-Side BullMQ Dwell Job Queue Card */}
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#6D5CF2]" />
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Server-Side BullMQ Dwell Job Queue
                </h3>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  serverDwellJob.status === 'waiting'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : serverDwellJob.status === 'completed_resolved'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : serverDwellJob.status === 'cancelled_exit'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {serverDwellJob.status.replace('_', ' ')}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#666A86] dark:text-[#A9ACC8]">Queue / Job ID:</span>
                <span className="font-mono text-[#1D1B3A] dark:text-[#F2F2FA] font-medium">
                  {serverDwellJob.queue} &gt; {serverDwellJob.jobId}
                </span>
              </div>

              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#666A86] dark:text-[#A9ACC8]">Target Member:</span>
                <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {serverDwellJob.personName} ({serverDwellJob.personId})
                </span>
              </div>

              {/* Countdown Progress Bar */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#666A86] dark:text-[#A9ACC8] flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#6D5CF2]" />
                    5-Minute Server Dwell Countdown:
                  </span>
                  <span className="font-mono font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                    {formatDwellTime(serverDwellJob.remainingSeconds)} ({dwellProgressPercent}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      serverDwellJob.status === 'cancelled_exit'
                        ? 'bg-rose-500'
                        : serverDwellJob.status === 'completed_resolved'
                        ? 'bg-emerald-500'
                        : 'bg-[#6D5CF2]'
                    }`}
                    style={{ width: `${serverDwellJob.status === 'cancelled_exit' ? 100 : dwellProgressPercent}%` }}
                  />
                </div>
              </div>

              {/* Status explanation */}
              {serverDwellJob.status === 'waiting' && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  • Server is holding delayed job in Redis/BullMQ. If exit_inner is received before 0s, job is cancelled.
                </div>
              )}

              {serverDwellJob.status === 'cancelled_exit' && (
                <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/20 p-2 rounded-xl border border-rose-200 dark:border-rose-900/40">
                  ⚠️ <strong>Job Cancelled:</strong> {serverDwellJob.cancellationReason}
                </div>
              )}

              {serverDwellJob.status === 'completed_resolved' && (
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded-xl border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between">
                  <span>✓ <strong>Resolved:</strong> Attendance recorded for Sunday Service</span>
                  <span className="font-mono text-[10px] bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full">
                    {serverDwellJob.resolvedRecordId}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Controls, Payload Inspector, Architecture & Guide (Span 5) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Sub-Navigation Tabs */}
          <div className="flex items-center gap-1 bg-[#EFEDFF] dark:bg-[#1D1D3D] p-1 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold">
            <button
              onClick={() => setActiveTab('controls')}
              className={`flex-1 py-2 px-2.5 rounded-xl transition-all ${
                activeTab === 'controls'
                  ? 'bg-white dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Controls
            </button>
            <button
              onClick={() => setActiveTab('expo_arch')}
              className={`flex-1 py-2 px-2.5 rounded-xl transition-all ${
                activeTab === 'expo_arch'
                  ? 'bg-white dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Expo Code
            </button>
            <button
              onClick={() => setActiveTab('battery_guide')}
              className={`flex-1 py-2 px-2.5 rounded-xl transition-all ${
                activeTab === 'battery_guide'
                  ? 'bg-white dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Battery Guide
            </button>
          </div>

          {/* TAB 1: INTERACTIVE SIMULATION CONTROLS */}
          {activeTab === 'controls' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Boundary Signal Triggers</h2>
                  <button
                    onClick={resetProximity}
                    className="text-xs text-[#666A86] dark:text-[#A9ACC8] hover:text-[#EF5A6F] flex items-center gap-1 font-semibold transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => sendSimulatedSignal('enter_outer')}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-bold hover:bg-[#6D5CF2] hover:text-white transition-all text-left flex items-center justify-between"
                  >
                    <span>1. Send enter_outer (300m)</span>
                    <span className="text-[10px] font-mono opacity-80 shrink-0">Wakes App</span>
                  </button>

                  <button
                    onClick={() => sendSimulatedSignal('enter_inner')}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#DDF5EC] dark:bg-[#16382F] text-[#1E7A5F] dark:text-[#5FD3AB] text-xs font-bold hover:bg-[#1E7A5F] hover:text-white transition-all text-left flex items-center justify-between"
                  >
                    <span>2. Send enter_inner (100m)</span>
                    <span className="text-[10px] font-mono opacity-80 shrink-0">Starts 5m Server Job</span>
                  </button>

                  <button
                    onClick={() => sendSimulatedSignal('exit_inner')}
                    className="w-full py-2.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-600 hover:text-white transition-all text-left flex items-center justify-between border border-rose-200 dark:border-rose-900/40"
                  >
                    <span>3. Send exit_inner (Depart 100m)</span>
                    <span className="text-[10px] font-mono opacity-80 shrink-0">Cancels Dwell Job</span>
                  </button>

                  <button
                    onClick={fastForwardServerDwellJob}
                    className="w-full py-2.5 px-3 rounded-xl bg-purple-100 dark:bg-purple-950/40 text-[#6D5CF2] dark:text-[#A79CFF] text-xs font-bold hover:bg-[#6D5CF2] hover:text-white transition-all text-left flex items-center justify-between"
                  >
                    <span>4. Fast-forward Server Dwell to 0s</span>
                    <span className="text-[10px] font-mono opacity-80 shrink-0">Medium Conf (85%)</span>
                  </button>

                  <button
                    onClick={triggerBeaconScan}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#1D1B3A] text-white text-xs font-bold hover:bg-[#2a2752] transition-all text-left flex items-center justify-between shadow-sm"
                  >
                    <span>5. Detect Entrance BLE Beacon</span>
                    <span className="text-[10px] font-mono text-emerald-400 shrink-0">High Conf (95%)</span>
                  </button>
                </div>

                {/* Anti-drive-past test button */}
                <div className="mt-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                  <button
                    onClick={simulateDrivePast}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-rose-500/10 text-amber-700 dark:text-amber-300 text-xs font-bold hover:from-amber-500/20 hover:to-rose-500/20 border border-amber-300/40 dark:border-amber-700/40 flex items-center justify-center gap-2 transition-all"
                  >
                    <Car className="w-4 h-4 text-amber-600" />
                    <span>Run Auto Demo: Driver Drives Past (40 km/h)</span>
                  </button>
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] text-center mt-1">
                    Enters 100m then departs within 2.5s. Proves server cancels job without check-in.
                  </p>
                </div>
              </div>

              {/* Cryptography & Payload Inspector Card */}
              <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm text-xs space-y-3 overflow-hidden">
                <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-[#6D5CF2] shrink-0" />
                  Device Payload & Verification
                </h2>

                <div className="space-y-2 font-mono text-[11px] bg-[#F6F7FC] dark:bg-[#14142E] p-3 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <div className="flex justify-between">
                    <span className="text-[#666A86]">Tenant ID:</span>
                    <span className="text-[#1D1B3A] dark:text-[#F2F2FA]">tenant-accra</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666A86]">Campus:</span>
                    <span className="text-[#1D1B3A] dark:text-[#F2F2FA] truncate">accra-central</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666A86]">Idempotency UUID:</span>
                    <span className="text-[#1D1B3A] dark:text-[#F2F2FA] truncate max-w-[140px]">
                      {isAmaCheckedIn ? amaRecord?.id : 'c87f39b1-...'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666A86]">Mock GPS Check:</span>
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
                  * Act 843 rule: Phone uploads only an arrival or departure event tied to Accra Central, never a continuous location history trail.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EXPO SKELETON & ARCHITECTURE */}
          {activeTab === 'expo_arch' && (
            <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#6D5CF2]" />
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Expo Location & TaskManager Architecture
                </h3>
              </div>

              <p className="text-[#666A86] dark:text-[#A9ACC8] text-[11px] leading-relaxed">
                On Android it uses the platform's native GeofencingClient, and on iOS it uses circular region monitoring.
                Registration occurs at <strong>module top level</strong> so background events wake the app even if killed.
              </p>

              <div className="bg-[#14142E] text-slate-100 p-3 rounded-2xl font-mono text-[10px] leading-relaxed overflow-x-auto">
                <div className="text-purple-400">// src/geofencing/campusGeofence.ts</div>
                <div>import * as TaskManager from "expo-task-manager";</div>
                <div>import * as Location from "expo-location";</div>
                <div className="text-slate-400">const TASK = "campus-geofence";</div>
                <br />
                <div className="text-emerald-400">// Must run at module top level!</div>
                <div>TaskManager.defineTask(TASK, async (&#123; data, error &#125;) =&gt; &#123;</div>
                <div>&nbsp;&nbsp;if (error) return;</div>
                <div>&nbsp;&nbsp;const &#123; eventType, region &#125; = data;</div>
                <div>&nbsp;&nbsp;const isEnter = eventType === Location.GeofencingEventType.Enter;</div>
                <div>&nbsp;&nbsp;const kind = (isEnter ? "enter_" : "exit_") + region.identifier;</div>
                <div>&nbsp;&nbsp;await queueSignal(&#123; id: uuid(), kind, campusId, occurredAt: Date.now() &#125;);</div>
                <div>&nbsp;&nbsp;await flushQueue(); <span className="text-purple-300">// POST /v1/attendance/signals</span></div>
                <div>&#125;);</div>
                <br />
                <div>export async function startMonitoring(c) &#123;</div>
                <div>&nbsp;&nbsp;await Location.startGeofencingAsync(TASK, [</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&#123; identifier: "outer", latitude: c.lat, longitude: c.lng, radius: 300 &#125;,</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&#123; identifier: "inner", latitude: c.lat, longitude: c.lng, radius: 100 &#125;,</div>
                <div>&nbsp;&nbsp;]);</div>
                <div>&#125;</div>
              </div>

              <div className="p-3 bg-[#EFEDFF] dark:bg-[#2A2A55] rounded-2xl text-[11px] text-[#1D1B3A] dark:text-[#F2F2FA] space-y-1">
                <div className="font-bold text-[#6D5CF2] dark:text-[#A79CFF]">Sequential Permission Order:</div>
                <div>1. Act 843 Plain Language Consent Screen (never track elsewhere)</div>
                <div>2. Foreground Location: <code>requestForegroundPermissionsAsync()</code></div>
                <div>3. Background Location: <code>requestBackgroundPermissionsAsync()</code> ('Allow all the time')</div>
              </div>
            </div>
          )}

          {/* TAB 3: MANUFACTURER BATTERY MANAGER GUIDE */}
          {activeTab === 'battery_guide' && (
            <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Manufacturer Battery Killer Guides
                </h3>
              </div>

              <p className="text-[#666A86] dark:text-[#A9ACC8] text-[11px] leading-relaxed">
                In West Africa, Tecno (HiOS), Infinix (XOS), itel (itellOS), and Samsung aggressively terminate background apps.
                Ekklesphere detects these manufacturers and guides members to whitelist the app.
              </p>

              <div className="space-y-2">
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                  <div className="font-bold text-amber-800 dark:text-amber-300">Tecno (HiOS) & Infinix (XOS):</div>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-amber-900 dark:text-amber-200">
                    <li>Open Phone Master &gt; Auto-start Management &gt; Enable Ekklesphere.</li>
                    <li>Settings &gt; Battery Lab &gt; Set Ekklesphere to "Don't optimize".</li>
                    <li>In Recent Apps, pull down or tap padlock to lock in memory.</li>
                  </ul>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                  <div className="font-bold text-slate-800 dark:text-slate-200">itel (itellOS / Android Go):</div>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                    <li>Settings &gt; Battery &gt; Battery Saver &gt; Disable during service hours.</li>
                    <li>Apps &gt; Ekklesphere &gt; Allow background execution.</li>
                  </ul>
                </div>

                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
                  <div className="font-bold text-blue-800 dark:text-blue-300">Samsung (One UI):</div>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-blue-900 dark:text-blue-200">
                    <li>Settings &gt; Apps &gt; Ekklesphere &gt; Battery &gt; Set to "Unrestricted".</li>
                    <li>Device Care &gt; Battery &gt; Never sleeping apps &gt; Add Ekklesphere.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Real-time Server Audit Stream */}
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm text-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Attendance Audit Log</h2>
              <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Stream
              </span>
            </div>

            <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
              {auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="p-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] text-[11px]">
                  <div className="flex items-center justify-between font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    <span className="truncate">{log.action}</span>
                    <span className="text-[#666A86] font-normal shrink-0 ml-1">{log.timestamp}</span>
                  </div>
                  <div className="text-[#666A86] dark:text-[#A9ACC8] mt-0.5 truncate">{log.details}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
