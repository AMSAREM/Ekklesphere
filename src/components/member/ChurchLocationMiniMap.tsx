// src/components/member/ChurchLocationMiniMap.tsx
import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  Compass,
  ExternalLink,
  Copy,
  Share2,
  Layers,
  Radio,
  Check,
  Maximize2,
} from 'lucide-react';

interface ChurchLocationMiniMapProps {
  churchName: string;
  campusName: string;
  campusAddress?: string;
  latitude: number;
  longitude: number;
  innerRadiusM?: number;
  outerRadiusM?: number;
  livePosition?: {
    lat: number;
    lng: number;
    accuracy: number;
    distanceM: number | null;
  } | null;
  isCheckedIn?: boolean;
  onToast?: (message: string) => void;
}

export const ChurchLocationMiniMap: React.FC<ChurchLocationMiniMapProps> = ({
  churchName,
  campusName,
  campusAddress,
  latitude,
  longitude,
  innerRadiusM = 50,
  outerRadiusM = 300,
  livePosition,
  isCheckedIn,
  onToast,
}) => {
  const [viewMode, setViewMode] = useState<'map' | 'radar'>('map');
  const [copied, setCopied] = useState(false);

  const formattedCoords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  // Detect iOS / Apple devices for native Apple Maps vs Google Maps universal links
  const openInDeviceMaps = () => {
    const isApple =
      typeof navigator !== 'undefined' &&
      /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent);

    const queryLabel = encodeURIComponent(`${churchName} (${campusName})`);
    const targetUrl = isApple
      ? `https://maps.apple.com/?q=${queryLabel}&ll=${latitude},${longitude}&t=m`
      : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (onToast) onToast(`Opening ${churchName} in your device maps...`);
  };

  const getDirections = () => {
    const isApple =
      typeof navigator !== 'undefined' &&
      /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent);

    const originParam = livePosition ? `&origin=${livePosition.lat},${livePosition.lng}` : '';
    const targetUrl = isApple
      ? `https://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d&t=m`
      : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}${originParam}`;

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (onToast) onToast('Launching turn-by-turn navigation in Maps...');
  };

  const copyCoordinates = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(formattedCoords);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        if (onToast) onToast(`Coordinates ${formattedCoords} copied to clipboard!`);
      }
    } catch {
      // Fallback
    }
  };

  const shareLocation = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${churchName} - ${campusName}`,
          text: `Church GPS location for ${churchName}: ${formattedCoords}`,
          url: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
        });
      } catch {
        // Share dismissed
      }
    } else {
      copyCoordinates();
    }
  };

  // Embed bbox around church location (+/- 0.005 degrees ~500m)
  const delta = 0.0045;
  const bbox = `${(longitude - delta).toFixed(6)},${(latitude - delta * 0.7).toFixed(
    6
  )},${(longitude + delta).toFixed(6)},${(latitude + delta * 0.7).toFixed(6)}`;
  const embedMapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;

  return (
    <div className="w-full bg-black/25 backdrop-blur-md rounded-2xl border border-white/20 overflow-hidden shadow-inner space-y-3 p-3 sm:p-4">
      {/* Header bar with controls */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Compass className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white block leading-tight">
              Church Premise Location
            </span>
            <span className="text-[11px] text-white/80 font-mono">
              {formattedCoords}
            </span>
          </div>
        </div>

        {/* View mode toggle (Map vs Radar) */}
        <div className="flex items-center bg-white/10 rounded-xl p-0.5 border border-white/15 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              viewMode === 'map'
                ? 'bg-white text-[#5848c2] shadow-xs'
                : 'text-white/80 hover:text-white'
            }`}
          >
            Live Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode('radar')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              viewMode === 'radar'
                ? 'bg-white text-[#5848c2] shadow-xs'
                : 'text-white/80 hover:text-white'
            }`}
          >
            Geofence Radar
          </button>
        </div>
      </div>

      {/* Main Mini-Map View Area */}
      <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden bg-slate-900 border border-white/15">
        {viewMode === 'map' ? (
          <>
            <iframe
              title={`Mini map preview for ${churchName}`}
              src={embedMapUrl}
              className="w-full h-full border-0 pointer-events-auto"
              loading="lazy"
            />
            {/* Overlay badge with premise center pin info */}
            <div className="absolute top-2 left-2 pointer-events-none bg-slate-900/85 backdrop-blur-md text-white px-2.5 py-1 rounded-lg border border-white/20 text-[10px] font-semibold flex items-center gap-1.5 shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{campusName || churchName}</span>
            </div>

            {/* Tap to expand overlay button */}
            <button
              type="button"
              onClick={openInDeviceMaps}
              aria-label="Open in external maps app"
              className="absolute top-2 right-2 bg-slate-900/85 hover:bg-slate-900 backdrop-blur-md text-white p-1.5 rounded-lg border border-white/20 shadow-md transition-transform hover:scale-105 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          /* SVG Sanctuary Geofence Radar Preview */
          <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0D0D26] to-[#1F174B] p-2 select-none">
            <svg
              className="w-full h-full max-w-[260px] max-h-[200px]"
              viewBox="0 0 200 200"
            >
              {/* Radar Grid circles */}
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="rgba(255, 255, 255, 0.12)"
                strokeDasharray="3 3"
              />
              <circle
                cx="100"
                cy="100"
                r="60"
                fill="none"
                stroke="rgba(167, 139, 250, 0.35)"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <circle
                cx="100"
                cy="100"
                r="30"
                fill="rgba(52, 211, 153, 0.12)"
                stroke="rgba(52, 211, 153, 0.75)"
                strokeWidth="1.5"
              />

              {/* Pulsing ring animation */}
              <circle
                cx="100"
                cy="100"
                r="30"
                fill="none"
                stroke="rgba(52, 211, 153, 0.4)"
                className="animate-ping origin-center"
                style={{ transformOrigin: '100px 100px' }}
              />

              {/* Crosshair lines */}
              <line
                x1="100"
                y1="10"
                x2="100"
                y2="190"
                stroke="rgba(255, 255, 255, 0.1)"
              />
              <line
                x1="10"
                y1="100"
                x2="190"
                y2="100"
                stroke="rgba(255, 255, 255, 0.1)"
              />

              {/* Center Sanctuary Pin */}
              <circle cx="100" cy="100" r="5" fill="#34D399" />
              <circle
                cx="100"
                cy="100"
                r="2"
                fill="#FFFFFF"
              />

              {/* Live Member Dot if position is acquired */}
              {livePosition && (
                (() => {
                  const dist = livePosition.distanceM ?? 50;
                  // Scale distance (0 to 400m -> 0 to 80px)
                  const scaledR = Math.min(80, Math.max(12, (dist / 400) * 80));
                  // Place member at 45 degree angle for representation
                  const memberX = 100 + scaledR * 0.707;
                  const memberY = 100 - scaledR * 0.707;

                  return (
                    <g>
                      {/* Line from member to church center */}
                      <line
                        x1="100"
                        y1="100"
                        x2={memberX}
                        y2={memberY}
                        stroke="rgba(96, 165, 250, 0.6)"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                      {/* Pulse */}
                      <circle
                        cx={memberX}
                        cy={memberY}
                        r="6"
                        fill="rgba(96, 165, 250, 0.4)"
                        className="animate-ping"
                        style={{ transformOrigin: `${memberX}px ${memberY}px` }}
                      />
                      {/* Member dot */}
                      <circle cx={memberX} cy={memberY} r="4.5" fill="#60A5FA" />
                      <circle cx={memberX} cy={memberY} r="2" fill="#FFFFFF" />
                    </g>
                  );
                })()
              )}
            </svg>

            {/* Radar Legend overlay */}
            <div className="absolute bottom-2 left-2 text-[10px] text-white/80 space-y-0.5 pointer-events-none">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Inner Geofence ({innerRadiusM}m)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span>Outer Perimeter ({outerRadiusM}m)</span>
              </div>
              {livePosition && (
                <div className="flex items-center gap-1.5 text-blue-300 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>Your Device ({livePosition.distanceM ?? 0}m away)</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live proximity banner */}
        <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-md text-white px-2.5 py-1 rounded-lg border border-white/20 text-[10px] font-bold flex items-center gap-1">
          {isCheckedIn ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-300">Sanctuary Presence Verified</span>
            </>
          ) : livePosition?.distanceM != null ? (
            <>
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>
                {livePosition.distanceM <= innerRadiusM
                  ? 'Inside Geofence Ring'
                  : `${livePosition.distanceM.toLocaleString()}m to Premise`}
              </span>
            </>
          ) : (
            <>
              <MapPin className="w-3 h-3 text-indigo-300" />
              <span>{campusName || 'Premise Set'}</span>
            </>
          )}
        </div>
      </div>

      {/* Device Map Integration Action Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
        <button
          type="button"
          onClick={openInDeviceMaps}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white text-[#5848c2] hover:bg-slate-100 font-bold transition-all shadow-sm cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="truncate">Open in Maps</span>
        </button>

        <button
          type="button"
          onClick={getDirections}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold transition-all cursor-pointer"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span className="truncate">Get Directions</span>
        </button>

        <button
          type="button"
          onClick={copyCoordinates}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold transition-all cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="truncate">{copied ? 'Copied!' : 'Copy GPS'}</span>
        </button>

        <button
          type="button"
          onClick={shareLocation}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold transition-all cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span className="truncate">Share Church</span>
        </button>
      </div>

      {campusAddress && (
        <p className="text-[11px] text-white/80 flex items-center gap-1.5 truncate">
          <MapPin className="w-3 h-3 shrink-0 text-white/70" />
          <span className="truncate">{campusAddress}</span>
        </p>
      )}
    </div>
  );
};
