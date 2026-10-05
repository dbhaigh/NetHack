const MAX_LOOK_PITCH = Math.PI / 2 - 0.04;

export class ThreeDGraphicsEngine {
  constructor(options = {}) {
    this.element = options.element ?? null;
    this.onStateChange = options.onStateChange ?? (() => {});
    this.lastStatus = { hp: 0, maxHp: 0 };
    this.message = '';
    this.state = 'BOOTING';
    this.dungeonDepth = Number(options.depth ?? 1);
    this.worldScale = Number(options.worldScale ?? 10);
    this.architecture = {
      cellSize: this.worldScale,
      floorThickness: 0.12 * this.worldScale,
      wallHeight: 2.4 * this.worldScale,
      wallThickness: 0.16 * this.worldScale,
      ceilingThickness: 0.1 * this.worldScale,
      eyeHeight: 1.35 * this.worldScale,
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.mapGroup = null;
    this.entityGroup = null;
    this.playerAnchor = null;
    this.playerMesh = null;
    this.animationHandle = null;
    this.cameraTarget = { x: 0, y: 0, z: 0 };
    this.entityMeshes = [];
    this.terrainStyles = {
      floor: { color: 0x555b62, height: 0 },
      wall: { color: 0x747b84, height: 2.4 },
      door: { color: 0x754c2a, height: 2.2 },
      stairs: { color: 0x69727c, height: 0.08 },
      corridor: { color: 0x41474e, height: 0 },
      water: { color: 0x155e75, height: -0.04 },
      lava: { color: 0xc2410c, height: 0.03 },
      rock: { color: 0x626971, height: 2.4 },
      tree: { color: 0x166534, height: 2.2 },
      sand: { color: 0xa16207, height: 0 },
    };
    this.mapTiles = [];
    this.monsters = [];
    this.objects = [];
    this.rooms = [];
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.playerState = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      fromX: 0,
      fromY: 0,
      z: 0.7,
      yaw: 0,
      pitch: 0,
      targetYaw: 0,
      targetPitch: 0,
      moveStartedAt: 0,
    };
    this.hasPlayerHeading = false;
    this.manualView = false;
    this.lastAnimationTime = 0;
    this.rawPointerInput = { x: 0, y: 0 };
    this.cameraMode = 'first-person';

    this._setup3DScene();
  }

  renderWindowEvent(name, payload = {}) {
    switch (name) {
      case 'engine_state':
        this.state = String(payload ?? this.state);
        this.onStateChange(this.state);
        this._updateStateDisplay();
        return this.state;
      case 'engine_message':
        this.message = String(payload ?? this.message);
        this._updateMessageDisplay();
        return this.message;
      case 'shim_message':
        this.message = String(payload.message ?? payload ?? this.message);
        this._updateMessageDisplay();
        return this.message;
      case 'shim_status_update':
        this.lastStatus = {
          hp: Number(payload.hp ?? this.lastStatus.hp),
          maxHp: Number(payload.maxHp ?? this.lastStatus.maxHp),
        };
        this._updateStatusDisplay();
        return this.lastStatus;
      case 'camera_move':
        this.cameraTarget = {
          x: Number(payload.x ?? this.cameraTarget.x ?? 0),
          y: Number(payload.y ?? this.cameraTarget.y ?? 0),
          z: Number(payload.z ?? 0),
        };
        this._syncCamera();
        return this.cameraTarget;
      case 'player_move':
        if (!this.canOccupy(Number(payload.x ?? this.playerState.x ?? 0), Number(payload.y ?? this.playerState.y ?? 0))) {
          return payload;
        }
        this.movePlayerTo(Number(payload.x ?? this.playerState.x ?? 0), Number(payload.y ?? this.playerState.y ?? 0));
        this.playerState.x = Number(payload.x ?? this.playerState.x ?? 0);
        this.playerState.y = Number(payload.y ?? this.playerState.y ?? 0);
        this.playerState.targetX = this.playerState.x;
        this.playerState.targetY = this.playerState.y;
        this.cameraTarget = { x: this.playerState.x, y: this.playerState.y, z: 0 };
        this._rebuildMapTiles();
        this._rebuildRoomLayout();
        this._rebuildEntityLayers();
        this._orientInitialCamera();
        this._syncCamera();
        return payload;
      case 'shim_map_update':
      case 'map_update':
        this._populateMap(payload);
        return payload;
      default:
        if (payload && typeof payload === 'object' && Array.isArray(payload.tiles)) {
          this._populateMap(payload);
        }
        return payload;
    }
  }

  _getHudRoot() {
    if (typeof document !== 'undefined' && document && typeof document.querySelector === 'function') {
      return document;
    }
    return this.element;
  }

