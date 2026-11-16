import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  isPublicLandingLocation,
  isSafeAppRouteTarget,
  resolveAuthTabFromLocation,
} from '../src/utils/authRoute';

describe('Landing to App Auth Route Resolution', () => {
  it('maps Sign In URLs and params to the login tab', () => {
    expect(resolveAuthTabFromLocation('/app', '')).toBe('login');
    expect(resolveAuthTabFromLocation('/app', '?auth=login')).toBe('login');
    expect(resolveAuthTabFromLocation('/login', '')).toBe('login');
    expect(resolveAuthTabFromLocation('/signin', '')).toBe('login');
  });

  it('maps Sign Up URLs and params to the register tab', () => {
    expect(resolveAuthTabFromLocation('/app', '?auth=signup')).toBe('register');
    expect(resolveAuthTabFromLocation('/app', '?auth=register')).toBe('register');
    expect(resolveAuthTabFromLocation('/signup', '')).toBe('register');
    expect(resolveAuthTabFromLocation('/register', '')).toBe('register');
  });

  it('maps Church / Organisation trial params to the org_signup tab', () => {
    expect(resolveAuthTabFromLocation('/app', '?auth=org_signup')).toBe('org_signup');
    expect(resolveAuthTabFromLocation('/app', '?auth=trial')).toBe('org_signup');
    expect(resolveAuthTabFromLocation('/app', '?auth=org')).toBe('org_signup');
  });

  it('distinguishes the public landing root from app/auth routes', () => {
    expect(isPublicLandingLocation('/', '')).toBe(true);
    expect(isPublicLandingLocation('/', '?view=app')).toBe(false);
    expect(isPublicLandingLocation('/', '?auth=login')).toBe(false);
    expect(isPublicLandingLocation('/', '?church=grace')).toBe(false);
    expect(isPublicLandingLocation('/app', '?auth=signup')).toBe(false);
    expect(isPublicLandingLocation('/login', '')).toBe(false);
    expect(isPublicLandingLocation('/signup', '')).toBe(false);
  });

  it('validates safe same-origin navigation paths from the landing iframe', () => {
    expect(isSafeAppRouteTarget('/app?auth=login')).toBe(true);
    expect(isSafeAppRouteTarget('/app?auth=signup')).toBe(true);
    expect(isSafeAppRouteTarget('/app?auth=org_signup')).toBe(true);
    expect(isSafeAppRouteTarget('/login')).toBe(true);
    expect(isSafeAppRouteTarget('/signup')).toBe(true);
    expect(isSafeAppRouteTarget('/')).toBe(true);

    expect(isSafeAppRouteTarget('https://evil.example/phish')).toBe(false);
    expect(isSafeAppRouteTarget('//evil.example')).toBe(false);
    expect(isSafeAppRouteTarget('javascript:alert(1)')).toBe(false);
  });

  it('wires Sign in and Sign up links in public/landing-page/index.html to /app auth routes', () => {
    const html = fs.readFileSync(
      path.resolve(process.cwd(), 'public/landing-page/index.html'),
      'utf8'
    );
    expect(html).toContain('href="/app?auth=login"');
    expect(html).toContain('href="/app?auth=signup"');
    expect(html).toContain('href="/app?auth=org_signup"');
    expect(html).toContain('target="_parent"');
    expect(html).not.toContain('<a href="#top">Sign in</a>');
  });

  it('renders modular React landing components and divs without wrapping in an iframe', () => {
    const landingSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/landing/PublicLandingPage.tsx'),
      'utf8'
    );
    expect(landingSource).not.toContain('<iframe');
    expect(landingSource).toContain('LandingHeader');
    expect(landingSource).toContain('LandingHero');
    expect(landingSource).toContain('LandingTrustStrip');
    expect(landingSource).toContain('LandingPlatformSection');
    expect(landingSource).toContain('LandingMomentsSlider');
    expect(landingSource).toContain('LandingWorkflowSection');
    expect(landingSource).toContain('LandingImpactSection');
    expect(landingSource).toContain('LandingStorySection');
    expect(landingSource).toContain('LandingDemoBanner');
    expect(landingSource).toContain('LandingFooter');
  });
});

