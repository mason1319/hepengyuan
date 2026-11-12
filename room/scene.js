/* 何鹏远个人网站 —— hi-fi 版：可交互的 3D 夜间工作台

   这个模块只负责「画面」：建场景、处理指针、把热点投影成可以聚焦的链接。
   要不要启动、什么时候降级、进入网站之后做什么，全部由 /room/boot.js 决定。

   约束：
   - 纯程序化建模，没有外部模型；唯一的图片是站内已公开的宣传片封面。
   - 只依赖自托管的 three.js（CSP 是 script-src 'self'，不能换成 CDN）。
   - 墙上的年份卡片逐字来自首页 Work 区，这里不新增任何履历或事实。 */

import * as THREE from "/assets/vendor/three-0.170.0.module.min.js";

const TAU = Math.PI * 2;
const { degToRad: rad, radToDeg: deg, clamp, lerp } = THREE.MathUtils;

const OSD = '"VT323", ui-monospace, "Courier New", "PingFang SC", monospace';
const SERIF = '"Literata", "Songti SC", "Noto Serif SC", "Source Han Serif SC", SimSun, Georgia, serif';
const SANS = '"Fira Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';

const AMBER = "#ffb45e";
const AMBER_DIM = "#a56f37";
const CORAL = 0xff7a5c;

/* 热点 = 首页导航。href 与 index.html 的锚点、子页一一对应。 */
export const HOTSPOTS = [
  { id: "enter", label: "ENTER", sub: "进入网站", href: "#top" },
  { id: "work", label: "WORK", sub: "公开履历", href: "#work" },
  { id: "film", label: "FILM", sub: "个人宣传片", href: "#personal-film" },
  { id: "posts", label: "POSTS", sub: "文章与影像", href: "#posts" },
  { id: "services", label: "SERVICES", sub: "服务与交付", href: "/services/" },
  { id: "online", label: "ONLINE", sub: "联系方式", href: "#contact" },
  { id: "game", label: "GAME", sub: "Aggie 3A 互动演示", href: "/aggie-3a/" },
];

/* 与首页 Work 区保持逐字一致。改履历时两处一起改。 */
const TIMELINE = [
  ["2009", "互联网金融"],
  ["2014", "比特币 · 以太坊"],
  ["2019", "数字资产交易平台"],
  ["2021", "传媒公司"],
  ["至今", "K12 教育培训机构"],
  ["现在", "Aggie 速记英语"],
];

/* ------------------------------------------------------------------ 小工具 */

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function woodTexture(base, dark, light, seed) {
  return canvasTexture(512, 512, (g, w, h) => {
    const rnd = makeRng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 280; i += 1) {
      const y = rnd() * h;
      const amp = 2 + rnd() * 5;
      const waves = 1 + rnd() * 2.5;
      const phase = rnd() * TAU;
      g.globalAlpha = 0.05 + rnd() * 0.13;
      g.strokeStyle = rnd() > 0.5 ? dark : light;
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin((x / w) * TAU * waves + phase) * amp);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

function speckleTexture(base, seed, amount = 0.05) {
  return canvasTexture(256, 256, (g, w, h) => {
    const rnd = makeRng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i += 1) {
      g.globalAlpha = rnd() * amount;
      g.fillStyle = rnd() > 0.5 ? "#ffffff" : "#000000";
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
    g.globalAlpha = 1;
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const gradient = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(255,255,255,.45)");
    gradient.addColorStop(0.6, "rgba(255,255,255,.1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
  });
}

function std(color, roughness = 0.85, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

/* 用两个对角点描述一块板子，比 position + size 更不容易算错墙洞。 */
function slab(x0, x1, y0, y1, z0, z1, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return shadowed(mesh);
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return shadowed(mesh);
}

/* 圆角盒：极小圆角的矩形 + 倒角挤出。three 核心里没有 RoundedBoxGeometry。 */
function roundedBoxGeometry(w, h, d, r, segments = 3) {
  const radius = Math.min(r, w / 2, h / 2, d / 2) - 1e-5;
  const eps = 1e-5;
  const shape = new THREE.Shape();
  const iw = w - radius * 2;
  const ih = h - radius * 2;
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, ih - eps, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(iw - eps, ih - eps, eps, Math.PI / 2, 0, true);
  shape.absarc(iw - eps, eps, eps, 0, -Math.PI / 2, true);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d - radius * 2,
    bevelEnabled: true,
    bevelSegments: segments,
    bevelSize: radius,
    bevelThickness: radius,
    curveSegments: segments,
    steps: 1,
  });
  geometry.center();
  return geometry;
}

function roundedBox(w, h, d, r, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(roundedBoxGeometry(w, h, d, r), material);
  mesh.position.set(x, y, z);
  return shadowed(mesh);
}

function rod(from, to, radius, material) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return shadowed(mesh);
}

/* 看不见但能被射线命中的盒子：让小物件更好点。 */
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
function hitBox(w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), HIT_MATERIAL);
  mesh.position.set(x, y, z);
  return mesh;
}

/* ------------------------------------------------------------------ 雨窗
   窗外是程序化的夜景光斑（不指向任何具体城市），玻璃上有静止水珠和
   走走停停往下流的水滴。水滴被当成小透镜：在水滴里采样偏移后的窗外。 */

const RAIN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RAIN_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uSize;
varying vec2 vUv;

float h11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 h22(vec2 p) { return vec2(h21(p), h21(p + 19.19)); }

vec3 lightColor(float t) {
  vec3 c = vec3(1.0, 0.66, 0.32);
  c = mix(c, vec3(0.62, 0.78, 1.0), step(0.42, t));
  c = mix(c, vec3(0.35, 0.92, 0.82), step(0.66, t));
  c = mix(c, vec3(1.0, 0.36, 0.34), step(0.82, t));
  c = mix(c, vec3(1.0, 0.48, 0.36), step(0.93, t));
  return c;
}

vec3 bokeh(vec2 p, float scale, float seed, float soft) {
  p *= scale;
  vec2 id = floor(p);
  vec2 gv = fract(p) - 0.5;
  vec3 col = vec3(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 cid = id + o;
      float n = h21(cid + seed);
      if (n < 0.5) continue;
      vec2 c = (h22(cid + seed * 1.31) - 0.5) * 0.8;
      float r = mix(0.13, 0.36, h21(cid + seed * 2.17));
      float d = length(gv - o - c);
      float disc = smoothstep(r, r - soft, d);
      disc *= 0.7 + 0.3 * smoothstep(r - soft * 3.0, r - soft, d);
      float twinkle = 0.8 + 0.2 * sin(uTime * (0.5 + n * 1.6) + n * 50.0);
      col += lightColor(h21(cid + seed * 3.7)) * disc * twinkle;
    }
  }
  return col;
}

vec3 outside(vec2 uv, float soft) {
  vec2 p = vec2(uv.x * uSize.x / uSize.y, uv.y);
  vec3 col = mix(vec3(0.012, 0.02, 0.045), vec3(0.05, 0.075, 0.14), smoothstep(-0.1, 1.1, uv.y));
  float band = smoothstep(1.02, 0.3, uv.y);
  col += bokeh(p, 5.5, 1.0, soft) * 0.42 * band;
  col += bokeh(p + 7.3, 10.0, 9.0, soft * 1.6) * 0.22 * band;
  return col;
}

