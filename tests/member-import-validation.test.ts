// tests/member-import-validation.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import {
  validateMemberImportBatch,
  validateAndFormatPhone,
  validateStrictIsoDate,
  mapHeaderToMemberField,
} from '../src/shared/memberImportValidation';

describe('Member Import Validation Engine (Shared Client/Server)', () => {
  it('maps canonical 28 headers + email aliases accurately', () => {
    expect(mapHeaderToMemberField('FIRST NAME')).toBe('firstName');
    expect(mapHeaderToMemberField('LASTNAME')).toBe('lastName');
    expect(mapHeaderToMemberField('PHONE NUMBER')).toBe('phoneE164');
    expect(mapHeaderToMemberField('EMAIL ADDRESS')).toBe('email');
    expect(mapHeaderToMemberField('RESIDENTIAL/DIGITAL ADDRESS')).toBe('residentialDigitalAddress');
    expect(mapHeaderToMemberField('date of baptism')).toBe('dateOfBaptism');
  });

  it('validates and normalizes Ghanaian and E.164 phone numbers', () => {
    expect(validateAndFormatPhone('024 123 4567')).toEqual({
      valid: true,
      formatted: '+233241234567',
    });
    expect(validateAndFormatPhone('241234567')).toEqual({
      valid: true,
      formatted: '+233241234567',
    });
    expect(validateAndFormatPhone('+447911123456')).toEqual({
      valid: true,
      formatted: '+447911123456',
    });
    expect(validateAndFormatPhone('12345')).toEqual({
      valid: false,
      formatted: '12345',
    });
  });

  it('rejects impossible calendar dates such as Feb 30 while parsing DD/MM/YYYY and YYYY-MM-DD', () => {
    expect(validateStrictIsoDate('2025-02-30')).toBeNull();
    expect(validateStrictIsoDate('31/04/2024')).toBeNull();
    expect(validateStrictIsoDate('29/02/2024')).toBe('2024-02-29'); // leap year
    expect(validateStrictIsoDate('29/02/2025')).toBeNull(); // non-leap year
    expect(validateStrictIsoDate('15/08/1992')).toBe('1992-08-15');
    expect(validateStrictIsoDate('1992-08-15')).toBe('1992-08-15');
  });

  it('enforces required fields, email, gender, children integer, future DOB, and intra-file duplicates', () => {
    const existing = [
      {
        id: 'existing-1',
        memberId: 'MEM-001',
        phoneE164: '+233240001111',
        email: 'existing@church.org',
      },
    ];

    const batch = [
      // Row 1: Valid new member with local phone + DD/MM/YYYY DOB
      {
        'FIRST NAME': 'Kwame',
        LASTNAME: 'Mensah',
        'PHONE NUMBER': '0241112233',
        EMAIL: 'KWAME@Church.org',
        GENDER: 'M',
        'DATE OF BIRTH': '15/08/1992',
        'NUMBER OF CHILDREN': '2',
        'HOME CELL GROUP': 'Adenta Cell',
      },
      // Row 2: Intra-file duplicate phone of Row 1
      {
        'FIRST NAME': 'Kwame',
        LASTNAME: 'Duplicate',
        'PHONE NUMBER': '+233241112233',
      },
      // Row 3: Invalid phone, invalid email, future DOB, negative children, missing lastname
      {
        'FIRST NAME': 'Abena',
        LASTNAME: '',
        'PHONE NUMBER': '999',
        EMAIL: 'not-an-email',
        'DATE OF BIRTH': '2099-01-01',
        'NUMBER OF CHILDREN': '-1',
        GENDER: 'InvalidValue',
      },
      // Row 4: Existing member match (by phone)
      {
        'FIRST NAME': 'Kojo',
        LASTNAME: 'Appiah',
        'PHONE NUMBER': '0240001111',
      },
    ];

    const skipRes = validateMemberImportBatch(batch, existing, 'skip');
    expect(skipRes.summary).toEqual({
      total: 4,
      valid: 2,
      invalid: 2,
      duplicates: 2,
      intraFileDuplicates: 1,
      newInserts: 1,
      updates: 0,
      skipped: 1,
    });
    expect(skipRes.rows[0].data.phoneE164).toBe('+233241112233');
    expect(skipRes.rows[0].data.email).toBe('kwame@church.org');
    expect(skipRes.rows[0].data.gender).toBe('male');
    expect(skipRes.rows[0].data.dateOfBirth).toBe('1992-08-15');
    expect(skipRes.rows[0].data.monthOfBirth).toBe('August');
    expect(skipRes.rows[0].action).toBe('insert');

    expect(skipRes.rows[1].isIntraFileDuplicate).toBe(true);
    expect(skipRes.rows[1].action).toBe('error');

    expect(skipRes.rows[2].isValid).toBe(false);
    expect(skipRes.rows[2].errors.length).toBeGreaterThanOrEqual(5);

    expect(skipRes.rows[3].action).toBe('skip');
    expect(skipRes.rows[3].matchedMemberId).toBe('existing-1');

    // Update mode converts existing match into update
    const updateRes = validateMemberImportBatch(batch, existing, 'update');
    expect(updateRes.rows[3].action).toBe('update');
    expect(updateRes.summary.updates).toBe(1);
    expect(updateRes.summary.skipped).toBe(0);

    // Error mode rejects existing duplicates
    const errorRes = validateMemberImportBatch(batch, existing, 'error');
    expect(errorRes.rows[3].action).toBe('error');
    expect(errorRes.rows[3].isValid).toBe(false);
    expect(errorRes.summary.invalid).toBe(3);
  });
});

