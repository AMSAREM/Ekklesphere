import React from 'react';
import { ArrowUpRight } from 'lucide-react';

const IMPACT_STATS = [
  {
    value: '6.2',
    unit: 'hrs',
    label: 'saved per team member each month',
  },
  {
    value: '2.4',
    unit: '×',
    label: 'more follow-ups completed on time',
  },
  {
    value: '94',
    unit: '%',
    label: 'of teams feel more in sync',
  },
];

export const LandingImpactSection: React.FC = () => {
  return (
    <section className="bg-[#e8dfd1] py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-14">
        {/* Heading Div */}
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#647180]">
              The Ekklesphere effect
            </div>
            <h2 className="mt-4 text-[clamp(2.25rem,4.5vw,3.75rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#0b1f33] text-balance">
              Good systems make
              <br />
              <em className="font-display font-normal italic">more space for good work.</em>
            </h2>
          </div>

          <p className="max-w-[280px] text-sm leading-relaxed text-[#5c625e]">
            The details matter. But they should never be the thing your team is known for.
          </p>
        </div>

        {/* Metrics Grid Div */}
        <div className="mt-14 grid grid-cols-1 divide-y divide-[#cec5b7] border-t border-b border-[#cec5b7] md:grid-cols-3 md:divide-x md:divide-y-0">
          {IMPACT_STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-between gap-4 py-8 md:px-7 md:first:pl-0 md:last:pr-0"
            >
              <div>
                <div className="text-5xl sm:text-6xl font-bold leading-none tracking-[-0.05em] tabular-nums text-[#0b1f33]">
                  {stat.value}
                  <span className="ml-1 text-2xl sm:text-3xl tracking-tight">{stat.unit}</span>
                </div>
                <div className="mt-3 max-w-[190px] text-xs leading-snug text-[#5c625e]">
                  {stat.label}
                </div>
              </div>
              <ArrowUpRight className="h-5 w-5 shrink-0 text-[#8e7852]" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
