const express = require('express');
const prisma = require('../db');
const { fail } = require('../errors');

const router = express.Router();

// GET /api/appointments  -> all appointments
router.get('/', async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    include: { patient: true, doctor: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
  res.json(appointments);
});

// POST /api/appointments  -> book an appointment
// Body: { "patientId": 1, "doctorId": 1, "date": "2026-12-01", "startTime": "10:30" }
router.post('/', async (req, res) => {
  const { patientId, doctorId, date, startTime } = req.body;

  if (!Number.isInteger(patientId) || !Number.isInteger(doctorId)) {
    fail(400, 'patientId and doctorId must be whole numbers');
  }
  if (isNaN(new Date(date))) fail(400, 'date must look like 2026-12-01');
  if (!/^\d{2}:\d{2}$/.test(startTime || '')) fail(400, 'startTime must look like 10:30');

  try {
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patientId,
        doctorId: doctorId,
        date: new Date(date),
        startTime: new Date('1970-01-01T' + startTime + ':00Z'), // TIME column
      },
    });
    res.status(201).json(appointment);
  } catch (err) {
    // The database stops the same doctor, date and time from being used twice
    if (err.code === 'P2002') fail(409, 'Doctor already booked at that time');
    throw err;
  }
});

// GET /api/appointments/:id  -> one appointment with patient, doctor and invoice
router.get('/:id', async (req, res) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: Number(req.params.id) },
    include: { patient: true, doctor: true, invoice: { include: { items: true } } },
  });
  if (!appointment) fail(404, 'Appointment not found');
  res.json(appointment);
});

// PATCH /api/appointments/:id/status  -> change the status
// Body: { "status": "CANCELLED" }
router.patch('/:id/status', async (req, res) => {
  const status = req.body.status;
  if (!['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)) {
    fail(400, 'status must be SCHEDULED, COMPLETED, CANCELLED or NO_SHOW');
  }

  const appointment = await prisma.appointment.update({
    where: { id: Number(req.params.id) },
    data: { status: status },
  });
  res.json(appointment);
});

// POST /api/appointments/:id/bill  -> mark completed AND create the invoice
// Body: { "items": [ { "serviceCode": "CONS", "quantity": 1 } ] }
// Both steps happen in one transaction: if one fails, nothing is saved.
router.post('/:id/bill', async (req, res) => {
  const id = Number(req.params.id);
  const items = req.body.items;

  if (!Array.isArray(items) || items.length === 0) fail(400, 'items is required (a list of services)');

  const invoice = await prisma.$transaction(async (tx) => {
    // 1. Check the appointment
    const appointment = await tx.appointment.findUnique({ where: { id: id }, include: { invoice: true } });
    if (!appointment) fail(404, 'Appointment not found');
    if (appointment.invoice) fail(409, 'Appointment already invoiced');
    if (appointment.status === 'CANCELLED') fail(400, 'Cannot bill a cancelled appointment');

    // 2. Build one invoice line per service, copying today's price
    const lines = [];
    for (const item of items) {
      const service = await tx.service.findUnique({ where: { code: item.serviceCode } });
      if (!service) fail(400, 'Unknown service: ' + item.serviceCode);

      const quantity = item.quantity || 1;
      if (!Number.isInteger(quantity) || quantity < 1) fail(400, 'quantity must be a whole number above 0');

      lines.push({ serviceCode: service.code, quantity: quantity, chargedPrice: service.listPrice });
    }

    // 3. Mark completed and create the invoice with its lines
    await tx.appointment.update({ where: { id: id }, data: { status: 'COMPLETED' } });
    return tx.invoice.create({
      data: { appointmentId: id, items: { create: lines } },
      include: { items: true },
    });
  });

  res.status(201).json(invoice);
});

// DELETE /api/appointments/:id  -> delete an appointment (fails if it has an invoice)
router.delete('/:id', async (req, res) => {
  await prisma.appointment.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

module.exports = router;
