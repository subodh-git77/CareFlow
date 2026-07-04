const { google } = require('googleapis');
const CalendarEvent = require('../models/CalendarEvent');

const calendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary';
const calendarTimeZone = () => process.env.APP_TIMEZONE || 'Asia/Kolkata';

const getOAuthClient = () => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) return null;
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  if (process.env.GOOGLE_REFRESH_TOKEN) client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
};

const isConfigured = () => Boolean(process.env.GOOGLE_CALENDAR_ENABLED === 'true' && getOAuthClient() && process.env.GOOGLE_REFRESH_TOKEN);

const localDateTime = (date, time) => `${date}T${time}:00`;

const addMinutes = (date, time, duration) => {
  const [hours, minutes] = time.split(':').map(Number);
  const value = new Date(`${date}T00:00:00`);
  value.setMinutes(hours * 60 + minutes + duration);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hour = String(value.getHours()).padStart(2, '0');
  const minute = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
};

const eventResource = ({ appointment, patient, doctor, durationMin }) => ({
  summary: `CareFlow appointment with Dr. ${doctor.name}`,
  description: `Patient: ${patient.name}\nAppointment reference: ${appointment._id}`,
  start: { dateTime: localDateTime(appointment.date, appointment.slotTime), timeZone: calendarTimeZone() },
  end: { dateTime: addMinutes(appointment.date, appointment.slotTime, durationMin), timeZone: calendarTimeZone() },
  attendees: [{ email: patient.email }, { email: doctor.email }],
  reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 1440 }, { method: 'popup', minutes: 30 }] }
});

const createEvent = async ({ appointment, patient, doctor, durationMin = 30 }) => {
  if (!isConfigured()) {
    const providerEventId = `mock-${appointment._id}`;
    await CalendarEvent.findOneAndUpdate(
      { appointmentId: appointment._id },
      { provider: 'MOCK', providerEventId, calendarId: calendarId(), status: 'CREATED', lastError: '' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return providerEventId;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: getOAuthClient() });
    const response = await calendar.events.insert({
      calendarId: calendarId(),
      requestBody: eventResource({ appointment, patient, doctor, durationMin }),
      sendUpdates: 'all'
    });
    await CalendarEvent.findOneAndUpdate(
      { appointmentId: appointment._id },
      { provider: 'GOOGLE', providerEventId: response.data.id, calendarId: calendarId(), status: 'CREATED', lastError: '' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return response.data.id;
  } catch (error) {
    await CalendarEvent.findOneAndUpdate(
      { appointmentId: appointment._id },
      { provider: 'GOOGLE', providerEventId: `failed-${appointment._id}`, calendarId: calendarId(), status: 'FAILED', lastError: error.message },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.warn(`[Calendar] Create failed: ${error.message}`);
    return '';
  }
};

const updateEvent = async ({ appointment, patient, doctor, durationMin = 30 }) => {
  const stored = await CalendarEvent.findOne({ appointmentId: appointment._id });
  if (!stored) return createEvent({ appointment, patient, doctor, durationMin });
  if (stored.provider === 'MOCK' || !isConfigured()) {
    stored.status = 'UPDATED';
    await stored.save();
    return true;
  }
  try {
    const calendar = google.calendar({ version: 'v3', auth: getOAuthClient() });
    await calendar.events.update({
      calendarId: stored.calendarId,
      eventId: stored.providerEventId,
      requestBody: eventResource({ appointment, patient, doctor, durationMin }),
      sendUpdates: 'all'
    });
    stored.status = 'UPDATED';
    stored.lastError = '';
    await stored.save();
    return true;
  } catch (error) {
    stored.status = 'FAILED';
    stored.lastError = error.message;
    await stored.save();
    console.warn(`[Calendar] Update failed: ${error.message}`);
    return false;
  }
};

const deleteEvent = async appointmentId => {
  const stored = await CalendarEvent.findOne({ appointmentId });
  if (!stored || stored.status === 'DELETED') return true;
  if (stored.provider === 'MOCK' || !isConfigured()) {
    stored.status = 'DELETED';
    await stored.save();
    return true;
  }
  try {
    const calendar = google.calendar({ version: 'v3', auth: getOAuthClient() });
    await calendar.events.delete({ calendarId: stored.calendarId, eventId: stored.providerEventId, sendUpdates: 'all' });
    stored.status = 'DELETED';
    stored.lastError = '';
    await stored.save();
    return true;
  } catch (error) {
    stored.status = 'FAILED';
    stored.lastError = error.message;
    await stored.save();
    console.warn(`[Calendar] Delete failed: ${error.message}`);
    return false;
  }
};

const getAuthorizationUrl = state => {
  const client = getOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state
  });
};

const exchangeCode = async code => {
  const client = getOAuthClient();
  if (!client) throw new Error('Google OAuth credentials are not configured');
  const { tokens } = await client.getToken(code);
  return tokens;
};

module.exports = { createEvent, deleteEvent, exchangeCode, getAuthorizationUrl, isConfigured, updateEvent };