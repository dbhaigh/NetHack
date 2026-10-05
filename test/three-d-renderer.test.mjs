import test from 'node:test';
import assert from 'node:assert/strict';

import { ThreeDGraphicsEngine } from '../graphics/ThreeDGraphicsEngine.js';
import { normalizeNetHackEvent } from '../graphics/NetHackRendererBridge.js';

test('renderer converts map updates into world objects and animates player movement', () => {
  class FakeMesh {
    constructor(geometry = null, material = null) {
      this.geometry = geometry;
      this.material = material;
      this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } };
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = { x: 1, y: 1, z: 1, set: (x, y, z) => { this.scale.x = x; this.scale.y = y; this.scale.z = z; } };
      this.userData = {};
    }
  }

  globalThis.window = {
    THREE: {
      Scene: class {
        constructor() { this.children = []; }
        add(obj) { this.children.push(obj); }
      },
      PerspectiveCamera: class {
        constructor() { this.position = { x: 0, y: 0, z: 0, set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; }
      },
      WebGLRenderer: class {
        constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; }
      },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: FakeMesh,
      GridHelper: class {
        constructor() { this.position = { y: 0 }; }
      },
      Group: class {
        constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; }
        add(obj) { this.children.push(obj); }
      },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });

  renderer.renderWindowEvent('map_update', {
    width: 2,
    height: 2,
    player: { x: 0, y: 1 },
    tiles: [
      { x: 0, y: 0, type: 'wall', glyph: '#', color: 0x7dd3fc },
      { x: 1, y: 0, type: 'floor', glyph: '.', color: 0x34d399 },
      { x: 0, y: 1, type: 'floor', glyph: '.', color: 0x34d399 },
      { x: 1, y: 1, type: 'floor', glyph: '.', color: 0x34d399 },
    ],
  });

  assert.ok(renderer.mapTiles.length >= 4);
  assert.ok(renderer.playerMesh);
  assert.equal(renderer.playerState.x, 0);
  assert.equal(renderer.playerState.y, 1);
  assert.equal(renderer.mapGroup.children.filter((child) => child.userData.isFloor).length, 4);
  assert.equal(renderer.mapGroup.children.filter((child) => child.userData.isCeiling).length, 4);
  assert.equal(renderer.mapGroup.children.filter((child) => child.userData.isWall).length, 1);
  assert.equal(renderer.scene.children.length, 5);

  renderer.movePlayerTo(1, 0);

  assert.equal(renderer.playerState.x, 1);
  assert.equal(renderer.playerState.y, 0);
  assert.ok(renderer.playerMesh.position.x !== 0 || renderer.playerMesh.position.z !== 0);
});

test('renderer merges incremental glyph updates into a persistent dungeon map', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });

  renderer.renderWindowEvent('map_update', {
    width: 8,
    height: 8,
    player: { x: 2, y: 2 },
    tiles: [{ x: 2, y: 2, glyph: '@', type: 'floor', color: 0xfafafa }],
  });

  renderer.renderWindowEvent('map_update', {
    width: 8,
    height: 8,
    player: { x: 3, y: 2 },
    tiles: [{ x: 3, y: 2, glyph: '#', type: 'wall', color: 0x7dd3fc }],
  });

  assert.equal(renderer.mapTiles.length, 2);
  assert.equal(renderer.playerState.x, 3);
  assert.equal(renderer.playerState.y, 2);
});

test('renderer handles player_move events from NetHack callbacks', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });
  renderer.renderWindowEvent('player_move', { x: 6, y: 7, mod: 0 });

  assert.equal(renderer.playerState.x, 6);
  assert.equal(renderer.playerState.y, 7);
  assert.equal(renderer.cameraTarget.x, 6);
  assert.equal(renderer.cameraTarget.y, 7);
});

test('renderer tracks monsters and objects as separate world layers', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });

  renderer.renderWindowEvent('map_update', {
    width: 6,
    height: 6,
    player: { x: 1, y: 1 },
    tiles: [{ x: 1, y: 1, type: 'floor', glyph: '.', color: 0x34d399 }],
    monsters: [{ x: 2, y: 2, glyph: 'M', color: 0xfda4af, type: 'monster' }],
    objects: [{ x: 3, y: 3, glyph: '+', color: 0xfacc15, type: 'object' }],
  });

  assert.equal(renderer.monsters.length, 1);
  assert.equal(renderer.objects.length, 1);
  assert.equal(renderer.monsters[0].x, 2);
  assert.equal(renderer.objects[0].glyph, '+');
});

