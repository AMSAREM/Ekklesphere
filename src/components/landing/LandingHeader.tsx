import React, { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';

interface LandingHeaderProps {
  onNavigate: (path: string) => void;
  onOpenDemo: () => void;
}

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'How it works', href: '#workflow' },
  { label: 'Stories', href: '#stories' },
  { label: 'Pricing', href: '#pricing' },
];

export const LandingHeader: React.FC<LandingHeaderProps> = ({ onNavigate, onOpenDemo }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleRouteClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setMobileOpen(false);
    onNavigate(path);
  };

  return (
    <header
      id="top"
      className="sticky top-0 z-40 w-full border-b border-[#0b1f33]/10 bg-[#f7f3ec]/92 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 sm:h-20 max-w-[1360px] items-center justify-between px-5 sm:px-8 lg:px-14">
        <div className="flex items-center gap-8 lg:gap-14">
          <a
            href="#top"
            aria-label="Ekklesphere home"
            className="inline-flex items-center gap-2.5 text-[#0b1f33] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e1ad3f]"
          >
            <div
              aria-hidden="true"
              className="flex h-7 w-7 -rotate-24 items-center justify-center gap-0.5 rounded-full border border-[#0b1f33]"
            >
              <span className="block h-3 w-0.5 rounded-full bg-[#0b1f33]" />
              <span className="block h-4 w-0.5 rounded-full bg-[#0b1f33]" />
              <span className="block h-2 w-0.5 rounded-full bg-[#0b1f33]" />
            </div>
            <span className="text-lg font-extrabold tracking-tight text-[#0b1f33]">
              ekklesphere
            </span>
          </a>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-7 lg:gap-9">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="whitespace-nowrap text-[13px] font-semibold text-[#0b1f33]/85 transition-colors hover:text-[#9c6912] hover:underline hover:underline-offset-4"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <a
            href="/app?auth=login"
            onClick={(e) => handleRouteClick(e, '/app?auth=login')}
            className="hidden md:inline-flex items-center whitespace-nowrap px-2 py-2 text-[13px] font-semibold text-[#0b1f33] transition-colors hover:text-[#9c6912]"
          >
            Sign in
          </a>
          <a
            href="/app?auth=signup"
            onClick={(e) => handleRouteClick(e, '/app?auth=signup')}
            className="hidden md:inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[#0b1f33] px-4 py-2.5 text-xs font-bold text-[#fffdf9] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#122e48]"
          >
            <span>Sign up</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#0b1f33]/15 bg-[#fffdf9]/70 text-[#0b1f33] md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#d9d4ca] bg-[#f7f3ec] px-5 py-5 md:hidden">
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="py-1.5 text-sm font-semibold text-[#0b1f33]"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#d9d4ca] pt-4">
            <a
              href="/app?auth=login"
              onClick={(e) => handleRouteClick(e, '/app?auth=login')}
              className="inline-flex min-h-[44px] items-center px-3 text-sm font-bold text-[#0b1f33]"
            >
              Sign in
            </a>
            <a
              href="/app?auth=signup"
              onClick={(e) => handleRouteClick(e, '/app?auth=signup')}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#0b1f33] px-5 py-2.5 text-xs font-bold text-[#fffdf9]"
            >
              <span>Sign up</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenDemo();
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#0b1f33]/20 px-4 py-2 text-xs font-bold text-[#0b1f33]"
            >
              <span>Book a demo</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
