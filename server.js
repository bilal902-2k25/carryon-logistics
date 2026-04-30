'use strict';

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory data store ──────────────────────────────────────────────────────
let shipments = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
const VALID_STATUSES = ['pending', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'];

function generateTrackingNumber() {
  const prefix = 'COL';
  const suffix = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}-${suffix}`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// List all shipments (with optional status filter)
app.get('/api/shipments', (req, res) => {
  const { status } = req.query;
  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    return res.json(shipments.filter((s) => s.status === status));
  }
  res.json(shipments);
});

// Get a single shipment by ID or tracking number
app.get('/api/shipments/:identifier', (req, res) => {
  const { identifier } = req.params;
  const shipment =
    shipments.find((s) => s.id === identifier) ||
    shipments.find((s) => s.trackingNumber === identifier.toUpperCase());

  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found' });
  }
  res.json(shipment);
});

// Create a new shipment
app.post('/api/shipments', (req, res) => {
  const { senderName, recipientName, origin, destination, weight, description } = req.body;

  if (!senderName || !recipientName || !origin || !destination) {
    return res.status(400).json({
      error: 'senderName, recipientName, origin, and destination are required',
    });
  }

  if (weight !== undefined && (isNaN(weight) || Number(weight) <= 0)) {
    return res.status(400).json({ error: 'weight must be a positive number' });
  }

  const now = new Date().toISOString();
  const shipment = {
    id: uuidv4(),
    trackingNumber: generateTrackingNumber(),
    senderName: String(senderName).trim(),
    recipientName: String(recipientName).trim(),
    origin: String(origin).trim(),
    destination: String(destination).trim(),
    weight: weight !== undefined ? Number(weight) : null,
    description: description ? String(description).trim() : '',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: 'pending', timestamp: now, note: 'Shipment created' }],
  };

  shipments.push(shipment);
  res.status(201).json(shipment);
});

// Update shipment status
app.patch('/api/shipments/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;

  const shipment = shipments.find((s) => s.id === id);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found' });
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  const now = new Date().toISOString();
  shipment.status = status;
  shipment.updatedAt = now;
  shipment.statusHistory.push({
    status,
    timestamp: now,
    note: note ? String(note).trim() : '',
  });

  res.json(shipment);
});

// Delete a shipment
app.delete('/api/shipments/:id', (req, res) => {
  const { id } = req.params;
  const index = shipments.findIndex((s) => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Shipment not found' });
  }
  shipments.splice(index, 1);
  res.status(204).send();
});

// Stats endpoint
app.get('/api/stats', (_req, res) => {
  const stats = {
    total: shipments.length,
  };
  for (const status of VALID_STATUSES) {
    stats[status] = shipments.filter((s) => s.status === status).length;
  }
  res.json(stats);
});

// ── Start server ──────────────────────────────────────────────────────────────
/* istanbul ignore next */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Carry On Logistics server running at http://localhost:${PORT}`);
  });
}

module.exports = { app, shipments: () => shipments, _reset: () => { shipments = []; } };
