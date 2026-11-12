import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../server.ts';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth.ts';
import {
  buildHappyBirthdayWallPost,
  formatBirthdayMonthDay,
  getUpcomingBirthdays,
  isBirthdayToday,
} from '../src/components/member/MemberBirthdaysModule';
import type { Person } from '../src/types/ekklesphere';

function makeMember(id: string, firstName: string, dateOfBirth?: string): Person {
  return {
    id,
    tenantId: TEST_ANCHOR_ORGANIZATION_ID,
    firstName,
    lastName: 'Tester',
    phoneE164: '+233240000001',
    groupName: 'Grace Cell',
    status: 'member',
    autoCheckinOptedIn: true,
    avatarInitials: firstName.slice(0, 2).toUpperCase(),
    joinedOn: '2025-01-01',
    consecutiveAbsences: 0,
    dateOfBirth,
  };
}

describe('MemberApp Birthdays Module & Church Wall', () => {
  it('matches member birthday accurately on month and day across birth years', () => {
    const ref = new Date(2026, 10, 12, 9, 0, 0); // Nov 12, 2026
    expect(isBirthdayToday('1994-11-12', ref)).toBe(true);
    expect(isBirthdayToday('2001-11-12T00:00:00Z', ref)).toBe(true);
    expect(isBirthdayToday('1994-11-13', ref)).toBe(false);
    expect(isBirthdayToday(undefined, ref)).toBe(false);
    expect(isBirthdayToday('invalid-date', ref)).toBe(false);
    expect(formatBirthdayMonthDay('1994-11-12')).toBe('12 Nov');
  });

  it('sorts today and upcoming congregation birthdays within the configured window', () => {
    const ref = new Date(2026, 10, 12, 9, 0, 0); // Nov 12
    const roster = [
      makeMember('m1', 'Kofi', '1992-11-18'), // +6 days
      makeMember('m2', 'Ama', '1995-11-12'),  // Today
      makeMember('m3', 'Yaw', '1990-12-25'),  // Outside 14-day window
      makeMember('m4', 'Abena'),              // No DOB
    ];

    const upcoming = getUpcomingBirthdays(roster, ref, 14);
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].member.id).toBe('m2');
    expect(upcoming[0].isToday).toBe(true);
    expect(upcoming[0].daysUntil).toBe(0);
    expect(upcoming[1].member.id).toBe('m1');
    expect(upcoming[1].isToday).toBe(false);
    expect(upcoming[1].daysUntil).toBe(6);
  });

  it('generates a default Happy Birthday post for the church wall', () => {
    const text = buildHappyBirthdayWallPost('Ama', 'Ridge Sanctuary');
    expect(text).toContain('Happy Birthday');
    expect(text).toContain('Ama');
    expect(text).toContain('Ridge Sanctuary');
  });

  it('persists Happy Birthday posts and celebrate/amen reactions on /api/church-wall per organization', async () => {
    const memberToken = signToken({
      id: 'mem-bday-1',
      email: 'ama.bday@example.org',
      name: 'Ama Mensah',
      role: 'member',
      organization_id: TEST_ANCHOR_ORGANIZATION_ID,
      tenant_id: TEST_ANCHOR_ORGANIZATION_ID,
    });

    const createRes = await request(app)
      .post('/api/church-wall')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        category: 'birthday',
        message: 'Happy Birthday to me! Grateful for another year in Ridge Sanctuary.',
        targetMemberId: 'mem-bday-1',
        targetMemberName: 'Ama Mensah',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.post?.message).toContain('Happy Birthday');
    const createdId = createRes.body.post?.id;

    const listRes = await request(app)
      .get('/api/church-wall')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.posts.some((p: { id: string }) => p.id === createdId)).toBe(true);

    const amenRes = await request(app)
      .post(`/api/church-wall/${createdId}/amen`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(amenRes.status).toBe(200);
    expect(amenRes.body.post?.amens).toContain('mem-bday-1');
  });
});
