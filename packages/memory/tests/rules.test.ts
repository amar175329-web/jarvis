import test from 'node:test'; import assert from 'node:assert/strict';
import { findSecrets, redactText, luhn, verhoeff } from '../src/redact.ts';
import { classify, sensitiveTags, purposeAllowsSensitive } from '../src/classify.ts';
import { decide, type Candidate } from '../src/policy.ts';
const now = new Date('2026-11-10T00:00:00Z'); const ctx = { kill: 'off' as const, now };
const d = (c: Partial<Candidate> & { text: string }) => decide({ origin: 'chat', actor: 'jarvis', ...c }, ctx);

test('checksums', () => { assert.ok(luhn('4111111111111111')); assert.ok(!luhn('4111111111111112')); assert.ok(verhoeff('2363')); assert.ok(!verhoeff('2364')); });
for (const [t, k] of [['Mera OTP 482913 hai', 'otp'], ['card 4111 1111 1111 1111', 'card'], ['cvv 123', 'cvv'], ['mera password hunter2 hai', 'password'], ['aadhaar 2345 6789 0123', 'gov_id'], ['ABCPD1234E meri PAN', 'gov_id'], ['account number 123456789012', 'bank_account'], ['upi pin 4821', 'upi_pin'], ['key ' + 'sk' + '-ant-' + 'abcdefghijk12345', 'api_key']] as const)
  test('NEVER secret: ' + t, () => { assert.ok(findSecrets(t).some((f) => f.kind === k)); assert.equal(d({ text: t, explicit: true, confirmed: { channel: 'app_tap' } }).verdict, 'refuse'); });
for (const t of ['Mujhe subah chai pasand hai', 'password manager use karta hoon', 'pin code 560001 hai', 'Rahul meri team mein hai', 'id 3f2b8c1e-1234-4abc-9def-1234567890ab']) test('no false alarm: ' + t, () => assert.equal(findSecrets(t).length, 0));
test('redact text', () => assert.equal(redactText('mera OTP 482913 hai'), 'mera [hata diya] hai'));

