require('dotenv').config();

if (process.env.USE_LOCAL_JSON_DB === 'true') {
  const mongoosePath = require.resolve('mongoose');
  require.cache[mongoosePath] = {
    id: mongoosePath,
    filename: mongoosePath,
    loaded: true,
    exports: require('./utils/mockMongoose')
  };
}
const mongoose = require('mongoose');
const Appointment = require('./models/Appointment');
const CalendarEvent = require('./models/CalendarEvent');
const DoctorProfile = require('./models/DoctorProfile');
const NotificationLog = require('./models/NotificationLog');
const Prescription = require('./models/Prescription');
const SlotHold = require('./models/SlotHold');
const User = require('./models/User');
const { localDateString } = require('./utils/dateTime');

const shiftedDate = days => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return localDateString(value);
};

const seedData = async () => {
  await Promise.all([
    CalendarEvent.deleteMany({}), NotificationLog.deleteMany({}), Prescription.deleteMany({}),
    SlotHold.deleteMany({}), Appointment.deleteMany({}), DoctorProfile.deleteMany({}), User.deleteMany({})
  ]);

  const [admin, patient, doctor, pediatrician, dermatologist] = await User.create([
    { name: 'Clinic Administrator', email: 'admin@careflow.demo', password: 'Admin123!', role: 'admin' },
    { name: 'Aarav Sharma', email: 'patient@careflow.demo', password: 'Patient123!', role: 'patient' },
    { name: 'Sarah Jenkins', email: 'doctor@careflow.demo', password: 'Doctor123!', role: 'doctor' },
    { name: 'Michael Chen', email: 'pediatrician@careflow.demo', password: 'Doctor123!', role: 'doctor' },
    { name: 'Priya Nair', email: 'dermatologist@careflow.demo', password: 'Doctor123!', role: 'doctor' }
  ]);

  await DoctorProfile.create([
    { userId: doctor._id, specialisation: 'Cardiology', workingHours: { start: '09:00', end: '17:00' }, slotDuration: 30 },
    { userId: pediatrician._id, specialisation: 'Pediatrics', workingHours: { start: '10:00', end: '16:00' }, slotDuration: 30 },
    { userId: dermatologist._id, specialisation: 'Dermatology', workingHours: { start: '08:00', end: '14:00' }, slotDuration: 20 }
  ]);

  const upcoming = await Appointment.create({
    patientId: patient._id, doctorId: doctor._id, symptoms: 'Occasional palpitations and tiredness for three days.',
    aiSymptomSummary: { urgency: 'Medium', chiefComplaint: 'Intermittent palpitations with fatigue', suggestedQuestions: ['Could this be stress-related?', 'Do I need an ECG?', 'Which warning signs need urgent care?'], provider: 'seed', available: true },
    status: 'CONFIRMED', active: true, date: shiftedDate(2), slotTime: '10:00'
  });
  const completed = await Appointment.create({
    patientId: patient._id, doctorId: dermatologist._id, symptoms: 'Dry itchy rash on both arms.',
    aiSymptomSummary: { urgency: 'Low', chiefComplaint: 'Itchy rash on both arms', suggestedQuestions: [], provider: 'seed', available: true },
    status: 'COMPLETED', active: true, date: shiftedDate(-5), slotTime: '09:00',
    postVisitNotes: 'Mild contact dermatitis. Avoid scented products and keep skin moisturised.',
    aiPostVisitSummary: { text: 'You have a mild skin irritation. Avoid scented products, moisturise twice daily, and return if the rash spreads or becomes painful.', provider: 'seed', available: true }
  });
  await Prescription.create({
    appointmentId: completed._id, patientId: patient._id, doctorId: dermatologist._id,
    medicines: [{ name: 'Hydrocortisone cream', dosage: 'Apply a thin layer', frequency: 'Twice daily', duration: '5 days' }]
  });

  return { admin, patient, doctor, upcoming };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/careflow');
  await seedData();
  console.log('Demo data created. Accounts are listed in README.md.');
  await mongoose.disconnect();
};

if (require.main === module) run().catch(error => { console.error(error); process.exit(1); });
module.exports = { seedData };