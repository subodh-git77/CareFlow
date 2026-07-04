const express = require('express');
const jwt = require('jsonwebtoken');
const { authorize, protect } = require('../middleware/auth');
const { exchangeCode, getAuthorizationUrl, isConfigured } = require('../services/googleCalendarService');
const { HttpError, asyncHandler } = require('../utils/http');

const router = express.Router();

router.get('/status', protect, authorize('admin'), (_req, res) => {
  res.json({ success: true, configured: isConfigured() });
});

router.get('/connect', protect, authorize('admin'), (req, res) => {
  const state = jwt.sign(
    { purpose: 'google-calendar', adminId: req.user._id.toString() },
    process.env.JWT_SECRET || 'development-only-change-me',
    { expiresIn: '10m' }
  );
  const url = getAuthorizationUrl(state);
  if (!url) return res.status(400).json({ success: false, error: 'Add Google client credentials to .env first' });
  return res.json({ success: true, url });
});

router.get('/callback', asyncHandler(async (req, res) => {
  if (!req.query.code || !req.query.state) throw new HttpError(400, 'Missing OAuth code or state');
  const state = jwt.verify(req.query.state, process.env.JWT_SECRET || 'development-only-change-me');
  if (state.purpose !== 'google-calendar') throw new HttpError(400, 'Invalid OAuth state');
  const tokens = await exchangeCode(req.query.code);
  res.json({
    success: true,
    message: 'OAuth succeeded. Copy the refresh token into GOOGLE_REFRESH_TOKEN, then restart the backend.',
    refreshToken: tokens.refresh_token || null
  });
}));

module.exports = router;