import * as THREE from '../../lib/three.module.js';

/**
 * 精简自研 Bloom 后期：
 *   场景 → HDR 缓冲 → 亮度提取 → 三级降采样高斯模糊 → 合成（ACES + sRGB + 暗角）
 * 不依赖 three 的 examples/jsm，全部用内联 shader 实现。
 */

const QUAD_VS = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float knee = max(uKnee, 1e-4);
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * contrib, 1.0);
}`;

const BLUR_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDir;
void main(){
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  s += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;

const COPY_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tDiffuse;
void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }`;

const COMPOSITE_FS = /* glsl */`
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tB0;
uniform sampler2D tB1;
uniform sampler2D tB2;
uniform float uStrength;
uniform float uExposure;
uniform vec2 uResolution;

/* ACES filmic 近似（Narkowicz） */
vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
/* 精确 sRGB OETF */
vec3 toSRGB(vec3 c){
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-5)), vec3(0.41666)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p){
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 b = texture2D(tB0, vUv).rgb * 1.00
         + texture2D(tB1, vUv).rgb * 0.75
         + texture2D(tB2, vUv).rgb * 0.55;
  c += b * uStrength;
  c *= uExposure;
  c = aces(c);

  /* 暗角 */
  vec2 d = (vUv - 0.5) * vec2(1.02, 1.0);
  float vig = smoothstep(0.86, 0.28, length(d));
  c *= mix(0.72, 1.0, vig);

  c = toSRGB(c);
  /* 抖动去色带 */
  c += (hash(vUv * uResolution) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export class BloomComposer {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = opts.enabled !== false;
    this.strength = opts.strength ?? 0.95;
    this.threshold = opts.threshold ?? 0.62;
    this.knee = opts.knee ?? 0.35;
    this.exposure = opts.exposure ?? 1.05;

    const halfOk =
      renderer.extensions.has('EXT_color_buffer_half_float') ||
      renderer.extensions.has('EXT_color_buffer_float');
    this.type = halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType;

    /* 全屏三角/四边形 */
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeo, null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const mkMat = (fs, uniforms) => new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: fs, uniforms,
      depthTest: false, depthWrite: false,
    });

    this.brightMat = mkMat(BRIGHT_FS, {
      tDiffuse: { value: null }, uThreshold: { value: this.threshold }, uKnee: { value: this.knee },
    });
    this.blurMat = mkMat(BLUR_FS, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.copyMat = mkMat(COPY_FS, { tDiffuse: { value: null } });
    this.compMat = mkMat(COMPOSITE_FS, {
      tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
      uStrength: { value: this.strength }, uExposure: { value: this.exposure },
      uResolution: { value: new THREE.Vector2(1, 1) },
    });

    this.levels = [];
    this.rtScene = null;
    this.setSize(1, 1, 1);
  }

  dispose() {
    if (this.rtScene) this.rtScene.dispose();
    for (const lv of this.levels) { lv.a.dispose(); lv.b.dispose(); }
    this.levels.length = 0;
    this.quadGeo.dispose();
    for (const m of [this.brightMat, this.blurMat, this.copyMat, this.compMat]) m.dispose();
  }

  _mkRT(w, h, depth = false) {
    const rt = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
      type: this.type,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: depth,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    return rt;
  }

  setSize(w, h, pixelRatio) {
    w = Math.max(1, Math.floor(w * pixelRatio));
    h = Math.max(1, Math.floor(h * pixelRatio));
    if (this._w === w && this._h === h) return;
    this._w = w; this._h = h;

    if (this.rtScene) this.rtScene.dispose();
    this.rtScene = this._mkRT(w, h, true);

    for (const lv of this.levels) { lv.a.dispose(); lv.b.dispose(); }
    this.levels.length = 0;
    for (let i = 0; i < 3; i++) {
      const d = Math.pow(2, i + 1);
      const lw = Math.max(4, Math.floor(w / d));
      const lh = Math.max(4, Math.floor(h / d));
      this.levels.push({ a: this._mkRT(lw, lh), b: this._mkRT(lw, lh), w: lw, h: lh });
    }
    this.compMat.uniforms.uResolution.value.set(w, h);
  }

  _draw(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  _blur(rtA, rtB, w, h) {
    this.blurMat.uniforms.tDiffuse.value = rtA.texture;
    this.blurMat.uniforms.uDir.value.set(1 / w, 0);
    this._draw(this.blurMat, rtB);

    this.blurMat.uniforms.tDiffuse.value = rtB.texture;
    this.blurMat.uniforms.uDir.value.set(0, 1 / h);
    this._draw(this.blurMat, rtA);
  }

  render() {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }

    /* 1. 场景 → HDR 缓冲 */
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(this.scene, this.camera);

    /* 2. 亮度提取（1/2 分辨率） */
    this.brightMat.uniforms.tDiffuse.value = this.rtScene.texture;
    this.brightMat.uniforms.uThreshold.value = this.threshold;
    this.brightMat.uniforms.uKnee.value = this.knee;
    this._draw(this.brightMat, this.levels[0].a);

    /* 3. 逐级降采样 + 高斯模糊 */
    const L = this.levels;
    this._blur(L[0].a, L[0].b, L[0].w, L[0].h);
    for (let i = 1; i < L.length; i++) {
      this.copyMat.uniforms.tDiffuse.value = L[i - 1].a.texture;
      this._draw(this.copyMat, L[i].a);
      this._blur(L[i].a, L[i].b, L[i].w, L[i].h);
    }

    /* 4. 合成到画布 */
    this.compMat.uniforms.tScene.value = this.rtScene.texture;
    this.compMat.uniforms.tB0.value = L[0].a.texture;
    this.compMat.uniforms.tB1.value = L[1].a.texture;
    this.compMat.uniforms.tB2.value = L[2].a.texture;
    this.compMat.uniforms.uStrength.value = this.strength;
    this.compMat.uniforms.uExposure.value = this.exposure;
    this._draw(this.compMat, null);
  }
}
