export function normalizeNetHackEvent(name, args = []) {
  const eventName = normalizeEventName(name);
  const payload = normalizePayload(eventName, args, name);

  return {
    name: eventName,
    payload,
  };
}

export function normalizeEventName(name) {
  const map = {
    shim_status_update: 'shim_status_update',
    shim_raw_print: 'shim_message',
    shim_raw_print_bold: 'shim_message',
    shim_message_menu: 'shim_message',
    shim_print_glyph: 'map_update',
    shim_update_positionbar: 'shim_status_update',
    shim_preference_update: 'shim_message',
    shim_getmsghistory: 'shim_message',
    shim_putmsghistory: 'shim_message',
    shim_curs: 'player_move',
    shim_display_nhwindow: 'viewport_refresh',
    shim_clear_nhwindow: 'viewport_refresh',
    shim_destroy_nhwindow: 'viewport_refresh',
    shim_update_inventory: 'inventory_update',
  };

  return map[name] ?? name;
}

export function normalizePayload(name, args = [], sourceName = name) {
  switch (name) {
    case 'shim_status_update': {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === 'object' && ('hp' in firstArg || 'maxHp' in firstArg)) {
        return {
          hp: Number(firstArg.hp ?? 0),
          maxHp: Number(firstArg.maxHp ?? 0),
          fieldIndex: firstArg.fieldIndex ?? 0,
          change: firstArg.change ?? 0,
          color: firstArg.color ?? 0,
        };
      }

      const [fieldIndex, valuePtr, change, percent, color] = args;
      const hp = typeof valuePtr === 'number' ? valuePtr : Number(valuePtr?.hp ?? fieldIndex ?? 0);
      const maxHp = typeof percent === 'number' ? percent : Number(valuePtr?.maxHp ?? 100);
      return {
        hp,
        maxHp,
        fieldIndex,
        change,
        color,
      };
    }
    case 'shim_message': {
      const [message] = args;
      if (message && typeof message === 'object' && 'message' in message) {
        return { message: String(message.message ?? '') };
      }
      return { message: String(message ?? '') };
    }
    case 'map_update': {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg) && ('tiles' in firstArg || 'player' in firstArg || 'width' in firstArg || 'height' in firstArg)) {
        return {
          ...firstArg,
          width: Number(firstArg.width ?? 16),
          height: Number(firstArg.height ?? 16),
          depth: Number(firstArg.depth ?? 1),
          player: {
            x: Number(firstArg.player?.x ?? firstArg.x ?? 0),
            y: Number(firstArg.player?.y ?? firstArg.y ?? 0),
          },
          tiles: Array.isArray(firstArg.tiles)
            ? firstArg.tiles.map((tile) => ({
                ...tile,
                x: Number(tile.x ?? 0),
                y: Number(tile.y ?? 0),
              }))
            : [],
        };
      }

      const [windowId, x, y, glyphInfo, backgroundGlyphInfo] = args;
      const foregroundTile = normalizeGlyphInfo(glyphInfo, x, y);
      const backgroundTile = backgroundGlyphInfo && typeof backgroundGlyphInfo === 'object'
        ? normalizeGlyphInfo(backgroundGlyphInfo, x, y)
        : null;
      const hasForegroundEntity = foregroundTile.entityKind || foregroundTile.glyph === '@';
      const tile = backgroundTile && hasForegroundEntity
        ? {
            ...backgroundTile,
            entityKind: foregroundTile.entityKind,
            entityGlyph: foregroundTile.glyph,
            entityColor: foregroundTile.color,
            isPlayer: foregroundTile.glyph === '@',
          }
        : foregroundTile;
      const player = { x: Number(x ?? 0), y: Number(y ?? 0) };
      return {
        windowId,
        width: 80,
        height: 21,
        incremental: true,
        player,
        tiles: [tile],
        glyphInfo,
        backgroundGlyphInfo,
      };
    }
    case 'player_move': {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg) && ('x' in firstArg || 'y' in firstArg)) {
        return {
          x: Number(firstArg.x ?? 0),
          y: Number(firstArg.y ?? 0),
          mod: Number(firstArg.mod ?? 0),
        };
      }

      const [x, y, mod] = sourceName === 'shim_curs'
        ? [args[1], args[2], 0]
        : args;
      return { x: Number(x ?? 0), y: Number(y ?? 0), mod: Number(mod ?? 0) };
    }
    case 'camera_move': {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg) && ('x' in firstArg || 'y' in firstArg)) {
        return {
          windowId: firstArg.windowId ?? 0,
          x: Number(firstArg.x ?? 0),
          y: Number(firstArg.y ?? 0),
          z: Number(firstArg.z ?? 0),
        };
      }

      const [windowId, x, y] = args;
      return { windowId, x: Number(x ?? 0), y: Number(y ?? 0) };
    }
    case 'viewport_refresh':
      return { refresh: true };
    case 'inventory_update':
      return { items: args ?? [] };
    default:
      return args.length <= 1 ? args[0] ?? {} : args;
  }
}

