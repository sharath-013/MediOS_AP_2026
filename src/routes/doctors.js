const express = require('express');
const prisma = require('../db');
const { fail } = require('../errors');

const router = express.Router();

// Check the doctor data sent by the user
function checkDoctor(body) {
  if (!body.name || !body.specialization) fail(400, 'name and specialization are required');
  if (!Number.isInteger(body.departmentId)) fail(400, 'departmentId (a whole number) is required');

  return {
    name: body.name,
    specialization: body.specialization,
    departmentId: body.departmentId,
  };
}

// GET /api/doctors  -> all doctors with their department
router.get('/', async (req, res) => {
  const doctors = await prisma.doctor.findMany({
    include: { department: true },
    orderBy: { id: 'asc' },
  });
  res.json(doctors);
});

// POST /api/doctors  -> create a doctor
router.post('/', async (req, res) => {
  const data = checkDoctor(req.body);
  const doctor = await prisma.doctor.create({ data: data });
  res.status(201).json(doctor);
});

// GET /api/doctors/:id/schedule?date=2026-12-01  -> doctor's appointments for one day
// (this route is written before '/:id' so that "schedule" is read correctly)
router.get('/:id/schedule', async (req, res) => {
  const date = new Date(req.query.date);
  if (isNaN(date)) fail(400, 'date is required, like 2026-12-01');

  const appointments = await prisma.appointment.findMany({
    where: { doctorId: Number(req.params.id), date: date },
    include: { patient: true },
    orderBy: { startTime: 'asc' },
  });
  res.json(appointments);
});

// GET /api/doctors/:id  -> one doctor
router.get('/:id', async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: Number(req.params.id) },
    include: { department: true },
  });
  if (!doctor) fail(404, 'Doctor not found');
  res.json(doctor);
});

// PUT /api/doctors/:id  -> update a doctor
router.put('/:id', async (req, res) => {
  const data = checkDoctor(req.body);
  const doctor = await prisma.doctor.update({
    where: { id: Number(req.params.id) },
    data: data,
  });
  res.json(doctor);
});

// DELETE /api/doctors/:id  -> delete a doctor (fails if they have appointments)
router.delete('/:id', async (req, res) => {
  await prisma.doctor.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

module.exports = router;
