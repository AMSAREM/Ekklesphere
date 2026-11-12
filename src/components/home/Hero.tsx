// src/components/home/Hero.tsx
// Deep surface hero combining church welcome message, interactive search, QuickActions, and NextServiceCard.

import React from 'react';
import { Search, X } from 'lucide-react';
import type { Church } from '../../types/churchHome';
import { NextServiceCard } from './NextServiceCard';
import { QuickActions } from './QuickActions';

export interface HeroProps {
  church: Church;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onWatch: () => void;
  onGive: () => void;
  onCheckIn: () => void;
  onEvents: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  church,
  searchQuery,
  onSearchChange,
  searchInputRef,
  onWatch,
  onGive,
  onCheckIn,
  onEvents,
}) => {
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const target = document.getElementById('events-and-news') || document.getElementById('belong-grow');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section
      id="home-top"
      aria-labelledby="church-hero-heading"
      className="relative overflow-hidden border-b border-white/10"
      style={{
        backgroundColor: 'var(--deep)',
        color: 'var(--deep-ink)',
      }}
    >
      {/* Subtle warm radial atmosphere using the church's brand accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-0 h-96 w-96 rounded-full opacity-15 blur-3xl"
        style={{ backgroundColor: 'var(--brand)' }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-12 lg:items-center lg:gap-12 lg:px-8 lg:py-20">
        {/* Left Column: Welcome copy, search bar, and QuickActions */}
        <div className="lg:col-span-7">
          <p className="text-sm font-medium" style={{ color: 'var(--brand)' }}>
            {church.tagline}
          </p>

          <h1
            id="church-hero-heading"
            className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.85rem]"
          >
            {church.heroHeadline}
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
            {church.heroSubheadline}
          </p>

          {/* Search bar */}
          <form onSubmit={handleSubmit} role="search" aria-label="Search church life" className="mt-7 max-w-xl">
            <label htmlFor="church-home-search" className="sr-only">
              Search groups, events, sermons, or service times
            </label>
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-4 h-4.5 w-4.5 text-white/60"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                id="church-home-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search groups, events, news, or service times..."
                className="w-full rounded-xl border border-white/20 bg-white/10 py-3.5 pl-11 pr-24 text-sm text-white placeholder:text-white/60 focus:border-white/50 focus:bg-white/15 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  className="absolute right-20 rounded-md p-1.5 text-white/75 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-opacity hover:opacity-95"
                style={{
                  backgroundColor: 'var(--brand)',
                  color: 'var(--brand-ink)',
                }}
              >
                Search
              </button>
            </div>
          </form>

          {/* Quick-action tiles */}
          <div className="mt-6">
            <QuickActions
              onWatch={onWatch}
              onGive={onGive}
              onCheckIn={onCheckIn}
              onEvents={onEvents}
            />
          </div>
        </div>

        {/* Right Column: Live NextServiceCard replacing hero photo */}
        <div className="lg:col-span-5">
          <NextServiceCard
            serviceTimes={church.serviceTimes}
            timezone={church.timezone}
            onWatchClick={onWatch}
          />
        </div>
      </div>
    </section>
  );
};