export function normalizeGlyphInfo(glyphInfo, x, y) {
  if (!glyphInfo || typeof glyphInfo !== 'object') {
    return {
      x: Number(x ?? 0),
      y: Number(y ?? 0),
      type: 'floor',
      color: 0x34d399,
      glyph: '.',
    };
  }

  const glyphValue = glyphInfo.glyph ?? glyphInfo.char ?? glyphInfo.ttychar ?? null;
  const ttychar = glyphInfo.ttychar ?? glyphInfo.char ?? null;
  const customColor = Number(glyphInfo?.gm?.customcolor ?? glyphInfo?.framecolor ?? glyphInfo.color ?? glyphInfo.clr ?? 0);
  const colorIndex = Number(glyphInfo?.gm?.color ?? glyphInfo.color ?? glyphInfo.clr ?? 7);
  const glyphFlags = Number(glyphInfo?.gm?.glyphflags ?? glyphInfo.glyphflags ?? 0);
  const glyphChar = typeof ttychar === 'number'
    ? String.fromCharCode(ttychar)
    : typeof glyphValue === 'string'
      ? glyphValue
      : glyphInfo.glyph === '#' || glyphInfo.glyph === 35
        ? '#'
        : '.';

  const wallLike = glyphInfo.blocking
    || glyphInfo.type === 'wall'
    || glyphChar === '-'
    || glyphChar === '|';
  const doorLike = glyphChar === '+';
  const unknown = Boolean(glyphFlags & (0x00400 | 0x00800));
  const voidLike = unknown || glyphChar === ' ' || glyphChar === '\0';
  const monsterLike = /^[A-Za-z&;:']$/.test(glyphChar) && glyphChar !== '@';
  const objectLike = /^[)\[%?!\/=(*$"`]$/.test(glyphChar);
  const tileType = voidLike
    ? 'void'
    : wallLike
      ? 'wall'
      : doorLike
        ? 'door'
        : glyphChar === '#'
          ? 'corridor'
          : glyphChar === '<' || glyphChar === '>'
            ? 'stairs'
            : 'floor';
  const glyph = glyphChar || (wallLike ? '|' : '.');
  const entityKind = monsterLike ? 'monster' : objectLike ? 'object' : null;

  return {
    x: Number(x ?? glyphInfo.x ?? 0),
    y: Number(y ?? glyphInfo.y ?? 0),
    type: tileType,
    color: resolveNetHackColor(customColor, colorIndex, tileType),
    glyph,
    height: wallLike ? 1.8 : doorLike ? 1.55 : 0.16,
    entityKind,
    glyphFlags,
    unknown,
  };
}

export function resolveNetHackColor(customColor, colorIndex, tileType = 'floor') {
  if (Number(customColor) > 0) {
    return Number(customColor);
  }

  const palette = [
    0x64748b, 0xdc2626, 0x16a34a, 0x92400e,
    0x2563eb, 0xa855f7, 0x06b6d4, 0xd1d5db,
    0x94a3b8, 0xf87171, 0x4ade80, 0xfacc15,
    0x60a5fa, 0xe879f9, 0x67e8f9, 0xf8fafc,
  ];
  const fallback = tileType === 'wall' || tileType === 'door' ? 0x64748b : 0x475569;
  return palette[Number(colorIndex)] ?? fallback;
}
