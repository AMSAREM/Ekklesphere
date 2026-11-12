// src/components/home/MinistryMosaic.tsx
// Mosaic grid of ministries & groups featuring uploaded photos or gradient fallbacks and a "+" tile overlay.

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Ministry } from '../../types/churchHome';

export interface MinistryMosaicProps {
  ministries: Ministry[];
  searchQuery?: string;
}

export const MinistryMosaic: React.FC<MinistryMosaicProps> = ({
  ministries,
  searchQuery = '',
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleMinistries = normalizedQuery
    ? ministries.filter(
        (m) =>
          m.name.toLowerCase().includes(normalizedQuery) ||
          m.category.toLowerCase().includes(normalizedQuery) ||
          m.summary.toLowerCase().includes(normalizedQuery)
      )
    : ministries;

  const selectedMinistry = visibleMinistries.find((m) => m.id === selectedId) || null;

  return (
    <section
      id="belong-grow"
      aria-labelledby="ministries-heading"
      className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8"
    >
      <div id="prayer-care" className="scroll-mt-24" />
      <div id="worship-music" className="scroll-mt-24" />
      <div id="resources" className="scroll-mt-24" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            Life together
          </p>
          <h2
            id="ministries-heading"
            className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ color: 'var(--text)' }}
          >
            Find a place to belong & serve
          </h2>
        </div>
        <p className="max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
          Select any tile to inspect meeting times, leadership contact, and how to join.
        </p>
      </div>

      {visibleMinistries.length === 0 ? (
        <div
          className="mt-8 rounded-2xl border p-8 text-center text-sm"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          No ministries matched "{searchQuery}". Clear your search to view all groups.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {visibleMinistries.map((ministry, index) => {
            // Create asymmetric mosaic rhythm on desktop
            const spanClass =
              index === 0
                ? 'lg:col-span-3 lg:row-span-2 min-h-[260px]'
                : index === 1 || index === 2
                ? 'lg:col-span-3 min-h-[190px]'
                : 'lg:col-span-2 min-h-[190px]';

            const isSelected = selectedId === ministry.id;

            return (
              <button
                key={ministry.id}
                type="button"
                onClick={() => setSelectedId(isSelected ? null : ministry.id)}
                aria-expanded={isSelected}
                className={`group relative flex flex-col justify-end overflow-hidden rounded-2xl border p-5 text-left transition-transform hover:-translate-y-0.5 ${spanClass}`}
                style={{
                  borderColor: isSelected ? 'var(--brand)' : 'var(--border)',
                  background:
                    ministry.accentGradient ||
                    'linear-gradient(135deg, var(--deep) 0%, #244C3F 70%, var(--brand) 145%)',
                }}
              >
                {/* Uploaded photo when provided by the church */}
                {ministry.imageUrl && (
                  <img
                    src={ministry.imageUrl}
                    alt={ministry.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}

                {/* Legible dark scrim for WCAG AA text contrast over photos/gradients */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10"
                />

                {/* "+" tile overlay in top-right */}
                <span
                  aria-hidden="true"
                  className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-black/35 text-white backdrop-blur-sm transition-colors group-hover:bg-white group-hover:text-black"
                >
                  {isSelected ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>

                <div className="relative z-10 text-white">
                  <span className="text-xs font-medium text-white/85">{ministry.category}</span>
                  <h3 className="mt-1 font-display text-xl font-semibold leading-snug sm:text-2xl">
                    {ministry.name}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-sm text-white/85">{ministry.summary}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected ministry detail drawer card */}
      {selectedMinistry && (
        <div
          role="region"
          aria-label={`${selectedMinistry.name} details`}
          className="mt-5 flex flex-col justify-between gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--brand)',
          }}
        >
          <div className="max-w-2xl">
            <p className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
              {selectedMinistry.category}
            </p>
            <h3
              className="mt-1 font-display text-xl font-semibold"
              style={{ color: 'var(--text)' }}
            >
              {selectedMinistry.name}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {selectedMinistry.summary}
            </p>
            <div
              className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs font-medium"
              style={{ color: 'var(--text)' }}
            >
              {selectedMinistry.meetingCadence && (
                <span>Meets: {selectedMinistry.meetingCadence}</span>
              )}
              {selectedMinistry.leaderName && <span>Contact: {selectedMinistry.leaderName}</span>}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="self-start rounded-lg border px-4 py-2 text-xs font-semibold transition-colors sm:self-center"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          >
            Close
          </button>
        </div>
      )}
    </section>
  );
};
