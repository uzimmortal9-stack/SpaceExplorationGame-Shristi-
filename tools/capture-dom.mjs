/**
 * capture-dom.mjs — minimal DOM/browser shims so three.js and the game's
 * world-building code can run under Node for offline verification.
 */

// ---------------------------------------------------------------- DOM shims

class FakeCtx {
  constructor(w, h) { this.canvas = { width: w, height: h }; }
  fillRect() {} strokeRect() {} beginPath() {} moveTo() {} lineTo() {}
  stroke() {} fill() {} fillText() {} strokeText() {} arc() {} closePath() {}
  save() {} restore() {} translate() {} rotate() {} scale() {} clearRect() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  drawImage() {} putImageData() {}
  getImageData(_x, _y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  measureText(t) { return { width: (t?.length ?? 0) * 8 }; }
  set font(_v) {} get font() { return ''; }
  set fillStyle(_v) {} get fillStyle() { return '#000'; }
  set strokeStyle(_v) {} get strokeStyle() { return '#000'; }
  set lineWidth(_v) {} get lineWidth() { return 1; }
  set textAlign(_v) {} get textAlign() { return 'left'; }
  set textBaseline(_v) {} get textBaseline() { return 'top'; }
  set globalAlpha(_v) {} get globalAlpha() { return 1; }
}

function makeCanvas(w = 300, h = 150) {
  return {
    width: w, height: h, style: {},
    getContext: () => new FakeCtx(w, h),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    addEventListener() {}, removeEventListener() {},
  };
}

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
  createElementNS: (_ns, tag) => (tag === 'canvas' ? makeCanvas() : { style: {} }),
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {
    style: {}, className: '', dataset: {}, children: [],
    append() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  }),
  body: { append() {}, appendChild() {}, style: {} },
  documentElement: { style: {} },
  addEventListener() {}, removeEventListener() {},
  getElementById: () => null,
};
globalThis.HTMLCanvasElement = function () {};
globalThis.HTMLImageElement = function () {};
globalThis.ImageData = function () {};
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.location = { href: 'http://localhost/', reload() {} };

// three.js loads textures through an Image element; Node has no decoder, so
// hand back a resolved 1x1 stub. Materials keep their structure and the
// console stays readable.
globalThis.Image = class {
  constructor() {
    this.width = 1;
    this.height = 1;
    setTimeout(() => this.onload?.(), 0);
  }
  set src(_v) {}
  get src() { return ''; }
  addEventListener(t, fn) { if (t === 'load') setTimeout(fn, 0); }
  removeEventListener() {}
};
globalThis.Blob = globalThis.Blob ?? class {};
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    Promise.resolve(blob.arrayBuffer()).then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};

