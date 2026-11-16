import React, { useCallback, useEffect, useState } from 'react';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LandingTrustStrip } from './LandingTrustStrip';
import { LandingPlatformSection } from './LandingPlatformSection';
import { LandingMomentsSlider } from './LandingMomentsSlider';
import { LandingWorkflowSection } from './LandingWorkflowSection';
import { LandingImpactSection } from './LandingImpactSection';
import { LandingStorySection } from './LandingStorySection';
import { LandingDemoBanner } from './LandingDemoBanner';
import { LandingFooter } from './LandingFooter';
import { LandingDemoModal, LandingQuickPanel } from './LandingModals';
import { isSafeAppRouteTarget } from '../../utils/authRoute';
import type { ConsolePlan, LandingPageConfig, PublicLandingOverview } from '../../types/ekklesphere';

interface PublicLandingPageProps {
  onNavigate?: (path: string) => void;
}

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({ onNavigate }) => {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'demo' | 'contact'>('demo');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [landingConfig, setLandingConfig] = useState<LandingPageConfig | null>(null);
  const [plans, setPlans] = useState<ConsolePlan[]>([]);
  const [liveStats, setLiveStats] = useState<PublicLandingOverview['liveStats'] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadOverview = async () => {
      try {
        const res = await fetch('/api/public/landing-overview');
        if (!res.ok) return;
        const data = (await res.json()) as Partial<PublicLandingOverview>;
        if (cancelled) return;
        if (data.landingConfig) setLandingConfig(data.landingConfig);
        if (Array.isArray(data.plans)) setPlans(data.plans);
        if (data.liveStats) setLiveStats(data.liveStats);
      } catch {
        // Fallback gracefully to static copy when offline
      }
    };
    loadOverview();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      if (!isSafeAppRouteTarget(path)) return;
      if (onNavigate) {
        onNavigate(path);
      } else if (typeof window !== 'undefined') {
        window.location.assign(path);
      }
    },
    [onNavigate]
  );

  const openModal = useCallback((mode: 'demo' | 'contact') => {
    setModalMode(mode);
    setIsDemoOpen(true);
  }, []);

  return (
    <div
      data-landing-root
      className="min-h-screen w-full overflow-x-clip bg-[#f7f3ec] text-[#0b1f33]"
    >
      <LandingHeader
        onNavigate={handleNavigate}
        onOpenDemo={() => openModal('demo')}
      />

      <main aria-label="Ekklesphere public landing page">
        <LandingHero
          onOpenDemo={() => openModal('demo')}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
          landingConfig={landingConfig}
          liveStats={liveStats}
        />
        <LandingTrustStrip />
        <LandingPlatformSection />
        <LandingMomentsSlider />
        <LandingWorkflowSection onOpenDemo={() => openModal('demo')} />
        <LandingImpactSection landingConfig={landingConfig} liveStats={liveStats} />
        <LandingStorySection />
        <LandingDemoBanner
          onNavigate={handleNavigate}
          onOpenDemo={() => openModal('demo')}
          landingConfig={landingConfig}
          plans={plans}
        />
      </main>

      <LandingFooter
        onNavigate={handleNavigate}
        onOpenContact={() => openModal('contact')}
        contactSalesEmail={landingConfig?.contactSalesEmail}
      />

      <LandingDemoModal
        isOpen={isDemoOpen}
        mode={modalMode}
        onClose={() => setIsDemoOpen(false)}
        onNavigate={handleNavigate}
        contactSalesEmail={landingConfig?.contactSalesEmail}
      />

      <LandingQuickPanel
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  );
};

export default PublicLandingPage;
