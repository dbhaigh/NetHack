import { normalizeNetHackEvent } from '../graphics/NetHackRendererBridge.js?v=20260921-25';

export class NethackEngine {
  constructor(options = {}) {
    this.graphics = null;
    this.moduleFactory = options.moduleFactory ?? null;
    this.state = 'BOOTING';
    this.message = '';
    this.engineName = options.engineName ?? 'NetHack';
  }

  attachGraphics(graphics) {
    this.graphics = graphics;
    return this;
  }

  async boot() {
    if (!this.moduleFactory) {
      this.message = 'No NetHack WASM factory configured.';
      this._notifyGraphics('engine_message', this.message);
      return null;
    }

    this.state = 'LOADING';
    this._notifyGraphics('engine_state', this.state);

    const module = await this.moduleFactory();
    this.state = 'LIVE';
    this._notifyGraphics('engine_state', this.state);

    return module;
  }

  processWindowEvent(name, payload = {}) {
    if (!this.graphics) {
      return null;
    }

    const normalized = normalizeNetHackEvent(name, Array.isArray(payload) ? payload : [payload]);
    const eventName = normalized.name;
    const eventPayload = normalized.payload;

    if (eventName === 'map_update' && eventPayload && Array.isArray(eventPayload.tiles)) {
      this.graphics.renderWindowEvent(eventName, eventPayload);
      return eventPayload;
    }

    this.graphics.renderWindowEvent(eventName, eventPayload);
    return eventPayload;
  }

  _notifyGraphics(type, payload) {
    if (!this.graphics) {
      return;
    }

    this.graphics.renderWindowEvent(type, payload);
  }
}