test('money numbers are T2 and immediately private when Amit says them', () => { for (const t of ['meri salary 80000 hai', 'Jarvis ka budget ₹5000 hai', 'rent 15000 hai']) { const v = d({ text: t }); assert.equal(v.verdict, 'save'); assert.equal(v.tier, 'sensitive'); assert.equal(v.private, true); assert.ok(v.tags.includes('money')); } });
test('health, weight, workout and medicine are T2', () => { for (const t of ['Mujhe diabetes hai', 'wazan 72 kg hai', 'kal 5 workout kiye', 'dawai 8 baje']) { const v = d({ text: t }); assert.equal(v.verdict, 'save', t); assert.equal(v.tier, 'sensitive', t); assert.equal(v.private, true, t); } });
test('family facts and family health details are T2', () => { for (const t of ['meri maa ko BP hai', 'mere papa ki dawai 8 baje hai', 'Rahul meri family mein hai']) { const v = d({ text: t }); assert.equal(v.verdict, 'save', t); assert.equal(v.tier, 'sensitive', t); assert.ok(v.tags.includes('family')); } });
test('a child/dependent fact can be T2, but photo and school address remain refused by current 014', () => {
  const fact = d({ text: 'mera beta Aryan 7 saal ka hai', explicit: true }); assert.equal(fact.verdict, 'save'); assert.equal(fact.tier, 'sensitive');
  for (const t of ['mera beta ki photo', 'mera beta ka school address 12 Park Road']) { const v = d({ text: t, explicit: true }); assert.equal(v.verdict, 'refuse'); assert.ok(v.reasons.includes('child_photo_or_school')); }
});
test('PAN label alone is T3 refusal with vault route, even without pasted number', () => { const t = 'PAN number ye hai'; assert.ok(findSecrets(t).some((f) => f.kind === 'gov_id')); const v = d({ text: t, explicit: true }); assert.equal(v.verdict, 'refuse'); assert.match(v.userMessage, /Vault/); assert.match(v.userMessage, /\{\{secret:naam\}\}/); });
test('self-harm and abuse always carry care; save only a generic short summary on explicit remember', () => {
  for (const [t, care] of [['mujhe jeene ka mann nahi hai', 'self_harm'], ['usne mujhe dhamki di thi aur maar peet ki', 'abuse']] as const) {
    const no = d({ text: t }); assert.equal(no.verdict, 'skip'); assert.equal(no.care, care);
    const yes = d({ text: t, explicit: true }); assert.equal(yes.verdict, 'save'); assert.equal(yes.tier, 'sensitive'); assert.equal(yes.care, care); assert.ok(!/method|plan|kaise|tareeka|overdose|cut myself/i.test(yes.body)); assert.ok(yes.body.length < 150);
  }
});
test('temporary emotion skipped; deep or recurring emotion is T2', () => {
  assert.equal(d({ text: 'Aaj mood kharab hai' }).verdict, 'skip');
  const deep = d({ text: 'Main kai mahino se andar se pareshan hoon' }); assert.equal(deep.verdict, 'save'); assert.equal(deep.tier, 'sensitive'); assert.ok(deep.tags.includes('emotion'));
});
test('purpose tags limit T2 to requested work', () => {
  const workout = sensitiveTags('wazan 72 kg hai'); const medicine = sensitiveTags('dawai 8 baje'); const money = sensitiveTags('salary 80000 hai');
  assert.equal(purposeAllowsSensitive(workout, 'plan_workout'), true);
  assert.equal(purposeAllowsSensitive(medicine, 'plan_workout'), false);
  assert.equal(purposeAllowsSensitive(medicine, 'medicine_reminder'), true);
  assert.equal(purposeAllowsSensitive(money, 'budget'), true);
  assert.equal(purposeAllowsSensitive(money, 'medicine_reminder'), false);
});
for (const t of ['Rahul doctor hai', 'EMI ki tarikh 5 hai', 'meri behen 25 saal ki hai', '5 saal pehle Delhi tha', 'API abuse protection add karni hai', 'project 2026 mein khatam']) test('allowed T1: ' + t, () => assert.equal(d({ text: t }).verdict, 'save'));
test('outside text is never a memory', () => { for (const o of ['web', 'screen', 'message', 'tool', 'file'] as const) assert.equal(d({ text: 'Amit ko chai pasand hai', origin: o }).reasons[0], 'untrusted_origin'); });
test('kill switch on/unreadable stops JARVIS writes but not Amit\'s own', () => { for (const kill of ['on', 'unreadable'] as const) { assert.equal(decide({ text: 'chai pasand', origin: 'chat', actor: 'jarvis' }, { kill, now }).verdict, 'refuse'); assert.equal(decide({ text: 'chai pasand', origin: 'ui', actor: 'amit_ui' }, { kill, now }).verdict, 'save'); } });
test('inferred T2 asks first, 90 day expiry, confidence <= 0.7', () => { const a = d({ text: 'Amit raat ko workout karta hai', source: 'inferred', confidence: 0.95 }); assert.equal(a.verdict, 'ask'); const s = d({ text: 'Amit raat ko workout karta hai', source: 'inferred', confirmed: { channel: 'text' } }); assert.equal(s.verdict, 'save'); assert.ok(s.confidence <= 0.7); assert.equal(s.expires_at, new Date(now.getTime() + 90 * 86400000).toISOString()); });
test('private contact from Amit is T2 and no longer hard-refused', () => { const v = d({ text: 'Rahul ka number 9876543210', kind: 'person' }); assert.equal(v.verdict, 'save'); assert.equal(v.tier, 'sensitive'); assert.equal(v.private, true); });
test('other people\'s sensitive info is tagged as T2 and private', () => { const c = { text: 'Rahul ka dharm hindu hai', kind: 'person' as const }; const v = d(c); assert.equal(v.verdict, 'save'); assert.equal(v.private, true); assert.equal(v.tier, 'sensitive'); assert.equal(v.subject, 'other'); });
test('due date memory expires 30 days after', () => assert.equal(d({ text: 'bill bharna hai', dueDate: '2026-12-05T00:00:00Z' }).expires_at, '2027-01-04T00:00:00.000Z'));
test('Amit-stated health/weight/workout history has no age-only expiry', () => { const v = d({ text: '19 January 2025 ko 5 workout kiye' }); assert.equal(v.verdict, 'save'); assert.equal(v.expires_at, null); });
test('too long is refused with note hint', () => assert.equal(d({ text: 'a '.repeat(600) }).reasons[0], 'too_long'));

// LEAD round-2 regression cases (typos, spaced PAN, Hinglish self-harm, benign negatives)
for (const t of ['mera paasword hunter22 hai', 'mera pasword xyz@1234 hai', 'pwd: Abc#1234', 'mera पासवर्ड abc123 है', 'mera p a n ABCDE 1234 F', 'ABCDE-1234-F meri PAN'])
  test('LEAD: secret typo/spaced is refused: ' + t, () => assert.equal(d({ text: t, explicit: true }).verdict, 'refuse'));
for (const t of ['mujhe mar jaana hai', 'main mar jaunga', 'zindagi khatam kar dun', 'मुझे मर जाना है'])
  test('LEAD: Hinglish self-harm carries care: ' + t, () => assert.equal(d({ text: t }).care, 'self_harm'));
for (const t of ['project 2026 mein khatam', 'kaam khatam kar dunga kal', 'movie khatam ho gayi', 'Rahul ka email rahul@gmail.com'])
  test('LEAD: not a false self-harm/secret: ' + t, () => { const v = d({ text: t }); assert.notEqual(v.care, 'self_harm'); assert.equal(findSecrets(t).filter((f) => f.kind === 'password' || f.kind === 'gov_id').length, 0); });