  _updateStateDisplay() {
    const root = this._getHudRoot();
    if (!root || typeof root.querySelector !== 'function') {
      return;
    }

    const state = root.querySelector('#engine-state');
    if (state) {
      state.textContent = this.state;
    }
  }

  _updateMessageDisplay() {
    const root = this._getHudRoot();
    if (!root || typeof root.querySelector !== 'function') {
      return;
    }

    const message = root.querySelector('#engine-message');
    if (message) {
      message.textContent = this.message;
    }
  }

  _updateStatusDisplay() {
    const root = this._getHudRoot();
    if (!root || typeof root.querySelector !== 'function') {
      return;
    }

    const meter = root.querySelector('.meter-row b');
    if (meter) {
      meter.textContent = `${this.lastStatus.hp}/${this.lastStatus.maxHp}`;
    }
  }

  movePlayerTo(x, y) {
    const previousX = this.playerState.x;
    const previousY = this.playerState.y;
    this.playerState.fromX = previousX;
    this.playerState.fromY = previousY;
    this.playerState.targetX = Number(x);
    this.playerState.targetY = Number(y);
    this.playerState.x = this.playerState.targetX;
    this.playerState.y = this.playerState.targetY;
    this.playerState.moveStartedAt = Date.now();

    if (this.playerMesh) {
      this._syncPlayerMesh();
    }
  }

  lookAround(deltaYaw, deltaPitch = 0) {
    const nextYaw = this.playerState.targetYaw + Number(deltaYaw ?? 0);
    this.playerState.targetYaw = Math.atan2(Math.sin(nextYaw), Math.cos(nextYaw));
    this.playerState.targetPitch = Math.max(-MAX_LOOK_PITCH, Math.min(MAX_LOOK_PITCH, this.playerState.targetPitch + Number(deltaPitch ?? 0)));
    this.hasPlayerHeading = true;
    this.manualView = true;
    return { yaw: this.playerState.targetYaw, pitch: this.playerState.targetPitch };
  }

  lookWithPointer(movementX, movementY, sensitivity = 0.00065) {
    const boundedX = Math.max(-24, Math.min(24, Number(movementX ?? 0)));
    const boundedY = Math.max(-24, Math.min(24, Number(movementY ?? 0)));
    this.rawPointerInput.x = Math.max(-160, Math.min(160, this.rawPointerInput.x + boundedX));
    this.rawPointerInput.y = Math.max(-160, Math.min(160, this.rawPointerInput.y + boundedY));
    this.pointerSensitivity = Number(sensitivity);
    this.hasPlayerHeading = true;
    this.manualView = true;
    return { ...this.rawPointerInput };
  }

  _integratePointerLook(deltaSeconds) {
    const frameX = this.rawPointerInput.x;
    const frameY = this.rawPointerInput.y;
    this.rawPointerInput.x = 0;
    this.rawPointerInput.y = 0;

    if (frameX === 0 && frameY === 0) {
      return { yaw: this.playerState.yaw, pitch: this.playerState.pitch };
    }

    const sensitivity = Number(this.pointerSensitivity ?? 0.00065);
    const yaw = Math.atan2(
      Math.sin(this.playerState.yaw - frameX * sensitivity),
      Math.cos(this.playerState.yaw - frameX * sensitivity)
    );
    const verticalSensitivity = sensitivity * 0.5;
    const pitch = Math.max(-MAX_LOOK_PITCH, Math.min(
      MAX_LOOK_PITCH,
      this.playerState.pitch - frameY * verticalSensitivity
    ));
    this.playerState.yaw = yaw;
    this.playerState.targetYaw = yaw;
    this.playerState.pitch = pitch;
    this.playerState.targetPitch = pitch;
    return { yaw, pitch };
  }

  getMovementKey(action) {
    const offsets = {
      forward: 0,
      backward: Math.PI,
      left: -Math.PI / 2,
      right: Math.PI / 2,
    };
    if (!(action in offsets)) {
      return null;
    }

    const angle = this.playerState.targetYaw + offsets[action];
    const directionX = Math.round(Math.sin(angle));
    const directionY = Math.round(Math.cos(angle));
    if (Math.abs(directionX) > Math.abs(directionY)) {
      return directionX > 0 ? 'l' : 'h';
    }
    return directionY > 0 ? 'j' : 'k';
  }

  canOccupy(x, y) {
    const delta = Math.abs(Number(x) - this.playerState.x) + Math.abs(Number(y) - this.playerState.y);
    if (delta !== 1) {
      return true;
    }
    const tile = this.mapTiles.find((candidate) => Number(candidate.x) === Number(x) && Number(candidate.y) === Number(y));
    return !tile || tile.type !== 'wall';
  }

