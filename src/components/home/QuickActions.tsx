// src/components/home/QuickActions.tsx
// Four concise quick-action tiles: Watch, Give, Check in, Events.

import React from 'react';
import { CalendarDays, HeartHandshake, MapPinCheck, PlayCircle } from 'lucide-react';

export interface QuickActionsProps {
  onWatch: () => void;
  onGive: () => void;
  onCheckIn: () => void;
  onEvents: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onWatch,
  onGive,
  onCheckIn,
  onEvents,
}) => {
  const tiles = [
    {
      key: 'watch',
      label: 'Watch',
      detail: 'Livestream & sermons',
      icon: PlayCircle,
      onClick: onWatch,
    },
    {
      key: 'give',
      label: 'Give',
      detail: 'Tithes & offerings',
      icon: HeartHandshake,
      onClick: onGive,
    },
    {
      key: 'checkin',
      label: 'Check in',
      detail: 'Sunday attendance',
      icon: MapPinCheck,
      onClick: onCheckIn,
    },
    {
      key: 'events',
      label: 'Events',
      detail: 'Gatherings ahead',
      icon: CalendarDays,
      onClick: onEvents,
    },
  ] as const;

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      role="group"
      aria-label="Quick church actions"
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={tile.onClick}
            className="group flex flex-col items-start justify-between rounded-xl border border-white/15 bg-white/[0.08] p-4 text-left transition-colors hover:border-white/35 hover:bg-white/[0.14]"
          >
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
              style={{
                backgroundColor: 'var(--brand)',
                color: 'var(--brand-ink)',
              }}
            >
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="mt-3 block text-sm font-semibold text-white">{tile.label}</span>
            <span className="mt-0.5 block text-xs text-white/75">{tile.detail}</span>
          </button>
        );
      })}
    </div>
  );
};
