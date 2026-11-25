import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDEBAR_ITEMS, isSidebarDestination, DEFAULT_DISABLED_DESTINATIONS, isSidebarItemEnabled } from '../src/nav-items.mjs';
test('sidebar navigation preserves the approved primary destination order', () => { assert.deepEqual(SIDEBAR_ITEMS.map((item) => item.destination), ['home','chat','today','tasks','memory','insights','boards','history','more']); });
test('sidebar destinations are allowlisted', () => { assert.equal(isSidebarDestination('today'), true); assert.equal(isSidebarDestination('power-off'), false); });
test('currently unmounted routes stay disabled until the shell enables them', () => { for (const route of DEFAULT_DISABLED_DESTINATIONS) assert.equal(isSidebarItemEnabled(route), false); assert.equal(isSidebarItemEnabled('today'), true); assert.equal(isSidebarItemEnabled('insights', []), true); });
