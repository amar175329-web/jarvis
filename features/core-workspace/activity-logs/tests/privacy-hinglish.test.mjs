import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateText, redactPrivateText } from '../src/privacy.ts';

test('S05 activity privacy projection catches S08/S09 Hinglish gaps without broad false positives', () => {
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
    assert.equal(isPrivateText(text), true, text);
    assert.equal(redactPrivateText(text), 'Private message hidden', text);
  }
  for (const text of ['report bhejni hai', 'gym jaana']) {
    assert.equal(isPrivateText(text), false, text);
    assert.equal(redactPrivateText(text), text, text);
  }
});
