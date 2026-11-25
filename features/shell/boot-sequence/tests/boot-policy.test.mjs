import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOT_STEPS, bootStepAt, shouldSkipBoot } from '../src/boot-policy.mjs';
test('boot sequence follows approved message order', () => { assert.equal(bootStepAt(0), 'INITIALIZING CORE'); assert.equal(bootStepAt(520), 'LOADING NEURAL LINK'); assert.equal(bootStepAt(1040), 'SYNCING YOUR WORKSPACE'); assert.equal(bootStepAt(2080), 'ALL SYSTEMS ONLINE'); assert.equal(BOOT_STEPS.length, 4); });
test('boot sequence respects reduced motion', () => { assert.equal(shouldSkipBoot(true), true); assert.equal(shouldSkipBoot(false), false); });
