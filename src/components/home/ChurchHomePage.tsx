// src/components/home/ChurchHomePage.tsx
// Public multi-tenant church Home / Landing screen uniting Header, Hero, NextServiceCard,
// QuickActions, MissionStatement, MinistryMosaic, EventsAndNews, ServiceTimes, VisitCard,
// Footer, BottomTabBar (<760px), and GiveDialog.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, PlayCircle, X } from 'lucide-react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { DEMO_CHURCH_HOME } from '../../data/demoChurchHome';
import {
  buildThemeCssVariables,
  loadPublicChurchHome,
  resolveRequestedChurchSlug,
} from '../../services/churchHomeService';
import type { Church, NavSectionKey } from '../../types/churchHome';
import { BottomTabBar, type MobileTabKey } from './BottomTabBar';
import { EventsAndNews } from './EventsAndNews';
import { Footer } from './Footer';
import { GiveDialog } from './GiveDialog';
import { Header } from './Header';
import { Hero } from './Hero';
import { MinistryMosaic } from './MinistryMosaic';
import { MissionStatement } from './MissionStatement';
import { ServiceTimes } from './ServiceTimes';
import { VisitCard } from './VisitCard';

export const ChurchHomePage: React.FC = () => {
  const {
    theme: appTheme,
    toggleTheme,
    currentUser,
    systemSettings,
    checkInPerson,
    setViewMode,
    showToast,
  } = useEkklesphere();

  const [church, setChurch] = useState<Church>(DEMO_CHURCH_HOME);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isGiveOpen, setIsGiveOpen] = useState<boolean>(false);
  const [isWatchOpen, setIsWatchOpen] = useState<boolean>(false);
  const [checkInNotice, setCheckInNotice] = useState<{
    title: string;
    message: string;
    canSignIn: boolean;
  } | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTabKey>('home');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const watchCloseRef = useRef<HTMLButtonElement | null>(null);
  const checkInCloseRef = useRef<HTMLButtonElement | null>(null);

  const isDark = appTheme === 'dark';

  useEffect(() => {
    let active = true;
    const slug = resolveRequestedChurchSlug();
    const hasExplicitSlugParam =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('church');

    loadPublicChurchHome(slug).then(({ church: loaded, source }) => {
      if (!active) return;
      if (source === 'demo' && !hasExplicitSlugParam && currentUser && systemSettings?.churchName) {
        setChurch({
          ...loaded,
          id: currentUser.organization_id || loaded.id,
          name: systemSettings.churchName,
          shortName: systemSettings.churchName,
          address: systemSettings.campusAddress || loaded.address,
          city: systemSettings.campusName || loaded.city,
        });
      } else {
        setChurch(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, [currentUser, systemSettings?.churchName, systemSettings?.campusAddress, systemSettings?.campusName]);

  // Manage Escape key & focus restoration for Watch & Check-in placeholder dialogs
  useEffect(() => {
    if (!isWatchOpen) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    watchCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWatchOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, [isWatchOpen]);

  useEffect(() => {
    if (!checkInNotice) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    checkInCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCheckInNotice(null);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, [checkInNotice]);

  const cssVars = useMemo(
    () => buildThemeCssVariables(church.theme, isDark),
    [church.theme, isDark]
  );

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleFocusSearch = () => {
    scrollToElement('home-top');
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 150);
  };

  const handleSelectNavSection = (section: NavSectionKey) => {
    const sectionMap: Record<NavSectionKey, string> = {
      belong: 'belong-grow',
      mission: 'mission-serve',
      prayer: 'prayer-care',
      worship: 'worship-music',
      giving: 'giving',
      resources: 'resources',
    };
    scrollToElement(sectionMap[section]);
  };

  const handleCheckIn = () => {
    if (currentUser) {
      checkInPerson(
        currentUser.id,
        'geofence',
        0.96,
        `Public Home check-in (${church.shortName || church.name})`
      );
      setCheckInNotice({
        title: 'Attendance recorded',
        message: `Thank you, ${currentUser.name}. Your check-in has been submitted to ${
          church.shortName || church.name
        }.`,
        canSignIn: false,
      });
      return;
    }

    // Clear placeholder handler when unauthenticated
    setCheckInNotice({
      title: 'Campus check-in',
      message:
        'Live attendance check-in uses your verified member profile and sanctuary location. Sign in to record your attendance for today’s gathering, or check in at the welcome desk on arrival.',
      canSignIn: true,
    });
    showToast('Sign in to complete live campus check-in');
  };

  const handleMobileTabSelect = (tab: MobileTabKey) => {
    setMobileTab(tab);
    if (tab === 'home') {
      scrollToElement('home-top');
    } else if (tab === 'watch') {
      setIsWatchOpen(true);
    } else if (tab === 'give') {
      setIsGiveOpen(true);
    } else if (tab === 'events') {
      scrollToElement('events-and-news');
    } else if (tab === 'visit') {
      scrollToElement('visit-us');
    }
  };

  const handleOpenAuthPortal = () => {
    setCheckInNotice(null);
    setViewMode('app');
  };

  return (
    <div
      className="church-home-root min-h-screen w-full transition-colors duration-200"
      style={{
        ...(cssVars as React.CSSProperties),
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
        style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-ink)' }}
      >
        Skip to main content
      </a>

      <Header
        church={church}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onFocusSearch={handleFocusSearch}
        onSelectSection={handleSelectNavSection}
        onOpenGive={() => setIsGiveOpen(true)}
        isSignedInMember={Boolean(currentUser)}
        onOpenPortal={handleOpenAuthPortal}
      />

      <main id="main-content">
        <Hero
          church={church}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchInputRef={searchInputRef}
          onWatch={() => setIsWatchOpen(true)}
          onGive={() => setIsGiveOpen(true)}
          onCheckIn={handleCheckIn}
          onEvents={() => scrollToElement('events-and-news')}
        />

        {searchQuery.trim() && (
          <div
            role="status"
            aria-live="polite"
            className="mx-auto mt-6 flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
          >
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Showing groups, events, news, and service times matching{' '}
              <strong style={{ color: 'var(--text)' }}>“{searchQuery.trim()}”</strong>
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="rounded-lg border px-3 py-1 text-xs font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              Clear filter
            </button>
          </div>
        )}

        <MissionStatement church={church} />
        <MinistryMosaic ministries={church.ministries} searchQuery={searchQuery} />
        <EventsAndNews
          events={church.events}
          newsPosts={church.newsPosts}
          searchQuery={searchQuery}
        />
        <ServiceTimes
          serviceTimes={church.serviceTimes}
          timezone={church.timezone}
          searchQuery={searchQuery}
        />
        <VisitCard church={church} onCheckInClick={handleCheckIn} />
      </main>

      <Footer
        church={church}
        onOpenGive={() => setIsGiveOpen(true)}
        onMemberPortal={handleOpenAuthPortal}
      />

      {/* Mobile bottom tab bar (< 760px) */}
      <BottomTabBar activeTab={mobileTab} onSelectTab={handleMobileTabSelect} />

      {/* Mobile Money Giving Modal */}
      <GiveDialog isOpen={isGiveOpen} onClose={() => setIsGiveOpen(false)} church={church} />

      {/* Watch Sanctuary Stream Dialog */}
      {isWatchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsWatchOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="watch-dialog-title"
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <PlayCircle className="h-5 w-5" style={{ color: 'var(--brand)' }} aria-hidden="true" />
                <h2 id="watch-dialog-title" className="font-display text-xl font-semibold">
                  Watch {church.shortName || church.name}
                </h2>
              </div>
              <button
                ref={watchCloseRef}
                type="button"
                onClick={() => setIsWatchOpen(false)}
                aria-label="Close watch dialog"
                className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Our Sunday gatherings stream live in {church.timezone}. Visit our YouTube channel for
              recent sermons and worship sessions.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              {church.socialLinks.youtube && (
                <a
                  href={church.socialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{
                    backgroundColor: 'var(--brand)',
                    color: 'var(--brand-ink)',
                  }}
                >
                  Open YouTube stream
                </a>
              )}
              <button
                type="button"
                onClick={() => setIsWatchOpen(false)}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: 'var(--border)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check-in Placeholder / Status Dialog */}
      {checkInNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCheckInNotice(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-dialog-title"
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                {checkInNotice.canSignIn ? (
                  <Info className="h-5 w-5" style={{ color: 'var(--brand)' }} aria-hidden="true" />
                ) : (
                  <CheckCircle2
                    className="h-5 w-5"
                    style={{ color: 'var(--brand)' }}
                    aria-hidden="true"
                  />
                )}
                <h2 id="checkin-dialog-title" className="font-display text-xl font-semibold">
                  {checkInNotice.title}
                </h2>
              </div>
              <button
                ref={checkInCloseRef}
                type="button"
                onClick={() => setCheckInNotice(null)}
                aria-label="Close check-in dialog"
                className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {checkInNotice.message}
            </p>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              {checkInNotice.canSignIn && (
                <button
                  type="button"
                  onClick={handleOpenAuthPortal}
                  className="rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{
                    backgroundColor: 'var(--brand)',
                    color: 'var(--brand-ink)',
                  }}
                >
                  Continue to member sign-in
                </button>
              )}
              <button
                type="button"
                onClick={() => setCheckInNotice(null)}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: 'var(--border)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChurchHomePage;
