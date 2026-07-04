const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema(
  {
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
    provider: { type: String, enum: ['GOOGLE', 'MOCK'], default: 'MOCK' },
    providerEventId: { type: String, required: true },
    calendarId: { type: String, default: 'primary' },
    status: { type: String, enum: ['CREATED', 'UPDATED', 'DELETED', 'FAILED'], default: 'CREATED' },
    lastError: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);