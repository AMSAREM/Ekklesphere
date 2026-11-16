import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  HeartHandshake,
  LayoutGrid,
  Play,
  Plus,
  Users,
  Wallet,
} from 'lucide-react';

import type { LandingPageConfig, PublicLandingOverview } from '../../types/ekklesphere';
import { BrandLogo } from '../common/BrandLogo';

interface LandingHeroProps {
  onOpenDemo: () => void;
  onOpenQuickAdd: () => void;
  landingConfig?: LandingPageConfig | null;
  liveStats?: PublicLandingOverview['liveStats'] | null;
}

const HERO_SLIDES = [
  {
    src: '/landing-page/images/ekklesphere-volunteer.jpg',
    alt: 'Volunteers serving together',
    indexLabel: '01 / 03',
    headline: 'Serve together.',
  },
  {
    src: '/landing-page/images/ekklesphere-worship.jpg',
    alt: 'A congregation gathered in worship',
    indexLabel: '02 / 03',
    headline: 'Gather with purpose.',
  },
  {
    src: '/landing-page/images/ekklesphere-team.jpg',
    alt: 'A church team working together',
    indexLabel: '03 / 03',
    headline: 'Lead in sync.',
  },
];

const WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'people', label: 'People', icon: Users },
  { id: 'ministries', label: 'Ministries', icon: HeartHandshake },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'giving', label: 'Giving', icon: Wallet },
] as const;

const ACTIVITY_ROWS = [
  {
    initials: 'EM',
    avatarBg: 'bg-[#eab9a8]',
    title: 'Emma added a note',
    meta: 'Care team · 8 min ago',
  },
  {
    initials: 'JT',
    avatarBg: 'bg-[#c6d9e5]',
    title: 'Jordan joined a team',
    meta: 'Welcome team · 24 min ago',
  },
  {
    initials: 'RS',
    avatarBg: 'bg-[#d9dfc8]',
    title: 'Roster was published',
    meta: 'Kids ministry · 42 min ago',
  },
];

