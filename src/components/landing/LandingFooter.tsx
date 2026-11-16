import React from 'react';
import { BrandLogo } from '../common/BrandLogo';

interface LandingFooterProps {
  onNavigate: (path: string) => void;
  onOpenContact?: () => void;
  contactSalesEmail?: string;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({
  onNavigate,
  onOpenContact,
  contactSalesEmail = 'sales@ekklesphere.com',
}) => {
  const handleRouteClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <footer id="pricing" className="bg-[#0b1f33] py-14 text-[#ecede6]">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-14">
        {/* Top Row Div */}
        <div className="grid grid-cols-1 gap-10 pb-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <a
              href="#top"
              aria-label="Ekklesphere home"
              className="inline-flex items-center no-underline"
            >
              <BrandLogo size="md" surface="dark" />
            </a>
          </div>

          <div className="lg:col-span-4">
            <p className="text-base leading-snug text-[#b9c0bd]">
              Church management,
              <br />
              <em className="font-display font-normal italic text-[#f0c66a]">made human.</em>
            </p>
          </div>

          <div className="lg:col-span-4 flex flex-wrap gap-14 lg:justify-end">
            <div className="flex flex-col gap-2.5">
              <strong className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f1c46b]">
                Explore
              </strong>
              <a
                href="#platform"
                className="text-xs text-[#bbc1be] transition-colors hover:text-[#f0c66a]"
              >
                Platform
              </a>
              <a
                href="#workflow"
                className="text-xs text-[#bbc1be] transition-colors hover:text-[#f0c66a]"
              >
                How it works
              </a>
              <a
                href="#stories"
                className="text-xs text-[#bbc1be] transition-colors hover:text-[#f0c66a]"
              >
                Stories
              </a>
            </div>

            <div className="flex flex-col gap-2.5">
              <strong className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f1c46b]">
                Connect
              </strong>
              <a
                href="/app?auth=login"
                onClick={(e) => handleRouteClick(e, '/app?auth=login')}
                className="text-xs text-[#bbc1be] transition-colors hover:text-[#f0c66a]"
              >
                Sign in
              </a>
              <a
                href="/app?auth=signup"
                onClick={(e) => handleRouteClick(e, '/app?auth=signup')}
                className="text-xs text-[#bbc1be] transition-colors hover:text-[#f0c66a]"
              >
                Sign up
              </a>
              <a
                href="/app?auth=org_signup"
                onClick={(e) => handleRouteClick(e, '/app?auth=org_signup')}
                className="text-xs text-[#bbc1be] transition-colors hover:text-[#f0c66a]"
              >
                Start church trial
              </a>
              {onOpenContact ? (
                <button
                  type="button"
                  onClick={onOpenContact}
                  className="text-left text-xs text-[#bbc1be] transition-colors hover:text-[#f0c66a] cursor-pointer"
                >
                  Contact ({contactSalesEmail})
                </button>
              ) : (
                <a
                  href={`mailto:${contactSalesEmail}`}
                  className="text-xs text-[#bbc1be] transition-colors hover:text-[#f0c66a]"
                >
                  Contact
                </a>
              )}
              <a
                href="/creator"
                onClick={(e) => handleRouteClick(e, '/creator')}
                className="text-xs text-[#8f9996] transition-colors hover:text-[#f0c66a]"
              >
                Creator Console
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Legal Div */}
        <div className="flex flex-col justify-between gap-3 border-t border-white/15 pt-6 text-xs text-[#87928f] sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Ekklesphere, Inc.</span>
          <span>Made for the people doing the work.</span>
          <div className="flex items-center gap-2 text-[#adb5b1]">
            <a href="#top" className="hover:text-white">
              Privacy
            </a>
            <span aria-hidden="true">·</span>
            <a href="#top" className="hover:text-white">
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