/* xy = 折射偏移，z = 水量 */
vec3 slide(vec2 uv, float t, float cols, float rows, float seed) {
  vec2 g = vec2(uv.x * cols, (1.0 - uv.y) * rows);
  float column = floor(g.x);
  float cs = h11(column * 7.13 + seed);
  g.y -= t * (0.3 + cs * 0.45) + cs * 13.0;
  float gy = g.y;
  vec2 id = vec2(column, floor(g.y));
  vec2 f = fract(g) - 0.5;
  float n = h21(id + seed);
  float on = step(0.42, n);
  float phase = t * (1.0 + n * 0.9) + n * 6.283;
  float yc = -0.22 * sin(phase + sin(phase) * 0.6);
  float xc = (n - 0.5) * 0.5 + 0.06 * sin(gy * 4.7 + cs * 40.0);
  vec2 cell = uSize / vec2(cols, rows);
  vec2 q = vec2(f.x - xc, f.y - yc) * cell;
  float r = mix(0.007, 0.0125, h21(id + seed + 5.0));
  float d = length(q * vec2(1.0, 0.8));
  float drop = smoothstep(r, r * 0.5, d) * on;
  float above = clamp((yc - f.y) / (yc + 0.5), 0.0, 1.0);
  float width = smoothstep(r * 0.6, r * 0.2, abs(q.x));
  float beads = smoothstep(0.45, 0.1, abs(fract(gy * 7.0) - 0.5));
  float trail = width * step(f.y, yc) * (1.0 - above) * (0.3 + 0.7 * beads) * on;
  vec2 off = (q / r) * drop + vec2(q.x / r, 0.0) * trail * 0.5;
  return vec3(off, max(drop, trail * 0.55));
}

vec3 stills(vec2 uv, float t, float perMeter, float seed) {
  vec2 g = uv * uSize * perMeter;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = h21(id + seed);
  vec2 c = (h22(id + seed * 1.7) - 0.5) * 0.6;
  float life = fract(t * 0.045 * (0.5 + h) + h * 9.0);
  float r = mix(0.08, 0.22, h) * smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.8, life);
  vec2 q = f - c;
  float m = smoothstep(r, r * 0.5, length(q)) * step(0.35, h);
  return vec3(q / max(r, 0.001) * m, m);
}

void main() {
  float t = uTime;
  vec3 a = slide(vUv, t, 8.0, 2.0, 0.0);
  vec3 b = slide(vUv + vec2(0.37, 0.0), t * 1.15, 13.0, 3.2, 3.0);
  vec3 s1 = stills(vUv, t, 30.0, 1.0);
  vec3 s2 = stills(vUv, t, 55.0, 5.0);

  vec2 off = a.xy * 0.09 + b.xy * 0.06 + s1.xy * 0.035 + s2.xy * 0.02;
  float water = clamp(a.z + b.z + s1.z * 0.8 + s2.z * 0.6, 0.0, 1.0);
  float soft = mix(0.2, 0.05, water);

  vec3 col = outside(vUv - off, soft);
  col = mix(col + vec3(0.012, 0.016, 0.026), col * 1.3, water);

  /* 空中的雨丝 */
  vec2 rp = vec2(vUv.x * uSize.x / uSize.y * 40.0 + vUv.y * 5.0, vUv.y * 1.6 + t * 2.4);
  float rid = floor(rp.x);
  float seg = fract(rp.y * (0.6 + h11(rid)) + h11(rid * 3.1) * 10.0);
  float streak = smoothstep(0.09, 0.0, abs(fract(rp.x) - 0.5))
    * smoothstep(0.0, 0.1, seg) * smoothstep(0.5, 0.1, seg) * step(0.55, h11(rid + 2.0));
  col += vec3(0.45, 0.55, 0.75) * streak * 0.06 * (1.0 - water);

  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  col *= 0.72 + 0.28 * smoothstep(0.0, 0.1, edge);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ 屏幕 */

function drawCrt(g, W, H, state) {
  g.fillStyle = "#0a0603";
  g.fillRect(0, 0, W, H);

  const wash = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.75);
  wash.addColorStop(0, "rgba(255,160,70,.11)");
  wash.addColorStop(1, "rgba(255,160,70,0)");
  g.fillStyle = wash;
  g.fillRect(0, 0, W, H);

  g.textBaseline = "top";
  g.fillStyle = AMBER_DIM;
  g.font = `34px ${OSD}`;
  g.textAlign = "left";
  g.fillText("HEPENGYUAN.COM", 60, 46);
  g.textAlign = "right";
  g.fillText(state.clock, W - 60, 46);
  g.textAlign = "left";
  g.fillRect(60, 92, W - 120, 2);

  g.fillStyle = AMBER;
  g.font = `600 78px ${SERIF}`;
  g.fillText("你好，我是何鹏远。", 56, 122);
  g.fillStyle = AMBER_DIM;
  g.font = `38px ${OSD}`;
  g.fillText("HE PENGYUAN  /  HPY", 60, 226);

  const rows = HOTSPOTS.filter((hotspot) => hotspot.id !== "enter");
  rows.forEach((hotspot, index) => {
    const y = 296 + index * 54;
    const active = state.hover === hotspot.id;
    if (active) {
      g.fillStyle = AMBER;
      g.fillRect(52, y - 4, W - 104, 50);
    }
    g.fillStyle = active ? "#0a0603" : AMBER;
    g.font = `44px ${OSD}`;
    g.fillText(`${active ? ">" : " "} ${hotspot.label}`, 60, y);
    g.fillStyle = active ? "#0a0603" : AMBER_DIM;
    g.font = `28px ${SANS}`;
    g.fillText(hotspot.sub, 330, y + 7);
  });

  const enter = state.hover === "enter";
  const promptY = H - 110;
  g.fillStyle = enter ? AMBER : "rgba(255,180,94,.14)";
  g.fillRect(52, promptY - 10, 470, 62);
  g.fillStyle = enter ? "#0a0603" : AMBER;
  g.font = `30px ${SANS}`;
  g.fillText("点击屏幕，进入网站", 70, promptY + 4);
  if (state.blink) {
    g.fillStyle = AMBER;
    g.fillRect(540, promptY - 2, 22, 44);
  }

  g.fillStyle = "rgba(0,0,0,.2)";
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1.4);
}

function clockText() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function phoneTexture() {
  return canvasTexture(256, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#16203a");
    sky.addColorStop(1, "#2a1a24");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillStyle = "#ece8dd";
    g.font = `92px ${OSD}`;
    g.fillText(clockText(), w / 2, 70);
    g.font = `34px ${OSD}`;
    g.fillStyle = "#b9b4a8";
    g.fillText("ONLINE", w / 2, 170);
    const rows = ["微信", "抖音", "邮箱", "Telegram"];
    rows.forEach((name, index) => {
      const y = 250 + index * 58;
      g.fillStyle = "rgba(236,232,221,.13)";
      g.beginPath();
      /* roundRect 在较旧的 Safari / WebView 里还没有；没有就画直角，不能因此整个房间起不来。 */
      if (typeof g.roundRect === "function") g.roundRect(22, y, w - 44, 46, 12);
      else g.rect(22, y, w - 44, 46);
      g.fill();
      g.fillStyle = index === 0 ? "#ff7a5c" : "#8f8b80";
      g.beginPath();
      g.arc(46, y + 23, 7, 0, TAU);
      g.fill();
      g.fillStyle = "#ece8dd";
      g.textAlign = "left";
      g.font = `26px ${SANS}`;
      g.fillText(name, 66, y + 9);
    });
  });
}

function handheldTexture() {
  return canvasTexture(320, 200, (g, w, h) => {
    g.fillStyle = "#101a2c";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c2f4f";
    for (let i = 0; i < 9; i += 1) g.fillRect(0, 120 + i * 9, w, 4);
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillStyle = "#ffcf7a";
    g.font = `66px ${OSD}`;
    g.fillText("AGGIE 3A", w / 2, 22);
    g.fillStyle = "#ff7a5c";
    g.font = `34px ${OSD}`;
    g.fillText("> PRESS START", w / 2, 104);
    g.fillStyle = "#8fb3e8";
    g.font = `26px ${OSD}`;
    g.fillText("V6  WEB", w / 2, 152);
  });
}

