const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTimeSlots, isRealDate, validateSchedule } = require('../utils/dateTime');

test('generates complete slots without crossing closing time', () => {
  assert.deepEqual(generateTimeSlots('09:00', '10:00', 30), ['09:00', '09:30']);
});

test('rejects impossible dates and invalid schedules', () => {
  assert.equal(isRealDate('2026-02-30'), false);
  assert.match(validateSchedule({ start: '17:00', end: '09:00' }, 30), /after/);
});