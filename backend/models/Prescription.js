const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    dosage: { type: String, required: true, trim: true, maxlength: 80 },
    frequency: { type: String, required: true, trim: true, maxlength: 80 },
    duration: { type: String, required: true, trim: true, maxlength: 80 }
  },
  { _id: true }
);

const prescriptionSchema = new mongoose.Schema(
  {
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    medicines: {
      type: [medicineSchema],
      validate: {
        validator: value => value.length > 0 && value.length <= 20,
        message: 'A prescription needs between 1 and 20 medicines'
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Prescription', prescriptionSchema);