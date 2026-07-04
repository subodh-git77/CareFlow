const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const NotificationLog = require('../models/NotificationLog');
const SlotHold = require('../models/SlotHold');
const { appointmentDateTime, localDateString } = require('../utils/dateTime');
const { attemptSend, sendEmail } = require('./emailService');

let jobs = [];

const processNotifications = async () => {
  const logs = await NotificationLog.find({
    status: { $in: ['PENDING', 'RETRYING'] },
    nextAttemptAt: { $lte: new Date() }
  }).sort({ nextAttemptAt: 1 }).limit(50);

  for (const log of logs) await attemptSend(log);
};

const createAppointmentReminders = async () => {
  const today = new Date();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const appointments = await Appointment.find({
    date: { $in: [localDateString(today), localDateString(tomorrow)] },
    status: 'CONFIRMED',
    active: true
  }).populate('patientId doctorId');

  for (const appointment of appointments) {
    if (!appointment.patientId || !appointment.doctorId) continue;
    const hoursAway = (appointmentDateTime(appointment.date, appointment.slotTime) - Date.now()) / 3600000;
    if (hoursAway <= 0 || hoursAway > 24.5) continue;
    await sendEmail({
      recipientEmail: appointment.patientId.email,
      type: 'REMINDER',
      subject: `Appointment reminder with Dr. ${appointment.doctorId.name}`,
      body: `Hi ${appointment.patientId.name},\n\nYour appointment with Dr. ${appointment.doctorId.name} is on ${appointment.date} at ${appointment.slotTime}.\n\nReference: ${appointment._id}`,
      appointmentId: appointment._id,
      dedupeKey: `appointment-reminder:${appointment._id}:${appointment.date}`
    });
  }
};

const initCronJobs = () => {
  if (jobs.length) return jobs;
  console.log('[Cron] Starting slot cleanup, notification delivery, and appointment reminders.');

  jobs = [
    cron.schedule('* * * * *', async () => {
      try {
        await SlotHold.deleteMany({ expiresAt: { $lte: new Date() } });
        await Appointment.updateMany(
          { status: 'HELD', createdAt: { $lte: new Date(Date.now() - 10 * 60 * 1000) } },
          { $set: { status: 'CANCELLED', active: false, cancellationReason: 'confirmation interrupted' } }
        );
      }
      catch (error) { console.warn(`[Cron] Slot cleanup failed: ${error.message}`); }
    }),
    cron.schedule('* * * * *', async () => {
      try { await processNotifications(); }
      catch (error) { console.warn(`[Cron] Notification processing failed: ${error.message}`); }
    }),
    cron.schedule('*/30 * * * *', async () => {
      try { await createAppointmentReminders(); }
      catch (error) { console.warn(`[Cron] Appointment reminder scan failed: ${error.message}`); }
    })
  ];
  return jobs;
};

const stopCronJobs = () => {
  jobs.forEach(job => job.stop());
  jobs = [];
};

module.exports = { createAppointmentReminders, initCronJobs, processNotifications, stopCronJobs };