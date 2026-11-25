import test from 'node:test'; import assert from 'node:assert/strict';
import { DEFAULT_SHELL_PREFERENCES, parseShellPreferences, validateShellPreferencePatch } from '../src/settings-policy.mjs';
test('settings defaults stay conservative and India-local', () => { assert.deepEqual(parseShellPreferences(null), DEFAULT_SHELL_PREFERENCES); assert.equal(parseShellPreferences({ language: 'hi', timeZone: 'UTC', reduceMotion: true }).reduceMotion, true); });
test('settings patch allowlist blocks secrets, model keys, and arbitrary settings', () => { assert.equal(validateShellPreferencePatch({ language: 'en' }).ok, true); assert.equal(validateShellPreferencePatch({ api_key: 'secret' }).ok, false); assert.equal(validateShellPreferencePatch({ paidBigEnabled: true }).ok, false); });
test('settings patch rejects unsupported values', () => { assert.equal(validateShellPreferencePatch({ language: 'fr' }).ok, false); assert.equal(validateShellPreferencePatch({ reduceMotion: 'yes' }).ok, false); });
