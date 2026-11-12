// src/components/home/VisitCard.tsx
// Visit Us contact card with campus address, directions map link, phone, email, and social channels.

import React from 'react';
import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react';
import type { Church } from '../../types/churchHome';

export interface VisitCardProps {
  church: Church;
  onCheckInClick: () => void;
}

export const VisitCard: React.FC<VisitCardProps> = ({ church, onCheckInClick }) => {
  const socialEntries = [
    { label: 'YouTube', href: church.socialLinks.youtube },
    { label: 'Instagram', href: church.socialLinks.instagram },
    { label: 'Facebook', href: church.socialLinks.facebook },
    { label: 'WhatsApp', href: church.socialLinks.whatsapp },
  ].filter((entry): entry is { label: string; href: string } => Boolean(entry.href));

  return (
    <section
      id="visit-us"
      aria-labelledby="visit-us-heading"
      className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8"
    >
      <div
        className="grid overflow-hidden rounded-2xl border lg:grid-cols-12"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Left: Direct Contact Details */}
        <div className="p-6 sm:p-8 lg:col-span-7">
          <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            Plan a Sunday visit
          </p>
          <h2
            id="visit-us-heading"
            className="mt-1 font-display text-3xl font-semibold tracking-tight"
            style={{ color: 'var(--text)' }}
          >
            We’d love to welcome you in person
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Hospitality stewards greet guests at the main courtyard entrance 20 minutes before every
            gathering. Parking and family check-in assistance are available on site.
          </p>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <dt className="sr-only">Address</dt>
              <MapPin
                className="mt-0.5 h-4.5 w-4.5 shrink-0"
                style={{ color: 'var(--brand)' }}
                aria-hidden="true"
              />
              <dd style={{ color: 'var(--text)' }}>
                {church.address}, {church.city}
              </dd>
            </div>

            {church.phone && (
              <div className="flex items-center gap-3">
                <dt className="sr-only">Phone</dt>
                <Phone
                  className="h-4.5 w-4.5 shrink-0"
                  style={{ color: 'var(--brand)' }}
                  aria-hidden="true"
                />
                <dd>
                  <a
                    href={`tel:${church.phone.replace(/\s+/g, '')}`}
                    className="font-medium hover:underline"
                    style={{ color: 'var(--text)' }}
                  >
                    {church.phone}
                  </a>
                </dd>
              </div>
            )}

            {church.email && (
              <div className="flex items-center gap-3">
                <dt className="sr-only">Email</dt>
                <Mail
                  className="h-4.5 w-4.5 shrink-0"
                  style={{ color: 'var(--brand)' }}
                  aria-hidden="true"
                />
                <dd>
                  <a
                    href={`mailto:${church.email}`}
                    className="font-medium hover:underline"
                    style={{ color: 'var(--text)' }}
                  >
                    {church.email}
                  </a>
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href={church.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-95"
              style={{
                backgroundColor: 'var(--brand)',
                color: 'var(--brand-ink)',
              }}
            >
              <span>Open directions</span>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>

            <button
              type="button"
              onClick={onCheckInClick}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text)',
                backgroundColor: 'var(--surface-muted)',
              }}
            >
              Campus check-in
            </button>
          </div>

          {socialEntries.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-xs font-medium" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Follow along:</span>
              {socialEntries.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: 'var(--text)' }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Right: Stylized Interactive Map Preview Stub */}
        <div
          className="relative flex min-h-[260px] flex-col justify-between p-6 text-white sm:p-8 lg:col-span-5"
          style={{
            background:
              'linear-gradient(155deg, var(--deep) 0%, #1F4A3C 68%, #2E6451 100%)',
          }}
        >
          {/* Subtle architectural map grid lines (non-stock, pure CSS geometry) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.22) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />

          <div className="relative z-10 flex items-center justify-between">
            <span className="rounded-lg border border-white/20 bg-black/25 px-3 py-1 text-xs font-medium">
              Campus map preview
            </span>
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-full shadow-lg"
              style={{
                backgroundColor: 'var(--brand)',
                color: 'var(--brand-ink)',
              }}
            >
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>

          <div className="relative z-10 mt-10 rounded-xl border border-white/15 bg-black/35 p-4 backdrop-blur-sm">
            <p className="font-display text-lg font-semibold">{church.shortName || church.name}</p>
            <p className="mt-1 text-sm text-white/80">
              {church.address}, {church.city}
            </p>
            <a
              href={church.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
              style={{ color: 'var(--brand)' }}
            >
              <span>View pin in Google Maps</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
