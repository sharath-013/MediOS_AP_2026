const express = require('express');
const prisma = require('../db');
const { fail } = require('../errors');

const router = express.Router();

// Check the patient data sent by the user
function checkPatient(body) {
  if (!body.firstName || !body.lastName || !body.phone || !body.email || !body.dateOfBirth || !body.gender) {
    fail(400, 'firstName, lastName, phone, email, dateOfBirth and gender are required');
  }
  if (!/^\+?[0-9]{10,14}$/.test(body.phone)) fail(400, 'Invalid phone');
  if (!/^.+@.+\..+$/.test(body.email)) fail(400, 'Invalid email');
  if (!['MALE', 'FEMALE', 'OTHER'].includes(body.gender)) fail(400, 'gender must be MALE, FEMALE or OTHER');

  const birthDate = new Date(body.dateOfBirth);
  if (isNaN(birthDate) || birthDate > new Date()) fail(400, 'Invalid dateOfBirth');

  return {
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone,
    email: body.email,
    dateOfBirth: birthDate,
    gender: body.gender,
  };
}

// GET /api/patients  -> all patients
router.get('/', async (req, res) => {
  const patients = await prisma.patient.findMany({ orderBy: { id: 'asc' } });
  res.json(patients);
});

// POST /api/patients  -> register a patient
router.post('/', async (req, res) => {
  const data = checkPatient(req.body);
  const patient = await prisma.patient.create({ data: data });
  res.status(201).json(patient);
});

// GET /api/patients/:id  -> one patient with their appointments
router.get('/:id', async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: Number(req.params.id) },
    include: { appointments: true },
  });
  if (!patient) fail(404, 'Patient not found');
  res.json(patient);
});

// PUT /api/patients/:id  -> update a patient
router.put('/:id', async (req, res) => {
  const data = checkPatient(req.body);
  const patient = await prisma.patient.update({
    where: { id: Number(req.params.id) },
    data: data,
  });
  res.json(patient);
});

// DELETE /api/patients/:id  -> delete a patient (fails if they have appointments)
router.delete('/:id', async (req, res) => {
  await prisma.patient.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

module.exports = router;
