const express = require('express');
const { createDoctor, deleteDoctor, getDoctors, markDoctorLeave, updateDoctor } = require('../controllers/adminController');
const { authorize, protect } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(protect, authorize('admin'));
router.route('/doctors').get(asyncHandler(getDoctors)).post(asyncHandler(createDoctor));
router.route('/doctors/:id').put(asyncHandler(updateDoctor)).delete(asyncHandler(deleteDoctor));
router.post('/doctors/:id/leave', asyncHandler(markDoctorLeave));

module.exports = router;