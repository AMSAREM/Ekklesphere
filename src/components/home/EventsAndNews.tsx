// src/components/home/EventsAndNews.tsx
// "What's new" section pairing a featured church event alongside news posts with date flag badges.

import React from 'react';
import { ArrowRight, Calendar, MapPin } from 'lucide-react';
import type { ChurchEvent, NewsPost } from '../../types/churchHome';
import { resolveDisplayImageUrl } from '../../utils/imageUrl';

export interface EventsAndNewsProps {
  events: ChurchEvent[];
  newsPosts: NewsPost[];
  searchQuery?: string;
}

function getDateParts(iso: string): { month: string; day: string; fullDate: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { month: 'Soon', day: '--', fullDate: 'Date upcoming' };
  }
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = String(date.getDate()).padStart(2, '0');
  const fullDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return { month, day, fullDate };
}

export const EventsAndNews: React.FC<EventsAndNewsProps> = ({
  events,
  newsPosts,
  searchQuery = '',
}) => {
  const query = searchQuery.trim().toLowerCase();

  const filteredEvents = query
    ? events.filter(
        (evt) =>
          evt.title.toLowerCase().includes(query) ||
          evt.summary.toLowerCase().includes(query) ||
          evt.location.toLowerCase().includes(query) ||
          evt.category.toLowerCase().includes(query)
      )
    : events;

  const filteredNews = query
    ? newsPosts.filter(
        (post) =>
          post.title.toLowerCase().includes(query) ||
          post.summary.toLowerCase().includes(query) ||
          post.category.toLowerCase().includes(query)
      )
    : newsPosts;

  const featuredEvent = filteredEvents.find((e) => e.featured) || filteredEvents[0] || null;
  const secondaryEvents = filteredEvents.filter((e) => e.id !== featuredEvent?.id);

  return (
    <section
      id="events-and-news"
      aria-labelledby="whats-new-heading"
      className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            What’s new
          </p>
          <h2
            id="whats-new-heading"
            className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ color: 'var(--text)' }}
          >
            Upcoming events & parish notes
          </h2>
        </div>
      </div>

      {filteredEvents.length === 0 && filteredNews.length === 0 ? (
        <div
          className="mt-8 rounded-2xl border p-8 text-center text-sm"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          No events or news items matched "{searchQuery}".
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          {/* Left Column: Featured Event + Secondary Upcoming Gatherings */}
          <div className="space-y-4 lg:col-span-7">
            {featuredEvent && (
              <article
                className="overflow-hidden rounded-2xl border shadow-sm"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                }}
              >
                <div
                  className="relative h-56 w-full overflow-hidden sm:h-64"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--deep) 0%, #244C3F 70%, var(--brand) 145%)',
                  }}
                >
                  {resolveDisplayImageUrl(featuredEvent.imageUrl, 'card') && (
                    <img
                      src={resolveDisplayImageUrl(featuredEvent.imageUrl, 'card')!}
                      alt={featuredEvent.title}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent"
                  />
                  {/* Date flag badge on top-left */}
                  {(() => {
                    const parts = getDateParts(featuredEvent.dateIso);
                    return (
                      <div
                        className="absolute left-5 top-0 flex flex-col items-center rounded-b-xl px-3.5 py-2.5 text-center shadow-md"
                        style={{
                          backgroundColor: 'var(--brand)',
                          color: 'var(--brand-ink)',
                        }}
                      >
                        <span className="text-xs font-semibold leading-none">{parts.month}</span>
                        <span className="mt-1 font-mono text-xl font-bold leading-none tabular-nums">
                          {parts.day}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="p-6">
                  <p className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                    {featuredEvent.category}
                  </p>
                  <h3
                    className="mt-1.5 font-display text-2xl font-semibold leading-snug"
                    style={{ color: 'var(--text)' }}
                  >
                    {featuredEvent.title}
                  </h3>
                  <p
                    className="mt-2.5 text-sm leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {featuredEvent.summary}
                  </p>

                  <div
                    className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-xs font-medium"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" style={{ color: 'var(--brand)' }} aria-hidden="true" />
                      {featuredEvent.timeLabel || getDateParts(featuredEvent.dateIso).fullDate}
                    </span>
                    {featuredEvent.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" style={{ color: 'var(--brand)' }} aria-hidden="true" />
                        {featuredEvent.location}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            )}

            {secondaryEvents.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {secondaryEvents.map((evt) => {
                  const parts = getDateParts(evt.dateIso);
                  return (
                    <article
                      key={evt.id}
                      className="flex flex-col justify-between rounded-2xl border p-5"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                            {evt.category}
                          </span>
                          {/* Date flag badge */}
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold tabular-nums"
                            style={{
                              backgroundColor: 'var(--surface-muted)',
                              color: 'var(--text)',
                            }}
                          >
                            <span>{parts.month}</span>
                            <span>{parts.day}</span>
                          </span>
                        </div>
                        <h3
                          className="mt-2 font-display text-lg font-semibold leading-snug"
                          style={{ color: 'var(--text)' }}
                        >
                          {evt.title}
                        </h3>
                        <p
                          className="mt-1.5 text-sm leading-relaxed"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {evt.summary}
                        </p>
                      </div>
                      <p className="mt-4 text-xs font-medium" style={{ color: 'var(--text)' }}>
                        {evt.timeLabel} · {evt.location}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: News list with hanging date flag badges */}
          <div className="lg:col-span-5">
            <div
              className="rounded-2xl border p-6"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
              }}
            >
              <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--text)' }}>
                Parish news & notes
              </h3>

              <ul className="mt-5 divide-y" style={{ borderColor: 'var(--border)' }}>
                {filteredNews.length === 0 && (
                  <li className="py-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No parish news posts published yet.
                  </li>
                )}
                {filteredNews.map((post) => {
                  const parts = getDateParts(post.publishedAt);
                  return (
                    <li
                      key={post.id}
                      className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {/* Hanging date flag badge */}
                      <div
                        className="relative flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-lg border text-center"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface-muted)',
                        }}
                      >
                        <span
                          className="w-full py-0.5 text-[11px] font-semibold leading-tight"
                          style={{
                            backgroundColor: 'var(--deep)',
                            color: 'var(--deep-ink)',
                          }}
                        >
                          {parts.month}
                        </span>
                        <span
                          className="py-1.5 font-mono text-lg font-bold leading-none tabular-nums"
                          style={{ color: 'var(--text)' }}
                        >
                          {parts.day}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                          {post.category}
                        </p>
                        <h4
                          className="mt-0.5 text-base font-semibold leading-snug"
                          style={{ color: 'var(--text)' }}
                        >
                          {post.href ? (
                            <a
                              href={post.href}
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <span>{post.title}</span>
                              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            </a>
                          ) : (
                            post.title
                          )}
                        </h4>
                        <p
                          className="mt-1 text-sm leading-relaxed"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {post.summary}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
