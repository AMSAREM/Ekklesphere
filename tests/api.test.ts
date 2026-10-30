// tests/api.test.ts - Ekklesphere Church Management & GPS Geofence Test Suite
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';

describe('Ekklesphere Church Management & GPS Premise Suite', () => {
  it('GET /api/health returns healthy server status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.app).toBe('Ekklesphere Church Management');
  });

  it('POST /api/campus-premise successfully saves church premise GPS coordinates', async () => {
    const res = await request(app)
      .post('/api/campus-premise')
      .send({
        lat: 5.6037,
        lng: -0.1870,
        churchName: 'PIWC KWADASO',
        campusName: 'Main Worship Auditorium',
        campusAddress: 'Kwadaso Estate, Kumasi / Accra',
        innerGeofenceMeters: 50,
        outerGeofenceMeters: 300,
        dwellTimeMinutes: 5,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.configured).toBe(true);
    expect(res.body.site).toBeDefined();
    expect(res.body.site.lat).toBe(5.6037);
    expect(res.body.site.lng).toBe(-0.1870);
    expect(res.body.premiseSettings.churchName).toBe('PIWC KWADASO');
  });

  it('GET /api/campus-premise returns the saved church premise GPS location', async () => {
    const res = await request(app).get('/api/campus-premise');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.premiseSettings.lat).toBe(5.6037);
    expect(res.body.premiseSettings.lng).toBe(-0.1870);
  });

  it('POST /api/campus-premise rejects invalid latitude or longitude', async () => {
    const res = await request(app)
      .post('/api/campus-premise')
      .send({
        lat: 999, // Invalid latitude
        lng: -0.1870,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_premise_coordinates');
  });

  it('POST /api/campus-premise/resolve-link extracts GPS coordinates directly from coordinate string', async () => {
    const res = await request(app)
      .post('/api/campus-premise/resolve-link')
      .send({
        input: '5.603717, -0.186964',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.lat).toBeCloseTo(5.603717, 4);
    expect(res.body.lng).toBeCloseTo(-0.186964, 4);
  });

  it('POST /api/live-checkins and GET /api/live-checkins records church service attendance', async () => {
    const checkinRes = await request(app)
      .post('/api/live-checkins')
      .send({
        personId: 'm-test-1',
        personName: 'Kofi Mensah',
        serviceInstanceId: 'svc-sun-1',
        method: 'geofence',
        confidence: 90,
      });

    expect(checkinRes.status).toBe(200);
    expect(checkinRes.body.success).toBe(true);
    expect(checkinRes.body.record.personName).toBe('Kofi Mensah');

    const listRes = await request(app).get('/api/live-checkins');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((r: any) => r.personId === 'm-test-1')).toBe(true);
  });

  it('POST /attendance/events verifies arrival signal against church premise geofence', async () => {
    const eventRes = await request(app)
      .post('/attendance/events')
      .send({
        clientEventId: '00000000-0000-0000-0000-000000000001',
        type: 'enter',
        source: 'geofence',
        lat: 5.6037,
        lng: -0.1870,
        accuracyM: 10,
        deviceTime: new Date().toISOString(),
      });

    expect(eventRes.status).toBe(200);
    expect(eventRes.body.status).toBe('accepted');
    expect(eventRes.body.distance_m).toBeLessThanOrEqual(15);
  });

  it('GET /api/events returns church worship services', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
