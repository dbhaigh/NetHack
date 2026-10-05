export class GraphicsController {
  constructor(options = {}) {
    this.element = options.element ?? null;
    this.lastStatus = { hp: 0, maxHp: 0 };
    this.message = '';
    this.state = 'BOOTING';
    this.lastGlyphs = 0;
    this.onStateChange = options.onStateChange ?? (() => {});
  }

  renderWindowEvent(name, payload = {}) {
    switch (name) {
      case 'shim_status_update':
        this.lastStatus = {
          hp: Number(payload.hp ?? this.lastStatus.hp),
          maxHp: Number(payload.maxHp ?? this.lastStatus.maxHp),
        };
        this._updateStatusDisplay();
        return this.lastStatus;
      case 'shim_message':
        this.message = String(payload.message ?? payload ?? '');
        this._updateMessageDisplay();
        return this.message;
      case 'engine_state':
        this.state = String(payload ?? this.state);
        this._updateStateDisplay();
        this.onStateChange(this.state);
        return this.state;
      case 'engine_message':
        this.message = String(payload ?? this.message);
        this._updateMessageDisplay();
        return this.message;
      default:
        return payload;
    }
  }

  _updateStatusDisplay() {
    if (!this.element) {
      return;
    }

    const meter = this.element.querySelector('.meter-row b');
    if (meter) {
      meter.textContent = `${this.lastStatus.hp}/${this.lastStatus.maxHp}`;
    }
  }

  _updateMessageDisplay() {
    if (!this.element) {
      return;
    }

    const status = this.element.querySelector('#engine-message');
    if (status) {
      status.textContent = this.message;
    }
  }

  _updateStateDisplay() {
    if (!this.element) {
      return;
    }

    const state = this.element.querySelector('#engine-state');
    if (state) {
      state.textContent = this.state;
    }
  }
}
