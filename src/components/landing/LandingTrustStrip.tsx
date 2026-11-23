import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { PublicEnrolledChurch } from '../../types/ekklesphere';
import { resolveDisplayImageUrl } from '../../utils/imageUrl';

interface LandingTrustStripProps {
  activeChurches?: PublicEnrolledChurch[];
  isLoading?: boolean;
  onNavigate?: (path: string) => void;
}

export const LandingTrustStrip: React.FC<LandingTrustStripProps> = ({
  activeChurches = [],
  isLoading = false,
  onNavigate,
}) => {
  const [failedLogoIds, setFailedLogoIds] = useState<Record<string, boolean>>({});

  const handleChurchClick = (e: React.MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (!onNavigate) return;
    e.preventDefault();
    onNavigate(`/home?church=${encodeURIComponent(slug)}`);
  };

  return (
    <section
      aria-label="Active churches enrolled on Ekklesphere"
      className="border-t border-[#d9d4ca] bg-[#f7f3ec]"
    >
      <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-14 lg:py-10">
        <p className="shrink-0 text-xs text-[#6e7777]">
          {isLoading ? (
            <>
              Active churches on <strong className="text-[#0b1f33]">Ekklesphere</strong>
            </>
          ) : activeChurches.length > 0 ? (
            <>
              Active {activeChurches.length === 1 ? 'church' : 'churches'} enrolled on{' '}
              <strong className="text-[#0b1f33]">Ekklesphere</strong>
            </>
          ) : (
            <>
              Enrolled churches on <strong className="text-[#0b1f33]">Ekklesphere</strong>
            </>
          )}
        </p>

        {isLoading ? (
          <div className="flex flex-wrap items-center gap-8 lg:gap-12" aria-hidden="true">
            <div className="h-6 w-28 bg-[#e8e2d7]/70" />
            <div className="h-6 w-32 bg-[#e8e2d7]/70" />
            <div className="h-6 w-24 bg-[#e8e2d7]/70" />
          </div>
        ) : activeChurches.length > 0 ? (
          <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-5 lg:justify-end lg:gap-x-12">
            {activeChurches.map((church) => {
              const resolvedLogo = !failedLogoIds[church.id]
                ? resolveDisplayImageUrl(church.logoUrl, 'thumb')
                : null;

              const logoMark = resolvedLogo ? (
                <img
                  src={resolvedLogo}
                  alt={church.name}
                  title={church.name}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  onError={() =>
                    setFailedLogoIds((prev) => ({ ...prev, [church.id]: true }))
                  }
                  className="h-9 w-auto max-w-[150px] object-contain opacity-90 transition-opacity group-hover:opacity-100 sm:h-10"
                />
              ) : (
                <span className="font-display text-lg font-medium tracking-[0.02em] text-[#0b1f33]/75 transition-colors group-hover:text-[#0b1f33] sm:text-xl">
                  {church.name}
                </span>
              );

              return church.slug ? (
                <a
                  key={church.id}
                  href={`/home?church=${encodeURIComponent(church.slug)}`}
                  aria-label={church.name}
                  onClick={(e) => handleChurchClick(e, church.slug)}
                  className="group inline-flex items-center transition-opacity hover:opacity-80"
                >
                  {logoMark}
                </a>
              ) : (
                <div key={church.id} className="inline-flex items-center">
                  {logoMark}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 lg:justify-end">
            <span className="text-xs font-medium text-[#6e7777]">
              No active churches enrolled yet.
            </span>
            <a
              href="/app?auth=org_signup"
              onClick={(e) => {
                if (!onNavigate) return;
                e.preventDefault();
                onNavigate('/app?auth=org_signup');
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b1f33] underline decoration-[#9c6912]/60 underline-offset-4 transition-colors hover:text-[#9c6912]"
            >
              <span>Enroll your church</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
};
