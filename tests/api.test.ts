// tests/api.test.ts - Automated Security & End-to-End Supabase Verification Suite
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken } from '../lib/auth';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SCHOOL_A_ID = 'e0000000-0000-0000-0000-000000000001';
const SCHOOL_B_ID = 'd0000000-0000-0000-0000-000000000002';

describe('SchoolSphere 3.1 Hardened Security & Supabase Integration Test Suite', () => {
  // Test Tokens
  let schoolATeacherToken: string;
  let schoolAAdminToken: string;
  let schoolBAdminToken: string;
  let elenaTeacherToken: string;
  let superAdminToken: string;
  let expiredToken: string;

  beforeAll(() => {
    // Standard authenticated accounts
    schoolATeacherToken = signToken({
      id: '00000000-0000-0000-0000-000000000010',
      email: 'teacher.a@school-a.edu.gh',
      role: 'teacher',
      school_id: SCHOOL_A_ID,
      username: 'kwame_teacher',
    });

    schoolAAdminToken = signToken({
      id: '00000000-0000-0000-0000-000000000011',
      email: 'admin.a@school-a.edu.gh',
      role: 'admin',
      school_id: SCHOOL_A_ID,
      username: 'kofi_admin',
    });

    schoolBAdminToken = signToken({
      id: '00000000-0000-0000-0000-000000000020',
      email: 'admin.b@school-b.edu.gh',
      role: 'admin',
      school_id: SCHOOL_B_ID,
      username: 'ama_admin',
    });

    // STEP 2 BACKDOOR AUDIT: Test account named "elena" with non-admin role
    elenaTeacherToken = signToken({
      id: '00000000-0000-0000-0000-000000000099',
      email: 'elena@example.com',
      role: 'teacher',
      school_id: SCHOOL_A_ID,
      username: 'elena',
    });

    // Verified super admin account
    superAdminToken = signToken({
      id: '00000000-0000-0000-0000-000000000000',
      email: 'superadmin@schoolsphere.dev',
      role: 'super_admin',
      username: 'system_master',
    });

    // Expired token (iat & exp in past)
    expiredToken = signToken(
      {
        id: '00000000-0000-0000-0000-000000000010',
        email: 'expired@school-a.edu.gh',
        role: 'teacher',
        school_id: SCHOOL_A_ID,
      },
      -10 // Expired 10 seconds ago
    );
  });

  // =========================================================================
  // REQUIREMENT A: Route Status Codes & Shape (Authenticated vs Unauthenticated)
  // =========================================================================
  describe('A. Route Authentication & Status Code Assertions', () => {
    it('GET /api/health returns healthy Supabase connection (never local fallback)', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.database).toBe('supabase');
      expect(res.body.connected).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('using local fallback');
    });

    it('GET /api/db/status returns healthy status', async () => {
      const res = await request(app).get('/api/db/status');
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
    });

    it('GET /api/license/status rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/license/status');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('GET /api/license/status permits authenticated request for valid school', async () => {
      const res = await request(app)
        .get('/api/license/status')
        .set('Authorization', `Bearer ${schoolAAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(res.body.school_id).toBe(SCHOOL_A_ID);
      expect(res.body.source).toBe('supabase');
    });

    it('GET /api/students rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/students');
      expect(res.status).toBe(401);
    });

    it('GET /api/students allows authenticated school teacher', async () => {
      const res = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${schoolATeacherToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/users rejects non-admin users with 403', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${schoolATeacherToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/users allows school admin with 200', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${schoolAAdminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // =========================================================================
  // REQUIREMENT B: CRUD Writes Directly to Supabase & Verification
  // =========================================================================
  describe('B. Direct Supabase CRUD Verification', () => {
    let createdStudentId: string;
    const testFirstName = `Test_${Date.now()}`;
    const testLastName = 'AkokoAudit';

    it('POST /api/students writes a student record and verifies persistence in Supabase', async () => {
      const postRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${schoolAAdminToken}`)
        .send({
          first_name: testFirstName,
          last_name: testLastName,
          grade: 'Form 2 Green',
          parent_phone: '+233241009988',
          parent_email: 'parent.test@example.com',
        });

      expect(postRes.status).toBe(201);
      expect(postRes.body.id).toBeDefined();
      expect(postRes.body.first_name).toBe(testFirstName);
      expect(postRes.body.school_id).toBe(SCHOOL_A_ID);
      createdStudentId = postRes.body.id;

      // READ DIRECTLY FROM SUPABASE CLIENT TO CONFIRM PERSISTENCE
      const { data: directDbRecord, error: dbErr } = await supabase
        .from('members')
        .select('*')
        .eq('id', createdStudentId)
        .single();

      expect(dbErr).toBeNull();
      expect(directDbRecord).toBeDefined();
      expect(directDbRecord.first_name).toBe(testFirstName);
      expect(directDbRecord.last_name).toBe(testLastName);
      expect(directDbRecord.organization_id).toBe(SCHOOL_A_ID);
    });

    it('PUT /api/students/:id updates record and confirms change in Supabase', async () => {
      expect(createdStudentId).toBeDefined();

      const putRes = await request(app)
        .put(`/api/students/${createdStudentId}`)
        .set('Authorization', `Bearer ${schoolAAdminToken}`)
        .send({
          grade: 'Form 3 Gold Honors',
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.grade).toBe('Form 3 Gold Honors');

      // READ DIRECTLY FROM SUPABASE CLIENT
      const { data: updatedDbRecord } = await supabase
        .from('members')
        .select('department')
        .eq('id', createdStudentId)
        .single();

      expect(updatedDbRecord?.department).toBe('Form 3 Gold Honors');
    });

    it('DELETE /api/students/:id deletes record and confirms removal in Supabase', async () => {
      expect(createdStudentId).toBeDefined();

      const delRes = await request(app)
        .delete(`/api/students/${createdStudentId}`)
        .set('Authorization', `Bearer ${schoolAAdminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // READ DIRECTLY FROM SUPABASE CLIENT TO CONFIRM DELETION
      const { data: checkDeleted } = await supabase
        .from('members')
        .select('id')
        .eq('id', createdStudentId)
        .maybeSingle();

      expect(checkDeleted).toBeNull();
    });
  });

  // =========================================================================
  // REQUIREMENT C: Tenant Isolation / RLS (School A cannot read/write School B)
  // =========================================================================
  describe('C. Tenant Isolation & Deny-by-Default School Scope Enforcement', () => {
    it('Denies School A user from accessing School B data via query param (403)', async () => {
      const res = await request(app)
        .get(`/api/students?school_id=${SCHOOL_B_ID}`)
        .set('Authorization', `Bearer ${schoolATeacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Tenant access denied: school scope mismatch');
    });

    it('Denies School A user from writing data into School B via body param (403)', async () => {
      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${schoolAAdminToken}`)
        .send({
          school_id: SCHOOL_B_ID,
          first_name: 'Intruder',
          last_name: 'CrossTenant',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Tenant access denied: school scope mismatch');
    });

    it('Denies School A user from accessing School B license status (403)', async () => {
      const res = await request(app)
        .get(`/api/license/status?school_id=${SCHOOL_B_ID}`)
        .set('Authorization', `Bearer ${schoolAAdminToken}`);

      expect(res.status).toBe(403);
    });

    it('Automatically scopes requests without school_id to user\'s own school', async () => {
      const res = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${schoolATeacherToken}`);

      expect(res.status).toBe(200);
      // All returned records must belong exclusively to School A
      for (const record of res.body) {
        expect(record.school_id).toBe(SCHOOL_A_ID);
      }
    });

    it('Allows super_admin to access any school scope', async () => {
      const res = await request(app)
        .get(`/api/students?school_id=${SCHOOL_A_ID}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // REQUIREMENT D: Auth Token Validation, Rejection, and Expiration
  // =========================================================================
  describe('D. Token Signature & Expiration Security', () => {
    it('Rejects requests with expired tokens with 401', async () => {
      const res = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Token has expired');
    });

    it('Rejects tokens with invalid signatures with 401', async () => {
      const forgedToken = `${schoolATeacherToken.slice(0, -6)}BADSIG`;
      const res = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid token signature');
    });

    it('Rejects malformed Authorization header with 401', async () => {
      const res = await request(app)
        .get('/api/students')
        .set('Authorization', 'InvalidFormatHeader');

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // REQUIREMENT E: Backdoor Verification (Elena username check permanently purged)
  // =========================================================================
  describe('E. Backdoor Audit: Elena Super-Admin Bypass Purged', () => {
    it('Denies user named "elena" with role="teacher" from super-admin endpoint (403)', async () => {
      const res = await request(app)
        .get('/api/admin/system-settings')
        .set('Authorization', `Bearer ${elenaTeacherToken}`);

      // Must be rejected with 403 Forbidden - username "elena" confers NO super-admin rights
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('Denies user named "elena" with role="teacher" from user management creation (403)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${elenaTeacherToken}`)
        .send({
          first_name: 'Hacked',
          last_name: 'Account',
          email: 'hacked@example.com',
          role: 'admin',
        });

      expect(res.status).toBe(403);
    });

    it('Grants super-admin endpoint access strictly to accounts with role="super_admin"', async () => {
      const res = await request(app)
        .get('/api/admin/system-settings')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('authorized');
    });
  });

  // =========================================================================
  // REQUIREMENT F: Church Premise GPS Geofence Configuration
  // =========================================================================
  describe('F. Church Premise GPS Geofence Configuration', () => {
    it('POST /api/campus-premise saves GPS coordinates with numeric values', async () => {
      const res = await request(app)
        .post('/api/campus-premise')
        .send({
          lat: 5.6037,
          lng: -0.1870,
          churchName: 'PIWC KWADASO',
          campusName: 'Main Campus',
          innerGeofenceMeters: 50,
          outerGeofenceMeters: 300,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.site.lat).toBe(5.6037);
      expect(res.body.site.lng).toBe(-0.1870);
    });

    it('POST /api/campus-premise handles string/coerced coordinates and fallback names', async () => {
      const res = await request(app)
        .post('/api/campus-premise')
        .send({
          lat: '5.55602',
          lng: '-0.1969',
          churchName: '',
          campusName: '',
          accuracyM: '12.5',
          innerGeofenceMeters: '60',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.site.lat).toBe(5.55602);
      expect(res.body.site.lng).toBe(-0.1969);
    });

    it('GET /api/campus-premise returns configured state', async () => {
      const res = await request(app).get('/api/campus-premise');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
      expect(res.body.premiseSettings).toBeDefined();
    });
  });
});
