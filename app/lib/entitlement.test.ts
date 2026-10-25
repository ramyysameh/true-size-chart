import { describe, expect, it } from 'vitest';
import { CACHE_MS, GRACE_MS, REFRESH_MS, cachedActive, planPageUrl, planSummary, withinGrace } from './entitlement';

const NOW = new Date('2026-10-24T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 3_600_000;

describe('planPageUrl', () => {
  it('builds the hosted plan page URL from the store handle', () => {
    expect(planPageUrl('cool-shop.myshopify.com', 'true-size-chart')).toBe(
      'https://admin.shopify.com/store/cool-shop/charges/true-size-chart/pricing_plans',
    );
  });
});

describe('constants', () => {
  it('match the brief', () => {
    expect(CACHE_MS).toBe(5 * MIN);
    expect(GRACE_MS).toBe(24 * HOUR);
    expect(REFRESH_MS).toBe(6 * HOUR);
  });
});

describe('cachedActive', () => {
  it('is true for an entitled shop checked 4 min ago', () => {
    expect(cachedActive({ entitled: true, entitlementCheckedAt: ago(4 * MIN) }, NOW)).toBe(true);
  });
  it('is false at 6 min', () => {
    expect(cachedActive({ entitled: true, entitlementCheckedAt: ago(6 * MIN) }, NOW)).toBe(false);
  });
  it('is false for a non-entitled shop or one never checked', () => {
    expect(cachedActive({ entitled: false, entitlementCheckedAt: ago(1 * MIN) }, NOW)).toBe(false);
    expect(cachedActive({ entitled: true, entitlementCheckedAt: null }, NOW)).toBe(false);
  });
});

describe('withinGrace', () => {
  it('is true at 23 h', () => {
    expect(withinGrace({ entitled: true, entitlementCheckedAt: ago(23 * HOUR) }, NOW)).toBe(true);
  });
  it('is false at 25 h', () => {
    expect(withinGrace({ entitled: true, entitlementCheckedAt: ago(25 * HOUR) }, NOW)).toBe(false);
  });
  it('is false for a non-entitled shop or one never checked', () => {
    expect(withinGrace({ entitled: false, entitlementCheckedAt: ago(1 * HOUR) }, NOW)).toBe(false);
    expect(withinGrace({ entitled: true, entitlementCheckedAt: null }, NOW)).toBe(false);
  });
});

describe('planSummary', () => {
  it('shows the trial end while the trial runs', () => {
    expect(
      planSummary({ planHandle: 'pro', billingPeriod: 'EVERY_30_DAYS', trialEndsAt: new Date('2026-11-07T00:00:00Z') }, NOW),
    ).toBe('Pro · free trial until 7 Nov 2026');
  });
  it('falls through to the period once the trial has ended', () => {
    expect(
      planSummary({ planHandle: 'pro', billingPeriod: 'ANNUAL', trialEndsAt: new Date('2026-10-01T00:00:00Z') }, NOW),
    ).toBe('Pro · yearly');
  });
  it('says monthly for EVERY_30_DAYS with no trial', () => {
    expect(planSummary({ planHandle: 'pro', billingPeriod: 'EVERY_30_DAYS', trialEndsAt: null }, NOW)).toBe('Pro · monthly');
  });
  it('is just Pro for an unknown period', () => {
    expect(planSummary({ planHandle: 'pro', billingPeriod: 'WEIRD', trialEndsAt: null }, NOW)).toBe('Pro');
    expect(planSummary({ planHandle: null, billingPeriod: null, trialEndsAt: null }, NOW)).toBe('Pro');
  });
});
