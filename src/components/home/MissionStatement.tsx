// src/components/home/MissionStatement.tsx
// Warm, spacious mission statement section driven by church profile data.

import React from 'react';
import type { Church } from '../../types/churchHome';

export interface MissionStatementProps {
  church: Church;
}

export const MissionStatement: React.FC<MissionStatementProps> = ({ church }) => {
  return (
    <section
      id="mission-serve"
      aria-labelledby="mission-heading"
      className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8"
    >
      <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-6">
          <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            Our mission & purpose
          </p>
          <h2
            id="mission-heading"
            className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
            style={{ color: 'var(--text)' }}
          >
            {church.missionHeading}
          </h2>
          <p
            className="mt-4 text-base leading-relaxed sm:text-lg"
            style={{ color: 'var(--text-muted)' }}
          >
            {church.missionStatement}
          </p>
        </div>

        {church.missionHighlights && church.missionHighlights.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-6 lg:grid-cols-1">
            {church.missionHighlights.map((highlight) => (
              <div
                key={highlight.title}
                className="rounded-xl border p-5"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: 'var(--brand)' }}
                  />
                  <div>
                    <h3
                      className="text-base font-semibold"
                      style={{ color: 'var(--text)' }}
                    >
                      {highlight.title}
                    </h3>
                    <p
                      className="mt-1 text-sm leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {highlight.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
