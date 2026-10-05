import { normalizeNetHackEvent } from '../graphics/NetHackRendererBridge.js?v=20260921-25';

export function bindNetHackRuntimeCallbacks(module, options = {}) {
  const callbackName = options.callbackName ?? '__nethackRuntimeBridge';
  const onNetHackEvent = typeof options.onNetHackEvent === 'function'
    ? options.onNetHackEvent
    : () => {};

  const callback = async function runtimeCallback(name, ...args) {
    const decodedArgs = name === 'shim_print_glyph'
      ? args.map((value, index) => (index === 3 || index === 4 ? decodeGlyphInfo(module, value) : value))
      : args;
    const event = normalizeNetHackEvent(name, decodedArgs);
    const result = await onNetHackEvent(event, { name, args: decodedArgs, module });
    return result ?? event.payload;
  };

  globalThis[callbackName] = callback;

  if (module) {
    const originalReady = module.onRuntimeInitialized;
    module.onRuntimeInitialized = function onRuntimeInitialized(...runtimeArgs) {
      const runtimeModule = typeof this?.ccall === 'function' ? this : module;
      runtimeModule.ccall('shim_graphics_set_callback', null, ['string'], [callbackName], { async: true });
      if (typeof originalReady === 'function') {
        return originalReady.apply(this, runtimeArgs);
      }
      return undefined;
    };
  }

  return callback;
}

export function decodeGlyphInfo(module, pointer) {
  if (!pointer || typeof pointer !== 'number' || typeof module?.getValue !== 'function') {
    return pointer;
  }

  return {
    glyph: module.getValue(pointer, 'i32'),
    ttychar: module.getValue(pointer + 4, 'i32'),
    framecolor: module.getValue(pointer + 8, 'i32'),
    gm: {
      glyphflags: module.getValue(pointer + 12, 'i32'),
      color: module.getValue(pointer + 16, 'i32'),
      symidx: module.getValue(pointer + 20, 'i32'),
      customcolor: module.getValue(pointer + 24, 'i32'),
    },
  };
}

export async function createNetHack(moduleConfig = {}) {
  const callbackName = moduleConfig.callbackName ?? '__nethackRuntimeBridge';
  const callbackHandler = typeof moduleConfig.onNetHackEvent === 'function'
    ? moduleConfig.onNetHackEvent
    : () => {};
  const runtimeFactory = moduleConfig.runtimeFactory
    ?? (await import('../targets/wasm/nethack.js')).default;
  const startupArguments = moduleConfig.arguments ?? [];
  const wrapped = {
    noInitialRun: true,
    print: (...args) => console.log(...args),
    printErr: (...args) => console.error(...args),
    ...moduleConfig,
  };

  delete wrapped.callbackName;
  delete wrapped.onNetHackEvent;
  delete wrapped.runtimeFactory;

  bindNetHackRuntimeCallbacks(wrapped, {
    callbackName,
    onNetHackEvent: callbackHandler,
  });

  const runtime = await runtimeFactory(wrapped);
  if (wrapped.noInitialRun && typeof runtime?._main === 'function') {
    setTimeout(() => startNetHackMain(runtime, startupArguments), 0);
  }
  return runtime;
}

export function startNetHackMain(module, argumentsList = []) {
  const args = ['nethack', ...argumentsList.map(String)];
  const pointers = args.map((argument) => {
    const byteLength = new TextEncoder().encode(argument).length + 1;
    const pointer = module._malloc(byteLength);
    module.stringToUTF8(argument, pointer, byteLength);
    return pointer;
  });
  const argv = module._malloc((pointers.length + 1) * 4);

  pointers.forEach((pointer, index) => module.setValue(argv + index * 4, pointer, '*'));
  module.setValue(argv + pointers.length * 4, 0, '*');

  Promise.resolve(module._main(pointers.length, argv)).catch((error) => {
    module.printErr?.(error);
  });
}
