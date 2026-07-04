const mongoose = require('mongoose');

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const doctorProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    specialisation: { type: String, required: [true, 'Specialisation is required'], trim: true, maxlength: 80, index: true },
    workingHours: {
      start: { type: String, default: '09:00', match: timePattern },
      end: { type: String, default: '17:00', match: timePattern }
    },
    slotDuration: { type: Number, enum: [15, 20, 30, 45, 60], default: 30 },
    leaveDays: { type: [{ type: String, match: datePattern }], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model('DoctorProfile', doctorProfileSchema);