export const LandingHero: React.FC<LandingHeroProps> = ({
  onOpenDemo,
  onOpenQuickAdd,
  landingConfig,
  liveStats,
}) => {
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<(typeof WORKSPACE_TABS)[number]['id']>('overview');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  const stepHero = (delta: number) => {
    setHeroIndex((prev) => (prev + delta + HERO_SLIDES.length) % HERO_SLIDES.length);
  };

  const kickerText =
    landingConfig?.isAnnouncementActive && landingConfig.announcementBadge
      ? landingConfig.announcementBadge
      : 'Church operations, clarified';

  const hasCustomCmsHero =
    Boolean(landingConfig?.heroTitle) &&
    landingConfig?.heroTitle !== 'Next-Gen Presence Radar & Sovereign Church Management';

  const subtitleText =
    landingConfig?.heroSubtitle &&
    landingConfig.heroSubtitle !==
      'Real-time automated geofence attendance, multi-role pastoral dashboards, usher door check-in station, and personal congregation mobile passes.'
      ? landingConfig.heroSubtitle
      : 'Ekklesphere brings people, plans, and pastoral care into one clear view—so your team can spend less time managing the details and more time being present.';

  const churchesLabel =
    liveStats && liveStats.activeChurchesCount > 0
      ? `${liveStats.activeChurchesCount} active ${
          liveStats.activeChurchesCount === 1 ? 'church workspace' : 'church workspaces'
        }`
      : 'Built with 120+ ministry teams';

  return (
    <section className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-14 pt-12 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-28">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-14">
        {/* Left Copy Div */}
        <div className="lg:col-span-5 flex flex-col items-start">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#647180]">
            {kickerText}
          </div>

          <h1 className="mt-5 text-[clamp(2.85rem,6vw,5.25rem)] font-bold leading-[0.95] tracking-[-0.04em] text-[#0b1f33] text-balance">
            {hasCustomCmsHero ? (
              landingConfig!.heroTitle
            ) : (
              <>
                Make room for{' '}
                <em className="font-display font-normal italic tracking-[-0.03em]">ministry.</em>
              </>
            )}
          </h1>

          <p className="mt-6 max-w-[460px] text-base leading-relaxed text-[#5c6876]">
            {subtitleText}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenDemo}
              className="inline-flex min-h-[44px] items-center gap-3 rounded-full bg-[#0b1f33] px-6 py-3 text-xs font-bold text-[#fffdf9] shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#122e48]"
            >
              <span>See Ekklesphere in action</span>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <a
              href="#platform"
              className="inline-flex min-h-[44px] items-center gap-3 rounded-full border border-[#0b1f33]/20 bg-transparent px-5 py-3 text-xs font-bold text-[#0b1f33] transition-colors hover:border-[#0b1f33] hover:bg-white/50"
            >
              <span>Explore the platform</span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#0b1f33]/40">
                <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              </span>
            </a>
          </div>

          <div className="mt-10 flex items-center gap-3 text-xs text-[#647180] tabular-nums">
            <div className="flex -space-x-2" aria-hidden="true">
              <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#f7f3ec] bg-[#e8b8a3] text-[10px] font-bold text-[#0b1f33]">
                J
              </div>
              <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#f7f3ec] bg-[#bfcedb] text-[10px] font-bold text-[#0b1f33]">
                M
              </div>
              <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#f7f3ec] bg-[#d7d9bd] text-[10px] font-bold text-[#0b1f33]">
                K
              </div>
            </div>
            <div>
              <span className="block">{churchesLabel}</span>
              <strong className="font-semibold text-[#0b1f33]">
                {liveStats && liveStats.activeSitesCount > 0
                  ? `${liveStats.activeSitesCount} active sanctuary ${
                      liveStats.activeSitesCount === 1 ? 'site' : 'sites'
                    } connected.`
                  : 'who care about the details.'}
              </strong>
            </div>
          </div>
        </div>

        {/* Right Visual Div Stack */}
        <div className="lg:col-span-7 relative">
          {/* Ambient Shapes */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-4 -top-6 h-56 w-56 rounded-full bg-[#e7d5b5]/70 blur-[2px] sm:h-72 sm:w-72"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-4 bottom-4 h-40 w-40 rounded-full bg-[#cbdde3]/75 blur-[2px] sm:h-52 sm:w-52"
          />

          {/* Photo Carousel Card Div */}
          <div
            aria-roledescription="carousel"
            aria-label="Ministry in motion"
            className="relative z-10 mx-auto w-[92%] sm:w-[86%] h-44 sm:h-56 overflow-hidden rounded-2xl bg-[#93aeb7] shadow-lg"
          >
            {HERO_SLIDES.map((slide, idx) => (
              <div
                key={slide.indexLabel}
                className={`absolute inset-0 transition-opacity duration-500 ${
                  idx === heroIndex ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <img
                  src={slide.src}
                  alt={slide.alt}
                  className="h-full w-full object-cover saturate-[0.78] contrast-[0.96]"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-[#091d2d]/75 via-[#091d2d]/20 to-[#e0ab3d]/30" />
                <div className="absolute bottom-4 left-5 z-10 text-[#fffdf7]">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">
                    {slide.indexLabel}
                  </span>
                  <strong className="mt-1 block text-lg font-bold tracking-tight">
                    {slide.headline}
                  </strong>
                </div>
              </div>
            ))}

            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {HERO_SLIDES.map((slide, idx) => (
                  <button
                    key={slide.indexLabel}
                    type="button"
                    onClick={() => setHeroIndex(idx)}
                    aria-label={`Show hero image ${idx + 1}`}
                    className={`h-0.5 transition-all ${
                      idx === heroIndex ? 'w-7 bg-[#f4d58b]' : 'w-4 bg-white/45'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepHero(-1)}
                  aria-label="Previous hero image"
                  className="grid h-7 w-7 place-items-center rounded-full border border-white/50 bg-[#0b1f33]/35 text-white transition-colors hover:bg-[#0b1f33]/75"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => stepHero(1)}
                  aria-label="Next hero image"
                  className="grid h-7 w-7 place-items-center rounded-full border border-white/50 bg-[#0b1f33]/35 text-white transition-colors hover:bg-[#0b1f33]/75"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Workspace Preview Div */}
          <div className="relative z-20 -mt-10 sm:-mt-16 overflow-hidden rounded-xl border border-[#0b1f33]/15 bg-[#fbfaf6] shadow-[0_30px_80px_rgba(11,31,51,0.14)] lg:rotate-[0.8deg]">
            {/* Topbar Div */}
            <div className="flex h-11 items-center justify-between border-b border-[#e8e4dd] px-4">
              <div className="flex items-center">
                <BrandLogo size="xs" surface="light" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium text-[#5e7a57]">Sunday workspace</span>
                <div className="grid h-6 w-6 place-items-center rounded-full bg-[#e2b59e] text-[9px] font-bold text-[#0b1f33]">
                  AC
                </div>
              </div>
            </div>

            {/* Workspace Body Div */}
            <div className="grid grid-cols-1 sm:grid-cols-[146px_1fr]">
              {/* Sidebar Div */}
              <div className="hidden sm:flex flex-col justify-between bg-[#f1f0ea] p-3">
                <div>
                  <div className="px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.15em] text-[#8d9490]">
                    Workspace
                  </div>
                  <div className="flex flex-col gap-1">
                    {WORKSPACE_TABS.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                            isActive
                              ? 'bg-white font-bold text-[#0b1f33] shadow-xs'
                              : 'text-[#636b67] hover:bg-white/60 hover:text-[#0b1f33]'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-2 border-t border-[#e2dfd7] pt-3">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#0b1f33] text-[9px] font-bold text-white">
                    NC
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-bold text-[#0b1f33]">
                      New City Church
                    </div>
                    <div className="truncate text-[9px] text-[#7c827f]">Admin workspace</div>
                  </div>
                </div>
              </div>

              {/* Workspace Content Div */}
              <div className="bg-[#fffefa] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8d9490]">
                      {activeTab === 'overview'
                        ? 'Monday, October 14'
                        : `${activeTab} view`}
                    </div>
                    <h3 className="mt-1 text-base sm:text-lg font-bold tracking-tight text-[#0b1f33]">
                      Good morning, Alex
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenQuickAdd}
                    aria-label="Open quick action panel"
                    className="grid h-8 w-8 place-items-center rounded-md border border-[#e4e0d7] bg-white text-[#0b1f33] transition-colors hover:border-[#e1ad3f] hover:bg-[#fff9e9]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Metrics Grid Div */}
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  <div className="rounded-lg border border-[#e9e5dc] bg-white p-3">
                    <div className="text-[10px] text-[#727c7e]">Active people</div>
                    <div className="mt-1.5 text-lg sm:text-2xl font-bold tracking-tight tabular-nums text-[#0b1f33]">
                      2,486
                    </div>
                    <div className="mt-1 text-[10px] font-medium text-[#5e8255]">
                      +12.4% this month
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#e9e5dc] bg-white p-3">
                    <div className="text-[10px] text-[#727c7e]">Serving this week</div>
                    <div className="mt-1.5 text-lg sm:text-2xl font-bold tracking-tight tabular-nums text-[#0b1f33]">
                      184
                    </div>
                    <div className="mt-1 text-[10px] font-medium text-[#5e8255]">
                      +8.2% vs. last week
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#e9e5dc] bg-white p-3">
                    <div className="text-[10px] text-[#727c7e]">Follow-ups due</div>
                    <div className="mt-1.5 text-lg sm:text-2xl font-bold tracking-tight tabular-nums text-[#0b1f33]">
                      18
                    </div>
                    <div className="mt-1 text-[10px] font-medium text-[#a3742e]">
                      Needs attention
                    </div>
                  </div>
                </div>

                {/* Lower Two-Panel Grid Div */}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
                  {/* Chart Card Div */}
                  <div className="md:col-span-7 rounded-lg border border-[#e9e5dc] bg-white p-3.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#8d9490]">
                          Ministry pulse
                        </div>
                        <div className="mt-0.5 text-xs font-bold text-[#0b1f33]">
                          People are moving forward
                        </div>
                      </div>
                    </div>

                    <div className="relative mt-3 h-28 w-full">
                      <div className="absolute inset-x-0 top-2 bottom-5 flex flex-col justify-between">
                        <span className="border-t border-dashed border-[#ece9e2]" />
                        <span className="border-t border-dashed border-[#ece9e2]" />
                        <span className="border-t border-dashed border-[#ece9e2]" />
                      </div>
                      <svg
                        viewBox="0 0 480 150"
                        preserveAspectRatio="none"
                        role="img"
                        aria-label="A line chart showing ministry engagement rising"
                        className="absolute inset-x-0 top-1 bottom-5 h-[calc(100%-24px)] w-full"
                      >
                        <defs>
                          <linearGradient id="landingChartFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0" stopColor="#e4ab35" stopOpacity="0.30" />
                            <stop offset="1" stopColor="#e4ab35" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0,119 C33,111 42,123 65,106 S102,90 126,98 S160,70 188,80 S220,89 247,62 S286,84 313,66 S351,39 377,52 S407,48 434,25 S461,22 480,10 L480,150 L0,150 Z"
                          fill="url(#landingChartFill)"
                        />
                        <path
                          d="M0,119 C33,111 42,123 65,106 S102,90 126,98 S160,70 188,80 S220,89 247,62 S286,84 313,66 S351,39 377,52 S407,48 434,25 S461,22 480,10"
                          fill="none"
                          stroke="#d99d29"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-[#8f9591]">
                        <span>May</span>
                        <span>Jun</span>
                        <span>Jul</span>
                        <span>Aug</span>
                        <span>Sep</span>
                        <span>Oct</span>
                      </div>
                    </div>
                  </div>

                  {/* Activity List Div */}
                  <div className="md:col-span-5 rounded-lg border border-[#e9e5dc] bg-white p-3.5">
                    <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#8d9490]">
                      Today
                    </div>
                    <div className="mt-0.5 text-xs font-bold text-[#0b1f33]">Team activity</div>

                    <div className="mt-2 divide-y divide-[#f0ede7]">
                      {ACTIVITY_ROWS.map((row) => (
                        <div key={row.title} className="flex items-center gap-2.5 py-2">
                          <div
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold text-[#0b1f33] ${row.avatarBg}`}
                          >
                            {row.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[10px] font-bold text-[#0b1f33]">
                              {row.title}
                            </div>
                            <div className="truncate text-[9px] text-[#7c827f]">{row.meta}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Confirmation Div */}
          <div className="relative z-30 mt-3 sm:-mt-5 sm:ml-4 inline-flex items-center gap-3 rounded-xl border border-[#0b1f33]/12 bg-[#fffefa] px-3.5 py-2.5 shadow-md sm:-rotate-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#fff0cc] text-xs text-[#9c6912]">
              ✦
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#0b1f33]">Sunday is ready.</div>
              <div className="text-[10px] text-[#747c78]">All 12 teams have checked in.</div>
            </div>
            <Check className="ml-2 h-4 w-4 text-[#5e8255]" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
};