test('renderer provides a starter dungeon state when no runtime map events arrive', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });
  const mapState = renderer.buildFallbackMapState();

  assert.equal(mapState.width, 16);
  assert.equal(mapState.height, 16);
  assert.ok(Array.isArray(mapState.tiles));
  assert.ok(mapState.tiles.length > 0);
  assert.ok(mapState.tiles.some((tile) => tile.x === mapState.player.x && tile.y === mapState.player.y));
});

test('renderer keeps the camera in a first-person view anchored to the player', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class {
        constructor() {
          this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } };
          this.lookAt = (x, y, z) => { this.lookAtTarget = { x, y, z }; };
          this.aspect = 1;
          this.updateProjectionMatrix = () => {};
        }
      },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });
  renderer.renderWindowEvent('map_update', {
    width: 10,
    height: 10,
    depth: 1,
    player: { x: 3, y: 4 },
    tiles: [{ x: 3, y: 4, type: 'floor', glyph: '@', color: 0xf8fafc }],
  });

  renderer._syncCamera();

  const playerWorldX = (renderer.playerState.x - renderer.mapWidth / 2) * renderer.worldScale;
  const playerWorldZ = (renderer.playerState.y - renderer.mapHeight / 2) * renderer.worldScale;
  assert.equal(renderer.camera.position.x, playerWorldX);
  assert.equal(renderer.camera.position.z, playerWorldZ);
  assert.equal(renderer.playerMesh.visible, false);
  assert.ok(renderer.camera.lookAtTarget.z > renderer.camera.position.z);
});

test('renderer maps movement to view direction and rejects known walls', () => {
  const renderer = new ThreeDGraphicsEngine();
  renderer.mapWidth = 10;
  renderer.mapHeight = 10;
  renderer.playerState.x = 5;
  renderer.playerState.y = 5;
  renderer.mapTiles = [
    { x: 5, y: 6, type: 'floor' },
    { x: 6, y: 5, type: 'wall' },
  ];

  assert.equal(renderer.getMovementKey('forward'), 'j');
  renderer.lookAround(Math.PI / 2, 2);
  assert.equal(renderer.getMovementKey('forward'), 'l');
  assert.ok(renderer.playerState.targetPitch > 1.5 && renderer.playerState.targetPitch < Math.PI / 2);
  assert.equal(renderer.playerState.pitch, 0);
  renderer._smoothView(1 / 60);
  assert.ok(renderer.playerState.yaw > 0 && renderer.playerState.yaw < Math.PI / 2);
  assert.ok(renderer.playerState.pitch > 0 && renderer.playerState.pitch < Math.PI / 2);
  assert.equal(renderer.canOccupy(6, 5), false);

  renderer.renderWindowEvent('player_move', { x: 6, y: 5 });
  assert.equal(renderer.playerState.x, 5);
  assert.equal(renderer.playerState.y, 5);
});

test('renderer applies yaw and pitch without camera roll', () => {
  const renderer = new ThreeDGraphicsEngine();
  renderer.mapWidth = 10;
  renderer.mapHeight = 10;
  renderer.playerState.x = 5;
  renderer.playerState.y = 5;
  renderer.playerState.yaw = 0.8;
  renderer.playerState.pitch = -0.35;
  renderer.camera = {
    position: { set: () => {} },
    rotation: {
      set(x, y, z, order) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.order = order;
      },
    },
  };

  renderer._syncCamera();

  assert.equal(renderer.camera.rotation.x, -0.35);
  assert.equal(renderer.camera.rotation.y, Math.PI + 0.8);
  assert.equal(renderer.camera.rotation.z, 0);
  assert.equal(renderer.camera.rotation.order, 'YXZ');
});

