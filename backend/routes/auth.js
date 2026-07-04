const express = require('express');
const { getMe, login, register } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.get('/me', protect, asyncHandler(getMe));

module.exports = router;