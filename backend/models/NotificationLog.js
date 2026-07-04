const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema(
  {
    recipientEmail: { type: String, required: true, trim: true, lowercase: true },
    type: {
      type: String,
      enum: ['CONFIRMATION', 'REMINDER', 'CANCELLATION', 'RESCHEDULE', 'LEAVE_NOTICE', 'MED_REMINDER', 'PRESCRIPTION', 'VISIT_SUMMARY'],
      required: true
    },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED', 'RETRYING'], default: 'PENDING' },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    retryCount: { type: Number, default: 0 },
    errorLog: { type: String, default: '' },
    sendAt: { type: Date, default: Date.now },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastAttemptAt: Date,
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
    dedupeKey: { type: String, sparse: true, unique: true }
  },
  { timestamps: true }
);

notificationLogSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model('NotificationLog', notificationLogSchema);