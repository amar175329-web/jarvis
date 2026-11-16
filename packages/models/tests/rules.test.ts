import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractByRules,
  detectSelfCorrection,
  cleanTask,
  checkMismatch,
  extractHybrid,
  isCanonicalTimeMatch,
} from '../local/rules.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cases20Path = path.resolve(__dirname, '../local/eval/cases.json');
const cases15Path = path.resolve(__dirname, '../local/eval/messy_cases.json');

const cases20 = JSON.parse(fs.readFileSync(cases20Path, 'utf8'));
const cases15 = JSON.parse(fs.readFileSync(cases15Path, 'utf8'));

test('extractByRules: extracts all 20 standard benchmark cases with high confidence', () => {
  let passedCount = 0;
  for (const c of cases20) {
    const res = extractByRules(c.text);
    assert.equal(res.success, true, `Expected success for case ${c.id}: ${c.text}`);
    assert.equal(res.confidence, 'high', `Expected high confidence for clean case ${c.id}`);
    assert.ok(res.काम, `Expected task for case ${c.id}`);
    assert.ok(res.समय, `Expected time for case ${c.id}`);
    passedCount++;
  }
  assert.equal(passedCount, 20);
});

test('detectSelfCorrection: detects Hindi correction keywords ("नहीं", "नहीं नहीं", "मतलब", "रुको")', () => {
  assert.equal(detectSelfCorrection('आज दोपहर नहीं शाम को 4 बजे क्लाइंट के साथ मीटिंग है').hasCorrection, true);
  assert.equal(detectSelfCorrection('नहीं नहीं कल सुबह आठ बजे डॉक्टर के पास जाना है').hasCorrection, true);
  assert.equal(detectSelfCorrection('सोमवार मतलब मंगलवार को 11 बजे कॉल है').hasCorrection, true);
  assert.equal(detectSelfCorrection('रुको 5 बजे चाय पीनी है').hasCorrection, true);
});

test('detectSelfCorrection: detects Roman / Hinglish correction keywords ("actually", "sorry", "ruko", "matlab", "nahi")', () => {
  assert.equal(detectSelfCorrection('actually kal subah 9 baje meeting attend karni hai').hasCorrection, true);
  assert.equal(detectSelfCorrection('sorry shaam 6 baje aana').hasCorrection, true);
  assert.equal(detectSelfCorrection('nahi aaj raat 9 baje call karna').hasCorrection, true);
  assert.equal(detectSelfCorrection('ruko dopahar 2 baje chalte hain').hasCorrection, true);
  assert.equal(detectSelfCorrection('parso matlab kal aana').hasCorrection, true);
});

test('detectSelfCorrection: does not falsely trigger on "मत भूलना" in clean reminders', () => {
  const res = detectSelfCorrection('रात को दस बजे खांसी का सिरप पीना मत भूलना');
  assert.equal(res.hasCorrection, false);
});

test('detectSelfCorrection: detects time-changing repetitions (multiple days, multiple dayparts, multiple hours)', () => {
  // Multiple days
  assert.equal(detectSelfCorrection('कल परसों नहीं कल दोपहर 2 बजे वो वाईफाई का बिल भर देना').hasCorrection, true);
  // Multiple dayparts
  assert.equal(detectSelfCorrection('दोपहर नहीं शाम 4 बजे मीटिंग है').hasCorrection, true);
  // Multiple hours
  assert.equal(detectSelfCorrection('3 बजे नहीं 4 बजे आना').hasCorrection, true);
});

test('extractByRules: sets confidence="partial" and hasCorrection=true when correction is in sentence', () => {
  const res1 = extractByRules('आज दोपहर नहीं शाम को 4 बजे क्लाइंट के साथ अर्जेंट मीटिंग है');
  assert.equal(res1.hasCorrection, true);
  assert.notEqual(res1.confidence, 'high'); // Must not be high!
  assert.equal(res1.confidence, 'partial');

  const res2 = extractByRules('कल परसों नहीं कल दोपहर 2 बजे वो वाईफाई का बिल भर देना');
  assert.equal(res2.hasCorrection, true);
  assert.equal(res2.confidence, 'partial');
});

test('extractByRules: evaluates 15 messy voice cases and identifies corrections correctly', () => {
  let correctionCount = 0;
  for (const c of cases15) {
    const res = extractByRules(c.text);
    assert.equal(res.success, true);
    if (res.hasCorrection) {
      correctionCount++;
    }
  }
  // Case 2 ("दोपहर नहीं शाम") and Case 4 ("कल परसों नहीं कल") have explicit self-corrections
  assert.ok(correctionCount >= 2, `Expected at least 2 self-corrections detected, got ${correctionCount}`);
});