test('renderer can look directly down without orbiting the player', () => {
  const renderer = new ThreeDGraphicsEngine();
  renderer.mapWidth = 10;
  renderer.mapHeight = 10;
  renderer.playerState.x = 5;
  renderer.playerState.y = 5;
  renderer.playerState.yaw = 1.2;
  renderer.playerState.pitch = -Math.PI / 2 + 0.04;
  renderer.camera = {
    position: { set: () => {} },
    rotation: {
      set(x, y, z, order) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.order = order;
      },
    },
  };

  renderer._syncCamera();

  const horizontalMagnitude = Math.cos(renderer.camera.rotation.x);
  assert.ok(horizontalMagnitude > 0 && horizontalMagnitude < 0.05);
  assert.ok(renderer.camera.rotation.x > -Math.PI / 2);
  assert.equal(renderer.camera.rotation.z, 0);
});

test('pointer look follows input directly without momentum or extra motion', () => {
  const levelRenderer = new ThreeDGraphicsEngine();
  const steepRenderer = new ThreeDGraphicsEngine();
  steepRenderer.playerState.targetPitch = 1;
  steepRenderer.playerState.pitch = 1;

  levelRenderer.lookWithPointer(60, 0);
  steepRenderer.lookWithPointer(60, 0);
  assert.equal(levelRenderer.playerState.targetYaw, 0);
  assert.equal(levelRenderer.rawPointerInput.x, 24);
  levelRenderer._integratePointerLook(1 / 60);
  steepRenderer._integratePointerLook(1 / 60);

  assert.ok(levelRenderer.playerState.targetYaw < 0);
  assert.equal(levelRenderer.playerState.yaw, levelRenderer.playerState.targetYaw);
  assert.equal(steepRenderer.playerState.yaw, steepRenderer.playerState.targetYaw);
  assert.equal(levelRenderer.playerState.targetYaw, steepRenderer.playerState.targetYaw);

  levelRenderer.lookWithPointer(0, -40);
  levelRenderer._integratePointerLook(1 / 60);
  assert.equal(levelRenderer.playerState.pitch, levelRenderer.playerState.targetPitch);
  assert.ok(levelRenderer.playerState.pitch > 0);

  const stopped = { yaw: levelRenderer.playerState.yaw, pitch: levelRenderer.playerState.pitch };
  levelRenderer._integratePointerLook(1 / 60);
  levelRenderer._smoothView(1 / 60);
  assert.deepEqual(
    { yaw: levelRenderer.playerState.yaw, pitch: levelRenderer.playerState.pitch },
    stopped
  );
});

test('renderer supports keyboard navigation and produces a dungeon-like fallback map', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });
  const mapState = renderer.buildFallbackMapState({ width: 12, height: 12, playerX: 5, playerY: 5 });

  assert.ok(Array.isArray(mapState.tiles));
  assert.ok(mapState.tiles.some((tile) => tile.type === 'wall'));
  assert.ok(mapState.tiles.some((tile) => tile.type === 'floor'));

  const moved = renderer.handleNavigationInput('ArrowRight');
  assert.ok(moved !== false);
  assert.ok(renderer.playerState.x >= 0);
  assert.ok(renderer.playerState.y >= 0);
});

test('renderer updates the browser HUD from engine state and status events', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const stateEl = { textContent: 'BOOTING' };
  const messageEl = { textContent: 'Waiting for engine startup…' };
  const meterEl = { textContent: '0/0' };

  globalThis.document = {
    querySelector: (selector) => {
      if (selector === '#engine-state') return stateEl;
      if (selector === '#engine-message') return messageEl;
      if (selector === '.meter-row b') return meterEl;
      return null;
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });
  renderer.renderWindowEvent('engine_state', 'LIVE');
  renderer.renderWindowEvent('engine_message', 'You enter the dungeon.');
  renderer.renderWindowEvent('shim_status_update', { hp: 12, maxHp: 30 });

  assert.equal(stateEl.textContent, 'LIVE');
  assert.equal(messageEl.textContent, 'You enter the dungeon.');
  assert.equal(meterEl.textContent, '12/30');
});

test('renderer follows player and depth updates from NetHack callbacks', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element, depth: 3 });

  renderer.renderWindowEvent('map_update', {
    width: 12,
    height: 12,
    depth: 7,
    player: { x: 5, y: 6 },
    tiles: [{ x: 5, y: 6, type: 'floor', glyph: '.', color: 0x34d399 }],
  });

  renderer.renderWindowEvent('camera_move', { x: 7, y: 8 });

  assert.equal(renderer.dungeonDepth, 7);
  assert.equal(renderer.cameraTarget.x, 7);
  assert.equal(renderer.cameraTarget.y, 8);
  assert.ok(renderer.playerState.x === 5 || renderer.playerState.y === 6);
});