describe('Member Import Validation HTTP API (/api/members/import/*)', () => {
  const adminToken = signToken({
    id: 'user-import-admin',
    email: 'import-admin@ekklesphere.church',
    role: 'admin',
    name: 'Import Admin',
  });

  const usherToken = signToken({
    id: 'user-import-usher',
    email: 'import-usher@ekklesphere.church',
    role: 'usher',
    name: 'Door Usher',
  });

  const memberToken = signToken({
    id: 'user-import-member',
    email: 'import-member@ekklesphere.church',
    role: 'member',
    name: 'Regular Member',
  });

  it('enforces RBAC on /api/members/import/validate and /api/members/import', async () => {
    const payload = {
      members: [{ firstName: 'Grace', lastName: 'Osei', phoneE164: '+233245550001' }],
    };

    const unauth = await request(app).post('/api/members/import/validate').send(payload);
    expect(unauth.status).toBe(401);

    const memberRes = await request(app)
      .post('/api/members/import/validate')
      .set('Authorization', `Bearer ${memberToken}`)
      .send(payload);
    expect(memberRes.status).toBe(403);

    const usherRes = await request(app)
      .post('/api/members/import')
      .set('Authorization', `Bearer ${usherToken}`)
      .send(payload);
    expect(usherRes.status).toBe(403);
  });

  it('rejects empty payload or invalid duplicateMode with 400', async () => {
    const emptyRes = await request(app)
      .post('/api/members/import/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ members: [] });
    expect(emptyRes.status).toBe(400);

    const badModeRes = await request(app)
      .post('/api/members/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        members: [{ firstName: 'Grace', lastName: 'Osei', phoneE164: '+233245550002' }],
        duplicateMode: 'overwrite_all',
      });
    expect(badModeRes.status).toBe(400);
  });

  it('runs dry-run validation via POST /api/members/import/validate without mutating DB', async () => {
    const before = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    const beforeCount = Array.isArray(before.body) ? before.body.length : 0;

    const validateRes = await request(app)
      .post('/api/members/import/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        duplicateMode: 'skip',
        members: [
          {
            'FIRST NAME': 'Nana',
            LASTNAME: 'Kofi',
            'PHONE NUMBER': '0249998877',
            EMAIL: 'nana.kofi@example.org',
          },
          {
            'FIRST NAME': 'Bad',
            LASTNAME: 'DateRow',
            'PHONE NUMBER': '0249998866',
            'DATE OF BIRTH': '2025-02-30',
          },
        ],
      });

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.success).toBe(true);
    expect(validateRes.body.summary).toMatchObject({
      total: 2,
      valid: 1,
      invalid: 1,
      newInserts: 1,
    });
    expect(validateRes.body.license).toBeDefined();

    const after = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.body.length).toBe(beforeCount);
  });

  it('rejects all-invalid batch on POST /api/members/import with 422', async () => {
    const res = await request(app)
      .post('/api/members/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        members: [
          {
            firstName: 'X',
            lastName: 'Y',
            phoneE164: 'invalid-phone',
            dateOfBirth: '2025-02-30',
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('IMPORT_VALIDATION_FAILED');
    expect(res.body.details?.errors?.length).toBe(1);
  });

  it('imports valid rows, skips or updates existing duplicates, and enforces seat limit on net-new inserts only', async () => {
    // Provision an isolated test church with seat limit = 2
    const { organisation } = await platformStore.createOrganisation({
      name: 'Validation Import Chapel',
      slug: `validation-import-chapel-${Date.now()}`,
      initialPlan: 'grace_starter',
      autoIssueTrial: false,
    });

    await platformStore.issueLicense({
      organizationId: organisation.id,
      tier: 'grace_starter',
      billingCycle: 'annual',
      status: 'active',
      overrides: { seatsLimit: 2 },
    });

    const orgAdminToken = signToken({
      id: 'org-import-admin',
      email: 'admin@validation-chapel.org',
      role: 'admin',
      name: 'Chapel Admin',
      organization_id: organisation.id,
      tenant_id: organisation.id,
    });

    // Import 2 valid members + 1 invalid row -> 2 new inserts succeed, invalid skipped
    const firstImport = await request(app)
      .post('/api/members/import')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        duplicateMode: 'skip',
        members: [
          {
            'FIRST NAME': 'Yaw',
            LASTNAME: 'Boadu',
            'PHONE NUMBER': '0247000001',
            DEPARTMENT: 'Choir',
          },
          {
            'FIRST NAME': 'Efua',
            LASTNAME: 'Sarpong',
            'PHONE NUMBER': '0247000002',
            DEPARTMENT: 'Media',
          },
          {
            'FIRST NAME': 'Broken',
            LASTNAME: 'Row',
            'PHONE NUMBER': '12',
          },
        ],
      });

    expect(firstImport.status).toBe(200);
    expect(firstImport.body.importedCount).toBe(2);
    expect(firstImport.body.invalidCount).toBe(1);
    expect(firstImport.body.members.length).toBe(2);

    // At seat limit (2/2): updating an existing member must SUCCEED (0 net new seats!)
    const updateImport = await request(app)
      .post('/api/members/import')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        duplicateMode: 'update',
        members: [
          {
            'FIRST NAME': 'Yaw',
            LASTNAME: 'Boadu',
            'PHONE NUMBER': '+233247000001',
            DEPARTMENT: 'Worship & Arts',
          },
        ],
      });

    expect(updateImport.status).toBe(200);
    expect(updateImport.body.importedCount).toBe(0);
    expect(updateImport.body.updatedCount).toBe(1);
    const yaw = updateImport.body.members.find((m: any) => m.phoneE164 === '+233247000001');
    expect(yaw?.department).toBe('Worship & Arts');

    // Trying to insert a 3rd net-new member at 2/2 seats must be rejected with 403 SEAT_LIMIT_REACHED
    const exceedRes = await request(app)
      .post('/api/members/import')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        duplicateMode: 'skip',
        members: [
          {
            'FIRST NAME': 'Kwaku',
            LASTNAME: 'Mensah',
            'PHONE NUMBER': '0247000003',
          },
        ],
      });

    expect(exceedRes.status).toBe(403);
    expect(exceedRes.body.code).toBe('SEAT_LIMIT_REACHED');
  });
});
