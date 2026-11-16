import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface LandingDemoBannerProps {
  onNavigate: (path: string) => void;
  onOpenDemo: () => void;
}

export const LandingDemoBanner: React.FC<LandingDemoBannerProps> = ({
  onNavigate,
  onOpenDemo,
}) => {
  const handleRouteClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <section id="demo" className="bg-[#eee8dc] py-16 sm:py-24">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-14">
        <div className="relative grid min-h-[420px] grid-cols-1 items-center overflow-hidden rounded-xl bg-[#0b1f33] p-8 sm:p-12 lg:grid-cols-12 lg:p-16 text-[#fffdf9]">
          {/* Content Div */}
          <div className="relative z-10 lg:col-span-7">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#aeb5b6]">
              Start with a conversation
            </div>
            <h2 className="mt-4 text-[clamp(2.5rem,5vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#fffdf9] text-balance">
              Give your team
              <br />
              <em className="font-display font-normal italic">room to lead.</em>
            </h2>
            <p className="mt-5 max-w-[390px] text-base leading-relaxed text-[#b9c0c0]">
              See how Ekklesphere can fit the way your church already works—and the way you want
              to grow.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a
                href="/app?auth=org_signup"
                onClick={(e) => handleRouteClick(e, '/app?auth=org_signup')}
                className="inline-flex min-h-[44px] items-center gap-3 rounded-full bg-[#e1ad3f] px-6 py-3 text-xs font-bold text-[#0b1f33] shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#f0bf55]"
              >
                <span>Start 14-day free trial</span>
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>

              <a
                href="/app?auth=login"
                onClick={(e) => handleRouteClick(e, '/app?auth=login')}
                className="border-b border-[#78838a] pb-0.5 text-xs font-semibold text-[#dfe2dc] transition-colors hover:border-[#f0bf55] hover:text-white"
              >
                Sign in
              </a>

              <button
                type="button"
                onClick={onOpenDemo}
                className="border-b border-[#78838a] pb-0.5 text-xs font-semibold text-[#dfe2dc] transition-colors hover:border-[#f0bf55] hover:text-white"
              >
                Book a personal demo
              </button>
            </div>
          </div>

          {/* Orbit Decorative Div */}
          <div
            aria-hidden="true"
            className="pointer-events-none relative mt-10 h-64 lg:col-span-5 lg:mt-0 lg:h-full"
          >
            <div className="absolute right-[-60px] top-1/2 h-[420px] w-[420px] -translate-y-1/2 sm:h-[520px] sm:w-[520px]">
              <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f4d58b]/20" />
              <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f4d58b]/20" />
              <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f4d58b]/20" />

              <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#e1ad3f] text-2xl text-[#0b1f33] ring-[16px] ring-[#e1ad3f]/10">
                ✦
              </div>

              <span className="absolute left-[22%] top-[24%] text-xs tracking-wider text-[#cdd0c8]">
                People
              </span>
              <span className="absolute right-[15%] top-[68%] text-xs tracking-wider text-[#cdd0c8]">
                Plans
              </span>
              <span className="absolute bottom-[12%] left-[34%] text-xs tracking-wider text-[#cdd0c8]">
                Care
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
