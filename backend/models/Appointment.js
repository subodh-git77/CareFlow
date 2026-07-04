const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symptoms: { type: String, required: true, trim: true, minlength: 5, maxlength: 3000 },
    aiSymptomSummary: {
      urgency: { type: String, enum: ['Low', 'Medium', 'High', 'Unknown'], default: 'Unknown' },
      chiefComplaint: String,
      suggestedQuestions: [String],
      rawOutput: String,
      provider: { type: String, default: 'none' },
      available: { type: Boolean, default: false }
    },
    status: { type: String, enum: ['HELD', 'CONFIRMED', 'CANCELLED', 'COMPLETED'], default: 'CONFIRMED', index: true },
    // Cancelled records stay in history, while this flag releases the unique slot.
    active: { type: Boolean, default: true, index: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    slotTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    postVisitNotes: { type: String, default: '', maxlength: 10000 },
    aiPostVisitSummary: {
      text: { type: String, default: '' },
      provider: { type: String, default: 'none' },
      available: { type: Boolean, default: false }
    },
    googleEventId: { type: String, default: '' },
    cancellationReason: { type: String, default: '' }
  },
  { timestamps: true }
);

appointmentSchema.index(
  { doctorId: 1, date: 1, slotTime: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_appointment_per_slot' }
);
appointmentSchema.index({ patientId: 1, date: -1, slotTime: -1 });
appointmentSchema.index({ doctorId: 1, date: 1, slotTime: 1, status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);