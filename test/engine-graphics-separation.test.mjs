import test from 'node:test';
import assert from 'node:assert/strict';

import { NethackEngine } from '../engine/NethackEngine.js';
import { GraphicsController } from '../graphics/GraphicsController.js';

test('engine and graphics are separate services with a narrow bridge', () => {
  const engine = new NethackEngine();
  const graphics = new GraphicsController({
    updateStatus: () => {},
    updateMessage: () => {},
  });

  assert.equal(engine.graphics, null);

  engine.attachGraphics(graphics);

  assert.equal(engine.graphics, graphics);

  engine.processWindowEvent('shim_status_update', {
    hp: 10,
    maxHp: 20,
  });

  assert.equal(graphics.lastStatus.hp, 10);
  assert.equal(graphics.lastStatus.maxHp, 20);
});
