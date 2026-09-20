import * as THREE from '../../lib/three.module.js';
import { CONFIG } from '../config.js';
import { clamp } from '../util.js';
import { FX } from './fx.js';
import { BloomComposer } from './bloom.js';
import { skyTexture } from './textures.js';

const PANEL_W = 336;

export const Stage = {
  renderer: null,
  scene: null,
  camera: null,
  composer: null,
  keyLight: null,
  groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  _ray: new THREE.Raycaster(),
  _ndc: new THREE.Vector2(),
  _hit: new THREE.Vector3(),
  _orbit: { az: CONFIG.camera.start.az, el: CONFIG.camera.start.el, dist: CONFIG.camera.start.dist },
  _dragging: false,
  spaceHeld: false,
  _last: { x: 0, y: 0 },
  _target: new THREE.Vector3(CONFIG.camera.target.x, CONFIG.camera.target.y, CONFIG.camera.target.z),
  _desired: { az: 0, el: 0, dist: 0 },

  init(canvas) {
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CONFIG.quality.maxPixelRatio));
    renderer.setClearColor(0x05040c, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;   // 色调映射在合成阶段自行处理
    renderer.autoClear = true;
    if (CONFIG.quality.shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0718, 34, 92);
    this.scene = scene;

    /* 天空穹顶 */
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(150, 32, 20),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    scene.add(sky);
    this.sky = sky;

    const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 400);
    this.camera = camera;

    /* ---------------- 灯光 ---------------- */
    scene.add(new THREE.HemisphereLight(0x9db4ff, 0x140d24, 0.42));

    const key = new THREE.DirectionalLight(0xffe2bb, 1.45);
    key.position.set(14, 22, 12);
    if (CONFIG.quality.shadows) {
      key.castShadow = true;
      key.shadow.mapSize.set(CONFIG.quality.shadowMapSize, CONFIG.quality.shadowMapSize);
      const sc = key.shadow.camera;
      sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 70;
      key.shadow.bias = -0.0012;
      key.shadow.normalBias = 0.03;
    }
    scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0x7b5cff, 0.55);
    fill.position.set(-16, 9, -12);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x49e6ff, 0.42);
    rim.position.set(0, 6, -18);
    scene.add(rim);

    scene.add(new THREE.AmbientLight(0x2a2050, 0.32));

    /* ---------------- 后期 ---------------- */
    this.composer = new BloomComposer(renderer, scene, camera, {
      enabled: CONFIG.quality.bloom,
      strength: CONFIG.quality.bloomStrength,
      threshold: CONFIG.quality.bloomThreshold,
      knee: CONFIG.quality.bloomKnee,
      exposure: CONFIG.quality.exposure,
    });

    FX.init(scene);
    this._bindInput(canvas);
    this.resize();
    return this;
  },

  /* ---------------------------------------------------------- */
  _bindInput(canvas) {
    /* 右键菜单一律拦掉，避免浏览器手势/菜单抢走操作 */
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    /* 空格 = 视角模式（按住），所以空格不再用于合成 —— 合成改用 Enter */
    addEventListener('keydown', e => {
      if (e.code !== 'Space') return;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      this.spaceHeld = true;
      canvas.style.cursor = this._dragging ? 'grabbing' : 'grab';
      e.preventDefault();
    });
    addEventListener('keyup', e => {
      if (e.code !== 'Space') return;
      this.spaceHeld = false;
      if (!this._dragging) canvas.style.cursor = '';
      e.preventDefault();
    });
    addEventListener('blur', () => {
      this.spaceHeld = false;
      this._dragging = false;
      canvas.style.cursor = '';
    });

    canvas.addEventListener('pointerdown', e => {
      /* 只有「空格 + 左键」或「中键」进入旋转；右键完全不用 */
      const isOrbit = (e.button === 0 && this.spaceHeld) || e.button === 1;
      if (!isOrbit) return;
      this._dragging = true;
      this._last.x = e.clientX; this._last.y = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', e => {
      if (!this._dragging) return;
      const dx = e.clientX - this._last.x;
      const dy = e.clientY - this._last.y;
      this._last.x = e.clientX; this._last.y = e.clientY;
      const o = this._orbit;
      o.az -= dx * 0.0052;
      o.el = clamp(o.el + dy * 0.0038, CONFIG.camera.minEl, CONFIG.camera.maxEl);
    });

    const end = e => {
      if (!this._dragging) return;
      this._dragging = false;
      canvas.style.cursor = this.spaceHeld ? 'grab' : '';
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const k = Math.exp(clamp(e.deltaY, -220, 220) * 0.0011);
      this._orbit.dist = clamp(this._orbit.dist * k, CONFIG.camera.minDist, CONFIG.camera.maxDist);
    }, { passive: false });
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, CONFIG.quality.maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);

    this.camera.aspect = w / h;
    if (w > 900) this.camera.setViewOffset(w, h, -PANEL_W / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();

    this.composer.setSize(w, h, pr);
  },

  updateCamera(dt, time) {
    const o = this._orbit;
    /* 呼吸感 */
    const breathEl = Math.sin(time * 0.35) * 0.012;
    const breathAz = Math.cos(time * 0.27) * 0.010;

    const el = clamp(o.el + breathEl, CONFIG.camera.minEl, CONFIG.camera.maxEl);
    const az = o.az + breathAz;
    const d = o.dist;

    const cosEl = Math.cos(el);
    const x = Math.sin(az) * cosEl * d;
    const z = Math.cos(az) * cosEl * d;
    const y = Math.sin(el) * d;

    this.camera.position.set(
      x + FX.shakeOffset.x + this._target.x,
      y + FX.shakeOffset.y + this._target.y,
      z + FX.shakeOffset.z + this._target.z,
    );
    this.camera.lookAt(this._target.x, this._target.y + 1.1, this._target.z);
    this.camera.rotateZ(FX.shakeRoll);
    this.camera.updateMatrixWorld();
  },

  /** 屏幕坐标 → 地面交点，写入 out，返回是否命中 */
  pickGround(clientX, clientY, out = this._hit) {
    const w = innerWidth, h = innerHeight;
    this._ndc.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    if (!this._ray.ray.intersectPlane(this.groundPlane, out)) return null;
    /* 限制在可施法半径内 */
    const r = Math.hypot(out.x, out.z);
    const max = CONFIG.arena.castRadius;
    if (r > max) { out.x *= max / r; out.z *= max / r; }
    out.y = 0;
    return out;
  },

  render() {
    this.composer.render();
  },
};
