const mongoose = require('mongoose');

const slotHoldSchema = new mongoose.Schema(
  {
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    slotDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    slotTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 5 * 60 * 1000) }
  },
  { timestamps: true }
);

slotHoldSchema.index({ doctorId: 1, slotDate: 1, slotTime: 1 }, { unique: true, name: 'one_hold_per_slot' });
slotHoldSchema.index({ patientId: 1 });
slotHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SlotHold', slotHoldSchema);