function cardTexture(year, caption, seed) {
  return canvasTexture(256, 320, (g, w, h) => {
    const rnd = makeRng(seed);
    g.fillStyle = ["#efe6cf", "#e9dfc9", "#f1e3c4"][Math.floor(rnd() * 3)];
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(120,90,40,.08)";
    for (let i = 0; i < 400; i += 1) g.fillRect(rnd() * w, rnd() * h, 2, 2);
    g.fillStyle = "#94440f";
    g.fillRect(24, 34, w - 48, 6);
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillStyle = "#1c1b22";
    const latin = /^[0-9A-Za-z]+$/.test(year);
    g.font = latin ? `118px ${OSD}` : `700 84px ${SERIF}`;
    g.fillText(year, w / 2, latin ? 62 : 78);
    g.fillStyle = "#3a3844";
    g.font = `500 30px ${SANS}`;
    const lines = caption.length > 7 ? [caption.slice(0, Math.ceil(caption.length / 2)), caption.slice(Math.ceil(caption.length / 2))] : [caption];
    lines.forEach((line, index) => g.fillText(line.trim(), w / 2, 206 + index * 40));
  });
}

function rugTexture() {
  return canvasTexture(512, 384, (g, w, h) => {
    const rnd = makeRng(41);
    g.fillStyle = "#5c2c33";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c79a5b";
    g.lineWidth = 6;
    g.strokeRect(22, 22, w - 44, h - 44);
    g.strokeStyle = "#7d3a34";
    g.lineWidth = 14;
    g.strokeRect(46, 46, w - 92, h - 92);
    g.fillStyle = "rgba(0,0,0,.1)";
    for (let i = 0; i < 3000; i += 1) g.fillRect(rnd() * w, rnd() * h, 2, 2);
  });
}

/* ------------------------------------------------------------------ 场景 */

