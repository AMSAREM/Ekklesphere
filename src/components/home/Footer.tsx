// src/components/home/Footer.tsx
// Deep surface church footer. Respects mobile BottomTabBar clearance and omits any public "Staff only" button.

import React from 'react';
import type { Church } from '../../types/churchHome';

export interface FooterProps {
  church: Church;
  onOpenGive: () => void;
  onMemberPortal: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  church,
  onOpenGive,
  onMemberPortal,
}) => {
  const year = new Date().getFullYear();

  return (
    <footer
      className="border-t border-white/10 pb-24 min-[760px]:pb-12"
      style={{
        backgroundColor: 'var(--deep)',
        color: 'var(--deep-ink)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-display text-xl font-semibold text-white">{church.name}</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">{church.tagline}</p>
            <p className="mt-4 text-sm text-white/75">
              {church.address}, {church.city}
            </p>
          </div>

          <div className="lg:col-span-3">
            <h3 className="text-sm font-semibold text-white">Connect</h3>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <a href="#belong-grow" className="hover:text-white hover:underline">
                  Belong & grow
                </a>
              </li>
              <li>
                <a href="#mission-serve" className="hover:text-white hover:underline">
                  Mission & serve
                </a>
              </li>
              <li>
                <a href="#service-times" className="hover:text-white hover:underline">
                  Service times
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenGive}
                  className="hover:text-white hover:underline"
                >
                  Giving
                </button>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-4">
            <h3 className="text-sm font-semibold text-white">Congregation</h3>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <a href="#events-and-news" className="hover:text-white hover:underline">
                  Events & news
                </a>
              </li>
              <li>
                <a href="#visit-us" className="hover:text-white hover:underline">
                  Plan a visit
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onMemberPortal}
                  className="text-left hover:text-white hover:underline"
                >
                  Member account
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/65 sm:flex-row sm:items-center">
          <p>
            © {year} {church.name}. All rights reserved.
          </p>
          {[church.phone, church.email].filter(Boolean).length > 0 && (
            <p>
              {[church.phone, church.email].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
};
