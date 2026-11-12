import { describe, expect, it } from 'vitest';
import { DEMO_CHURCH_HOME } from '../src/data/demoChurchHome';
import {
  buildThemeCssVariables,
  computeNextServiceCountdown,
  startGiving,
  validateMobileMoneyPhone,
} from '../src/services/churchHomeService';

describe('Public Church Home Service', () => {
  it('computes the nearest upcoming service countdown accurately', () => {
    // Friday 2026-11-13 17:00:00 -> Evening watch & intercession is Friday at 18:00
    const fridayAfternoon = new Date(2026, 10, 13, 17, 0, 0);
    const result = computeNextServiceCountdown(DEMO_CHURCH_HOME.serviceTimes, fridayAfternoon);

    expect(result.nextService?.id).toBe('svc-fri-prayer');
    expect(result.isLiveNow).toBe(false);
    expect(result.days).toBe(0);
    expect(result.hours).toBe(1);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(0);
  });

  it('detects when a worship service is currently live in progress', () => {
    // Sunday 2026-11-15 10:30:00 -> Family & youth gathering (10:00, 120 mins) is live
    const sundayMidService = new Date(2026, 10, 15, 10, 30, 0);
    const result = computeNextServiceCountdown(DEMO_CHURCH_HOME.serviceTimes, sundayMidService);

    expect(result.nextService?.id).toBe('svc-sun-family');
    expect(result.isLiveNow).toBe(true);
    expect(result.days).toBe(0);
    expect(result.hours).toBe(0);
  });

  it('validates Ghana Mobile Money phone numbers for MTN, Telecel, and AT', () => {
    expect(validateMobileMoneyPhone('024 555 1234')).toEqual({
      valid: true,
      normalized: '+233245551234',
    });
    expect(validateMobileMoneyPhone('+233 50 111 2233')).toEqual({
      valid: true,
      normalized: '+233501112233',
    });
    expect(validateMobileMoneyPhone('0279876543')).toEqual({
      valid: true,
      normalized: '+233279876543',
    });

    const invalid = validateMobileMoneyPhone('12345');
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toBeTruthy();
  });

  it('keeps startGiving() as a clean stub without processing live payments', async () => {
    const res = await startGiving({
      churchId: DEMO_CHURCH_HOME.id,
      churchSlug: DEMO_CHURCH_HOME.slug,
      amountGhs: 100,
      fund: 'Tithe',
      network: 'mtn_momo',
      phoneNumber: '0241234567',
    });

    expect(res.status).toBe('stub_ready');
    expect(res.reference.startsWith('GIV-STUB-')).toBe(true);
    expect(res.providerLabel).toBe('MTN MoMo');
  });

  it('builds runtime CSS theme variables for both light and dark mode', () => {
    const lightVars = buildThemeCssVariables(DEMO_CHURCH_HOME.theme, false);
    const darkVars = buildThemeCssVariables(DEMO_CHURCH_HOME.theme, true);

    expect(lightVars['--brand']).toBe(DEMO_CHURCH_HOME.theme.brand);
    expect(lightVars['--deep']).toBe(DEMO_CHURCH_HOME.theme.deep);
    expect(lightVars['--bg']).toBe(DEMO_CHURCH_HOME.theme.bg);
    expect(lightVars['--text']).toBe(DEMO_CHURCH_HOME.theme.text);

    expect(darkVars['--bg']).not.toBe(lightVars['--bg']);
    expect(darkVars['--text']).not.toBe(lightVars['--text']);
  });
});
