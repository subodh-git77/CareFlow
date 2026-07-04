const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const doctorRoutes = require('./routes/doctor');
const patientRoutes = require('./routes/patient');

const app = express();
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(value => value.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({
  success: true,
  status: 'UP',
  database: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
  timestamp: new Date().toISOString()
}));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/calendar', calendarRoutes);

app.use((_req, res) => res.status(404).json({ success: false, error: 'API route not found' }));
app.use((error, _req, res, _next) => {
  let status = error.statusCode || 500;
  let message = error.message || 'Internal server error';
  if (error.name === 'ValidationError') status = 400;
  if (error.name === 'CastError') { status = 400; message = 'Invalid record identifier'; }
  if (error.code === 11000) { status = 409; message = 'A record with these details already exists'; }
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, error: message });
});

module.exports = app;