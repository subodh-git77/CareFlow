const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const Prescription = require('../models/Prescription');
const SlotHold = require('../models/SlotHold');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const { createEvent, deleteEvent, updateEvent } = require('../services/googleCalendarService');
const { analyzeSymptoms, FALLBACK_MESSAGE } = require('../services/llmService');
const { HttpError } = require('../utils/http');
const { generateTimeSlots, isRealDate, validateBookableSlot } = require('../utils/dateTime');

const withTimeout = (promise, milliseconds) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('AI request timed out')), milliseconds))
]);

const serializeDoctor = profile => ({
  _id: profile.userId._id,
  name: profile.userId.name,
  email: profile.userId.email,
  specialisation: profile.specialisation,
  workingHours: profile.workingHours,
  slotDuration: profile.slotDuration,
  leaveDays: profile.leaveDays
});

const getDoctorsForSearch = async (req, res) => {
  const profileQuery = req.query.specialisation
    ? { specialisation: { $regex: req.query.specialisation.trim(), $options: 'i' } }
    : {};
  const profiles = await DoctorProfile.find(profileQuery)
    .populate({ path: 'userId', match: { role: 'doctor', isActive: true }, select: 'name email' })
    .sort({ specialisation: 1 });
  res.json({ success: true, data: profiles.filter(profile => profile.userId).map(serializeDoctor) });
};

const getAvailableSlots = async (req, res) => {
  const { date } = req.query;
  if (!isRealDate(date)) throw new HttpError(400, 'Provide a valid date in YYYY-MM-DD format');

  const profile = await DoctorProfile.findOne({ userId: req.params.id })
    .populate({ path: 'userId', match: { isActive: true } });
  if (!profile?.userId) throw new HttpError(404, 'Doctor not found');
  if (profile.leaveDays.includes(date)) return res.json({ success: true, slots: [], message: 'Doctor is on leave on this date' });

  const [appointments, holds] = await Promise.all([
    Appointment.find({ doctorId: req.params.id, date, active: true }).select('slotTime'),
    SlotHold.find({ doctorId: req.params.id, slotDate: date, expiresAt: { $gt: new Date() } }).select('slotTime')
  ]);
  const unavailable = new Set([...appointments, ...holds].map(item => item.slotTime));
  const slots = generateTimeSlots(profile.workingHours.start, profile.workingHours.end, profile.slotDuration)
    .filter(time => !unavailable.has(time) && new Date(`${date}T${time}:00`) > new Date());

  return res.json({ success: true, slots });
};

