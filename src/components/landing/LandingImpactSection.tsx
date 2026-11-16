import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { LandingPageConfig, PublicLandingOverview } from '../../types/ekklesphere';

interface LandingImpactSectionProps {
  landingConfig?: LandingPageConfig | null;
  liveStats?: PublicLandingOverview['liveStats'] | null;
}

export const LandingImpactSection: React.FC<LandingImpactSectionProps> = ({
  landingConfig,
  liveStats,
}) => {
  const cmsStats = landingConfig?.featuredStats;

  const stats = [
    {
      value:
        liveStats && liveStats.activeChurchesCount > 0
          ? String(liveStats.activeChurchesCount)
          : cmsStats?.congregationsServed || '6.2',
      unit:
        liveStats && liveStats.activeChurchesCount > 0
          ? liveStats.activeChurchesCount === 1
            ? 'church'
            : 'churches'
          : cmsStats?.congregationsServed
          ? ''
          : 'hrs',
      label:
        liveStats && liveStats.activeChurchesCount > 0
          ? 'active organisations provisioned on platform'
          : 'saved per team member each month',
    },
    {
      value:
        liveStats && liveStats.totalCheckinsRecorded > 0
          ? liveStats.totalCheckinsRecorded.toLocaleString()
          : cmsStats?.proximityAccuracy || '2.4',
      unit: liveStats && liveStats.totalCheckinsRecorded > 0 ? '' : cmsStats?.proximityAccuracy ? '' : '×',
      label:
        liveStats && liveStats.totalCheckinsRecorded > 0
          ? 'verified attendance check-ins recorded'
          : 'geofence & usher check-in cadence',
    },
    {
      value: cmsStats?.networkUptime || '99.98%',
      unit: '',
      label: 'platform uptime across active sanctuaries',
    },
  ];

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

          <p className="max-w-[300px] text-sm leading-relaxed text-[#5c625e]">
            {landingConfig?.showcaseHeadline ||
              'The details matter. But they should never be the thing your team is known for.'}
          </p>
        </div>

        {/* Metrics Grid Div */}
        <div className="mt-14 grid grid-cols-1 divide-y divide-[#cec5b7] border-t border-b border-[#cec5b7] md:grid-cols-3 md:divide-x md:divide-y-0">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-between gap-4 py-8 md:px-7 md:first:pl-0 md:last:pr-0"
            >
              <div>
                <div className="text-4xl sm:text-5xl font-bold leading-none tracking-[-0.04em] tabular-nums text-[#0b1f33]">
                  {stat.value}
                  {stat.unit && (
                    <span className="ml-1.5 text-xl sm:text-2xl tracking-tight font-semibold">
                      {stat.unit}
                    </span>
                  )}
                </div>
                <div className="mt-3 max-w-[220px] text-xs leading-snug text-[#5c625e]">
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
