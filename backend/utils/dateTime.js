const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMinutes = time => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const isRealDate = value => {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

const localDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const appointmentDateTime = (date, time) => new Date(`${date}T${time}:00`);

const generateTimeSlots = (start, end, duration) => {
  const slots = [];
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  for (let minute = startMinutes; minute + duration <= endMinutes; minute += duration) {
    slots.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  return slots;
};

const validateSchedule = ({ start, end }, duration) => {
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) return 'Working hours must use HH:MM format';
  if (toMinutes(start) >= toMinutes(end)) return 'Working hour end must be after the start';
  if (![15, 20, 30, 45, 60].includes(Number(duration))) return 'Slot duration must be 15, 20, 30, 45, or 60 minutes';
  return null;
};

const validateBookableSlot = (profile, date, slotTime) => {
  if (!isRealDate(date) || !TIME_PATTERN.test(slotTime)) return 'Use a valid date and time';
  if (appointmentDateTime(date, slotTime) <= new Date()) return 'Please choose a future appointment slot';
  if (profile.leaveDays.includes(date)) return 'Doctor is on leave on this date';
  const slots = generateTimeSlots(profile.workingHours.start, profile.workingHours.end, profile.slotDuration);
  if (!slots.includes(slotTime)) return 'This time is outside the doctor’s available schedule';
  return null;
};

module.exports = {
  DATE_PATTERN,
  TIME_PATTERN,
  appointmentDateTime,
  generateTimeSlots,
  isRealDate,
  localDateString,
  validateBookableSlot,
  validateSchedule
};