const holdSlot = async (req, res) => {
  const { doctorId, date, slotTime } = req.body;
  if (!doctorId || !date || !slotTime) throw new HttpError(400, 'Doctor, date, and slot time are required');

  const profile = await DoctorProfile.findOne({ userId: doctorId }).populate({ path: 'userId', match: { isActive: true } });
  if (!profile?.userId) throw new HttpError(404, 'Doctor not found');
  const slotError = validateBookableSlot(profile, date, slotTime);
  if (slotError) throw new HttpError(400, slotError);

  await SlotHold.deleteOne({ doctorId, slotDate: date, slotTime, expiresAt: { $lte: new Date() } });
  if (await Appointment.exists({ doctorId, date, slotTime, active: true })) throw new HttpError(409, 'This slot is already booked');

  try {
    const hold = await SlotHold.create({
      doctorId,
      slotDate: date,
      slotTime,
      patientId: req.user._id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    await SlotHold.deleteMany({ patientId: req.user._id, _id: { $ne: hold._id } });
    return res.status(201).json({ success: true, message: 'Slot held for 5 minutes', data: hold });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'Another patient just held this slot. Please choose another.');
    throw error;
  }
};

const confirmAppointment = async (req, res) => {
  const { holdId, symptoms } = req.body;
  if (!holdId || !symptoms?.trim()) throw new HttpError(400, 'A valid hold and symptom description are required');
  if (symptoms.trim().length < 5) throw new HttpError(400, 'Please describe the symptoms in a little more detail');

  // Deleting with this query atomically claims the hold, so it cannot be confirmed twice.
  const hold = await SlotHold.findOneAndDelete({ _id: holdId, patientId: req.user._id, expiresAt: { $gt: new Date() } });
  if (!hold) throw new HttpError(410, 'Your 5-minute hold expired. Please choose the slot again.');

  const [doctor, profile] = await Promise.all([
    User.findOne({ _id: hold.doctorId, role: 'doctor', isActive: true }),
    DoctorProfile.findOne({ userId: hold.doctorId })
  ]);
  if (!doctor || !profile) throw new HttpError(404, 'Doctor is no longer available');
  const slotError = validateBookableSlot(profile, hold.slotDate, hold.slotTime);
  if (slotError) throw new HttpError(409, slotError);

  const fallbackSummary = {
    urgency: 'Unknown',
    chiefComplaint: FALLBACK_MESSAGE,
    suggestedQuestions: [],
    rawOutput: FALLBACK_MESSAGE,
    provider: 'none',
    available: false
  };

  let appointment;
  try {
    appointment = await Appointment.create({
      patientId: req.user._id,
      doctorId: doctor._id,
      symptoms: symptoms.trim(),
      aiSymptomSummary: fallbackSummary,
      status: 'HELD',
      active: true,
      date: hold.slotDate,
      slotTime: hold.slotTime
    });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'Another patient just booked this slot. Please choose another.');
    throw error;
  }

  await SlotHold.deleteMany({ doctorId: doctor._id, slotDate: appointment.date, slotTime: appointment.slotTime });

  try {
    appointment.aiSymptomSummary = await withTimeout(analyzeSymptoms(appointment.symptoms), 15000);
  } catch (error) {
    console.warn(`[Booking] AI summary unavailable: ${error.message}`);
    appointment.aiSymptomSummary = fallbackSummary;
  }
  appointment.status = 'CONFIRMED';
  await appointment.save();

  const eventId = await createEvent({
    appointment,
    patient: req.user,
    doctor,
    durationMin: profile.slotDuration
  });
  if (eventId) {
    appointment.googleEventId = eventId;
    await appointment.save();
  }

  await Promise.allSettled([
    sendEmail({
      recipientEmail: req.user.email,
      type: 'CONFIRMATION',
      subject: `Appointment confirmed with Dr. ${doctor.name}`,
      body: `Hi ${req.user.name},\n\nYour appointment is confirmed for ${appointment.date} at ${appointment.slotTime}.\nDoctor: Dr. ${doctor.name}\nReference: ${appointment._id}`,
      appointmentId: appointment._id,
      dedupeKey: `confirmation:patient:${appointment._id}`
    }),
    sendEmail({
      recipientEmail: doctor.email,
      type: 'CONFIRMATION',
      subject: `New appointment with ${req.user.name}`,
      body: `Dr. ${doctor.name},\n\n${req.user.name} booked ${appointment.date} at ${appointment.slotTime}.\nAI urgency: ${appointment.aiSymptomSummary.urgency}\nChief complaint: ${appointment.aiSymptomSummary.chiefComplaint}`,
      appointmentId: appointment._id,
      dedupeKey: `confirmation:doctor:${appointment._id}`
    })
  ]);

  res.status(201).json({ success: true, message: 'Appointment confirmed', data: appointment });
};

