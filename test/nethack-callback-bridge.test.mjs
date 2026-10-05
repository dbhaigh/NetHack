import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeNetHackEvent, normalizeGlyphInfo } from '../graphics/NetHackRendererBridge.js';

test('real NetHack callback events are normalized for the renderer', () => {
  const status = normalizeNetHackEvent('shim_status_update', [0, 12, 1, 50, 0x00ff00, []]);
  assert.equal(status.name, 'shim_status_update');
  assert.equal(status.payload.hp, 12);
  assert.equal(status.payload.maxHp, 50);

  const glyph = normalizeNetHackEvent('shim_print_glyph', [1, 4, 7, { glyph: '#', color: 0x7dd3fc }, null]);
  assert.equal(glyph.name, 'map_update');
  assert.equal(glyph.payload.tiles[0].x, 4);
  assert.equal(glyph.payload.tiles[0].y, 7);
  assert.equal(glyph.payload.player.x, 4);

  const message = normalizeNetHackEvent('shim_raw_print', ['You enter the dungeon.']);
  assert.equal(message.name, 'shim_message');
  assert.match(message.payload.message, /You enter the dungeon/i);

  const glyphInfo = normalizeNetHackEvent('shim_print_glyph', [
    1,
    3,
    5,
    {
      glyph: 42,
      ttychar: 35,
      framecolor: 0x00ff00,
      gm: { customcolor: 0x7dd3fc, glyphflags: 1 },
    },
    null,
  ]);

  assert.equal(glyphInfo.name, 'map_update');
  assert.equal(glyphInfo.payload.tiles[0].type, 'corridor');
  assert.equal(glyphInfo.payload.tiles[0].height, 0.16);
  assert.equal(glyphInfo.payload.tiles[0].color, 0x7dd3fc);

  const cursor = normalizeNetHackEvent('shim_curs', [3, 74, 15]);
  assert.equal(cursor.name, 'player_move');
  assert.deepEqual(cursor.payload, { x: 74, y: 15, mod: 0 });

  assert.equal(normalizeGlyphInfo({ ttychar: 45, gm: { color: 7, customcolor: 0 } }, 1, 1).type, 'wall');
  assert.equal(normalizeGlyphInfo({ ttychar: 124, gm: { color: 7, customcolor: 0 } }, 1, 1).type, 'wall');
  assert.equal(normalizeGlyphInfo({ ttychar: 35, gm: { color: 7, customcolor: 0 } }, 1, 1).type, 'corridor');
  assert.equal(normalizeGlyphInfo({ ttychar: 102, gm: { color: 3, customcolor: 0 } }, 1, 1).entityKind, 'monster');
  assert.equal(normalizeGlyphInfo({ ttychar: 41, gm: { color: 6, customcolor: 0 } }, 1, 1).entityKind, 'object');
  assert.notEqual(normalizeGlyphInfo({ ttychar: 46, gm: { color: 0, customcolor: 0 } }, 1, 1).color, 0);
  const unexplored = normalizeGlyphInfo({ ttychar: 32, gm: { glyphflags: 0x00800 } }, 1, 1);
  assert.equal(unexplored.type, 'void');
  assert.equal(unexplored.unknown, true);

  const monsterOnFloor = normalizeNetHackEvent('shim_print_glyph', [
    1,
    6,
    8,
    { ttychar: 102, gm: { color: 3, customcolor: 0 } },
    { ttychar: 46, gm: { color: 7, customcolor: 0 } },
  ]);
  assert.equal(monsterOnFloor.payload.tiles[0].type, 'floor');
  assert.equal(monsterOnFloor.payload.tiles[0].glyph, '.');
  assert.equal(monsterOnFloor.payload.tiles[0].entityKind, 'monster');
  assert.equal(monsterOnFloor.payload.tiles[0].entityGlyph, 'f');
});
