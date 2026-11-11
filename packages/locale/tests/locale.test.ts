import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/index.ts';

const t = new Date('2026-11-07T11:40:00Z'); // 17:10 in India, Saturday 7 Nov 2026

test('UTC -> IST parts', () => {
  assert.deepEqual(L.toISTParts(t), { year: 2026, month: 11, day: 7, hour: 17, minute: 10, second: 0, weekday: 6 });
  assert.equal(L.toISTParts(new Date('2026-12-31T19:00:00Z')).day, 1); // crosses midnight into 1 Jan
  assert.equal(L.toISTParts(new Date('2026-12-31T19:00:00Z')).year, 2027);
});
test('IST -> UTC round trip and real-date check', () => {
  assert.equal(L.istToUtc(2026, 11, 7, 17, 10).toISOString(), '2026-11-07T11:40:00.000Z');
  assert.equal(L.istToUtc(2026, 1, 1, 0, 0).toISOString(), '2025-12-31T18:30:00.000Z');
  assert.throws(() => L.istToUtc(2026, 2, 31), RangeError);
  assert.throws(() => L.istToUtc(2026, 13, 1), RangeError);
  assert.throws(() => L.istToUtc(2026, 1, 1, 24, 0), RangeError);
});
test('day and month boundaries are in India time, not UTC', () => {
  assert.equal(L.startOfDayIST(t).toISOString(), '2026-11-06T18:30:00.000Z');
  assert.equal(L.startOfDayIST(new Date('2026-11-07T19:00:00Z')).toISOString(), '2026-11-07T18:30:00.000Z'); // 00:30 on the 8th in India
  assert.equal(L.startOfMonthIST(t).toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(L.addDaysIST(t, 1).toISOString(), '2026-11-08T11:40:00.000Z');
  assert.equal(L.addDaysIST(t, -7).toISOString(), '2026-10-31T11:40:00.000Z');
});
test('parseISTDateTime', () => {
  assert.equal(L.parseISTDateTime('2026-11-07 17:10').toISOString(), t.toISOString());
  assert.equal(L.parseISTDateTime('२०२६-११-०७T१७:१०').toISOString(), t.toISOString()); // Hindi digits are accepted
  assert.throws(() => L.parseISTDateTime('7 Nov 2026'));
  assert.throws(() => L.parseISTDateTime('2026-02-30 10:00'));
});
test('dates in three languages', () => {
  assert.equal(L.formatDate(t, 'en', 'short'), '7 Nov 2026');
  assert.equal(L.formatDate(t, 'en', 'long'), '7 November 2026');
  assert.equal(L.formatDate(t, 'en', 'full'), 'Saturday, 7 November 2026');
  assert.equal(L.formatDate(t, 'hi', 'full'), 'शनिवार, 7 नवंबर 2026');
  assert.equal(L.formatDate(t, 'hinglish', 'full'), 'Saturday, 7 November 2026');
});
test('times in three languages', () => {
  assert.equal(L.formatTime(t, 'en'), '5:10 PM');
  assert.equal(L.formatTime(t, 'hi'), 'शाम 5:10 बजे');
  assert.equal(L.formatTime(t, 'hinglish'), 'shaam 5:10 baje');
  assert.equal(L.formatTime(new Date('2026-11-06T18:30:00Z'), 'en'), '12:00 AM');
  assert.equal(L.formatTime(new Date('2026-11-07T06:30:00Z'), 'en'), '12:00 PM');
  assert.equal(L.formatTime(new Date('2026-11-07T06:30:00Z'), 'hi'), 'दोपहर 12:00 बजे');
  assert.equal(L.formatDateTime(t, 'en', 'short'), '7 Nov 2026, 5:10 PM');
});
test('parts of the day and greeting', () => {
  assert.equal(L.greeting(new Date('2026-11-07T04:00:00Z'), 'en'), 'Good morning'); // 09:30
  assert.equal(L.greeting(t, 'hi'), 'शुभ संध्या');
  assert.equal(L.greeting(new Date('2026-11-07T17:00:00Z'), 'hinglish'), 'Shubh ratri'); // 22:30
  assert.deepEqual([3, 4, 11, 12, 15, 16, 19, 20].map(L.dayPart), ['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night']);
});
test('today / tomorrow / yesterday', () => {
  assert.equal(L.relativeDay(t, t, 'en'), 'today');
  assert.equal(L.relativeDay(L.addDaysIST(t, 1), t, 'hi'), 'कल');
  assert.equal(L.relativeDay(L.addDaysIST(t, -1), t, 'hi'), 'बीता कल');
  assert.equal(L.relativeDay(L.addDaysIST(t, 1), t, 'hinglish'), 'kal');
  assert.equal(L.relativeDay(L.addDaysIST(t, 5), t, 'en'), '12 November 2026');
  // late night in UTC is already "tomorrow" in India
  assert.equal(L.relativeDay(new Date('2026-11-07T19:00:00Z'), new Date('2026-11-07T10:00:00Z'), 'en'), 'tomorrow');
});
test('digits and rupees', () => {
  assert.equal(L.toDevanagariDigits('5:10 PM 2026'), '५:१० PM २०२६');
  assert.equal(L.toAsciiDigits('५:१० ₹२५०'), '5:10 ₹250');
  assert.equal(L.formatINR(1234567.5), '₹12,34,567.50');
  assert.equal(L.formatINR(999), '₹999.00');
  assert.equal(L.formatINR(100000, 0), '₹1,00,000');
  assert.equal(L.formatINR(-1500), '-₹1,500.00');
  assert.equal(L.formatINR(0.05, 2), '₹0.05');
});
test('language detection: Hindi, Hinglish, English', () => {
  assert.equal(L.detectLanguage('कल सुबह 6 बजे उठा देना'), 'hi');
  assert.equal(L.detectLanguage('kal subah 6 baje utha dena bhai'), 'hinglish');
  assert.equal(L.detectLanguage('mujhe kal ki meeting dikhao'), 'hinglish');
  assert.equal(L.detectLanguage('Please open YouTube and pause the video'), 'en');
  assert.equal(L.detectLanguage('Open the settings'), 'en');
  assert.equal(L.detectLanguage(''), 'en');
  assert.equal(L.detectLanguage('12345 !!!'), 'en');
  assert.equal(L.detectLanguage('YouTube पर गाना चलाओ'), 'hi'); // mixed: mostly Hindi
});
