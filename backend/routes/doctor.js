const express = require('express');
const { addPostVisitNotes, addPrescription, getAppointmentById, getDoctorAppointments } = require('../controllers/doctorController');
const { authorize, protect } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(protect, authorize('doctor'));
router.get('/appointments', asyncHandler(getDoctorAppointments));
router.get('/appointments/:id', asyncHandler(getAppointmentById));
router.post('/appointments/:id/notes', asyncHandler(addPostVisitNotes));
router.post('/appointments/:id/prescription', asyncHandler(addPrescription));

module.exports = router;