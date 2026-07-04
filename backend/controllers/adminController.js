const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const SlotHold = require('../models/SlotHold');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const { deleteEvent } = require('../services/googleCalendarService');
const { HttpError } = require('../utils/http');
const { isRealDate, localDateString, validateSchedule } = require('../utils/dateTime');

const doctorView = profile => ({
  _id: profile.userId._id,
  name: profile.userId.name,
  email: profile.userId.email,
  role: profile.userId.role,
  profile: {
    _id: profile._id,
    specialisation: profile.specialisation,
    workingHours: profile.workingHours,
    slotDuration: profile.slotDuration,
    leaveDays: profile.leaveDays
  }
});

const getDoctors = async (_req, res) => {
  const profiles = await DoctorProfile.find()
    .populate({ path: 'userId', match: { role: 'doctor', isActive: true }, select: 'name email role' })
    .sort({ specialisation: 1 });
  res.json({ success: true, data: profiles.filter(profile => profile.userId).map(doctorView) });
};

const createDoctor = async (req, res) => {
  const { name, email, password, specialisation, workingHours = { start: '09:00', end: '17:00' }, slotDuration = 30 } = req.body;
  if (!name?.trim() || !email?.trim() || !password || !specialisation?.trim()) {
    throw new HttpError(400, 'Name, email, password, and specialisation are required');
  }
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  const scheduleError = validateSchedule(workingHours, Number(slotDuration));
  if (scheduleError) throw new HttpError(400, scheduleError);

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) throw new HttpError(409, 'An account already exists with this email');

  const user = await User.create({ name: name.trim(), email: normalizedEmail, password, role: 'doctor' });
  try {
    const profile = await DoctorProfile.create({
      userId: user._id,
      specialisation: specialisation.trim(),
      workingHours,
      slotDuration: Number(slotDuration)
    });
    await profile.populate('userId', 'name email role');
    return res.status(201).json({ success: true, data: doctorView(profile) });
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }
};

const updateDoctor = async (req, res) => {
  const { name, email, specialisation, workingHours, slotDuration } = req.body;
  const user = await User.findOne({ _id: req.params.id, role: 'doctor', isActive: true });
  const profile = await DoctorProfile.findOne({ userId: req.params.id });
  if (!user || !profile) throw new HttpError(404, 'Doctor not found');

  const schedule = workingHours || profile.workingHours;
  const duration = Number(slotDuration || profile.slotDuration);
  const scheduleError = validateSchedule(schedule, duration);
  if (scheduleError) throw new HttpError(400, scheduleError);

  if (email && email.trim().toLowerCase() !== user.email) {
    if (await User.exists({ email: email.trim().toLowerCase(), _id: { $ne: user._id } })) {
      throw new HttpError(409, 'An account already exists with this email');
    }
    user.email = email.trim().toLowerCase();
  }
  if (name?.trim()) user.name = name.trim();
  await user.save();

  if (specialisation?.trim()) profile.specialisation = specialisation.trim();
  profile.workingHours = schedule;
  profile.slotDuration = duration;
  await profile.save();

  res.json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profile: {
        _id: profile._id,
        specialisation: profile.specialisation,
        workingHours: profile.workingHours,
        slotDuration: profile.slotDuration,
        leaveDays: profile.leaveDays
      }
    }
  });
};

const notifyCancelledAppointment = async (appointment, doctor, type, reason) => {
  const patient = appointment.patientId;
  if (!patient) return;
  await Promise.allSettled([
    deleteEvent(appointment._id),
    sendEmail({
      recipientEmail: patient.email,
      type,
      subject: `Appointment change with Dr. ${doctor.name}`,
      body: `Hi ${patient.name},\n\nYour appointment with Dr. ${doctor.name} on ${appointment.date} at ${appointment.slotTime} was cancelled because ${reason}.\n\nPlease sign in to choose another available time.`,
      appointmentId: appointment._id,
      dedupeKey: `${type.toLowerCase()}:${appointment._id}:${appointment.date}`
    })
  ]);
};

const deleteDoctor = async (req, res) => {
  const doctor = await User.findOne({ _id: req.params.id, role: 'doctor', isActive: true });
  if (!doctor) throw new HttpError(404, 'Doctor not found');

  const appointments = await Appointment.find({ doctorId: doctor._id, active: true }).populate('patientId', 'name email');
  await Appointment.updateMany(
    { doctorId: doctor._id, active: true },
    { $set: { status: 'CANCELLED', active: false, cancellationReason: 'doctor profile was removed' } }
  );
  await SlotHold.deleteMany({ doctorId: doctor._id });
  await DoctorProfile.deleteOne({ userId: doctor._id });
  doctor.isActive = false;
  await doctor.save();

  await Promise.allSettled(appointments.map(appointment =>
    notifyCancelledAppointment(appointment, doctor, 'CANCELLATION', 'the doctor is no longer available')
  ));

  res.json({ success: true, message: `Doctor removed. ${appointments.length} active appointment(s) were cancelled.` });
};

const markDoctorLeave = async (req, res) => {
  const { date } = req.body;
  if (!isRealDate(date) || date < localDateString()) throw new HttpError(400, 'Choose a valid current or future leave date');

  const doctor = await User.findOne({ _id: req.params.id, role: 'doctor', isActive: true });
  const profile = await DoctorProfile.findOne({ userId: req.params.id });
  if (!doctor || !profile) throw new HttpError(404, 'Doctor not found');

  if (!profile.leaveDays.includes(date)) {
    profile.leaveDays.push(date);
    profile.leaveDays.sort();
    await profile.save();
  }

  const appointments = await Appointment.find({ doctorId: doctor._id, date, active: true }).populate('patientId', 'name email');
  await Appointment.updateMany(
    { doctorId: doctor._id, date, active: true },
    { $set: { status: 'CANCELLED', active: false, cancellationReason: 'doctor leave' } }
  );
  await SlotHold.deleteMany({ doctorId: doctor._id, slotDate: date });

  await Promise.allSettled(appointments.map(appointment =>
    notifyCancelledAppointment(appointment, doctor, 'LEAVE_NOTICE', 'the doctor is on leave')
  ));

  res.json({
    success: true,
    message: `Leave marked for ${date}. ${appointments.length} affected patient(s) were notified.`,
    leaveDays: profile.leaveDays
  });
};

module.exports = { createDoctor, deleteDoctor, getDoctors, markDoctorLeave, updateDoctor };