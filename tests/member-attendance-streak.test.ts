// tests/member-attendance-streak.test.ts
import { describe, it, expect } from 'vitest';
import { ATTENDANCE_BADGES } from '../src/components/member/MemberAttendanceStreakCard';

describe('Member Attendance Streak & Digital Badges', () => {
  it('defines progressive streak thresholds for all 5 digital badges', () => {
    expect(ATTENDANCE_BADGES.length).toBe(5);

    const thresholds = ATTENDANCE_BADGES.map((b) => b.streakRequired);
    expect(thresholds).toEqual([1, 3, 5, 8, 12]);

    // Check each badge has valid scripture encouragement
    for (const badge of ATTENDANCE_BADGES) {
      expect(badge.scripture).toBeDefined();
      expect(badge.scripture.length).toBeGreaterThan(10);
      expect(badge.scriptureRef).toBeDefined();
      expect(badge.title).toBeDefined();
      expect(badge.description).toBeDefined();
    }
  });

  it('correctly identifies unlocked badges based on member streak count', () => {
    const streak = 4;
    const unlocked = ATTENDANCE_BADGES.filter((b) => streak >= b.streakRequired);
    const locked = ATTENDANCE_BADGES.filter((b) => streak < b.streakRequired);

    // At 4 weeks: Pilgrim of Faith (1) and Steadfast Believer (3) should be unlocked
    expect(unlocked.map((b) => b.id)).toEqual(['first_step', 'bronze_fellowship']);

    // Next badge should be Sanctuary Pillar (5)
    expect(locked[0].id).toBe('silver_pillar');
    expect(locked[0].streakRequired).toBe(5);
  });

  it('correctly unlocks all badges at 12+ consecutive weeks', () => {
    const streak = 14;
    const unlocked = ATTENDANCE_BADGES.filter((b) => streak >= b.streakRequired);
    expect(unlocked.length).toBe(5);
    expect(unlocked[unlocked.length - 1].id).toBe('diamond_ambassador');
  });

  it('calculates progress percentage towards next badge accurately', () => {
    const currentStreak = 4;
    const unlockedBadges = ATTENDANCE_BADGES.filter((b) => currentStreak >= b.streakRequired);
    const nextBadge = ATTENDANCE_BADGES.find((b) => currentStreak < b.streakRequired)!;

    const prevThreshold = unlockedBadges[unlockedBadges.length - 1].streakRequired; // 3
    const span = nextBadge.streakRequired - prevThreshold; // 5 - 3 = 2
    const currentInSpan = currentStreak - prevThreshold; // 4 - 3 = 1
    const progressPct = Math.round((currentInSpan / span) * 100); // 50%

    expect(progressPct).toBe(50);
  });
});
