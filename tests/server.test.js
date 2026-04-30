'use strict';

const request = require('supertest');
const { app, _reset } = require('../server');

beforeEach(() => _reset());

// ── Health check ──────────────────────────────────────────────────────────────
describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
describe('GET /api/stats', () => {
  it('returns zero counts on empty store', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.pending).toBe(0);
  });
});

// ── List shipments ────────────────────────────────────────────────────────────
describe('GET /api/shipments', () => {
  it('returns empty array initially', async () => {
    const res = await request(app).get('/api/shipments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('filters by status', async () => {
    await request(app).post('/api/shipments').send(validPayload());
    const r2 = await request(app).post('/api/shipments').send(validPayload({ senderName: 'Alice' }));
    await request(app).patch(`/api/shipments/${r2.body.id}/status`).send({ status: 'in_transit' });

    const res = await request(app).get('/api/shipments?status=pending');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('pending');
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await request(app).get('/api/shipments?status=unknown');
    expect(res.status).toBe(400);
  });
});

// ── Create shipment ───────────────────────────────────────────────────────────
describe('POST /api/shipments', () => {
  it('creates a shipment with required fields', async () => {
    const res = await request(app).post('/api/shipments').send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.trackingNumber).toMatch(/^COL-[A-Z0-9]+$/);
    expect(res.body.status).toBe('pending');
    expect(res.body.statusHistory).toHaveLength(1);
  });

  it('creates a shipment with all fields', async () => {
    const res = await request(app).post('/api/shipments').send({
      ...validPayload(),
      weight: 2.5,
      description: 'Electronics',
    });
    expect(res.status).toBe(201);
    expect(res.body.weight).toBe(2.5);
    expect(res.body.description).toBe('Electronics');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/shipments').send({ senderName: 'Bob' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-positive weight', async () => {
    const res = await request(app).post('/api/shipments').send({ ...validPayload(), weight: -1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for zero weight', async () => {
    const res = await request(app).post('/api/shipments').send({ ...validPayload(), weight: 0 });
    expect(res.status).toBe(400);
  });
});

// ── Get single shipment ───────────────────────────────────────────────────────
describe('GET /api/shipments/:identifier', () => {
  it('retrieves by ID', async () => {
    const created = (await request(app).post('/api/shipments').send(validPayload())).body;
    const res = await request(app).get(`/api/shipments/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
  });

  it('retrieves by tracking number', async () => {
    const created = (await request(app).post('/api/shipments').send(validPayload())).body;
    const res = await request(app).get(`/api/shipments/${created.trackingNumber}`);
    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe(created.trackingNumber);
  });

  it('returns 404 for unknown identifier', async () => {
    const res = await request(app).get('/api/shipments/not-a-real-id');
    expect(res.status).toBe(404);
  });
});

// ── Update status ─────────────────────────────────────────────────────────────
describe('PATCH /api/shipments/:id/status', () => {
  it('updates status and appends to history', async () => {
    const created = (await request(app).post('/api/shipments').send(validPayload())).body;
    const res = await request(app)
      .patch(`/api/shipments/${created.id}/status`)
      .send({ status: 'in_transit', note: 'Left warehouse' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_transit');
    expect(res.body.statusHistory).toHaveLength(2);
    expect(res.body.statusHistory[1].note).toBe('Left warehouse');
  });

  it('returns 400 for invalid status', async () => {
    const created = (await request(app).post('/api/shipments').send(validPayload())).body;
    const res = await request(app)
      .patch(`/api/shipments/${created.id}/status`)
      .send({ status: 'flying' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown shipment', async () => {
    const res = await request(app)
      .patch('/api/shipments/bad-id/status')
      .send({ status: 'delivered' });
    expect(res.status).toBe(404);
  });
});

// ── Delete shipment ───────────────────────────────────────────────────────────
describe('DELETE /api/shipments/:id', () => {
  it('deletes an existing shipment', async () => {
    const created = (await request(app).post('/api/shipments').send(validPayload())).body;
    const del = await request(app).delete(`/api/shipments/${created.id}`);
    expect(del.status).toBe(204);

    const get = await request(app).get(`/api/shipments/${created.id}`);
    expect(get.status).toBe(404);
  });

  it('returns 404 when deleting non-existent shipment', async () => {
    const res = await request(app).delete('/api/shipments/ghost');
    expect(res.status).toBe(404);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function validPayload(overrides = {}) {
  return {
    senderName: 'Alice',
    recipientName: 'Bob',
    origin: 'New York, NY',
    destination: 'Los Angeles, CA',
    ...overrides,
  };
}
