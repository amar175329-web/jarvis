import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySensitivity } from '../src/sensitivity.mjs';

test('Roman Hindi medicine probes are private and must not be stored in public tables', () => {
  for (const text of [
    'kal 8 baje metformin lena',
    'kal 8 baje goli khani hai',
    'goliyan subah lena',
    'tablet lena',
    'syrup dena',
    'injection lagwana',
    'capsule after dinner',
    'kal ilaaj ke liye jaana',
    'dard ki dawa',
  ]) {
    assert.equal(classifySensitivity(text).sensitive, true, text);
  }
});

test('Devanagari medicine and health phrases are private', () => {
  for (const text of [
    'कल गोली खानी है',
    'दर्द की दवा',
    'सिरप सुबह लेना',
    'इंजेक्शन लगवाना',
    'कैप्सूल लेना',
    'मधुमेह की रिपोर्ट',
    'डॉक्टर को दिखाना',
  ]) {
    assert.equal(classifySensitivity(text).sensitive, true, text);
  }
});

test('common medicine names and health indicators are private', () => {
  for (const text of [
    'metformin', 'paracetamol', 'Crocin', 'Dolo 650', 'insulin', 'ibuprofen',
    'BP check', 'sugar test', 'diabetes follow-up', 'blood pressure report',
    'doctor appointment', 'therapy session', 'hospital visit', 'lab report',
  ]) {
    assert.equal(classifySensitivity(text).sensitive, true, text);
  }
});

test('credentials and bank-account style content fail closed', () => {
  for (const text of [
    'remember my password',
    'OTP 493821',
    'bank account number 123456789012',
    'IFSC HDFC0001234',
    'UPI ID amit@example.com',
    'mera PIN 4821',
    'account details 123456789',
  ]) {
    assert.equal(classifySensitivity(text).sensitive, true, text);
  }
});

test('ambiguous private context is marked sensitive with uncertain confidence', () => {
  const result = classifySensitivity('private note for work');
  assert.equal(result.sensitive, true);
  assert.equal(result.confidence, 'uncertain');
});

test('ordinary reminders stay eligible for public reminder storage', () => {
  for (const text of ['walk', 'buy groceries', 'project review', 'read chapter 4']) {
    assert.equal(classifySensitivity(text).sensitive, false, text);
  }
});

test('P28 additional health terms (Roman + Devanagari) are marked sensitive', () => {
  for (const text of [
    'kal physio session 5 baje',
    'physiotherapy kal 5 baje',
    'dentist appointment tomorrow',
    'periods tracking reminder',
    'saans lene mein dikkat',
    'pump lena hai',
    'inhaler rakh lena',
    'फिजियो सेशन कल',
    'फिजियोथेरेपी कल 5 बजे',
    'डेंटिस्ट के पास जाना है',
    'पीरियड्स डेट नोट',
    'सांस की तकलीफ',
    'साँस का पंप',
    'पंप लेना है',
    'इनहेलर साथ रखना',
  ]) {
    assert.equal(classifySensitivity(text).sensitive, true, text);
    assert.equal(classifySensitivity(text).category, 'health', text);
  }
});

test('financial and family references are blocked from public task/reminder fields', () => {
  for (const phrase of ['salary transfer', 'rent payment', 'meri wife ka appointment', 'papa ko call karna', 'परिवार की बात', 'माँ को फोन']) {
    assert.equal(classifySensitivity(phrase).sensitive, true, phrase);
  }
});

test('Hinglish sensitivity gaps are private and safe everyday phrases stay ordinary', () => {
  for (const text of [
    'khud ko hurt karna hai',
    'main bahut udaas hoon',
    'bank balance kitna hai',
    'dwai leni hai',
    'daava lena hai',
    'davai leni hai',
    'dava lena hai',
    'goli leni hai',
    'dawai leni hai',
  ]) {
    assert.equal(classifySensitivity(text).sensitive, true, text);
  }
  for (const text of ['report bhejni hai', 'gym jaana']) {
    assert.equal(classifySensitivity(text).sensitive, false, text);
  }
});