function buildScene({ scene, renderer, posterUrl, quality }) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const hotspots = {};
  const tickers = [];
  const moodLights = []; /* 只管氛围的点光源，低画质下关掉 */
  const glow = glowTexture();

  const addHotspot = (id, group, anchor, view) => {
    group.userData.hotspot = id;
    hotspots[id] = { group, anchor: new THREE.Vector3(...anchor), view };
  };

  /* ---- 房间外壳 */
  const wallMaterial = std(0xffffff, 0.95, 0, { map: speckleTexture("#4d5168", 3) });
  wallMaterial.map.wrapS = wallMaterial.map.wrapT = THREE.RepeatWrapping;
  wallMaterial.map.repeat.set(3, 2);
  const floorMaterial = std(0xffffff, 0.75, 0, { map: woodTexture("#4c3729", "#241710", "#6b4f3c", 7) });
  floorMaterial.map.wrapS = floorMaterial.map.wrapT = THREE.RepeatWrapping;
  floorMaterial.map.repeat.set(1, 4);
  floorMaterial.map.rotation = Math.PI / 2;
  const trim = std(0x1d1e26, 0.7);

  const WIN = { x0: 0.24, x1: 1.44, y0: 1.02, y1: 1.98 };
  const BACK = -1.6;

  const room = new THREE.Group();
  room.add(slab(-2.4, WIN.x0, 0, 2.7, BACK - 0.14, BACK, wallMaterial));
  room.add(slab(WIN.x1, 2.4, 0, 2.7, BACK - 0.14, BACK, wallMaterial));
  room.add(slab(WIN.x0, WIN.x1, 0, WIN.y0, BACK - 0.14, BACK, wallMaterial));
  room.add(slab(WIN.x0, WIN.x1, WIN.y1, 2.7, BACK - 0.14, BACK, wallMaterial));
  room.add(slab(-2.54, -2.4, 0, 2.7, BACK - 0.14, 2.4, wallMaterial));
  room.add(slab(2.4, 2.54, 0, 2.7, BACK - 0.14, 2.4, wallMaterial));
  room.add(slab(-2.54, 2.54, 2.7, 2.8, BACK - 0.14, 2.4, wallMaterial));
  room.add(slab(-2.54, 2.54, -0.1, 0, BACK - 0.14, 2.4, floorMaterial));
  room.add(slab(-2.4, 2.4, 0, 0.09, BACK, BACK + 0.015, trim));

  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.7), std(0xffffff, 0.98, 0, { map: rugTexture() }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.05, 0.003, 0.1);
  rug.receiveShadow = true;
  room.add(rug);

  /* ---- 窗 */
  const rain = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0) } },
    vertexShader: RAIN_VERTEX,
    fragmentShader: RAIN_FRAGMENT,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), rain);
  glass.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, BACK - 0.1);
  room.add(glass);

  const frame = 0.035;
  const fz0 = BACK - 0.11;
  const fz1 = BACK - 0.06;
  room.add(slab(WIN.x0, WIN.x1, WIN.y0, WIN.y0 + frame, fz0, fz1, trim));
  room.add(slab(WIN.x0, WIN.x1, WIN.y1 - frame, WIN.y1, fz0, fz1, trim));
  room.add(slab(WIN.x0, WIN.x0 + frame, WIN.y0, WIN.y1, fz0, fz1, trim));
  room.add(slab(WIN.x1 - frame, WIN.x1, WIN.y0, WIN.y1, fz0, fz1, trim));
  const midX = (WIN.x0 + WIN.x1) / 2;
  room.add(slab(midX - 0.014, midX + 0.014, WIN.y0, WIN.y1, fz0, fz1, trim));
  room.add(slab(WIN.x0, WIN.x1, 1.6, 1.626, fz0, fz1, trim));
  room.add(slab(WIN.x0 - 0.05, WIN.x1 + 0.05, WIN.y0 - 0.035, WIN.y0, BACK - 0.14, BACK + 0.09, std(0x24252e, 0.6)));
  scene.add(room);

  /* ---- 桌子 */
  const deskTop = 0.75;
  const deskWood = std(0xffffff, 0.55, 0, { map: woodTexture("#7a5236", "#3d2616", "#a87a52", 11) });
  deskWood.map.anisotropy = anisotropy;
  const deskDark = std(0x17181e, 0.6, 0.3);
  const desk = new THREE.Group();
  desk.add(slab(-1.0, 1.0, deskTop - 0.04, deskTop, -1.585, -0.76, deskWood));
  desk.add(slab(-0.96, -0.92, 0, deskTop - 0.04, -1.56, -0.8, deskDark));
  desk.add(slab(0.92, 0.96, 0, deskTop - 0.04, -1.56, -0.8, deskDark));
  desk.add(slab(-0.92, 0.92, 0.04, deskTop - 0.04, -1.56, -1.54, deskDark));
  scene.add(desk);

  /* ---- CRT 显示器（ENTER） */
  const beige = std(0xb8b09c, 0.62);
  const monitor = new THREE.Group();
  monitor.position.set(-0.22, deskTop, -1.27);
  monitor.rotation.y = 0.14;
  monitor.add(roundedBox(0.27, 0.03, 0.25, 0.012, beige, 0, 0.015, 0));
  monitor.add(box(0.13, 0.03, 0.15, std(0x8f8876, 0.7), 0, 0.042, -0.01));
  monitor.add(roundedBox(0.45, 0.375, 0.38, 0.03, beige, 0, 0.245, 0));
  monitor.add(roundedBox(0.385, 0.305, 0.02, 0.012, std(0x121218, 0.5), 0, 0.255, 0.184));

  const crtCanvas = document.createElement("canvas");
  crtCanvas.width = 1024;
  crtCanvas.height = 768;
  const crtContext = crtCanvas.getContext("2d");
  const crtTexture = new THREE.CanvasTexture(crtCanvas);
  crtTexture.colorSpace = THREE.SRGBColorSpace;
  crtTexture.anisotropy = anisotropy;
  const crtGeometry = new THREE.PlaneGeometry(0.345, 0.259, 24, 18);
  const crtPositions = crtGeometry.attributes.position;
  for (let i = 0; i < crtPositions.count; i += 1) {
    const nx = crtPositions.getX(i) / 0.1725;
    const ny = crtPositions.getY(i) / 0.1295;
    crtPositions.setZ(i, -0.005 * (nx * nx + ny * ny));
  }
  crtGeometry.computeVertexNormals();
  const crtMaterial = new THREE.MeshBasicMaterial({ map: crtTexture, toneMapped: false });
  const crt = new THREE.Mesh(crtGeometry, crtMaterial);
  crt.position.set(0, 0.255, 0.206);
  monitor.add(crt);

  const powerLed = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7dff8a }));
  powerLed.position.set(0.185, 0.085, 0.191);
  monitor.add(powerLed);
  monitor.add(box(0.05, 0.008, 0.004, std(0x8f8876, 0.6), -0.16, 0.085, 0.191));

  const crtGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xff9a50, opacity: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  crtGlow.scale.set(1.25, 1.0, 1);
  crtGlow.raycast = () => {}; /* 光晕只是装饰，不能挡住旁边物件的点击 */
  crtGlow.position.set(0, 0.255, 0.24);
  monitor.add(crtGlow);

  const crtLight = new THREE.PointLight(0xffa25a, 0.2, 2.4, 2);
  crtLight.position.set(0, 0.26, 0.42);
  monitor.add(crtLight);
  scene.add(monitor);
  addHotspot("enter", monitor, [-0.2, 1.2, -1.15], { pos: [-0.176, 1.006, -0.69], look: [-0.196, 1.004, -1.2] });

  const crtState = { hover: null, blink: true, clock: clockText() };
  const redrawCrt = () => {
    drawCrt(crtContext, 1024, 768, crtState);
    crtTexture.needsUpdate = true;
  };

  /* ---- 键盘与鼠标 */
  const keyboard = new THREE.Group();
  keyboard.position.set(-0.19, deskTop, -0.93);
  keyboard.rotation.y = 0.06;
  const board = roundedBox(0.43, 0.02, 0.155, 0.008, std(0xa9a18d, 0.7), 0, 0.012, 0);
  board.rotation.x = 0.05;
  keyboard.add(board);
  const keyGeometry = new THREE.BoxGeometry(0.0235, 0.009, 0.021);
  const keys = new THREE.InstancedMesh(keyGeometry, std(0xffffff, 0.6), 70);
  const keyMatrix = new THREE.Matrix4();
  const keyColor = new THREE.Color();
  let keyIndex = 0;
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 14; col += 1) {
      const x = (col - 6.5) * 0.0285;
      const z = (row - 2) * 0.0265;
      keyMatrix.makeTranslation(x, 0.027 - z * 0.05, z);
      keys.setMatrixAt(keyIndex, keyMatrix);
      const accent = (row === 0 && col === 0) || (row === 2 && col === 13);
      keyColor.set(accent ? 0xe0603f : (row + col) % 9 === 0 ? 0xbdb5a0 : 0xe2dccb);
      keys.setColorAt(keyIndex, keyColor);
      keyIndex += 1;
    }
  }
  keys.instanceMatrix.needsUpdate = true;
  keys.instanceColor.needsUpdate = true;
  keys.castShadow = true;
  keyboard.add(keys);
  scene.add(keyboard);
  scene.add(roundedBox(0.058, 0.03, 0.098, 0.014, std(0xb8b09c, 0.6), 0.115, deskTop + 0.015, -0.93));

  /* ---- NAS（SERVICES） */
  const nas = new THREE.Group();
  nas.position.set(-0.76, deskTop, -1.31);
  nas.rotation.y = 0.3;
  nas.add(roundedBox(0.17, 0.25, 0.22, 0.014, std(0x3b3e4a, 0.45, 0.4), 0, 0.132, 0));
  const leds = [];
  for (let i = 0; i < 4; i += 1) {
    nas.add(box(0.13, 0.04, 0.004, std(0x121318, 0.5, 0.3), -0.004, 0.062 + i * 0.05, 0.111));
    nas.add(box(0.05, 0.004, 0.005, std(0x3a3d48, 0.4, 0.5), -0.03, 0.062 + i * 0.05, 0.1125));
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.004), new THREE.MeshBasicMaterial({ color: 0x66ff9a }));
    led.position.set(0.048, 0.062 + i * 0.05, 0.1135);
    nas.add(led);
    leds.push(led);
  }
  const nasPower = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.004), new THREE.MeshBasicMaterial({ color: CORAL }));
  nasPower.position.set(-0.058, 0.232, 0.1125);
  nas.add(nasPower);
  nas.add(box(0.15, 0.008, 0.2, std(0x0e0f13, 0.7), 0, 0.004, 0));
  scene.add(nas);
  addHotspot("services", nas, [-0.76, 1.06, -1.25], { pos: [-0.62, 0.99, -0.74], look: [-0.76, 0.89, -1.3] });
  const ledOn = new THREE.Color(0x66ff9a);
  const ledBusy = new THREE.Color(0xffb45e);
  const ledOff = new THREE.Color(0x0d2416);
  tickers.push((time) => {
    leds.forEach((led, index) => {
      const pulse = Math.sin(time * (3.1 + index * 1.7) + index * 2.1) + Math.sin(time * (7.3 + index) + index);
      led.material.color.copy(pulse > 1.1 ? ledBusy : pulse > -0.9 ? ledOn : ledOff);
    });
  });

  /* ---- 掌机（GAME） */
  const handheld = new THREE.Group();
  handheld.position.set(-0.6, deskTop, -0.9);
  handheld.rotation.y = 0.42;
  handheld.add(box(0.13, 0.01, 0.07, std(0x17181e, 0.6), 0, 0.005, -0.012));
  const cradle = box(0.1, 0.07, 0.008, std(0x17181e, 0.6), 0, 0.04, -0.03);
  cradle.rotation.x = -0.5;
  handheld.add(cradle);
  const device = new THREE.Group();
  device.position.set(0, 0.062, 0.004);
  device.rotation.x = -0.5;
  device.add(roundedBox(0.205, 0.092, 0.02, 0.009, std(0xdcd6c6, 0.5)));
  const handheldScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.104, 0.065), new THREE.MeshBasicMaterial({ map: handheldTexture(), toneMapped: false }));
  handheldScreen.position.set(0, 0.002, 0.0103);
  device.add(handheldScreen);
  device.add(box(0.114, 0.075, 0.002, std(0x101014, 0.4), 0, 0.002, 0.0096));
  const padMaterial = std(0x24252c, 0.5);
  device.add(box(0.026, 0.008, 0.004, padMaterial, -0.078, 0.004, 0.011));
  device.add(box(0.008, 0.026, 0.004, padMaterial, -0.078, 0.004, 0.011));
  const buttonMaterial = std(CORAL, 0.4);
  for (const [bx, by] of [[0.072, 0.012], [0.086, -0.004]]) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 16), buttonMaterial);
    button.rotation.x = Math.PI / 2;
    button.position.set(bx, by, 0.011);
    device.add(button);
  }
  handheld.add(device);
  handheld.add(hitBox(0.24, 0.14, 0.1, 0, 0.07, 0));
  const handheldLight = new THREE.PointLight(0x7aa8ff, 0.03, 0.6, 2);
  handheldLight.position.set(0, 0.09, 0.08);
  handheld.add(handheldLight);
  moodLights.push(handheldLight);
  scene.add(handheld);
  addHotspot("game", handheld, [-0.6, 0.9, -0.9], { pos: [-0.47, 0.92, -0.55], look: [-0.6, 0.81, -0.9] });

  /* ---- 手机（ONLINE） */
  const phone = new THREE.Group();
  phone.position.set(0.55, deskTop, -0.92);
  phone.rotation.y = -0.3;
  phone.add(box(0.07, 0.008, 0.06, std(0x17181e, 0.6), 0, 0.004, -0.014));
  const phoneBack = box(0.05, 0.1, 0.006, std(0x17181e, 0.6), 0, 0.05, -0.03);
  phoneBack.rotation.x = -0.32;
  phone.add(phoneBack);
  const handset = new THREE.Group();
  handset.position.set(0, 0.084, -0.006);
  handset.rotation.x = -0.32;
  handset.add(roundedBox(0.073, 0.152, 0.009, 0.0042, std(0x1b1c22, 0.35, 0.5)));
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.142), new THREE.MeshBasicMaterial({ map: phoneTexture(), toneMapped: false }));
  phoneScreen.position.z = 0.0048;
  handset.add(phoneScreen);
  phone.add(handset);
  phone.add(hitBox(0.11, 0.19, 0.1, 0, 0.09, 0));
  scene.add(phone);
  addHotspot("online", phone, [0.55, 0.93, -0.92], { pos: [0.44, 0.93, -0.55], look: [0.55, 0.83, -0.92] });

  /* ---- 书（POSTS） */
  const books = new THREE.Group();
  books.position.set(0.3, deskTop, -1.33);
  books.rotation.y = -0.18;
  const paper = std(0xe8dfc8, 0.9);
  let stackY = 0;
  [[0.27, 0.036, 0.195, 0x7a2e2a, 0.02], [0.245, 0.03, 0.18, 0x26405e, -0.07], [0.255, 0.042, 0.19, 0xcfc4a8, 0.05], [0.21, 0.024, 0.155, 0x35523f, -0.12]]
    .forEach(([w, h, d, color, turn]) => {
      const book = new THREE.Group();
      book.add(box(w, h, d, std(color, 0.8)));
      book.add(box(w - 0.012, h - 0.008, d - 0.006, paper, 0.008, 0, 0.004));
      book.position.y = stackY + h / 2;
      book.rotation.y = turn;
      books.add(book);
      stackY += h;
    });
  const pen = rod(new THREE.Vector3(-0.06, stackY + 0.005, 0.03), new THREE.Vector3(0.07, stackY + 0.005, -0.02), 0.0045, std(CORAL, 0.4));
  books.add(pen);
  books.add(hitBox(0.3, stackY + 0.04, 0.22, 0, stackY / 2, 0));
  scene.add(books);
  addHotspot("posts", books, [0.3, 0.95, -1.3], { pos: [0.24, 1.02, -0.78], look: [0.3, 0.83, -1.33] });

  /* ---- 马克杯 */
  const mug = new THREE.Group();
  mug.position.set(0.78, deskTop, -1.08);
  const profile = [[0, 0], [0.036, 0], [0.04, 0.005], [0.04, 0.086], [0.0365, 0.086], [0.0365, 0.008], [0, 0.008]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  mug.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, 28), std(0xe9e2d0, 0.4, 0, { side: THREE.DoubleSide }))));
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), std(0x2a160c, 0.25));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.072;
  mug.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.006, 8, 20, Math.PI), std(0xe9e2d0, 0.4));
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.04, 0.046, 0);
  mug.add(shadowed(handle));
  mug.rotation.y = 0.7;
  scene.add(mug);

  /* ---- 台灯（点一下开关，不是导航） */
  const lamp = new THREE.Group();
  lamp.userData.action = "lamp";
  const lampMetal = std(0x1c1d24, 0.45, 0.6);
  const lampBase = new THREE.Vector3(0.84, deskTop, -1.4);
  const lampElbow = new THREE.Vector3(0.86, 1.14, -1.44);
  const lampHead = new THREE.Vector3(0.6, 1.23, -1.22);
  const lampTarget = new THREE.Vector3(0.3, deskTop, -1.02);
  const lampDirection = new THREE.Vector3().subVectors(lampTarget, lampHead).normalize();
  const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.082, 0.018, 28), lampMetal);
  baseDisc.position.copy(lampBase).add(new THREE.Vector3(0, 0.009, 0));
  lamp.add(shadowed(baseDisc));
  lamp.add(rod(lampBase.clone().add(new THREE.Vector3(0, 0.018, 0)), lampElbow, 0.008, lampMetal));
  lamp.add(rod(lampElbow, lampHead, 0.008, lampMetal));
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), lampMetal);
  joint.position.copy(lampElbow);
  lamp.add(joint);
  const shadeMaterial = std(0xd9583a, 0.45, 0.1, { side: THREE.DoubleSide, emissive: 0x4a1c0e, emissiveIntensity: 1 });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.085, 0.115, 28, 1, true), shadeMaterial);
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), lampDirection);
  shade.position.copy(lampHead).addScaledVector(lampDirection, 0.03);
  lamp.add(shade);
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffe2b8 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 12), bulbMaterial);
  bulb.position.copy(lampHead).addScaledVector(lampDirection, 0.05);
  lamp.add(bulb);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffb070, opacity: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  lampGlow.scale.set(0.42, 0.42, 1);
  lampGlow.raycast = () => {};
  lampGlow.position.copy(bulb.position);
  lamp.add(lampGlow);
  const hit = hitBox(0.22, 0.2, 0.22, 0, 0, 0);
  hit.position.copy(lampHead);
  lamp.add(hit);

  const spot = new THREE.SpotLight(0xffc48a, 2.6, 4.2, rad(44), 0.6, 2);
  spot.position.copy(lampHead).addScaledVector(lampDirection, 0.04);
  spot.target.position.copy(lampTarget);
  spot.castShadow = quality === "high";
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.08;
  spot.shadow.camera.far = 3.5;
  spot.shadow.bias = -0.0006;
  spot.shadow.radius = 5;
  lamp.add(spot);
  lamp.add(spot.target);
  const bulbLight = new THREE.PointLight(0xffb070, 0.12, 1.8, 2);
  bulbLight.position.copy(bulb.position);
  lamp.add(bulbLight);
  scene.add(lamp);

  let lampOn = true;
  let lampLevel = 1;
  const toggleLamp = () => {
    lampOn = !lampOn;
  };
  tickers.push((time, dt) => {
    lampLevel = lerp(lampLevel, lampOn ? 1 : 0, 1 - Math.exp(-dt * 9));
    spot.intensity = 2.6 * lampLevel;
    bulbLight.intensity = 0.12 * lampLevel;
    lampGlow.material.opacity = 0.5 * lampLevel;
    bulbMaterial.color.setRGB(0.16 + 0.84 * lampLevel, 0.14 + 0.75 * lampLevel, 0.12 + 0.6 * lampLevel);
    shadeMaterial.emissiveIntensity = lampLevel;
  });

  /* ---- 窗台上的植物 */
  const plant = new THREE.Group();
  plant.position.set(1.2, WIN.y0, BACK + 0.02);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.044, 0.09, 20), std(0x8a4a33, 0.85));
  pot.position.y = 0.045;
  plant.add(shadowed(pot));
  const leafMaterial = std(0x2f5a3a, 0.7);
  const leafRng = makeRng(23);
  for (let i = 0; i < 9; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), leafMaterial);
    const length = 0.09 + leafRng() * 0.07;
    leaf.scale.set(0.022, length, 0.008);
    const pivot = new THREE.Group();
    pivot.position.y = 0.085;
    pivot.rotation.y = (i / 9) * TAU + leafRng();
    pivot.rotation.z = 0.25 + leafRng() * 0.55;
    leaf.position.y = length * 0.9;
    pivot.add(shadowed(leaf));
    plant.add(pivot);
  }
  scene.add(plant);

  /* ---- 宣传片海报（FILM） */
  const poster = new THREE.Group();
  poster.position.set(-0.8, 1.49, BACK + 0.016);
  poster.add(box(0.57, 0.3356, 0.03, std(0x101014, 0.5, 0.2)));
  const posterMaterial = std(0x1a1a22, 0.6, 0, { emissive: 0x000000 });
  posterMaterial.userData.keepEmissive = true; /* 贴图异步到达，悬停高亮不能改它的自发光 */
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(0.53, 0.2981), posterMaterial);
  picture.position.z = 0.0156;
  poster.add(picture);
  scene.add(poster);
  addHotspot("film", poster, [-0.8, 1.67, BACK + 0.03], { pos: [-0.75, 1.47, -0.82], look: [-0.8, 1.488, BACK] });
  new THREE.TextureLoader().load(posterUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    posterMaterial.map = texture;
    posterMaterial.emissiveMap = texture;
    posterMaterial.color.set(0xffffff);
    posterMaterial.emissive.set(0xffffff);
    posterMaterial.emissiveIntensity = 0.55;
    posterMaterial.needsUpdate = true;
  }, undefined, () => {
    /* 海报加载失败就保留深色画框，其它一切照常。 */
  });

  /* ---- 年份卡片（WORK） */
  const cards = new THREE.Group();
  const stringY = 1.418;
  const cardZ = BACK + 0.012;
  const spanStart = -0.455;
  const spanEnd = 0.185;
  const sag = (x) => {
    const t = (x - spanStart) / (spanEnd - spanStart);
    return stringY - 0.022 * Math.sin(t * Math.PI);
  };
  const stringCurve = new THREE.CatmullRomCurve3(
    Array.from({ length: 9 }, (_, index) => {
      const x = lerp(spanStart, spanEnd, index / 8);
      return new THREE.Vector3(x, sag(x), cardZ + 0.004);
    }),
  );
  cards.add(new THREE.Mesh(new THREE.TubeGeometry(stringCurve, 24, 0.0018, 6), std(0xcdbf9a, 0.9)));
  const pinMaterial = std(0x1a1b21, 0.5, 0.4);
  for (const x of [spanStart, spanEnd]) {
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), pinMaterial);
    pin.position.set(x, sag(x), cardZ + 0.004);
    cards.add(pin);
  }
  const cardRng = makeRng(5);
  TIMELINE.forEach(([year, caption], index) => {
    const x = lerp(spanStart + 0.06, spanEnd - 0.06, index / (TIMELINE.length - 1));
    const texture = cardTexture(year, caption, 100 + index);
    texture.anisotropy = anisotropy;
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.088, 0.11),
      std(0xffffff, 0.92, 0, { map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.16, side: THREE.DoubleSide }),
    );
    const holder = new THREE.Group();
    holder.position.set(x, sag(x), cardZ + 0.006 + index * 0.0004);
    holder.rotation.z = (cardRng() - 0.5) * 0.14;
    card.position.y = -0.058;
    card.castShadow = true;
    holder.add(card);
    holder.add(box(0.012, 0.022, 0.006, std(index === TIMELINE.length - 1 ? CORAL : 0x8a6a45, 0.6), 0, -0.006, 0.002));
    cards.add(holder);
  });
  cards.add(hitBox(0.68, 0.19, 0.04, (spanStart + spanEnd) / 2, stringY - 0.07, cardZ));
  scene.add(cards);
  addHotspot("work", cards, [(spanStart + spanEnd) / 2, stringY + 0.03, cardZ], {
    pos: [-0.135, 1.345, -0.86],
    look: [-0.135, 1.352, BACK],
  });


  /* ---- 搁板与串灯（纯装饰：竖屏和较方的窗口里，墙的上半部分不能是空的） */
  const shelf = new THREE.Group();
  shelf.add(slab(-1.2, -0.3, 2.0, 2.025, BACK, BACK + 0.17, deskWood));
  shelf.add(slab(-1.12, -1.1, 1.93, 2.0, BACK, BACK + 0.15, deskDark));
  shelf.add(slab(-0.4, -0.38, 1.93, 2.0, BACK, BACK + 0.15, deskDark));
  let spineX = -1.12;
  [[0.03, 0.2, 0x7a2e2a], [0.024, 0.18, 0xcfc4a8], [0.036, 0.21, 0x26405e], [0.022, 0.17, 0x35523f], [0.03, 0.19, 0x8a6a45], [0.026, 0.2, 0x4a3a5c]]
    .forEach(([w, h, color], index) => {
      const spine = box(w, h, 0.13, std(color, 0.8), spineX + w / 2, 2.025 + h / 2, BACK + 0.085);
      if (index === 5) {
        spine.rotation.z = -0.2;
        spine.position.x += 0.022;
      }
      shelf.add(spine);
      spineX += w + 0.003;
    });
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 20), std(0xb9b09a, 0.6));
  jar.position.set(-0.62, 2.075, BACK + 0.09);
  shelf.add(shadowed(jar));
  for (let i = 0; i < 5; i += 1) {
    const stem = rod(
      new THREE.Vector3(-0.62, 2.12, BACK + 0.09),
      new THREE.Vector3(-0.62 + (i - 2) * 0.035, 2.24 + (i % 2) * 0.04, BACK + 0.09 + ((i * 7) % 3 - 1) * 0.02),
      0.0035,
      std(i % 2 ? CORAL : 0xe9e2d0, 0.6),
    );
    shelf.add(stem);
  }
  shelf.add(roundedBox(0.16, 0.1, 0.11, 0.012, std(0x2b2d37, 0.6), -0.47, 2.075, BACK + 0.085));
  scene.add(shelf);

  const fairy = new THREE.Group();
  const fairyPoints = [];
  const fairyPins = [-1.7, -0.75, 0.2, 1.15, 2.1];
  for (let i = 0; i < fairyPins.length - 1; i += 1) {
    for (let k = 0; k < 8; k += 1) {
      const t = k / 8;
      const x = lerp(fairyPins[i], fairyPins[i + 1], t);
      fairyPoints.push(new THREE.Vector3(x, 2.5 - 0.11 * Math.sin(t * Math.PI), BACK + 0.02));
    }
  }
  fairyPoints.push(new THREE.Vector3(fairyPins[fairyPins.length - 1], 2.5, BACK + 0.02));
  fairy.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fairyPoints), 96, 0.0025, 5), std(0x15161b, 0.8)));
  const bulbGeometry = new THREE.SphereGeometry(0.011, 8, 6);
  const bulbs = new THREE.InstancedMesh(bulbGeometry, new THREE.MeshBasicMaterial({ color: 0xffd08a }), fairyPoints.length);
  const haloPositions = new Float32Array(fairyPoints.length * 3);
  const bulbMatrix = new THREE.Matrix4();
  fairyPoints.forEach((point, index) => {
    bulbMatrix.makeTranslation(point.x, point.y - 0.014, point.z + 0.006);
    bulbs.setMatrixAt(index, bulbMatrix);
    haloPositions.set([point.x, point.y - 0.014, point.z + 0.012], index * 3);
  });
  bulbs.instanceMatrix.needsUpdate = true;
  fairy.add(bulbs);
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute("position", new THREE.BufferAttribute(haloPositions, 3));
  fairy.add(new THREE.Points(haloGeometry, new THREE.PointsMaterial({
    color: 0xffb060, size: 0.11, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, map: glow,
  })));
  for (const x of [-1.1, 0.0, 1.1]) {
    const warm = new THREE.PointLight(0xffb060, 0.22, 2.2, 2);
    warm.position.set(x, 2.36, BACK + 0.22);
    fairy.add(warm);
    moodLights.push(warm);
  }
  scene.add(fairy);

  /* ---- 光 */
  scene.add(new THREE.HemisphereLight(0x8494c6, 0x2a1c14, 1.2));
  const windowLight = new THREE.PointLight(0x7f9df0, 3.6, 7, 2);
  windowLight.position.set(0.85, 1.55, BACK + 0.35);
  scene.add(windowLight);
  const fill = new THREE.PointLight(0x74688c, 1.1, 7, 2);
  fill.position.set(-0.7, 2.0, 0.9);
  scene.add(fill);

  const setMood = (enabled) => {
    for (const light of moodLights) light.visible = enabled;
  };
  setMood(quality === "high");

  /* ---- 灯下的浮尘 */
  const dustCount = quality === "high" ? 70 : 28;
  const dustSeeds = [];
  const dustPositions = new Float32Array(dustCount * 3);
  const dustRng = makeRng(77);
  for (let i = 0; i < dustCount; i += 1) {
    dustSeeds.push([0.05 + dustRng() * 0.9, 0.8 + dustRng() * 0.5, -1.45 + dustRng() * 0.6, dustRng() * TAU, 0.3 + dustRng() * 0.7]);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: 0xffd9a8, size: 0.0075, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, map: glow,
  }));
  scene.add(dust);
  tickers.push((time) => {
    for (let i = 0; i < dustCount; i += 1) {
      const [x, y, z, phase, speed] = dustSeeds[i];
      dustPositions[i * 3] = x + Math.sin(time * 0.11 * speed + phase) * 0.06;
      dustPositions[i * 3 + 1] = y + Math.sin(time * 0.07 * speed + phase * 1.7) * 0.08;
      dustPositions[i * 3 + 2] = z + Math.cos(time * 0.09 * speed + phase) * 0.05;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    dust.material.opacity = 0.5 * lampLevel;
  });

  tickers.push((time) => {
    rain.uniforms.uTime.value = time;
    crtLight.intensity = 0.2 * (0.965 + 0.035 * Math.sin(time * 13.0));
  });

  return { hotspots, tickers, lamp, toggleLamp, crtState, redrawCrt, spot, setMood };
}