test('renderer understands real glyph metadata and room layout data from NetHack callbacks', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const event = normalizeNetHackEvent('shim_print_glyph', [
    1,
    4,
    7,
    { glyph: '#', gm: { customcolor: 0x7dd3fc }, blocking: true },
    null,
  ]);

  assert.equal(event.name, 'map_update');
  assert.equal(event.payload.tiles[0].type, 'wall');
  assert.equal(event.payload.tiles[0].color, 0x7dd3fc);

  const renderer = new ThreeDGraphicsEngine({ element });
  renderer.renderWindowEvent('map_update', {
    width: 10,
    height: 10,
    player: { x: 4, y: 4 },
    tiles: [{ x: 4, y: 4, type: 'floor', glyph: '.', color: 0x34d399 }],
    rooms: [{ x: 1, y: 1, width: 2, height: 2, color: 0x34d399 }],
  });

  assert.equal(renderer.rooms.length, 1);
  assert.equal(renderer.rooms[0].width, 2);
  assert.equal(renderer.rooms[0].x, 1);
});

test('renderer applies terrain semantics and animates monsters and objects', () => {
  globalThis.window = {
    THREE: {
      Scene: class { constructor() { this.children = []; } add(obj) { this.children.push(obj); } },
      PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; this.lookAt = () => {}; this.aspect = 1; this.updateProjectionMatrix = () => {}; } },
      WebGLRenderer: class { constructor() { this.domElement = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; } },
      AmbientLight: class { constructor() { this.position = { set: () => {} }; } },
      DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
      PlaneGeometry: class {},
      MeshStandardMaterial: class {},
      Mesh: class { constructor() { this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; this.rotation = { y: 0 }; this.geometry = {}; this.material = {}; this.userData = {}; } },
      GridHelper: class { constructor() { this.position = { y: 0 }; } },
      Group: class { constructor() { this.children = []; this.position = { y: 0 }; this.rotation = { y: 0 }; } add(obj) { this.children.push(obj); } remove(obj) { this.children = this.children.filter((child) => child !== obj); } },
      BoxGeometry: class {},
      Color: class { constructor() {} },
    },
  };

  const element = {
    clientWidth: 640,
    clientHeight: 480,
    innerHTML: '',
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => null,
  };

  const renderer = new ThreeDGraphicsEngine({ element });
  renderer.renderWindowEvent('map_update', {
    width: 12,
    height: 12,
    player: { x: 2, y: 2 },
    tiles: [
      { x: 0, y: 0, type: 'wall', glyph: '#', color: 0x7dd3fc },
      { x: 1, y: 0, type: 'door', glyph: '+', color: 0x8b5a2b },
      { x: 2, y: 0, type: 'stairs', glyph: '>', color: 0xf9a8d4 },
    ],
    monsters: [{ x: 4, y: 4, glyph: 'M', color: 0xfda4af, type: 'monster', state: 'moving', phase: 0.5 }],
    objects: [{ x: 5, y: 4, glyph: '?', color: 0xfacc15, type: 'object', state: 'glow', phase: 1.3 }],
  });

  const wallStyle = renderer.getTerrainStyle({ type: 'wall', color: 0x7dd3fc });
  const doorStyle = renderer.getTerrainStyle({ type: 'door', color: 0x8b5a2b });
  const stairsStyle = renderer.getTerrainStyle({ type: 'stairs', color: 0xf9a8d4 });

  assert.equal(wallStyle.height, 2.4);
  assert.equal(doorStyle.height, 2.2);
  assert.equal(stairsStyle.color, 0xf9a8d4);
  assert.equal(renderer.mapGroup.children.filter((child) => child.userData.isDoor).length, 1);
  assert.equal(renderer.mapGroup.children.filter((child) => child.userData.isDoorFrame).length, 3);
  assert.ok(renderer.entityMeshes.length >= 2);
  assert.ok(renderer.entityMeshes[0].position.y !== 0.75 || renderer.entityMeshes[1].position.y !== 0.75);
});
