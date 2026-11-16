import React, { useCallback, useState } from 'react';
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

interface PublicLandingPageProps {
  onNavigate?: (path: string) => void;
}

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({ onNavigate }) => {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

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

  return (
    <div
      data-landing-root
      className="min-h-screen w-full overflow-x-clip bg-[#f7f3ec] text-[#0b1f33]"
    >
      <LandingHeader
        onNavigate={handleNavigate}
        onOpenDemo={() => setIsDemoOpen(true)}
      />

      <main aria-label="Ekklesphere public landing page">
        <LandingHero
          onOpenDemo={() => setIsDemoOpen(true)}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        />
        <LandingTrustStrip />
        <LandingPlatformSection />
        <LandingMomentsSlider />
        <LandingWorkflowSection onOpenDemo={() => setIsDemoOpen(true)} />
        <LandingImpactSection />
        <LandingStorySection />
        <LandingDemoBanner
          onNavigate={handleNavigate}
          onOpenDemo={() => setIsDemoOpen(true)}
        />
      </main>

      <LandingFooter onNavigate={handleNavigate} />

      <LandingDemoModal
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        onNavigate={handleNavigate}
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