const rescheduleAppointment = async (req, res) => {
  const { date, slotTime } = req.body;
  const appointment = await Appointment.findOne({ _id: req.params.id, patientId: req.user._id, active: true });
  if (!appointment) throw new HttpError(404, 'Active appointment not found');
  if (appointment.status !== 'CONFIRMED') throw new HttpError(400, 'Only confirmed appointments can be rescheduled');

  const [doctor, profile] = await Promise.all([
    User.findOne({ _id: appointment.doctorId, isActive: true }),
    DoctorProfile.findOne({ userId: appointment.doctorId })
  ]);
  if (!doctor || !profile) throw new HttpError(404, 'Doctor is no longer available');
  const slotError = validateBookableSlot(profile, date, slotTime);
  if (slotError) throw new HttpError(400, slotError);
  if (await SlotHold.exists({ doctorId: doctor._id, slotDate: date, slotTime, expiresAt: { $gt: new Date() } })) {
    throw new HttpError(409, 'This slot is temporarily held by another patient');
  }

  const oldDate = appointment.date;
  const oldTime = appointment.slotTime;
  appointment.date = date;
  appointment.slotTime = slotTime;
  try {
    await appointment.save();
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'Another patient just booked this slot');
    throw error;
  }

  await updateEvent({ appointment, patient: req.user, doctor, durationMin: profile.slotDuration });
  await Promise.allSettled([
    sendEmail({
      recipientEmail: req.user.email,
      type: 'RESCHEDULE',
      subject: `Appointment rescheduled with Dr. ${doctor.name}`,
      body: `Hi ${req.user.name},\n\nYour appointment moved from ${oldDate} at ${oldTime} to ${date} at ${slotTime}.`,
      appointmentId: appointment._id
    }),
    sendEmail({
      recipientEmail: doctor.email,
      type: 'RESCHEDULE',
      subject: `Appointment rescheduled: ${req.user.name}`,
      body: `${req.user.name}'s appointment moved from ${oldDate} at ${oldTime} to ${date} at ${slotTime}.`,
      appointmentId: appointment._id
    })
  ]);

  res.json({ success: true, message: 'Appointment rescheduled', data: appointment });
};

const cancelAppointment = async (req, res) => {
  const appointment = await Appointment.findOne({ _id: req.params.id, patientId: req.user._id, active: true });
  if (!appointment) throw new HttpError(404, 'Active appointment not found');
  if (appointment.status === 'COMPLETED') throw new HttpError(400, 'A completed appointment cannot be cancelled');

  const doctor = await User.findById(appointment.doctorId);
  appointment.status = 'CANCELLED';
  appointment.active = false;
  appointment.cancellationReason = 'cancelled by patient';
  await appointment.save();
  await deleteEvent(appointment._id);

  if (doctor) await Promise.allSettled([
    sendEmail({
      recipientEmail: req.user.email,
      type: 'CANCELLATION',
      subject: 'Appointment cancelled',
      body: `Hi ${req.user.name},\n\nYour appointment on ${appointment.date} at ${appointment.slotTime} was cancelled.`,
      appointmentId: appointment._id
    }),
    sendEmail({
      recipientEmail: doctor.email,
      type: 'CANCELLATION',
      subject: `Appointment cancelled by ${req.user.name}`,
      body: `${req.user.name} cancelled the appointment on ${appointment.date} at ${appointment.slotTime}.`,
      appointmentId: appointment._id
    })
  ]);

  res.json({ success: true, message: 'Appointment cancelled' });
};

const getPatientAppointments = async (req, res) => {
  const appointments = await Appointment.find({ patientId: req.user._id })
    .populate('doctorId', 'name email')
    .sort({ date: -1, slotTime: -1 })
    .lean();
  const prescriptions = await Prescription.find({ appointmentId: { $in: appointments.map(item => item._id) } }).lean();
  const byAppointment = new Map(prescriptions.map(item => [item.appointmentId.toString(), item]));
  res.json({
    success: true,
    data: appointments.map(item => ({ ...item, prescription: byAppointment.get(item._id.toString()) || null }))
  });
};

module.exports = {
  cancelAppointment,
  confirmAppointment,
  getAvailableSlots,
  getDoctorsForSearch,
  getPatientAppointments,
  holdSlot,
  rescheduleAppointment
};