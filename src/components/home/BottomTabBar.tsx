// src/components/home/BottomTabBar.tsx
// Fixed bottom navigation bar on mobile screens under 760px: Home, Watch, Give, Events, Visit.

import React from 'react';
import { CalendarDays, HeartHandshake, Home, MapPin, PlayCircle } from 'lucide-react';

export type MobileTabKey = 'home' | 'watch' | 'give' | 'events' | 'visit';

export interface BottomTabBarProps {
  activeTab: MobileTabKey;
  onSelectTab: (tab: MobileTabKey) => void;
}

const MOBILE_TABS: Array<{ key: MobileTabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'watch', label: 'Watch', icon: PlayCircle },
  { key: 'give', label: 'Give', icon: HeartHandshake },
  { key: 'events', label: 'Events', icon: CalendarDays },
  { key: 'visit', label: 'Visit', icon: MapPin },
];

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav
      aria-label="Mobile navigation"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md min-[760px]:hidden"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
        color: 'var(--text)',
      }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelectTab(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors"
              style={{
                color: isActive ? 'var(--brand)' : 'var(--text-muted)',
              }}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className={isActive ? 'font-semibold' : ''}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
