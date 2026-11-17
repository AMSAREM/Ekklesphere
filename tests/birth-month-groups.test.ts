import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import {
  ALL_BIRTH_MONTH_GROUPS,
  deriveMonthOfBirth,
  formatBirthMonthGroupName,
  resolveMemberBirthFields,
} from '../src/utils/birthMonth';
import { validateMemberImportBatch } from '../src/shared/memberImportValidation';

describe('Birth Month & Automatic Birth Month Group Assignment', () => {
  const adminToken = signToken({
    id: 'user-bm-admin',
    email: 'bm-admin@ekklesphere.church',
    role: 'admin',
    name: 'Birth Month Admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const memberToken = signToken({
    id: 'user-bm-member',
    email: 'ama.mensah@ekklesphere.church',
    role: 'member',
    name: 'Ama Mensah',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('derives month of birth strictly from date of birth and formats canonical groups', () => {
    expect(deriveMonthOfBirth('1994-05-19')).toBe('May');
    expect(deriveMonthOfBirth('19/05/1994')).toBe('May');
    expect(deriveMonthOfBirth('1994-05-19', 'December')).toBe('May');
    expect(deriveMonthOfBirth('', 'aug')).toBe('August');

    expect(formatBirthMonthGroupName('May')).toBe('May Birthday Group');
    expect(formatBirthMonthGroupName('november')).toBe('November Birthday Group');
    expect(ALL_BIRTH_MONTH_GROUPS).toHaveLength(12);

    // Date of birth overrides any conflicting month/group
    expect(
      resolveMemberBirthFields({
        dateOfBirth: '1991-09-12',
        monthOfBirth: 'March',
        birthMonthGroup: 'March Birthday Group',
      })
    ).toEqual({
      monthOfBirth: 'September',
      birthMonthGroup: 'September Birthday Group',
    });

    // Month-only fallback still assigns canonical birth month group
    expect(
      resolveMemberBirthFields({
        dateOfBirth: '',
        monthOfBirth: 'July',
      })
    ).toEqual({
      monthOfBirth: 'July',
      birthMonthGroup: 'July Birthday Group',
    });
  });

  it('assigns synced month of birth & birthMonthGroup on CSV import and warns on DOB conflict', () => {
    const { rows, summary } = validateMemberImportBatch(
      [
        {
          'FIRST NAME': 'Kofi',
          'LAST NAME': 'Owusu',
          'PHONE NUMBER': '0244555111',
          'DATE OF BIRTH': '1992-03-14',
          'MONTH OF BIRTH': 'October',
        },
        {
          'FIRST NAME': 'Abena',
          'LAST NAME': 'Asare',
          'PHONE NUMBER': '0244555222',
          'MONTH OF BIRTH': 'dec',
        },
      ],
      [],
      'skip'
    );

    expect(summary.valid).toBe(2);
    expect(rows[0].data.monthOfBirth).toBe('March');
    expect(rows[0].data.birthMonthGroup).toBe('March Birthday Group');
    expect(rows[0].warnings.some((w) => w.includes('synced to March'))).toBe(true);

    expect(rows[1].data.monthOfBirth).toBe('December');
    expect(rows[1].data.birthMonthGroup).toBe('December Birthday Group');
  });

  it('persists synced monthOfBirth & automatic birthMonthGroup via admin & member APIs', async () => {
    // 1. Admin creates member with DOB; even if stale month sent, DOB wins
    const createRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Ama',
        lastName: 'Mensah',
        email: 'ama.mensah@ekklesphere.church',
        phoneE164: '+233244333444',
        dateOfBirth: '1995-04-08',
        monthOfBirth: 'January',
        homeCellGroup: 'Cantonments Cell',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.monthOfBirth).toBe('April');
    expect(createRes.body.birthMonthGroup).toBe('April Birthday Group');

    // 2. Admin edits DOB and verifies automatic birth month group re-syncs
    const updateRes = await request(app)
      .put(`/api/members/${createRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dateOfBirth: '1995-11-21',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.monthOfBirth).toBe('November');
    expect(updateRes.body.birthMonthGroup).toBe('November Birthday Group');

    // 3. Member updates own DOB via self-service profile endpoint and gets synced group back
    const selfRes = await request(app)
      .patch('/api/members/me/profile')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        dateOfBirth: '1995-07-02',
      });

    expect(selfRes.status).toBe(200);
    expect(selfRes.body.profile?.monthOfBirth ?? selfRes.body.monthOfBirth).toBe('July');
    expect(selfRes.body.profile?.birthMonthGroup ?? selfRes.body.birthMonthGroup).toBe(
      'July Birthday Group'
    );
  });
});
