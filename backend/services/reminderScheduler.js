const NotificationLog = require('../models/NotificationLog');

const durationInDays = value => {
  const number = Math.max(1, Number(String(value).match(/\d+/)?.[0] || 1));
  const text = String(value).toLowerCase();
  if (text.includes('week')) return Math.min(number * 7, 90);
  if (text.includes('month')) return Math.min(number * 30, 90);
  return Math.min(number, 90);
};

const reminderHours = frequency => {
  const text = frequency.toLowerCase();
  if (text.includes('four') || text.includes('4 times') || text.includes('6 hour')) return [6, 12, 18, 23];
  if (text.includes('three') || text.includes('thrice') || text.includes('3 times') || text.includes('8 hour')) return [8, 14, 20];
  if (text.includes('twice') || text.includes('2 times') || text.includes('12 hour')) return [9, 21];
  return [9];
};

const scheduleMedicationReminders = async (prescription, patient, doctor) => {
  await NotificationLog.deleteMany({
    prescriptionId: prescription._id,
    type: 'MED_REMINDER',
    status: { $in: ['PENDING', 'RETRYING'] }
  });

  const now = new Date();
  const reminders = [];

  prescription.medicines.forEach((medicine, medicineIndex) => {
    const days = durationInDays(medicine.duration);
    for (let day = 0; day < days; day += 1) {
      for (const hour of reminderHours(medicine.frequency)) {
        const sendAt = new Date();
        sendAt.setDate(sendAt.getDate() + day);
        sendAt.setHours(hour, 0, 0, 0);
        if (sendAt <= now) continue;

        reminders.push({
          recipientEmail: patient.email,
          type: 'MED_REMINDER',
          status: 'PENDING',
          subject: `Medication reminder: ${medicine.name}`,
          body: `Hi ${patient.name},\n\nIt is time to take ${medicine.name}.\nDosage: ${medicine.dosage}\nFrequency: ${medicine.frequency}\nDuration: ${medicine.duration}\nPrescribed by: Dr. ${doctor.name}\n\nFollow your doctor’s instructions and contact the clinic if you have concerns.`,
          sendAt,
          nextAttemptAt: sendAt,
          prescriptionId: prescription._id,
          appointmentId: prescription.appointmentId,
          dedupeKey: `med:${prescription._id}:${prescription.updatedAt.getTime()}:${medicineIndex}:${sendAt.toISOString()}`
        });
      }
    }
  });

  if (reminders.length) await NotificationLog.insertMany(reminders, { ordered: false });
  return reminders.length;
};

module.exports = { scheduleMedicationReminders };