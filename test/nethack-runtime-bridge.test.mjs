import test from 'node:test';
import assert from 'node:assert/strict';

import { createNetHack } from '../engine/nethack.js';

test('runtime bridge registers the actual NetHack callback and forwards events to the app', async () => {
  const calls = [];
  const instance = await createNetHack({
    callbackName: '__nethackRuntimeBridge',
    onNetHackEvent: (event) => {
      calls.push(['event', event.name, event.payload]);
      return event.payload;
    },
    runtimeFactory: async (module) => {
      module.ccall = (...args) => {
        calls.push(args);
        return undefined;
      };
      return module;
    },
  });

  instance.onRuntimeInitialized();

  assert.ok(typeof globalThis.__nethackRuntimeBridge === 'function');
  assert.equal(calls[0][0], 'shim_graphics_set_callback');

  const result = await globalThis.__nethackRuntimeBridge('shim_status_update', { hp: 18, maxHp: 30 });
  assert.equal(result.hp, 18);
  assert.equal(result.maxHp, 30);
});
