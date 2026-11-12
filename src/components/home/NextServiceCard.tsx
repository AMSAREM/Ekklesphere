// src/components/home/NextServiceCard.tsx
// Live "Next service" countdown card calculated dynamically from church.serviceTimes.

import React, { useEffect, useState } from 'react';
import { CalendarClock, MapPin, Radio } from 'lucide-react';
import { computeNextServiceCountdown } from '../../services/churchHomeService';
import type { ServiceTime } from '../../types/churchHome';

export interface NextServiceCardProps {
  serviceTimes: ServiceTime[];
  timezone: string;
  onWatchClick: () => void;
}

export const NextServiceCard: React.FC<NextServiceCardProps> = ({
  serviceTimes,
  timezone,
  onWatchClick,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const countdown = computeNextServiceCountdown(serviceTimes, now);

  const timeSegments = [
    { label: 'Days', value: countdown.days },
    { label: 'Hours', value: countdown.hours },
    { label: 'Min', value: countdown.minutes },
    { label: 'Sec', value: countdown.seconds },
  ];

  return (
    <section
      aria-label="Next service countdown"
      className="rounded-2xl border border-white/15 bg-white/[0.07] p-6 backdrop-blur-sm sm:p-7"
      style={{ color: 'var(--deep-ink)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-white/85">
          <CalendarClock className="h-4 w-4" style={{ color: 'var(--brand)' }} aria-hidden="true" />
          {countdown.isLiveNow ? 'Service in progress' : 'Next worship gathering'}
        </span>

        {countdown.nextService?.isLivestreamed && (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--brand)',
              color: 'var(--brand-ink)',
            }}
          >
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            Livestream available
          </span>
        )}
      </div>

      <h2 className="mt-3 font-display text-2xl font-semibold leading-snug text-white sm:text-[1.65rem]">
        {countdown.nextService?.label || 'Sunday worship gathering'}
      </h2>

      <p className="mt-1.5 text-sm text-white/80">{countdown.formattedDateLabel}</p>

      {countdown.nextService?.campus && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-white/75">
          <MapPin className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
          <span>{countdown.nextService.campus}</span>
        </p>
      )}

      {/* Countdown blocks */}
      {countdown.isLiveNow ? (
        <div className="mt-5 rounded-xl border border-white/15 bg-black/20 p-4">
          <p className="text-sm leading-relaxed text-white/90">
            Our congregation is gathering now. Join us in person or tune in to the sanctuary stream.
          </p>
        </div>
      ) : (
        <div
          className="mt-5 grid grid-cols-4 gap-2.5 sm:gap-3"
          role="timer"
          aria-live="off"
          aria-label={`Time until ${countdown.nextService?.label || 'next service'}: ${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds`}
        >
          {timeSegments.map((segment) => (
            <div
              key={segment.label}
              className="rounded-xl border border-white/12 bg-black/25 px-2 py-3 text-center"
            >
              <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-white sm:text-3xl">
                {String(segment.value).padStart(2, '0')}
              </div>
              <div className="mt-0.5 text-xs font-medium text-white/70">{segment.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm">
        <a
          href="#service-times"
          className="font-medium text-white/90 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
        >
          See full service schedule
        </a>
        {countdown.nextService?.isLivestreamed && (
          <button
            type="button"
            onClick={onWatchClick}
            className="font-semibold transition-opacity hover:opacity-90"
            style={{ color: 'var(--brand)' }}
          >
            Watch stream
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-white/55">Schedule timezone: {timezone}</p>
    </section>
  );
};
