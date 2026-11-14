// src/components/home/Header.tsx
// Top desktop navigation on >=760px and compact top bar on mobile.
// Intentionally excludes any public "Staff only / Log in" button.

import React from 'react';
import { Moon, Search, Sun } from 'lucide-react';
import type { Church, NavSectionKey } from '../../types/churchHome';
import { resolveDisplayImageUrl } from '../../utils/imageUrl';

export interface HeaderProps {
  church: Church;
  isDark: boolean;
  onToggleTheme: () => void;
  onFocusSearch: () => void;
  onSelectSection: (section: NavSectionKey) => void;
  onOpenGive: () => void;
  isSignedInMember?: boolean;
  onOpenPortal?: () => void;
}

const NAV_ITEMS: Array<{ key: NavSectionKey; label: string; href: string }> = [
  { key: 'belong', label: 'Belong & grow', href: '#belong-grow' },
  { key: 'mission', label: 'Mission & serve', href: '#mission-serve' },
  { key: 'prayer', label: 'Prayer & care', href: '#prayer-care' },
  { key: 'worship', label: 'Worship & music', href: '#worship-music' },
  { key: 'giving', label: 'Giving', href: '#giving' },
  { key: 'resources', label: 'Resources', href: '#resources' },
];

export const Header: React.FC<HeaderProps> = ({
  church,
  isDark,
  onToggleTheme,
  onFocusSearch,
  onSelectSection,
  onOpenGive,
  isSignedInMember = false,
  onOpenPortal,
}) => {
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-md"
      style={{
        backgroundColor: 'var(--deep)',
        color: 'var(--deep-ink)',
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Left: Brand Logo & Church Name */}
        <a
          href="#home-top"
          className="group flex min-w-0 items-center gap-3 rounded-lg py-0.5 text-left"
        >
          {resolveDisplayImageUrl(church.logoUrl, 'thumb') ? (
            <img
              src={resolveDisplayImageUrl(church.logoUrl, 'thumb')!}
              alt={`${church.name} logo`}
              referrerPolicy="no-referrer"
              decoding="async"
              className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/20"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-lg font-semibold shadow-sm"
              style={{
                backgroundColor: 'var(--brand)',
                color: 'var(--brand-ink)',
              }}
            >
              {(church.shortName || church.name).charAt(0)}
            </span>
          )}
          <span className="truncate font-display text-lg font-semibold tracking-tight sm:text-xl">
            {church.shortName || church.name}
          </span>
        </a>

        {/* Center/Right: Desktop Navigation (>=760px) */}
        <nav
          aria-label="Primary church navigation"
          className="hidden min-[760px]:flex items-center gap-1 lg:gap-2"
        >
          {NAV_ITEMS.map((item) => {
            if (item.key === 'giving') {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={onOpenGive}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white whitespace-nowrap"
                >
                  {item.label}
                </button>
              );
            }
            return (
              <a
                key={item.key}
                href={item.href}
                onClick={() => onSelectSection(item.key)}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white whitespace-nowrap"
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Right Utilities: Search & Theme Toggle (plus signed-in member shortcut only when already authenticated) */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onFocusSearch}
            aria-label="Search ministries, events, and resources"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          >
            {isDark ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {isSignedInMember && onOpenPortal && (
            <button
              type="button"
              onClick={onOpenPortal}
              className="hidden sm:inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-95"
              style={{
                backgroundColor: 'var(--brand)',
                color: 'var(--brand-ink)',
              }}
            >
              My portal
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
