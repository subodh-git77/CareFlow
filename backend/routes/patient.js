const express = require('express');
const {
  cancelAppointment,
  confirmAppointment,
  getAvailableSlots,
  getDoctorsForSearch,
  getPatientAppointments,
  holdSlot,
  rescheduleAppointment
} = require('../controllers/patientController');
const { authorize, protect } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(protect, authorize('patient'));
router.get('/doctors', asyncHandler(getDoctorsForSearch));
router.get('/doctors/:id/slots', asyncHandler(getAvailableSlots));
router.get('/appointments', asyncHandler(getPatientAppointments));
router.post('/appointments/hold', asyncHandler(holdSlot));
router.post('/appointments/confirm', asyncHandler(confirmAppointment));
router.put('/appointments/:id/reschedule', asyncHandler(rescheduleAppointment));
router.delete('/appointments/:id/cancel', asyncHandler(cancelAppointment));

module.exports = router;