  getTerrainStyle(tile = {}) {
    const type = String(tile.type ?? tile.terrain ?? 'floor').toLowerCase();
    const base = this.terrainStyles[type] ?? this.terrainStyles.floor;
    const color = Number(tile.color ?? base.color ?? 0x34d399);
    const height = Number(tile.height ?? base.height ?? 0.25);
    return { ...base, type, color, height };
  }

  buildFallbackMapState(options = {}) {
    const width = Number(options.width ?? 16);
    const height = Number(options.height ?? 16);
    const depth = Number(options.depth ?? 1);
    const playerX = Number(options.playerX ?? Math.floor(width / 2));
    const playerY = Number(options.playerY ?? Math.floor(height / 2));

    const tiles = Array.from({ length: width * height }, () => ({
      x: 0,
      y: 0,
      type: 'wall',
      glyph: '#',
      color: 0x7dd3fc,
    }));

    const makeRoom = (x, y, w, h, color) => {
      for (let row = y; row < y + h; row += 1) {
        for (let col = x; col < x + w; col += 1) {
          if (row >= 0 && row < height && col >= 0 && col < width) {
            const idx = row * width + col;
            tiles[idx] = { x: col, y: row, type: 'floor', glyph: '.', color };
          }
        }
      }
    };

    makeRoom(2, 2, 5, 4, 0x34d399);
    makeRoom(8, 3, 5, 5, 0x2dd4bf);
    makeRoom(4, 9, 7, 3, 0x16a34a);

    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (col === 0 || row === 0 || col === width - 1 || row === height - 1) {
          const idx = row * width + col;
          tiles[idx] = { x: col, y: row, type: 'wall', glyph: '#', color: 0x7dd3fc };
        }
      }
    }

    const corridorCenters = [
      [4, 4],
      [8, 5],
      [6, 10],
      [11, 6],
    ];

    corridorCenters.forEach(([cx, cy]) => {
      for (let x = 0; x < width; x += 1) {
        const idx = cy * width + x;
        if (tiles[idx].type === 'wall') {
          tiles[idx] = { x, y: cy, type: 'floor', glyph: '.', color: 0x34d399 };
        }
      }
      for (let y = 0; y < height; y += 1) {
        const idx = y * width + cx;
        if (tiles[idx].type === 'wall') {
          tiles[idx] = { x: cx, y, type: 'floor', glyph: '.', color: 0x34d399 };
        }
      }
    });

    const playerIndex = playerY * width + playerX;
    if (tiles[playerIndex] && tiles[playerIndex].type === 'wall') {
      tiles[playerIndex] = { x: playerX, y: playerY, type: 'floor', glyph: '@', color: 0xf8fafc };
    } else {
      tiles[playerIndex] = { x: playerX, y: playerY, type: 'floor', glyph: '@', color: 0xf8fafc };
    }

    const stairsIndex = Math.max(0, Math.min(width * height - 1, (height - 2) * width + (width - 2)));
    tiles[stairsIndex] = { x: width - 2, y: height - 2, type: 'stairs', glyph: '>', color: 0xf9a8d4 };

    const monsterSpawns = [
      { x: 10, y: 7, glyph: 'M', color: 0xfda4af, type: 'monster', state: 'moving', phase: 0.3 },
      { x: 5, y: 8, glyph: 'M', color: 0xfda4af, type: 'monster', state: 'moving', phase: 1.2 },
    ].filter((monster) => monster.x >= 0 && monster.x < width && monster.y >= 0 && monster.y < height && tiles[monster.y * width + monster.x].type === 'floor');

    const objectSpawns = [
      { x: 7, y: 6, glyph: '?', color: 0xfacc15, type: 'object', state: 'glow', phase: 0.8 },
      { x: 3, y: 8, glyph: '?', color: 0xfacc15, type: 'object', state: 'glow', phase: 1.5 },
    ].filter((obj) => obj.x >= 0 && obj.x < width && obj.y >= 0 && obj.y < height && tiles[obj.y * width + obj.x].type === 'floor');

    return {
      width,
      height,
      depth,
      player: { x: playerX, y: playerY },
      tiles,
      monsters: monsterSpawns,
      objects: objectSpawns,
      rooms: [
        { x: 2, y: 2, width: 5, height: 4, color: 0x2dd4bf },
        { x: 8, y: 3, width: 5, height: 5, color: 0x2dd4bf },
        { x: 4, y: 9, width: 7, height: 3, color: 0x2dd4bf },
      ],
    };
  }

  handleNavigationInput(key) {
    const normalized = String(key ?? '').toLowerCase();
    const moveMap = {
      arrowup: [0, -1],
      w: [0, -1],
      arrowdown: [0, 1],
      s: [0, 1],
      arrowleft: [-1, 0],
      a: [-1, 0],
      arrowright: [1, 0],
      d: [1, 0],
    };

    const delta = moveMap[normalized];
    if (!delta) {
      return false;
    }

    const nextX = Math.max(0, Math.min(this.mapWidth - 1, this.playerState.x + delta[0]));
    const nextY = Math.max(0, Math.min(this.mapHeight - 1, this.playerState.y + delta[1]));
    this.movePlayerTo(nextX, nextY);
    if (this.mapTiles.length > 0) {
      const floorTile = this.mapTiles.find((tile) => Number(tile.x) === nextX && Number(tile.y) === nextY);
      if (floorTile && floorTile.type === 'wall') {
        this.movePlayerTo(this.playerState.x - delta[0], this.playerState.y - delta[1]);
        return false;
      }
    }
    this.playerState.x = nextX;
    this.playerState.y = nextY;
    this.cameraTarget = { x: nextX, y: nextY, z: 0 };
    this._syncCamera();
    return true;
  }

  _setup3DScene() {
    if (!this.element || typeof window === 'undefined' || !window.THREE) {
      return;
    }

    const THREE = window.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(58, this.element.clientWidth / this.element.clientHeight || 1, 0.5, 1200);
    this.camera.position.set(18 * this.worldScale, 18 * this.worldScale, 18 * this.worldScale);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.element.clientWidth, this.element.clientHeight);
    this.element.innerHTML = '';
    this.element.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xb8c1cc, 0.42);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xd8e2ee, 0.72);
    dir.position.set(18 * this.worldScale, 22 * this.worldScale, 12 * this.worldScale);
    this.scene.add(dir);

    if (typeof THREE.Fog === 'function') {
      this.scene.fog = new THREE.Fog(0x000000, 4 * this.worldScale, 11 * this.worldScale);
    }

    if (typeof THREE.PointLight === 'function') {
      this.playerLight = new THREE.PointLight(0xffd9a3, 2.2, 8 * this.worldScale, 1.6);
      this.scene.add(this.playerLight);
    }

    this.cameraTarget = { x: 0, y: 0, z: 0 };

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    this.entityGroup = new THREE.Group();
    this.scene.add(this.entityGroup);

    this.playerAnchor = new THREE.Group();
    this.scene.add(this.playerAnchor);

    const playerMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.3,
      metalness: 0.18,
      roughness: 0.4,
    });
    this.playerMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 5), playerMaterial);
    this.playerMesh.position.set(0, 7, 0);
    this.playerMesh.visible = this.cameraMode !== 'first-person';
    this.playerAnchor.add(this.playerMesh);

    this._animate = this._animate.bind(this);
    if (typeof requestAnimationFrame === 'function') {
      this.animationHandle = requestAnimationFrame(this._animate);
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => this._resizeRenderer());
    }
  }

  _resizeRenderer() {
    if (!this.renderer || !this.element || !this.camera) {
      return;
    }

    const width = this.element.clientWidth || 640;
    const height = this.element.clientHeight || 420;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  _animate() {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }

    if (this.playerMesh) {
      const elapsed = Date.now() - (this.playerState.moveStartedAt || Date.now());
      const duration = 220;
      const progress = Math.min(elapsed / duration, 1);
      const easedX = this.playerState.fromX + (this.playerState.targetX - this.playerState.fromX) * progress;
      const easedY = this.playerState.fromY + (this.playerState.targetY - this.playerState.fromY) * progress;

      this.playerMesh.position.x = (easedX - this.mapWidth / 2) * this.worldScale;
      this.playerMesh.position.z = (easedY - this.mapHeight / 2) * this.worldScale;
      this.playerMesh.position.y = (this.playerState.z + Math.sin(elapsed / 110) * 0.08) * this.worldScale;

    }

    const animationTime = Date.now();
    const deltaSeconds = this.lastAnimationTime
      ? Math.min((animationTime - this.lastAnimationTime) / 1000, 0.05)
      : 1 / 60;
    this.lastAnimationTime = animationTime;
    this._integratePointerLook(deltaSeconds);
    this._smoothView(deltaSeconds);

    const now = Date.now() * 0.006;
    for (const entityMesh of this.entityMeshes) {
      const entity = entityMesh.userData.entity ?? {};
      const state = String(entity.state ?? 'idle').toLowerCase();
      const phase = Number(entity.phase ?? 0);
      const isMonster = String(entity.type ?? '').toLowerCase() === 'monster';
      const bob = state === 'moving' ? Math.sin(now + phase) * 0.18 : Math.sin(now * 0.9 + phase) * 0.08;
      const pulse = state === 'glow' || state === 'attacking' ? Math.sin(now * 2.5 + phase) * 0.12 : 0;
      entityMesh.position.y = Number(entityMesh.userData.baseY ?? 0) + (bob + pulse) * this.worldScale;
      entityMesh.rotation.y += isMonster ? 0.03 : 0.02;
    }

    this._syncCamera();

    this.renderer.render(this.scene, this.camera);
    this.animationHandle = requestAnimationFrame(this._animate);
  }

  _smoothView(deltaSeconds) {
    const smoothing = 1 - Math.exp(-6 * Math.max(0, Number(deltaSeconds ?? 0)));
    const yawDelta = Math.atan2(
      Math.sin(this.playerState.targetYaw - this.playerState.yaw),
      Math.cos(this.playerState.targetYaw - this.playerState.yaw)
    );
    if (Math.abs(yawDelta) > 1e-12) {
      this.playerState.yaw = Math.atan2(
        Math.sin(this.playerState.yaw + yawDelta * smoothing),
        Math.cos(this.playerState.yaw + yawDelta * smoothing)
      );
    }
    const pitchDelta = this.playerState.targetPitch - this.playerState.pitch;
    if (Math.abs(pitchDelta) > 1e-12) {
      this.playerState.pitch += pitchDelta * smoothing;
    }
  }

  _syncCamera() {
    if (!this.camera || !this.mapWidth || !this.mapHeight) {
      return;
    }

    const playerWorldX = (Number(this.playerState.x ?? this.cameraTarget.x ?? 0) - this.mapWidth / 2) * this.worldScale;
    const playerWorldZ = (Number(this.playerState.y ?? this.cameraTarget.y ?? 0) - this.mapHeight / 2) * this.worldScale;
    const yaw = Number(this.playerState.yaw ?? 0);
    const pitch = Math.max(-MAX_LOOK_PITCH, Math.min(MAX_LOOK_PITCH, Number(this.playerState.pitch ?? 0)));
    const cameraHeight = this.architecture.eyeHeight;
    const lookAhead = 3.2 * this.worldScale;

    const horizontalLook = Math.cos(pitch) * lookAhead;
    const targetX = playerWorldX + Math.sin(yaw) * horizontalLook;
    const targetZ = playerWorldZ + Math.cos(yaw) * horizontalLook;
    const targetY = cameraHeight + Math.sin(pitch) * lookAhead;

    this.camera.position.set(playerWorldX, cameraHeight, playerWorldZ);
    this.playerLight?.position?.set(playerWorldX, cameraHeight, playerWorldZ);
    if (this.camera.rotation && typeof this.camera.rotation.set === 'function') {
      this.camera.rotation.set(pitch, Math.PI + yaw, 0, 'YXZ');
    } else {
      this.camera.lookAt(targetX, targetY, targetZ);
    }
  }

  _syncPlayerMesh() {
    if (!this.playerMesh || !this.mapWidth || !this.mapHeight) {
      return;
    }

    const worldX = (this.playerState.x - this.mapWidth / 2) * this.worldScale;
    const worldZ = (this.playerState.y - this.mapHeight / 2) * this.worldScale;
    this.playerMesh.position.x = worldX;
    this.playerMesh.position.z = worldZ;
    this.playerMesh.position.y = this.playerState.z * this.worldScale;

  }

  _populateMap(payload = {}) {
    if (!this.mapGroup || !window.THREE) {
      return;
    }

    this.mapWidth = Number(payload.width ?? payload.columns ?? (this.mapWidth || 16));
    this.mapHeight = Number(payload.height ?? payload.rows ?? (this.mapHeight || 16));
    this.dungeonDepth = Number(payload.depth ?? this.dungeonDepth ?? 1);

    const candidateTiles = Array.isArray(payload.tiles)
      ? payload.tiles
      : Array.isArray(payload.map)
        ? payload.map
        : [];

    this.monsters = Array.isArray(payload.monsters) ? payload.monsters.map((entity) => ({ ...entity })) : [];
    this.objects = Array.isArray(payload.objects) ? payload.objects.map((entity) => ({ ...entity })) : [];
    this.rooms = Array.isArray(payload.rooms) ? payload.rooms.map((room) => ({ ...room })) : [];

    if (candidateTiles.length > 0 && (payload.incremental || (payload.tiles?.length === 1 && payload.player))) {
      const singleTile = candidateTiles[0];
      const key = `${Number(singleTile.x ?? 0)},${Number(singleTile.y ?? 0)}`;
      const existingIndex = this.mapTiles.findIndex((tile) => `${Number(tile.x ?? 0)},${Number(tile.y ?? 0)}` === key);
      if (existingIndex >= 0) {
        const existingTile = this.mapTiles[existingIndex];
        this.mapTiles[existingIndex] = singleTile.type === 'void' && (singleTile.entityKind || singleTile.isPlayer)
          ? {
              ...existingTile,
              entityKind: singleTile.entityKind,
              entityGlyph: singleTile.entityGlyph,
              entityColor: singleTile.entityColor,
              isPlayer: singleTile.isPlayer,
            }
          : { ...existingTile, ...singleTile };
      } else {
        this.mapTiles.push({ ...singleTile });
      }
    } else if (candidateTiles.length > 0) {
      this.mapTiles = candidateTiles.map((tile) => ({ ...tile }));
    } else if (this.mapTiles.length === 0) {
      this.mapTiles = Array.from({ length: this.mapWidth * this.mapHeight }, (_, index) => ({
        x: index % this.mapWidth,
        y: Math.floor(index / this.mapWidth),
        type: (index % 5 === 0) ? 'wall' : 'floor',
        glyph: index % 5 === 0 ? '#' : '.',
        color: 0x34d399,
      }));
    }

    this._rebuildMapTiles();
    this._rebuildRoomLayout();
    this._rebuildEntityLayers();

    if (!payload.incremental && payload.player && typeof payload.player === 'object') {
      const playerX = Number(payload.player.x ?? this.playerState.targetX ?? 0);
      const playerY = Number(payload.player.y ?? this.playerState.targetY ?? 0);
      this.movePlayerTo(playerX, playerY);
      this.playerState.x = playerX;
      this.playerState.y = playerY;
      this.playerState.targetX = playerX;
      this.playerState.targetY = playerY;
      this.cameraTarget = { x: playerX, y: playerY, z: 0 };
    }

    this._orientInitialCamera();

    this.mapGroup.position.y = 0;
    this._syncPlayerMesh();
    this._syncCamera();
  }

  _rebuildMapTiles() {
    if (!this.mapGroup || !window.THREE) {
      return;
    }

    while (this.mapGroup.children.length > 0) {
      const child = this.mapGroup.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }

    for (let index = 0; index < this.mapTiles.length; index += 1) {
      const tile = this.mapTiles[index];
      if (tile.type === 'void') {
        continue;
      }
      const x = Number(tile.x ?? (index % this.mapWidth));
      const y = Number(tile.y ?? Math.floor(index / this.mapWidth));
      const isLit = this._isTileLit(tile);
      this._addFloorSurface(tile, x, y, isLit);
      if (tile.type === 'wall' || tile.type === 'rock' || tile.type === 'tree') {
        this._addWallSurface(tile, x, y, isLit);
      } else if (tile.type === 'door') {
        this._addDoorSurface(tile, x, y, isLit);
      }
      this._addCeilingSurface(tile, x, y, isLit);
    }
  }

  _rebuildRoomLayout() {
    // Room boundaries are represented by their actual wall and floor glyphs.
  }

  _addFloorSurface(tile, x, y, isLit) {
    const THREE = window.THREE;
    const floorColors = {
      corridor: 0x373c42,
      stairs: 0x626a73,
      water: 0x155e75,
      lava: 0x9a3412,
      sand: 0x854d0e,
    };
    const color = isLit ? Number(floorColors[tile.type] ?? 0x50565d) : 0x000000;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(
        this.architecture.cellSize * 0.96,
        this.architecture.floorThickness,
        this.architecture.cellSize * 0.96
      ),
      new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0.02 })
    );
    floor.position.set(
      (x - this.mapWidth / 2) * this.worldScale,
      -this.architecture.floorThickness / 2,
      (y - this.mapHeight / 2) * this.worldScale
    );
    floor.userData = { isFloor: true, surface: 'floor', tileType: tile.type, tileX: x, tileY: y };
    this.mapGroup.add(floor);
  }

  _addCeilingSurface(tile, x, y, isLit) {
    const THREE = window.THREE;
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(
        this.architecture.cellSize * 1.01,
        this.architecture.ceilingThickness,
        this.architecture.cellSize * 1.01
      ),
      new THREE.MeshStandardMaterial({ color: isLit ? 0x303740 : 0x000000, roughness: 1, metalness: 0 })
    );
    ceiling.position.set(
      (x - this.mapWidth / 2) * this.worldScale,
      this.architecture.wallHeight + this.architecture.ceilingThickness / 2,
      (y - this.mapHeight / 2) * this.worldScale
    );
    ceiling.userData = { isCeiling: true, surface: 'ceiling', tileX: x, tileY: y };
    this.mapGroup.add(ceiling);
  }

  _addWallSurface(tile, x, y, isLit) {
    const THREE = window.THREE;
    const horizontal = this._barrierOrientation(tile, x, y) === 'horizontal';
    const width = horizontal ? this.architecture.cellSize * 1.05 : this.architecture.wallThickness;
    const depth = horizontal ? this.architecture.wallThickness : this.architecture.cellSize * 1.05;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, this.architecture.wallHeight, depth),
      new THREE.MeshStandardMaterial({ color: isLit ? 0x747b84 : 0x000000, roughness: 0.88, metalness: 0.04 })
    );
    wall.position.set(
      (x - this.mapWidth / 2) * this.worldScale,
      this.architecture.wallHeight / 2,
      (y - this.mapHeight / 2) * this.worldScale
    );
    wall.userData = { isWall: true, surface: 'wall', orientation: horizontal ? 'horizontal' : 'vertical', tileX: x, tileY: y };
    this.mapGroup.add(wall);
    this._addMasonryCourses(x, y, horizontal, isLit);
  }

  _addDoorSurface(tile, x, y, isLit) {
    const THREE = window.THREE;
    const horizontal = this._barrierOrientation(tile, x, y) === 'horizontal';
    const width = horizontal ? this.architecture.cellSize * 0.82 : this.architecture.wallThickness * 0.72;
    const depth = horizontal ? this.architecture.wallThickness * 0.72 : this.architecture.cellSize * 0.82;
    const height = this.architecture.wallHeight * 0.86;
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: isLit ? 0x754c2a : 0x000000, roughness: 0.82, metalness: 0.08 })
    );
    door.position.set(
      (x - this.mapWidth / 2) * this.worldScale,
      height / 2,
      (y - this.mapHeight / 2) * this.worldScale
    );
    door.userData = { isDoor: true, surface: 'door', orientation: horizontal ? 'horizontal' : 'vertical', tileX: x, tileY: y };
    this.mapGroup.add(door);
    this._addDoorFrame(x, y, horizontal, isLit);
  }

  _addMasonryCourses(x, y, horizontal, isLit) {
    const THREE = window.THREE;
    const worldX = (x - this.mapWidth / 2) * this.worldScale;
    const worldZ = (y - this.mapHeight / 2) * this.worldScale;
    const mortarColor = isLit ? 0x282d33 : 0x000000;
    const material = () => new THREE.MeshStandardMaterial({ color: mortarColor, roughness: 1, metalness: 0 });

    for (const heightRatio of [0.33, 0.66]) {
      const course = new THREE.Mesh(
        new THREE.BoxGeometry(
          horizontal ? this.architecture.cellSize : this.architecture.wallThickness * 1.08,
          0.035 * this.worldScale,
          horizontal ? this.architecture.wallThickness * 1.08 : this.architecture.cellSize
        ),
        material()
      );
      course.position.set(worldX, this.architecture.wallHeight * heightRatio, worldZ);
      course.userData = { isWallDetail: true, surface: 'mortar', tileX: x, tileY: y };
      this.mapGroup.add(course);
    }
  }

  _addDoorFrame(x, y, horizontal, isLit) {
    const THREE = window.THREE;
    const worldX = (x - this.mapWidth / 2) * this.worldScale;
    const worldZ = (y - this.mapHeight / 2) * this.worldScale;
    const frameColor = isLit ? 0x3f2b1d : 0x000000;
    const createFramePart = (width, height, depth, offsetX, offsetY, offsetZ) => {
      const part = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.72, metalness: 0.12 })
      );
      part.position.set(worldX + offsetX, offsetY, worldZ + offsetZ);
      part.userData = { isDoorFrame: true, surface: 'door-frame', tileX: x, tileY: y };
      this.mapGroup.add(part);
    };

    const postWidth = 0.1 * this.worldScale;
    const frameDepth = this.architecture.wallThickness;
    const halfOpening = 0.43 * this.worldScale;
    const headerHeight = 0.14 * this.worldScale;
    if (horizontal) {
      createFramePart(postWidth, this.architecture.wallHeight, frameDepth, -halfOpening, this.architecture.wallHeight / 2, 0);
      createFramePart(postWidth, this.architecture.wallHeight, frameDepth, halfOpening, this.architecture.wallHeight / 2, 0);
      createFramePart(this.architecture.cellSize, headerHeight, frameDepth, 0, this.architecture.wallHeight - headerHeight / 2, 0);
    } else {
      createFramePart(frameDepth, this.architecture.wallHeight, postWidth, 0, this.architecture.wallHeight / 2, -halfOpening);
      createFramePart(frameDepth, this.architecture.wallHeight, postWidth, 0, this.architecture.wallHeight / 2, halfOpening);
      createFramePart(frameDepth, headerHeight, this.architecture.cellSize, 0, this.architecture.wallHeight - headerHeight / 2, 0);
    }
  }

  _barrierOrientation(tile, x, y) {
    if (tile.glyph === '-') return 'horizontal';
    if (tile.glyph === '|') return 'vertical';
    const at = (tileX, tileY) => this.mapTiles.find((candidate) => Number(candidate.x) === tileX && Number(candidate.y) === tileY);
    const horizontalWalls = [at(x - 1, y), at(x + 1, y)].filter((candidate) => candidate?.type === 'wall').length;
    const verticalWalls = [at(x, y - 1), at(x, y + 1)].filter((candidate) => candidate?.type === 'wall').length;
    return horizontalWalls >= verticalWalls ? 'horizontal' : 'vertical';
  }

  _rebuildEntityLayers() {
    if (!this.entityGroup || !window.THREE) {
      return;
    }

    while (this.entityGroup.children.length > 0) {
      const child = this.entityGroup.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }

    this.entityMeshes = [];

    const renderEntity = (entity, colorOverride, size = 0.4) => {
      const isMonster = String(entity.type ?? '').toLowerCase() === 'monster';
      const entityMaterial = new window.THREE.MeshStandardMaterial({
        color: Number(entity.entityColor ?? entity.color ?? colorOverride ?? 0x94a3b8),
        emissive: Number(entity.entityColor ?? entity.color ?? colorOverride ?? 0x000000),
        emissiveIntensity: isMonster ? 0.08 : 0.16,
        roughness: isMonster ? 0.72 : 0.5,
        metalness: isMonster ? 0.05 : 0.32,
      });
      const geometry = isMonster && typeof window.THREE.CapsuleGeometry === 'function'
        ? new window.THREE.CapsuleGeometry(size * this.worldScale * 0.32, size * this.worldScale * 0.55, 6, 10)
        : isMonster && typeof window.THREE.SphereGeometry === 'function'
          ? new window.THREE.SphereGeometry(size * this.worldScale / 2, 12, 8)
        : !isMonster && typeof window.THREE.OctahedronGeometry === 'function'
          ? new window.THREE.OctahedronGeometry(size * this.worldScale / 2)
          : new window.THREE.BoxGeometry(size * this.worldScale, size * this.worldScale, size * this.worldScale);
      const entityMesh = new window.THREE.Mesh(geometry, entityMaterial);
      const x = Number(entity.x ?? 0);
      const y = Number(entity.y ?? 0);
      const state = String(entity.state ?? 'idle').toLowerCase();
      const variation = state === 'moving' ? 0.18 : state === 'glow' || state === 'attacking' ? 0.12 : 0.05;
      const baseY = (isMonster ? 0.48 : 0.3) * this.worldScale;
      entityMesh.position.set(
        (x - this.mapWidth / 2) * this.worldScale,
        baseY + variation * this.worldScale,
        (y - this.mapHeight / 2) * this.worldScale
      );
      entityMesh.userData = { entity, kind: entity.type ?? 'entity', baseY };
      this.entityMeshes.push(entityMesh);
      this.entityGroup.add(entityMesh);
    };

    for (const monster of this.monsters) {
      renderEntity(monster, 0xfda4af, 0.6);
    }

    for (const object of this.objects) {
      renderEntity(object, 0xfacc15, 0.38);
    }

    for (const tile of this.mapTiles) {
      if (!this._isTileLit(tile)) {
        continue;
      }
      if (tile.entityKind === 'monster') {
        renderEntity({ ...tile, type: 'monster' }, tile.entityColor ?? tile.color, 0.6);
      } else if (tile.entityKind === 'object') {
        renderEntity({ ...tile, type: 'object' }, tile.entityColor ?? tile.color, 0.38);
      }
    }
  }

  _isTileLit(tile) {
    if (!tile || tile.unknown || tile.type === 'void') {
      return false;
    }
    const distanceX = Math.abs(Number(tile.x) - this.playerState.x);
    const distanceY = Math.abs(Number(tile.y) - this.playerState.y);
    return Math.max(distanceX, distanceY) <= 8;
  }

  _orientInitialCamera() {
    if (this.hasPlayerHeading || this.mapTiles.length === 0) {
      return;
    }

    const tileByPosition = new Map(this.mapTiles.map((tile) => [`${Number(tile.x)},${Number(tile.y)}`, tile]));
    const directions = [
      { dx: 0, dy: 1, yaw: 0 },
      { dx: 1, dy: 0, yaw: Math.PI / 2 },
      { dx: 0, dy: -1, yaw: Math.PI },
      { dx: -1, dy: 0, yaw: -Math.PI / 2 },
    ];
    let bestDirection = null;
    let bestScore = 0;

    for (const direction of directions) {
      let score = 0;
      for (let distance = 1; distance <= 8; distance += 1) {
        const tile = tileByPosition.get(`${this.playerState.x + direction.dx * distance},${this.playerState.y + direction.dy * distance}`);
        if (!tile || tile.type === 'void' || tile.type === 'wall') {
          break;
        }
        score += tile.type === 'door' ? 0.5 : 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestDirection = direction;
      }
    }

    if (bestDirection) {
      this.playerState.yaw = bestDirection.yaw;
      this.playerState.targetYaw = bestDirection.yaw;
    }
  }
}
