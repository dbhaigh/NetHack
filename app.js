import { NethackEngine } from './engine/NethackEngine.js?v=20260921-28';
import { ThreeDGraphicsEngine } from './graphics/ThreeDGraphicsEngine.js?v=20260921-28';
import { normalizeNetHackEvent } from './graphics/NetHackRendererBridge.js?v=20260921-28';
import { createNetHack } from './engine/nethack.js?v=20260921-28';

const viewport = document.getElementById('viewport');
const graphics = new ThreeDGraphicsEngine({ element: viewport });
const pendingKeys = [];
const keyWaiters = [];
const runtimeMenus = new Map();
let pointerLockStartedAt = 0;

function enqueueKey(keyCode) {
  const waiter = keyWaiters.shift();
  if (waiter) {
    waiter(keyCode);
  } else {
    pendingKeys.push(keyCode);
  }
}

function readKey() {
  const keyCode = pendingKeys.shift();
  return keyCode === undefined
    ? new Promise((resolve) => keyWaiters.push(resolve))
    : Promise.resolve(keyCode);
}

function handleRuntimeKey(event) {
  const movementMap = {
    ArrowUp: 'forward',
    w: 'forward',
    W: 'forward',
    ArrowDown: 'backward',
    s: 'backward',
    S: 'backward',
    a: 'left',
    A: 'left',
    d: 'right',
    D: 'right',
  };
  const keyMap = {
    Enter: '\r',
    Escape: '\u001b',
    Backspace: '\b',
  };
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    graphics.lookAround(event.key === 'ArrowLeft' ? -Math.PI / 2 : Math.PI / 2);
    return;
  }

  const movement = movementMap[event.key];
  const key = movement
    ? graphics.getMovementKey(movement)
    : keyMap[event.key] ?? (event.key.length === 1 ? event.key : null);
  if (!key) {
    return;
  }

  event.preventDefault();
  enqueueKey(key.charCodeAt(0));
}

function addRuntimeMenuItem(context) {
  const [windowId, , identifierPointer, selector, , , , label] = context.args;
  const menu = runtimeMenus.get(windowId) ?? { items: [], prompt: '' };
  const identifier = identifierPointer
    ? context.module.getValue(identifierPointer, 'i32')
    : 0;
  menu.items.push({ identifier, selector: Number(selector ?? 0), label: String(label ?? '') });
  runtimeMenus.set(windowId, menu);
}

async function selectRuntimeMenu(context) {
  const [windowId, how, selectionPointer] = context.args;
  if (Number(how) === 0) {
    return 0;
  }

  const menu = runtimeMenus.get(windowId) ?? { items: [], prompt: '' };
  let selected = menu.prompt === 'Do you want a tutorial?'
    ? menu.items.find((item) => item.selector === 'n'.charCodeAt(0))
    : null;

  while (!selected) {
    const keyCode = await readKey();
    if (keyCode === 27) {
      return -1;
    }
    selected = menu.items.find((item) => item.selector === keyCode);
  }

  const menuItemPointer = context.module._malloc(16);
  context.module.setValue(menuItemPointer, selected.identifier, 'i32');
  context.module.setValue(menuItemPointer + 8, -1, 'i32');
  context.module.setValue(menuItemPointer + 12, 0, 'i32');
  context.module.setValue(selectionPointer, menuItemPointer, '*');
  return 1;
}

async function handleNetHackEvent(event, context) {
  engine.processWindowEvent(event.name, event.payload);

  switch (context.name) {
    case 'shim_start_menu':
      runtimeMenus.set(context.args[0], { items: [], prompt: '' });
      return undefined;
    case 'shim_add_menu':
      addRuntimeMenuItem(context);
      return undefined;
    case 'shim_end_menu': {
      const menu = runtimeMenus.get(context.args[0]);
      if (menu) {
        menu.prompt = String(context.args[1] ?? '');
      }
      return undefined;
    }
    case 'shim_select_menu':
      return selectRuntimeMenu(context);
    case 'shim_nhgetch':
    case 'shim_nh_poskey':
    case 'shim_message_menu':
    case 'shim_yn_function':
      return readKey();
    case 'shim_player_selection_or_tty':
      return false;
    case 'shim_askname':
      if (globalThis.nethackGlobal?.globals?.svp) {
        globalThis.nethackGlobal.globals.svp.plname = 'WebHero';
      }
      return undefined;
    case 'shim_create_nhwindow':
      return Number(context.args[0] ?? 0);
    case 'shim_doprev_message':
    case 'set_shim_font_name':
      return 0;
    case 'shim_get_ext_cmd':
      return -1;
    case 'shim_get_color_string':
    case 'shim_getmsghistory':
      return '';
    default:
      return event.payload;
  }
}

const engine = new NethackEngine({
  moduleFactory: async () => createNetHack({
    callbackName: '__nethackRuntimeBridge',
    arguments: ['-uWebHero', '-pWizard', '-rhuman', '-gfemale', '-aneutral'],
    onNetHackEvent: handleNetHackEvent,
    onRuntimeInitialized: () => {
      engine.processWindowEvent('engine_state', 'LIVE');
      engine.processWindowEvent('shim_message', { message: 'You enter the dungeon.' });
    },
  }),
});

engine.attachGraphics(graphics);

window.__nethackEngine = engine;
window.__nethackGraphics = graphics;
window.__normalizeNetHackEvent = normalizeNetHackEvent;
window.addEventListener('keydown', handleRuntimeKey);
viewport.addEventListener('click', () => viewport.requestPointerLock?.());
document.addEventListener('pointerlockchange', () => {
  pointerLockStartedAt = document.pointerLockElement === viewport ? performance.now() : 0;
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === viewport) {
    if (performance.now() - pointerLockStartedAt < 100) {
      return;
    }
    graphics.lookWithPointer(event.movementX, event.movementY);
  }
});

engine.boot().then((module) => {
  window.__nethackModule = module;
}).catch((error) => {
  console.error(error);
  engine.processWindowEvent('engine_state', 'ERROR');
  engine.processWindowEvent('shim_message', { message: error.message });
});
