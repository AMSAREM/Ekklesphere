// src/components/home/ServiceTimes.tsx
// Clean service schedule cards driven from church.serviceTimes.

import React from 'react';
import { Clock, MapPin, Radio } from 'lucide-react';
import { formatServiceTimeLabel, getDayName } from '../../services/churchHomeService';
import type { ServiceTime } from '../../types/churchHome';

export interface ServiceTimesProps {
  serviceTimes: ServiceTime[];
  timezone: string;
  searchQuery?: string;
}

export const ServiceTimes: React.FC<ServiceTimesProps> = ({
  serviceTimes,
  timezone,
  searchQuery = '',
}) => {
  const query = searchQuery.trim().toLowerCase();
  const visible = query
    ? serviceTimes.filter(
        (svc) =>
          svc.label.toLowerCase().includes(query) ||
          getDayName(svc.dayOfWeek).toLowerCase().includes(query) ||
          (svc.campus || '').toLowerCase().includes(query) ||
          (svc.description || '').toLowerCase().includes(query)
      )
    : serviceTimes;

  return (
    <section
      id="service-times"
      aria-labelledby="service-times-heading"
      className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            Weekly rhythm
          </p>
          <h2
            id="service-times-heading"
            className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ color: 'var(--text)' }}
          >
            Service times
          </h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          All gatherings listed in {timezone}
        </p>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((service) => (
          <article
            key={service.id}
            className="flex flex-col justify-between rounded-2xl border p-5"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                  {getDayName(service.dayOfWeek)}
                </span>
                {service.isLivestreamed && (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Radio className="h-3.5 w-3.5" style={{ color: 'var(--brand)' }} aria-hidden="true" />
                    Online too
                  </span>
                )}
              </div>

              <p
                className="mt-2 font-mono text-2xl font-semibold tabular-nums"
                style={{ color: 'var(--text)' }}
              >
                {formatServiceTimeLabel(service.time)}
              </p>

              <h3 className="mt-1 text-base font-semibold" style={{ color: 'var(--text)' }}>
                {service.label}
              </h3>

              {service.description && (
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {service.description}
                </p>
              )}
            </div>

            {service.campus && (
              <p
                className="mt-4 inline-flex items-center gap-1.5 border-t pt-3 text-xs font-medium"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--brand)' }} aria-hidden="true" />
                <span>{service.campus}</span>
              </p>
            )}
          </article>
        ))}

        {visible.length === 0 && (
          <div
            className="col-span-full rounded-2xl border p-6 text-center text-sm"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <Clock className="mx-auto mb-2 h-5 w-5" aria-hidden="true" />
            No scheduled services matched "{searchQuery}".
          </div>
        )}
      </div>
    </section>
  );
};
