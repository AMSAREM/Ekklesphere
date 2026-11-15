import React from 'react';

export const PublicLandingPage: React.FC = () => (
  <main className="public-landing-frame" aria-label="Ekklesphere public landing page">
    <iframe
      src="/landing-page/index.html"
      title="Ekklesphere church management platform"
      loading="eager"
    />
  </main>
);

export default PublicLandingPage;
