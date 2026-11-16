import React, { useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';

const CALENDAR_DAYS = [
  { label: 'MON', date: 14 },
  { label: 'TUE', date: 15 },
  { label: 'WED', date: 16 },
  { label: 'THU', date: 17 },
  { label: 'FRI', date: 18 },
];

export const LandingPlatformSection: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(16);

  return (
    <section id="platform" className="bg-[#f1ede5] py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-14">
        {/* Section Heading Div */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#647180]">
              One place to lead from
            </div>
            <h2 className="mt-4 text-[clamp(2.25rem,4.5vw,3.75rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#0b1f33] text-balance">
              Your church is a living system.
              <br />
              <em className="font-display font-normal italic">See it clearly.</em>
            </h2>
          </div>

          <div className="lg:col-span-5">
            <p className="max-w-[460px] text-base leading-relaxed text-[#5c6876]">
              From first-time guests to Sunday volunteers, Ekklesphere gives your whole team the
              context to care well—and the confidence to move together.
            </p>
          </div>
        </div>

        {/* Three Feature Panels Div Grid */}
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Panel 01: Know Your People */}
          <div className="flex flex-col justify-between rounded-xl bg-[#d5e4ee] p-5 sm:p-6">
            <div>
              <div className="relative h-52 overflow-hidden rounded-lg bg-[#bcd3df]">
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 h-32 w-56 -translate-x-1/2 -translate-y-1/2 -rotate-24 rounded-full border border-[#0b1f33]/15"
                />
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 h-48 w-36 -translate-x-1/2 -translate-y-1/2 rotate-30 rounded-full border border-[#0b1f33]/15"
                />

                <div className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-[#fffefa] shadow-sm">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0b1f33] text-[9px] font-bold text-white">
                    NC
                  </span>
                  <strong className="mt-0.5 text-[9px] text-[#0b1f33]">New City</strong>
                </div>

                <div className="absolute left-[15%] top-[26%] grid h-8 w-8 place-items-center rounded-full bg-[#eab7a3] text-[10px] font-bold text-[#0b1f33] shadow-xs">
                  EM
                </div>
                <div className="absolute right-[14%] top-[22%] grid h-8 w-8 place-items-center rounded-full bg-[#f1d28b] text-[10px] font-bold text-[#0b1f33] shadow-xs">
                  JT
                </div>
                <div className="absolute right-[18%] bottom-[16%] grid h-8 w-8 place-items-center rounded-full bg-[#cbd5b7] text-[10px] font-bold text-[#0b1f33] shadow-xs">
                  RS
                </div>
              </div>

              <div className="mt-6 text-[11px] font-bold tracking-[0.12em] text-[#0b1f33]/55">
                01
              </div>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#0b1f33]">
                Know your people.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4f5c66]">
                See every relationship, team, and next step—without losing the human story.
              </p>
            </div>

            <div className="mt-6">
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#0b1f33] hover:text-[#9c6912]"
              >
                <span>Explore people</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Panel 02: Make Plans That Move */}
          <div className="flex flex-col justify-between rounded-xl bg-[#e9dfc9] p-5 sm:p-6">
            <div>
              <div className="h-52 rounded-lg bg-[#f6f1e6] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.12em] text-[#6d7169]">
                  <span>OCTOBER SCHEDULE</span>
                  <span>2026</span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {CALENDAR_DAYS.map((day) => {
                    const active = selectedDate === day.date;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setSelectedDate(day.date)}
                        className="flex flex-col items-center gap-2 rounded-lg py-1 transition-colors hover:bg-white/60"
                      >
                        <span className="text-[9px] font-semibold text-[#8c8c86]">
                          {day.label}
                        </span>
                        <span
                          className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold tabular-nums ${
                            active
                              ? 'bg-[#e1ad3f] text-[#0b1f33]'
                              : 'text-[#0b1f33]'
                          }`}
                        >
                          {day.date}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-1.5">
                  <div className="rounded bg-[#f9eab9] px-2.5 py-1.5 text-[11px] font-semibold text-[#0b1f33]">
                    {selectedDate === 16 ? 'Sunday teams · 8:30 AM' : `Oct ${selectedDate} · Ministry huddle`}
                  </div>
                  <div className="rounded bg-[#deebee] px-2.5 py-1.5 text-[11px] font-semibold text-[#0b1f33]">
                    Leaders huddle · 12:00 PM
                  </div>
                </div>
              </div>

              <div className="mt-6 text-[11px] font-bold tracking-[0.12em] text-[#0b1f33]/55">
                02
              </div>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#0b1f33]">
                Make plans that move.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4f5c66]">
                Turn scattered schedules into shared momentum, from Sunday to every day.
              </p>
            </div>

            <div className="mt-6">
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#0b1f33] hover:text-[#9c6912]"
              >
                <span>Explore planning</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Panel 03: Care, With Context */}
          <div className="flex flex-col justify-between rounded-xl bg-[#d9dfcc] p-5 sm:p-6">
            <div>
              <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-lg bg-[#d0d8c0] p-5">
                <div
                  aria-hidden="true"
                  className="absolute h-44 w-44 rounded-full border border-[#536a4a]/25"
                />
                <div className="relative z-10 w-full -rotate-2 rounded-lg bg-[#fffdf8] p-4 shadow-md">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#6d7c5f]">
                    Care note
                  </div>
                  <div className="mt-2 font-display text-base leading-snug text-[#0b1f33]">
                    “Checking in after our conversation.”
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[#eaeade] pt-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#eab9a8] text-[9px] font-bold text-[#0b1f33]">
                        EM
                      </span>
                      <div>
                        <div className="text-[10px] font-bold text-[#0b1f33]">Emma Morales</div>
                        <div className="text-[9px] text-[#7c8478]">Just now</div>
                      </div>
                    </div>
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[#e8f0e3] text-[#4f704b]">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 text-[11px] font-bold tracking-[0.12em] text-[#0b1f33]/55">
                03
              </div>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#0b1f33]">
                Care, with context.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4f5c66]">
                Make follow-up feel personal with thoughtful notes and simple next steps.
              </p>
            </div>

            <div className="mt-6">
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#0b1f33] hover:text-[#9c6912]"
              >
                <span>Explore care</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