/* ------------------------------------------------------------------ 挂载 */

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export async function mount({
  stage,
  labels,
  quality: wantedQuality = "high",
  forced = false,
  reducedMotion = false,
  posterUrl = "/assets/hpy-promo-poster.jpg",
  onNavigate = () => {},
  onFail = () => {},
} = {}) {
  if (!stage || !labels) throw new Error("room: stage and labels are required");

  let quality = wantedQuality === "low" ? "low" : "high";

  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "VT323"'), document.fonts.load('600 40px "Literata"'), document.fonts.load('28px "Fira Sans"')]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* 字体没到就用回退字体画屏幕。 */
  }

  const canvas = document.createElement("canvas");
  canvas.className = "room-canvas";
  canvas.setAttribute("aria-hidden", "true");
  stage.append(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === "high",
      alpha: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: !forced,
    });
  } catch (error) {
    canvas.remove();
    throw error;
  }

  const pixelRatioFor = (level) => Math.min(window.devicePixelRatio || 1, level === "high" ? 2 : 1.25);
  renderer.setPixelRatio(pixelRatioFor(quality));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b10);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 30);

  const built = buildScene({ scene, renderer, posterUrl, quality });
  const hotspotList = HOTSPOTS.map((definition) => ({ ...definition, ...built.hotspots[definition.id] }));
  const byId = Object.fromEntries(hotspotList.map((hotspot) => [hotspot.id, hotspot]));
  const pickRoots = [...hotspotList.map((hotspot) => hotspot.group), built.lamp];

  /* 每个热点记下自己的受光材质，悬停时给一点暖色自发光。 */
  const highlight = new THREE.Color(CORAL);
  for (const hotspot of hotspotList) {
    const materials = new Set();
    hotspot.group.traverse((node) => {
      const material = node.isMesh ? node.material : null;
      if (material?.isMeshStandardMaterial && !material.emissiveMap && !material.userData.keepEmissive) materials.add(material);
    });
    hotspot.materials = [...materials].map((material) => ({ material, base: material.emissive.clone(), baseIntensity: material.emissiveIntensity }));
    hotspot.heat = 0;
  }

  /* ---- 取景 */
  const home = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const view = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let width = 1;
  let height = 1;
  let docked = false;

  function layout() {
    width = Math.max(1, stage.clientWidth || window.innerWidth);
    height = Math.max(1, stage.clientHeight || window.innerHeight);
    const aspect = width / height;
    const narrow = clamp((1.25 - aspect) / 0.75, 0, 1);

    /* 横屏固定垂直视角；变窄时改为保住水平方向，再窄就把机位往后拉。 */
    const baseVertical = 36;
    const minHorizontal = 58;
    const horizontal = deg(2 * Math.atan(Math.tan(rad(baseVertical) / 2) * aspect));
    camera.fov = horizontal >= minHorizontal
      ? baseVertical
      : Math.min(66, deg(2 * Math.atan(Math.tan(rad(minHorizontal) / 2) / aspect)));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    home.pos.set(lerp(0.06, -0.08, narrow), lerp(1.18, 1.3, narrow), lerp(0.55, 1.55, narrow));
    home.look.set(lerp(0.03, -0.1, narrow), lerp(1.13, 1.22, narrow), -1.4);

    docked = width < 720 || aspect < 0.9;
    labels.dataset.layout = docked ? "dock" : "float";
    if (docked) {
      for (const hotspot of hotspotList) {
        hotspot.element.style.transform = "";
        hotspot.element.style.visibility = "";
      }
    }
    renderer.setSize(width, height, false);
  }

  /* ---- 标签：真正的链接，键盘和读屏都能用 */
  let hoverId = null;
  let busy = false;

  function setHover(id) {
    if (hoverId === id) return;
    hoverId = id;
    for (const hotspot of hotspotList) hotspot.element.classList.toggle("is-hot", hotspot.id === id);
    built.crtState.hover = id;
    built.redrawCrt();
  }

  const plainClick = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

  for (const hotspot of hotspotList) {
    const link = document.createElement("a");
    link.className = "room-tag";
    link.href = hotspot.href;
    link.dataset.hotspot = hotspot.id;
    const key = document.createElement("span");
    key.className = "room-tag-k";
    key.textContent = hotspot.label;
    const sub = document.createElement("span");
    sub.className = "room-tag-s";
    sub.textContent = hotspot.sub;
    link.append(key, sub);
    link.addEventListener("pointerenter", () => setHover(hotspot.id));
    link.addEventListener("pointerleave", () => setHover(null));
    link.addEventListener("focus", () => setHover(hotspot.id));
    link.addEventListener("blur", () => setHover(null));
    link.addEventListener("click", (event) => {
      if (!plainClick(event)) return;
      event.preventDefault();
      activate(hotspot.id);
    });
    labels.append(link);
    hotspot.element = link;
  }

  /* ---- 指针 */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const parallax = { x: 0, y: 0, targetX: 0, targetY: 0, weight: 1 };
  let pointerActive = false;
  let pointerMoved = false;

  function toNdc(event) {
    const rect = stage.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  }

  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickRoots, true);
    for (const hitResult of hits) {
      let node = hitResult.object;
      while (node) {
        if (node.userData.hotspot) return { hotspot: node.userData.hotspot };
        if (node.userData.action) return { action: node.userData.action };
        node = node.parent;
      }
    }
    return null;
  }

  function onPointerMove(event) {
    toNdc(event);
    pointerActive = true;
    pointerMoved = true;
    if (!reducedMotion) {
      parallax.targetX = pointer.x;
      parallax.targetY = pointer.y;
    }
  }

  function onPointerLeave() {
    pointerActive = false;
    parallax.targetX = 0;
    parallax.targetY = 0;
    stage.style.cursor = "";
    setHover(null);
  }

  function onClick(event) {
    if (busy || !plainClick(event)) return;
    toNdc(event);
    const result = pick();
    if (result?.hotspot) activate(result.hotspot);
    else if (result?.action === "lamp") built.toggleLamp();
  }

  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerleave", onPointerLeave);
  stage.addEventListener("click", onClick);

  /* ---- 镜头 */
  let flight = null;

  function flyTo(target, seconds, done) {
    if (seconds <= 0) {
      view.pos.fromArray(target.pos);
      view.look.fromArray(target.look);
      flight = null;
      done?.();
      return;
    }
    const current = {
      fromPos: view.pos.clone(),
      fromLook: view.look.clone(),
      toPos: new THREE.Vector3().fromArray(target.pos),
      toLook: new THREE.Vector3().fromArray(target.look),
      elapsed: 0,
      seconds,
      done,
      timer: 0,
    };
    /* 兜底：渲染循环被浏览器节流或暂停（后台标签页、极低帧率）时，点击也必须有结果。 */
    current.timer = window.setTimeout(() => {
      if (flight === current) finishFlight();
    }, seconds * 1000 + 700);
    flight = current;
  }

  function finishFlight() {
    const current = flight;
    if (!current) return;
    flight = null;
    window.clearTimeout(current.timer);
    view.pos.copy(current.toPos);
    view.look.copy(current.toLook);
    parallax.weight = 0;
    current.done?.();
  }

  function activate(id) {
    const hotspot = byId[id];
    if (!hotspot || busy) return;
    busy = true;
    setHover(id);
    labels.classList.add("is-flying");
    stage.style.cursor = "";
    flyTo(hotspot.view, reducedMotion ? 0 : id === "enter" ? 1.2 : 1.0, () => {
      onNavigate({ id: hotspot.id, href: hotspot.href });
    });
  }

  function reset() {
    busy = false;
    if (flight) window.clearTimeout(flight.timer);
    flight = null;
    view.pos.copy(home.pos);
    view.look.copy(home.look);
    parallax.weight = 1;
    labels.classList.remove("is-flying");
    setHover(null);
  }

  /* ---- 循环 */
  const projected = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const sideways = new THREE.Vector3();
  let frameId = 0;
  let running = false;
  let disposed = false;
  let last = 0;
  let time = 0;
  let blinkAt = 0;

  /* 帧率看门狗：先降画质，画质降到底还是太慢才放弃。 */
  const watch = { settle: 0.8, elapsed: 0, frames: 0, done: false };

  function watchdog(dt) {
    if (watch.done || document.hidden || dt > 0.25) return;
    if (watch.settle > 0) {
      watch.settle -= dt;
      return;
    }
    watch.elapsed += dt;
    watch.frames += 1;
    if (watch.elapsed < 2.5) return;
    const fps = watch.frames / watch.elapsed;
    /* 阈值留在 30 以下：省电模式和部分移动浏览器会把刷新率锁在 30fps，那不算跑不动。 */
    if (fps >= (quality === "high" ? 24 : 14)) {
      watch.done = true;
      return;
    }
    if (quality === "high") {
      setQuality("low");
      watch.settle = 0.8;
      watch.elapsed = 0;
      watch.frames = 0;
      return;
    }
    watch.done = true;
    if (!forced) onFail("slow");
  }

  function setQuality(level) {
    quality = level;
    renderer.setPixelRatio(pixelRatioFor(level));
    renderer.shadowMap.enabled = level === "high";
    built.spot.castShadow = level === "high";
    built.setMood(level === "high");
    scene.traverse((node) => {
      if (node.material) node.material.needsUpdate = true;
    });
    renderer.setSize(width, height, false);
  }

  function update(dt, realDt = dt) {
    time += dt * (reducedMotion ? 0.2 : 1);

    if (flight) {
      /* 用真实经过的时间，而不是被限幅的 dt：掉帧时镜头跳得快一点，但不会变成慢动作。 */
      flight.elapsed += realDt;
      const t = clamp(flight.elapsed / flight.seconds, 0, 1);
      const k = easeInOut(t);
      view.pos.lerpVectors(flight.fromPos, flight.toPos, k);
      view.look.lerpVectors(flight.fromLook, flight.toLook, k);
      parallax.weight = Math.min(parallax.weight, 1 - k);
      if (t >= 1) finishFlight();
    } else if (!busy) {
      view.pos.copy(home.pos);
      view.look.copy(home.look);
      parallax.weight = lerp(parallax.weight, 1, 1 - Math.exp(-dt * 3));
    }

    const follow = 1 - Math.exp(-dt * 4);
    parallax.x = lerp(parallax.x, parallax.targetX, follow);
    parallax.y = lerp(parallax.y, parallax.targetY, follow);
    const sway = reducedMotion ? 0 : Math.sin(time * 0.27) * 0.008;
    sideways.subVectors(view.look, view.pos).cross(camera.up).normalize();
    offset.copy(sideways).multiplyScalar((parallax.x * 0.11 + sway) * parallax.weight);
    offset.y += (parallax.y * 0.05 + (reducedMotion ? 0 : Math.sin(time * 0.19) * 0.004)) * parallax.weight;
    camera.position.copy(view.pos).add(offset);
    camera.lookAt(view.look);

    if (pointerMoved && pointerActive && !busy) {
      pointerMoved = false;
      const result = pick();
      stage.style.cursor = result ? "pointer" : "";
      setHover(result?.hotspot ?? null);
    }

    for (const hotspot of hotspotList) {
      const goal = hotspot.id === hoverId ? 1 : 0;
      if (Math.abs(hotspot.heat - goal) < 0.002) continue;
      hotspot.heat = lerp(hotspot.heat, goal, 1 - Math.exp(-dt * 10));
      for (const entry of hotspot.materials) {
        entry.material.emissive.copy(entry.base).lerp(highlight, hotspot.heat * 0.5);
        entry.material.emissiveIntensity = lerp(entry.baseIntensity, 0.32, hotspot.heat);
      }
    }

    for (const tick of built.tickers) tick(time, dt);

    blinkAt += dt;
    if (blinkAt > 0.55) {
      blinkAt = 0;
      built.crtState.blink = reducedMotion ? true : !built.crtState.blink;
      built.crtState.clock = clockText();
      if (!reducedMotion || built.crtState.clock !== built.crtState.drawnClock) {
        built.crtState.drawnClock = built.crtState.clock;
        built.redrawCrt();
      }
    }

    if (!docked) {
      camera.updateMatrixWorld();
      for (const hotspot of hotspotList) {
        projected.copy(hotspot.anchor).project(camera);
        const x = clamp((projected.x * 0.5 + 0.5) * width, 64, width - 64);
        const y = clamp((-projected.y * 0.5 + 0.5) * height, 84, height - 16);
        hotspot.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        hotspot.element.style.visibility = projected.z > 1 ? "hidden" : "";
      }
    }
  }

  function frame(now) {
    if (!running) return;
    frameId = requestAnimationFrame(frame);
    const realDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(realDt, 0.1);
    last = now;
    update(dt, realDt);
    renderer.render(scene, camera);
    watchdog(dt);
  }

  function resume() {
    if (running || disposed) return;
    running = true;
    last = performance.now();
    frameId = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(frameId);
  }

  const onVisibility = () => {
    if (document.hidden) pause();
    else if (wantRunning) resume();
  };
  let wantRunning = false;

  const onContextLost = (event) => {
    event.preventDefault();
    pause();
    onFail("context-lost");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("visibilitychange", onVisibility);

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => layout()) : null;
  if (resizeObserver) resizeObserver.observe(stage);
  else window.addEventListener("resize", layout);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (flight) window.clearTimeout(flight.timer);
    flight = null;
    pause();
    wantRunning = false;
    resizeObserver?.disconnect();
    window.removeEventListener("resize", layout);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    stage.removeEventListener("pointermove", onPointerMove);
    stage.removeEventListener("pointerleave", onPointerLeave);
    stage.removeEventListener("click", onClick);
    stage.style.cursor = "";
    scene.traverse((node) => {
      node.geometry?.dispose?.();
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose?.();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.remove();
    for (const hotspot of hotspotList) hotspot.element.remove();
  }

  /* ---- 首帧：先编译着色器再交出控制权，避免淡入时卡一下。 */
  layout();
  reset();
  built.redrawCrt();
  update(0);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);

  return {
    start() {
      wantRunning = true;
      resume();
    },
    stop() {
      wantRunning = false;
      pause();
    },
    reset,
    dispose,
    activate,
    get quality() {
      return quality;
    },
  };
}
