const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const { generatePostVisitSummary, FALLBACK_MESSAGE } = require('../services/llmService');
const { scheduleMedicationReminders } = require('../services/reminderScheduler');
const { HttpError } = require('../utils/http');

const withTimeout = (promise, milliseconds) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('AI request timed out')), milliseconds))
]);

const attachPrescriptions = async appointments => {
  const prescriptions = await Prescription.find({ appointmentId: { $in: appointments.map(item => item._id) } }).lean();
  const byAppointment = new Map(prescriptions.map(item => [item.appointmentId.toString(), item]));
  return appointments.map(item => ({ ...item, prescription: byAppointment.get(item._id.toString()) || null }));
};

const getDoctorAppointments = async (req, res) => {
  const query = { doctorId: req.user._id };
  if (req.query.status) query.status = req.query.status.toUpperCase();
  const appointments = await Appointment.find(query)
    .populate('patientId', 'name email')
    .sort({ date: 1, slotTime: 1 })
    .lean();
  res.json({ success: true, data: await attachPrescriptions(appointments) });
};

const getAppointmentById = async (req, res) => {
  const appointment = await Appointment.findOne({ _id: req.params.id, doctorId: req.user._id })
    .populate('patientId', 'name email')
    .lean();
  if (!appointment) throw new HttpError(404, 'Appointment not found');
  const prescription = await Prescription.findOne({ appointmentId: appointment._id }).lean();
  res.json({ success: true, data: { appointment, prescription } });
};

const addPostVisitNotes = async (req, res) => {
  const notes = req.body.postVisitNotes?.trim();
  if (!notes) throw new HttpError(400, 'Clinical notes are required');

  const appointment = await Appointment.findOne({ _id: req.params.id, doctorId: req.user._id });
  if (!appointment) throw new HttpError(404, 'Appointment not found');
  if (appointment.status === 'CANCELLED') throw new HttpError(400, 'A cancelled appointment cannot be completed');

  let summary;
  try {
    summary = await withTimeout(generatePostVisitSummary(notes), 15000);
  } catch (error) {
    console.warn(`[Visit summary] AI unavailable: ${error.message}`);
    summary = { text: `${FALLBACK_MESSAGE}.\n\nClinical notes from your doctor:\n${notes}`, provider: 'none', available: false };
  }

  appointment.postVisitNotes = notes;
  appointment.aiPostVisitSummary = summary;
  appointment.status = 'COMPLETED';
  await appointment.save();

  const patient = await User.findById(appointment.patientId);
  if (patient) await sendEmail({
    recipientEmail: patient.email,
    type: 'VISIT_SUMMARY',
    subject: `Your visit summary from Dr. ${req.user.name}`,
    body: `Hi ${patient.name},\n\nYour visit summary is ready.\n\n${summary.text}\n\nSign in to CareFlow to view your complete record.`,
    appointmentId: appointment._id,
    dedupeKey: `visit-summary:${appointment._id}:${appointment.updatedAt.getTime()}`
  });

  res.json({ success: true, message: 'Visit notes saved', data: appointment });
};

const addPrescription = async (req, res) => {
  const { medicines } = req.body;
  if (!Array.isArray(medicines) || !medicines.length) throw new HttpError(400, 'Add at least one medicine');
  const invalid = medicines.some(medicine =>
    !medicine.name?.trim() || !medicine.dosage?.trim() || !medicine.frequency?.trim() || !medicine.duration?.trim()
  );
  if (invalid) throw new HttpError(400, 'Every medicine needs a name, dosage, frequency, and duration');

  const appointment = await Appointment.findOne({ _id: req.params.id, doctorId: req.user._id });
  if (!appointment) throw new HttpError(404, 'Appointment not found');
  if (appointment.status === 'CANCELLED') throw new HttpError(400, 'Cannot prescribe for a cancelled appointment');

  const cleanMedicines = medicines.map(medicine => ({
    name: medicine.name.trim(),
    dosage: medicine.dosage.trim(),
    frequency: medicine.frequency.trim(),
    duration: medicine.duration.trim()
  }));

  const prescription = await Prescription.findOneAndUpdate(
    { appointmentId: appointment._id },
    {
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      doctorId: req.user._id,
      medicines: cleanMedicines
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const patient = await User.findById(appointment.patientId);
  let remindersScheduled = 0;
  if (patient) {
    try {
      remindersScheduled = await scheduleMedicationReminders(prescription, patient, req.user);
    } catch (error) {
      console.warn(`[Medication reminders] Scheduling failed: ${error.message}`);
    }
    const medicineList = cleanMedicines
      .map(medicine => `- ${medicine.name}: ${medicine.dosage}, ${medicine.frequency}, for ${medicine.duration}`)
      .join('\n');
    await sendEmail({
      recipientEmail: patient.email,
      type: 'PRESCRIPTION',
      subject: `Prescription from Dr. ${req.user.name}`,
      body: `Hi ${patient.name},\n\nYour prescription:\n${medicineList}\n\nMedication reminders have been scheduled where possible.`,
      appointmentId: appointment._id,
      prescriptionId: prescription._id,
      dedupeKey: `prescription:${prescription._id}:${prescription.updatedAt.getTime()}`
    });
  }

  res.json({
    success: true,
    message: `Prescription saved. ${remindersScheduled} medication reminder(s) scheduled.`,
    data: prescription
  });
};

module.exports = { addPostVisitNotes, addPrescription, getAppointmentById, getDoctorAppointments };