test('checkMismatch: fails when extracted time contains tokens not in input', () => {
  const input = 'आज दोपहर 2 बजे क्लाइंट के साथ मीटिंग है';
  // 270M hallucinated "रात्र" when input only had "दोपहर"
  const badTime = { काम: 'क्लाइंट के साथ मीटिंग है', समय: 'आज रात्र में 2:00 बजे' };
  const check = checkMismatch(input, badTime);
  assert.equal(check.ok, false);
  assert.ok(check.reason.includes('fabricated token'));
});

test('checkMismatch: fails when extracted task contains fabricated content not in input', () => {
  const input = 'शाम को ब्लड प्रेशर की दवा लेनी है';
  // 270M hallucinated "रैकेट 9:00"
  const badTask = { काम: 'रैकेट 9:00', समय: 'शाम' };
  const check = checkMismatch(input, badTask);
  assert.equal(check.ok, false);
  assert.ok(check.reason.includes('fabricated tokens'));
});

test('checkMismatch: passes when extracted task and time match input text', () => {
  const input = 'कल सुबह आठ बजे दवाई लेनी है';
  const good = { काम: 'दवाई लेनी है', समय: 'कल सुबह 8:00 बजे' };
  const check = checkMismatch(input, good);
  assert.equal(check.ok, true);
});

test('extractHybrid: fast path uses rules when confidence is high and no correction', async () => {
  const res = await extractHybrid('कल सुबह आठ बजे दवाई लेनी है');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.method, 'rules');
    assert.equal(res.confidence, 'high');
    assert.equal(res.data.समय, 'कल सुबह 8:00 बजे');
  }
});

test('extractHybrid: discards response and asks "समझ नहीं आया, दोबारा बोलिए" when model fails mismatch check', async () => {
  // Input has correction -> calls mock model which returns hallucinated time
  const mockHallucinatingModel = async () => ({
    ok: true,
    data: { काम: 'मीटिंग है', समय: 'आज रात्र में 2:00 बजे' },
  });

  const res = await extractHybrid('दोपहर नहीं शाम 4 बजे मीटिंग है', mockHallucinatingModel);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.clarificationNeeded, true);
    assert.equal(res.message, 'समझ नहीं आया, दोबारा बोलिए');
    assert.ok(res.reason.includes('mismatch_check_failed'));
  }
});

test('extractHybrid: asks "समझ नहीं आया, दोबारा बोलिए" when self-correction causes discrepancy between rules and model', async () => {
  // Rules sees "आज दोपहर 4:00 बजे", model sees "आज शाम 4:00 बजे" -> discrepancy!
  const mockModel = async () => ({
    ok: true,
    data: { काम: 'क्लाइंट के साथ मीटिंग है', समय: 'आज शाम 4:00 बजे' },
  });

  const res = await extractHybrid('आज दोपहर नहीं शाम को 4 बजे क्लाइंट के साथ अर्जेंट मीटिंग है', mockModel);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.clarificationNeeded, true);
    assert.equal(res.message, 'समझ नहीं आया, दोबारा बोलिए');
    assert.ok(res.reason.includes('correction_discrepancy'));
  }
});

test('isCanonicalTimeMatch: accurately matches normalized time components across scripts', () => {
  assert.equal(isCanonicalTimeMatch('कल सुबह 8:00 बजे', 'कल सुबह 8:00 बजे'), true);
  assert.equal(isCanonicalTimeMatch('kal subah 8:00 baje', 'कल सुबह 8:00 बजे'), true);
  assert.equal(isCanonicalTimeMatch('आज दोपहर 4:00 बजे', 'आज शाम 4:00 बजे'), false);
  assert.equal(isCanonicalTimeMatch('परसों दोपहर 2:00 बजे', 'कल दोपहर 2:00 बजे'), false);
});

test('cleanTask: removes conversational fillers (अरे, सुनो, यार, भाई, वो, जरा, arre, bhai, sun, na वगैरह) and stutters', () => {
  assert.equal(cleanTask('अरे सुनो कल वो थायरॉइड की गोली खानी है'), 'थायरॉइड की गोली खानी है');
  assert.equal(cleanTask('यार को जरा शर्मा जी को फोन मिलाना है'), 'शर्मा जी को फोन मिलाना है');
  assert.equal(cleanTask('... सुबह स्टेशन... स्टेशन पहुंचना है भाई'), 'स्टेशन पहुंचना है');
  assert.equal(cleanTask('arre bhai na insulin lena hai'), 'insulin lena hai');
  assert.equal(cleanTask('sun rahul ko call karke bolna'), 'rahul ko call karke bolna');
  assert.equal(cleanTask('flight ke liye nikalna padega boss'), 'flight ke liye nikalna padega');
});
