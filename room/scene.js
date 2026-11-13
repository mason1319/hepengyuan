/* 何鹏远个人网站 —— hi-fi 版：可交互的 3D 夜间书桌

   这个模块只负责「画面」：搭房间、处理指针、把镜头推到某件物品前，放带退带，并告诉
   启动器那件物品的屏幕此刻落在页面的哪个矩形里。文字内容、进出房间与降级全部由
   /room/boot.js 负责——内容直接取自首页已经服务器直出的 HTML，这里不保存任何事实。

   约束：
   - 纯程序化建模，没有外部模型；屏幕上的影像只来自启动器交来的站内已公开媒体。
   - 只依赖自托管的 three.js（站点 CSP 的 script-src 只信任本站）。
   - 墙上的年份卡片逐字来自首页 Work 区（scripts/validate-room.mjs 会核对）。 */

import * as THREE from "/assets/vendor/three-0.170.0.module.min.js";

const TAU = Math.PI * 2;
const { degToRad: rad, radToDeg: deg, clamp, lerp } = THREE.MathUtils;

const OSD = '"VT323", ui-monospace, "Courier New", "PingFang SC", monospace';
const SERIF = '"Literata", "Songti SC", "Noto Serif SC", "Source Han Serif SC", SimSun, Georgia, serif';
const SANS = '"Fira Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';

const AMBER = "#ffb45e";
const AMBER_DIM = "#a56f37";
const CORAL = 0xff7a5c;

/* 房间里能点的东西。view：在房间里打开的视图；href：离开房间去的地方。
   顶部导航只列 view 项与 SERVICES，其余入口靠点物件。 */
export const HOTSPOTS = [
  { id: "about", label: "ABOUT", sub: "关于我", view: "about" },
  { id: "work", label: "WORK", sub: "履历与作品", view: "work" },
  { id: "posts", label: "POSTS", sub: "文章与档案", view: "posts" },
  { id: "film", label: "FILM", sub: "录像带 · 宣传片与影像", view: "film" },
  { id: "online", label: "ONLINE", sub: "联系方式", view: "online" },
  { id: "services", label: "SERVICES", sub: "服务与交付", href: "/services/" },
  { id: "game", label: "GAME", sub: "Aggie 3A 互动演示", href: "/aggie-3a/" },
];

/* 不是导航、只在房间里起作用的物件。 */
const ACTIONS = {
  lamp: { label: "LAMP", sub: "开关台灯" },
  tape: { label: "TAPE", sub: "录音机 · 雨声" },
};

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
  draw(canvas.getContext("2d"), width, height);
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

/* 纯装饰的发光贴片不能挡住旁边物件的点击。 */
function noPick(object) {
  object.raycast = () => {};
  return object;
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


/* ------------------------------------------------------------------ 贴图与屏幕 */

function clockText(withSeconds = false) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return withSeconds ? `${hh}:${mm}:${String(now.getSeconds()).padStart(2, "0")}` : `${hh}:${mm}`;
}

const GREEN = "#7dffa1";
const GREEN_DIM = "#3f9e5f";

function scanlines(g, W, H, alpha = 0.2) {
  g.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1.4);
}

/* 老电脑的绿色单色显示器。推近之后真正可读、可点的内容由启动器用 HTML 盖上来。 */
function drawComputer(g, W, H, s) {
  g.save();
  g.fillStyle = "#03110a";
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  glow.addColorStop(0, "rgba(90,255,150,.10)");
  glow.addColorStop(1, "rgba(90,255,150,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.textBaseline = "top";
  g.textAlign = "left";
  g.shadowColor = "rgba(120,255,160,.55)";
  g.shadowBlur = 8;
  g.fillStyle = GREEN;
  g.font = `44px ${OSD}`;
  const line = (text, y, color = GREEN) => {
    g.fillStyle = color;
    g.fillText(text, 56, y);
  };
  if (s.mode === "about") {
    line("HPY-DOS 1.0", 56);
    line("C:\\> TYPE ABOUT.TXT", 120);
    if (s.blink) g.fillRect(56, 184, 24, 40);
  } else if (s.mode === "online") {
    line("ATDT HEPENGYUAN.COM", 56);
    line("RINGING...", 120, GREEN_DIM);
    line("CONNECT 2400", 184);
    if (s.blink) g.fillRect(56, 248, 24, 40);
  } else {
    line("HPY-DOS 1.0", 48);
    g.textAlign = "right";
    g.fillText(s.clock, W - 56, 48);
    g.textAlign = "left";
    line("HEPENGYUAN.COM", 100, GREEN_DIM);
    line("READY.", 172);
    HOTSPOTS.filter((hotspot) => hotspot.view).forEach((hotspot, index) => {
      const y = 236 + index * 62;
      const active = s.hover === hotspot.id;
      if (active) {
        g.fillStyle = GREEN;
        g.fillRect(48, y - 6, W - 96, 56);
      }
      g.fillStyle = active ? "#03110a" : GREEN;
      g.font = `48px ${OSD}`;
      g.fillText(`${active ? ">" : " "} ${hotspot.label}`, 56, y);
      g.fillStyle = active ? "#03110a" : GREEN_DIM;
      g.font = `30px ${SANS}`;
      g.fillText(hotspot.sub.split(" · ")[0], 330, y + 8);
    });
    g.font = `44px ${OSD}`;
    g.fillStyle = GREEN;
    g.fillText("C:\\>", 56, H - 150);
    if (s.blink) g.fillRect(150, H - 146, 24, 40);
  }
  /* 底部功能键条 */
  g.shadowBlur = 0;
  g.font = `34px ${OSD}`;
  ["1ABOUT", "2ONLINE", "3POSTS", "4FILM", "5WORK"].forEach((label, index) => {
    const x = 48 + index * 186;
    g.fillStyle = GREEN;
    g.fillRect(x + 22, H - 78, 150, 40);
    g.fillStyle = "#03110a";
    g.fillText(label.slice(1), x + 30, H - 74);
    g.fillStyle = GREEN;
    g.fillText(label[0], x, H - 74);
  });
  g.restore();
  scanlines(g, W, H);
}

/* 老电视：测试卡、图文电视、雪花、正在播放的录像带。 */
const BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0", "#101010"];
function drawTv(g, W, H, s, noise) {
  g.save();
  if (s.mode === "teletext") {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#1f34d8";
    g.fillRect(0, 40, W, 60);
    g.fillStyle = "#ffe14d";
    g.font = `44px ${OSD}`;
    g.textBaseline = "top";
    g.fillText("HPY TELETEXT   P100", 36, 48);
    g.fillStyle = "#55e3ff";
    for (let i = 0; i < 6; i += 1) g.fillRect(36, 140 + i * 62, 220 + ((i * 97) % 330), 20);
  } else if (s.mode === "noise") {
    g.imageSmoothingEnabled = false;
    g.drawImage(noise, 0, 0, W, H);
  } else if (s.mode === "media" && s.element) {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    const source = s.element;
    const sw = source.videoWidth || source.naturalWidth || 0;
    const sh = source.videoHeight || source.naturalHeight || 0;
    if (sw && sh) {
      const scale = Math.min(W / sw, H / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      try {
        g.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } catch {
        /* 视频还没解出第一帧时 drawImage 会抛错，下一帧再画。 */
      }
    }
    g.font = `40px ${OSD}`;
    g.textBaseline = "top";
    g.shadowColor = "rgba(0,0,0,.8)";
    g.shadowBlur = 6;
    g.fillStyle = "#e9fff2";
    if (s.osd && (s.osdHold || s.blink)) g.fillText(s.osd, 32, 28);
  } else {
    /* 测试卡 + 当前时间 */
    const barH = H * 0.66;
    BARS.forEach((color, index) => {
      g.fillStyle = color;
      g.fillRect((index * W) / BARS.length, 0, W / BARS.length + 1, barH);
    });
    const ramp = g.createLinearGradient(0, 0, W, 0);
    ramp.addColorStop(0, "#000");
    ramp.addColorStop(1, "#fff");
    g.fillStyle = ramp;
    g.fillRect(0, barH, W, H * 0.12);
    g.fillStyle = "#101010";
    g.fillRect(0, barH + H * 0.12, W, H);
    g.strokeStyle = "#fff";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(W / 2, H * 0.42, H * 0.3, 0, TAU);
    g.stroke();
    g.fillStyle = "#000";
    g.fillRect(W / 2 - 150, H * 0.31, 300, 112);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "top";
    g.font = `52px ${OSD}`;
    g.fillText("HPY TV", W / 2, H * 0.31 + 8);
    g.font = `40px ${OSD}`;
    g.fillText(s.clock, W / 2, H * 0.31 + 62);
    g.font = `28px ${SANS}`;
    g.fillText("放入录像带 · FILM", W / 2, barH + H * 0.15);
  }
  g.restore();
  scanlines(g, W, H, 0.22);
  const vignette = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.45)");
  g.fillStyle = vignette;
  g.fillRect(0, 0, W, H);
}

/* 录像机的荧光显示屏（VFD）：平时显示时间，放带时显示 PLAY。 */
function drawVfd(g, W, H, s) {
  g.fillStyle = "#020807";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#59f5d0";
  g.shadowColor = "rgba(89,245,208,.8)";
  g.shadowBlur = 10;
  g.textBaseline = "middle";
  g.font = `52px ${OSD}`;
  g.textAlign = "right";
  let text = s.clock.replace(":", s.blink ? ":" : " ");
  if (s.vcr === "play") text = "\u25B6 PLAY";
  else if (s.vcr === "pause") text = "\u2016 PAUSE";
  else if (s.vcr === "load") text = "LOAD";
  g.fillText(text, W - 14, H / 2 + 2);
  g.textAlign = "left";
  g.font = `22px ${OSD}`;
  g.fillStyle = "rgba(89,245,208,.55)";
  g.fillText("VCR", 12, H / 2);
  g.shadowBlur = 0;
}

function clockFaceTexture() {
  return canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    g.fillStyle = "#efe6d2";
    g.beginPath();
    g.arc(c, c, c, 0, TAU);
    g.fill();
    g.strokeStyle = "#2a2622";
    for (let i = 0; i < 60; i += 1) {
      const a = (i / 60) * TAU;
      const major = i % 5 === 0;
      g.lineWidth = major ? 9 : 3;
      g.beginPath();
      g.moveTo(c + Math.sin(a) * (c - 22), c - Math.cos(a) * (c - 22));
      g.lineTo(c + Math.sin(a) * (c - (major ? 62 : 40)), c - Math.cos(a) * (c - (major ? 62 : 40)));
      g.stroke();
    }
    g.fillStyle = "#2a2622";
    g.font = `500 64px ${SERIF}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    [[12, 0], [3, 1], [6, 2], [9, 3]].forEach(([n, q]) => {
      const a = q * (TAU / 4);
      g.fillText(String(n), c + Math.sin(a) * (c - 112), c - Math.cos(a) * (c - 112));
    });
    g.font = `30px ${OSD}`;
    g.fillStyle = "#94440f";
    g.fillText("HPY", c, c + 92);
  });
}

function handheldTexture() {
  return canvasTexture(320, 200, (g, w) => {
    g.fillStyle = "#101a2c";
    g.fillRect(0, 0, w, 200);
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

/* 桌上的黄色记事本：只有标题和横线，具体内容在打开 WORK 时由 HTML 呈现。 */
function legalPadTexture() {
  return canvasTexture(256, 352, (g, w, h) => {
    g.fillStyle = "#f3dc6c";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#7a2b22";
    g.fillRect(0, 0, w, 30);
    g.strokeStyle = "rgba(70,110,170,.5)";
    g.lineWidth = 2;
    for (let y = 70; y < h; y += 18) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.strokeStyle = "rgba(200,60,60,.65)";
    g.beginPath();
    g.moveTo(40, 30);
    g.lineTo(40, h);
    g.stroke();
    g.fillStyle = "#1f2a44";
    g.font = `italic 600 38px ${SERIF}`;
    g.textBaseline = "alphabetic";
    g.fillText("Work", 54, 64);
  });
}

/* 录像带侧标：只写栏目名（宣传片 / 旅行 / 学习），具体条目标题只在播放时显示。 */
function tapeLabelTexture(label, en, color) {
  return canvasTexture(512, 64, (g, w, h) => {
    g.fillStyle = "#121216";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f1ece0";
    g.fillRect(36, 8, w - 72, h - 16);
    g.fillStyle = color;
    g.fillRect(36, 8, 26, h - 16);
    g.fillStyle = "#1c1b22";
    g.textBaseline = "middle";
    g.font = `700 34px ${SANS}`;
    g.fillText(label, 82, h / 2 + 1);
    g.textAlign = "right";
    g.font = `34px ${OSD}`;
    g.fillStyle = "#5c5866";
    g.fillText(en, w - 52, h / 2 + 2);
  });
}

function grilleTexture() {
  return canvasTexture(128, 128, (g, w) => {
    g.fillStyle = "#2a2c31";
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2, 0, TAU);
    g.fill();
    g.fillStyle = "#0e0f12";
    for (let y = 8; y < w; y += 9) {
      for (let x = 8; x < w; x += 9) {
        if ((x - w / 2) ** 2 + (y - w / 2) ** 2 < (w / 2 - 8) ** 2) {
          g.beginPath();
          g.arc(x, y, 2.4, 0, TAU);
          g.fill();
        }
      }
    }
  });
}

function lcdTexture(text) {
  return canvasTexture(256, 80, (g, w, h) => {
    g.fillStyle = "#9fae8c";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1f2618";
    g.font = `60px ${OSD}`;
    g.textAlign = "right";
    g.textBaseline = "middle";
    g.fillText(text, w - 14, h / 2 + 3);
  });
}

/* 电话的卷曲电话线。 */
class CoilCurve extends THREE.Curve {
  constructor(from, to, radius, turns) {
    super();
    this.from = from;
    this.to = to;
    this.radius = radius;
    this.turns = turns;
    this.axis = new THREE.Vector3().subVectors(to, from);
    const helper = Math.abs(this.axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    this.u = new THREE.Vector3().crossVectors(this.axis, helper).normalize();
    this.v = new THREE.Vector3().crossVectors(this.axis, this.u).normalize();
  }

  getPoint(t, target = new THREE.Vector3()) {
    const sag = Math.sin(t * Math.PI) * -0.03;
    const angle = t * this.turns * TAU;
    return target.copy(this.from).addScaledVector(this.axis, t)
      .addScaledVector(this.u, Math.cos(angle) * this.radius)
      .addScaledVector(this.v, Math.sin(angle) * this.radius)
      .add(new THREE.Vector3(0, sag, 0));
  }
}

/* ------------------------------------------------------------------ 场景 */

const BACK = -1.6;
const LEFT = -1.95;
const RIGHT = 1.25;
const CEIL = 2.75;
const FRONT = 2.4;
const DESK_TOP = 0.75;
const WIN = { x0: -0.42, x1: 0.98, y0: 1.02, y1: 2.16 };

function buildScene({ scene, renderer, posterUrl, quality }) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const hotspots = {};
  const tickers = [];
  const moodLights = []; /* 只管氛围的点光源，低画质下关掉 */
  const glow = glowTexture();

  const tag = (id, group) => {
    group.userData.hotspot = id;
    (hotspots[id] ||= { groups: [] }).groups.push(group);
  };

  /* ---- 房间外壳：暖色灰泥墙、木地板 */
  const wall = std(0xffffff, 0.95, 0, { map: speckleTexture("#8a6f5a", 3, 0.06) });
  wall.map.wrapS = wall.map.wrapT = THREE.RepeatWrapping;
  wall.map.repeat.set(3, 2);
  const ceiling = std(0x5a4a3e, 0.95);
  const floor = std(0xffffff, 0.7, 0, { map: woodTexture("#4c3729", "#241710", "#6b4f3c", 7) });
  floor.map.wrapS = floor.map.wrapT = THREE.RepeatWrapping;
  floor.map.repeat.set(1, 4);
  floor.map.rotation = Math.PI / 2;
  const trim = std(0x2a2420, 0.7);

  const room = new THREE.Group();
  room.add(slab(LEFT, WIN.x0, 0, CEIL, BACK - 0.14, BACK, wall));
  room.add(slab(WIN.x1, RIGHT, 0, CEIL, BACK - 0.14, BACK, wall));
  room.add(slab(WIN.x0, WIN.x1, 0, WIN.y0, BACK - 0.14, BACK, wall));
  room.add(slab(WIN.x0, WIN.x1, WIN.y1, CEIL, BACK - 0.14, BACK, wall));
  room.add(slab(LEFT - 0.14, LEFT, 0, CEIL, BACK - 0.14, FRONT, wall));
  room.add(slab(RIGHT, RIGHT + 0.14, 0, CEIL, BACK - 0.14, FRONT, wall));
  room.add(slab(LEFT - 0.14, RIGHT + 0.14, CEIL, CEIL + 0.1, BACK - 0.14, FRONT, ceiling));
  room.add(slab(LEFT - 0.14, RIGHT + 0.14, -0.1, 0, BACK - 0.14, FRONT, floor));
  room.add(slab(LEFT, RIGHT, 0, 0.09, BACK, BACK + 0.015, trim));
  room.add(slab(RIGHT - 0.015, RIGHT, 0, 0.09, BACK, FRONT, trim));
  scene.add(room);

  /* ---- 窗：雨夜 */
  const rain = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0) } },
    vertexShader: RAIN_VERTEX,
    fragmentShader: RAIN_FRAGMENT,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), rain);
  glass.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, BACK - 0.1);
  scene.add(glass);

  const frameMat = std(0xe7dccb, 0.6);
  const f = 0.04;
  const fz0 = BACK - 0.11;
  const fz1 = BACK - 0.05;
  const midX = (WIN.x0 + WIN.x1) / 2;
  const transom = 1.74;
  [
    [WIN.x0, WIN.x1, WIN.y0, WIN.y0 + f],
    [WIN.x0, WIN.x1, WIN.y1 - f, WIN.y1],
    [WIN.x0, WIN.x0 + f, WIN.y0, WIN.y1],
    [WIN.x1 - f, WIN.x1, WIN.y0, WIN.y1],
    [midX - 0.018, midX + 0.018, WIN.y0, WIN.y1],
    [WIN.x0, WIN.x1, transom - 0.016, transom + 0.016],
  ].forEach(([x0, x1, y0, y1]) => scene.add(slab(x0, x1, y0, y1, fz0, fz1, frameMat)));
  scene.add(slab(WIN.x0 - 0.06, WIN.x1 + 0.06, WIN.y0 - 0.04, WIN.y0, BACK - 0.14, BACK + 0.1, frameMat));

  /* ---- 窗帘与帘杆 */
  const curtainMat = std(0xd8c4a2, 0.92, 0, { side: THREE.DoubleSide });
  const makeCurtain = (x0, x1, folds) => {
    const width = x1 - x0;
    const height = 2.3 - 0.86;
    const geometry = new THREE.PlaneGeometry(width, height, 40, 1);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const u = (position.getX(i) + width / 2) / width;
      position.setZ(i, 0.03 * Math.sin(u * TAU * folds) + 0.012 * Math.sin(u * TAU * folds * 2.3));
    }
    geometry.computeVertexNormals();
    const mesh = shadowed(new THREE.Mesh(geometry, curtainMat));
    mesh.position.set((x0 + x1) / 2, 0.86 + height / 2, BACK + 0.07);
    return mesh;
  };
  scene.add(makeCurtain(-0.7, -0.34, 4));
  scene.add(makeCurtain(0.9, 1.22, 3.5));
  scene.add(rod(new THREE.Vector3(-0.78, 2.32, BACK + 0.08), new THREE.Vector3(1.22, 2.32, BACK + 0.08), 0.012, std(0x2a2420, 0.4, 0.6)));

  /* ---- 暖气片（桌下可见） */
  const radiatorMat = std(0xd9d2c3, 0.55, 0.2);
  const radiator = new THREE.Group();
  for (let i = 0; i < 16; i += 1) {
    radiator.add(box(0.045, 0.48, 0.09, radiatorMat, -0.24 + i * 0.066, 0.38, BACK + 0.07));
  }
  radiator.add(box(1.06, 0.03, 0.06, radiatorMat, 0.255, 0.63, BACK + 0.07));
  radiator.add(box(1.06, 0.03, 0.06, radiatorMat, 0.255, 0.13, BACK + 0.07));
  scene.add(radiator);

  /* ---- 书桌：四条腿 + 前横档，桌下能看到暖气片 */
  const deskWood = std(0xffffff, 0.5, 0, { map: woodTexture("#7a5236", "#3d2616", "#a87a52", 11) });
  deskWood.map.anisotropy = anisotropy;
  const deskDark = std(0x3a2618, 0.6);
  const desk = new THREE.Group();
  desk.add(slab(-1.08, 1.1, DESK_TOP - 0.04, DESK_TOP, -1.585, -0.76, deskWood));
  for (const [x, z] of [[-1.04, -1.55], [1.06, -1.55], [-1.04, -0.8], [1.06, -0.8]]) {
    desk.add(slab(x - 0.025, x + 0.025, 0, DESK_TOP - 0.04, z - 0.025, z + 0.025, deskDark));
  }
  desk.add(slab(-1.02, 1.04, DESK_TOP - 0.12, DESK_TOP - 0.04, -0.81, -0.785, deskDark));
  scene.add(desk);

  /* ---- 椅子（左前景） */
  const chairMat = std(0xd8cfbd, 0.7);
  const chair = new THREE.Group();
  chair.position.set(-0.98, 0, -0.42);
  chair.rotation.y = 0.5;
  chair.add(box(0.44, 0.035, 0.42, chairMat, 0, 0.46, 0));
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) chair.add(box(0.03, 0.46, 0.03, chairMat, x, 0.23, z));
  chair.add(box(0.03, 0.5, 0.03, chairMat, -0.19, 0.73, 0.19));
  chair.add(box(0.03, 0.5, 0.03, chairMat, 0.19, 0.73, 0.19));
  chair.add(box(0.41, 0.07, 0.025, chairMat, 0, 0.94, 0.19));
  for (let i = 0; i < 4; i += 1) chair.add(box(0.018, 0.4, 0.018, chairMat, -0.12 + i * 0.08, 0.7, 0.19));
  scene.add(chair);

  /* ================================================================ 80 年代的书桌
     左：老电脑（主机 + 绿色显示器 + 键盘 + 软盘）；中：老电视放在录像机上，前面是遥控器；
     右：录像带、记事本、计算器、电话叠在调制解调器上；窗台上放着一台手提录音机。 */

  const beigeShell = std(0xd2c8ae, 0.62);
  const beigeDark = std(0xb3a98f, 0.7);
  const slotDark = std(0x111216, 0.6);
  const silver = std(0xc9c9c4, 0.35, 0.7);

  /* ---- 老电脑（ABOUT / ONLINE） */
  const computer = new THREE.Group();
  computer.position.set(-0.72, DESK_TOP, -1.3);
  computer.rotation.y = 0.12;
  computer.add(roundedBox(0.44, 0.13, 0.38, 0.012, beigeShell, 0, 0.065, 0));
  for (let i = 0; i < 2; i += 1) {
    const y = 0.088 - i * 0.046;
    computer.add(box(0.17, 0.036, 0.006, beigeDark, 0.105, y, 0.19));
    computer.add(box(0.13, 0.006, 0.004, slotDark, 0.1, y + 0.004, 0.194));
    computer.add(box(0.016, 0.022, 0.006, silver, 0.17, y, 0.195));
  }
  computer.add(box(0.06, 0.014, 0.004, slotDark, -0.15, 0.04, 0.192));
  const computerLed = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.004), new THREE.MeshBasicMaterial({ color: 0x7dff8a }));
  computerLed.position.set(-0.17, 0.08, 0.192);
  computer.add(computerLed);
  const monitorBody = new THREE.Group();
  monitorBody.position.set(0, 0.13, -0.01);
  monitorBody.add(roundedBox(0.36, 0.3, 0.32, 0.03, beigeShell, 0, 0.15, 0));
  monitorBody.add(roundedBox(0.22, 0.18, 0.12, 0.03, beigeShell, 0, 0.15, -0.2));
  monitorBody.add(roundedBox(0.31, 0.235, 0.012, 0.01, std(0x17181c, 0.5), 0, 0.165, 0.158));
  const computerCanvas = document.createElement("canvas");
  computerCanvas.width = 1024;
  computerCanvas.height = 768;
  const computerContext = computerCanvas.getContext("2d");
  const computerTexture = new THREE.CanvasTexture(computerCanvas);
  computerTexture.colorSpace = THREE.SRGBColorSpace;
  computerTexture.anisotropy = anisotropy;
  const curved = (w, h, depth) => {
    const geometry = new THREE.PlaneGeometry(w, h, 24, 18);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const nx = position.getX(i) / (w / 2);
      const ny = position.getY(i) / (h / 2);
      position.setZ(i, -depth * (nx * nx + ny * ny));
    }
    geometry.computeVertexNormals();
    return geometry;
  };
  /* 屏幕是外凸的玻璃：四角最低处也必须在黑色凹框（前表面 z≈0.164）前面，否则只露出中间一个椭圆。 */
  const computerScreen = new THREE.Mesh(curved(0.27, 0.2, 0.004), new THREE.MeshBasicMaterial({ map: computerTexture, toneMapped: false }));
  computerScreen.position.set(0, 0.168, 0.176);
  computerScreen.userData.size = [0.27, 0.2];
  monitorBody.add(computerScreen);
  for (const x of [0.11, 0.14]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 16), beigeDark);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(x, 0.027, 0.162);
    monitorBody.add(knob);
  }
  computer.add(monitorBody);
  const computerGlow = new THREE.PointLight(0x6dff9a, 0.12, 1.6, 2);
  computerGlow.position.set(0, 0.32, 0.4);
  computer.add(computerGlow);
  moodLights.push(computerGlow);
  scene.add(computer);
  tag("about", computer);

  const computerState = { mode: "desk", hover: null, blink: true, clock: clockText() };
  const redrawComputer = () => {
    drawComputer(computerContext, 1024, 768, computerState);
    computerTexture.needsUpdate = true;
  };

  /* 键盘 */
  const keyboard = new THREE.Group();
  keyboard.position.set(-0.68, DESK_TOP, -0.92);
  keyboard.rotation.y = 0.1;
  const board = roundedBox(0.44, 0.024, 0.17, 0.008, beigeShell, 0, 0.012, 0);
  board.rotation.x = 0.06;
  keyboard.add(board);
  const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0235, 0.01, 0.021), std(0xffffff, 0.6), 75);
  const keyMatrix = new THREE.Matrix4();
  const keyColor = new THREE.Color();
  let keyIndex = 0;
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 15; col += 1) {
      const z = (row - 2) * 0.0265;
      keyMatrix.makeTranslation((col - 7) * 0.0272, 0.029 - z * 0.06, z);
      keys.setMatrixAt(keyIndex, keyMatrix);
      keyColor.set(col > 12 || row === 0 ? 0xb8ae96 : 0xe4dccb);
      keys.setColorAt(keyIndex, keyColor);
      keyIndex += 1;
    }
  }
  keys.instanceMatrix.needsUpdate = true;
  keys.instanceColor.needsUpdate = true;
  keys.castShadow = true;
  keyboard.add(keys);
  scene.add(keyboard);
  tag("about", keyboard);

  /* 软盘（标签空白：不在场景里写任何未确认的内容） */
  [[0x2b4d8a, 0.0, 0.3], [0x1f1f24, 0.004, -0.25]].forEach(([color, lift, turn], index) => {
    const disk = new THREE.Group();
    disk.position.set(-1.0 + index * 0.02, DESK_TOP + 0.0017 + lift, -1.05 + index * 0.03);
    disk.rotation.y = turn;
    disk.add(box(0.09, 0.0034, 0.094, std(color, 0.5)));
    disk.add(box(0.05, 0.0036, 0.03, silver, 0.008, 0.0002, -0.032));
    disk.add(box(0.068, 0.0036, 0.046, std(0xf1ece0, 0.8), 0, 0.0002, 0.022));
    scene.add(disk);
  });

  /* ---- 录像机 + 老电视（FILM / POSTS） */
  const vcr = new THREE.Group();
  vcr.position.set(0.03, DESK_TOP, -1.3);
  vcr.rotation.y = -0.03;
  vcr.add(roundedBox(0.43, 0.085, 0.32, 0.006, std(0x1d1d22, 0.5, 0.2), 0, 0.0425, 0));
  vcr.add(box(0.42, 0.075, 0.004, std(0x27272d, 0.45, 0.3), 0, 0.043, 0.16));
  vcr.add(box(0.2, 0.03, 0.004, slotDark, -0.085, 0.055, 0.162));
  vcr.add(box(0.2, 0.003, 0.004, std(0x3a3a42, 0.4, 0.4), -0.085, 0.041, 0.163));
  const vfdCanvas = document.createElement("canvas");
  vfdCanvas.width = 256;
  vfdCanvas.height = 64;
  const vfdContext = vfdCanvas.getContext("2d");
  const vfdTexture = new THREE.CanvasTexture(vfdCanvas);
  vfdTexture.colorSpace = THREE.SRGBColorSpace;
  const vfd = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.0275), new THREE.MeshBasicMaterial({ map: vfdTexture, toneMapped: false }));
  vfd.position.set(0.115, 0.056, 0.1625);
  vcr.add(vfd);
  for (let i = 0; i < 5; i += 1) vcr.add(box(0.022, 0.009, 0.006, silver, -0.17 + i * 0.03, 0.018, 0.163));
  const vcrSlot = new THREE.Object3D();
  vcrSlot.position.set(-0.085, 0.055, 0.16);
  vcr.add(vcrSlot);
  scene.add(vcr);
  tag("film", vcr);

  const tv = new THREE.Group();
  tv.position.set(0.03, DESK_TOP + 0.085, -1.3);
  tv.rotation.y = -0.03;
  const tvShell = std(0x26262b, 0.5, 0.15);
  tv.add(roundedBox(0.4, 0.34, 0.34, 0.025, tvShell, 0, 0.17, 0));
  tv.add(roundedBox(0.3, 0.26, 0.16, 0.03, tvShell, 0, 0.17, -0.22));
  tv.add(roundedBox(0.37, 0.31, 0.012, 0.012, std(0x1a1a1e, 0.45, 0.2), 0, 0.172, 0.168));
  tv.add(box(0.3, 0.23, 0.006, slotDark, 0, 0.198, 0.17));
  const tvCanvas = document.createElement("canvas");
  tvCanvas.width = 768;
  tvCanvas.height = 576;
  const tvContext = tvCanvas.getContext("2d");
  const tvTexture = new THREE.CanvasTexture(tvCanvas);
  tvTexture.colorSpace = THREE.SRGBColorSpace;
  tvTexture.anisotropy = anisotropy;
  /* 同理：凹框前表面 z≈0.173，屏幕四角在 0.175。 */
  const tvScreen = new THREE.Mesh(curved(0.27, 0.2, 0.004), new THREE.MeshBasicMaterial({ map: tvTexture, toneMapped: false }));
  tvScreen.position.set(0, 0.198, 0.183);
  tvScreen.userData.size = [0.27, 0.2];
  tv.add(tvScreen);
  tv.add(box(0.33, 0.04, 0.004, std(0x141417, 0.5), 0, 0.052, 0.175));
  for (let i = 0; i < 6; i += 1) tv.add(box(0.02, 0.012, 0.006, silver, -0.14 + i * 0.03, 0.052, 0.177));
  for (const x of [0.08, 0.13]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.012, 20), silver);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(x, 0.052, 0.18);
    tv.add(knob);
  }
  const tvLed = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.004), new THREE.MeshBasicMaterial({ color: 0xff3b2e }));
  tvLed.position.set(0.16, 0.052, 0.178);
  tv.add(tvLed);
  const antennaMat = std(0xd0d0cc, 0.3, 0.8);
  for (const [x1, y1, z1] of [[-0.19, 0.6, -0.2], [0.21, 0.58, -0.22]]) {
    const from = new THREE.Vector3(Math.sign(x1) * 0.04, 0.34, -0.12);
    const to = new THREE.Vector3(x1, y1, z1);
    tv.add(rod(from, to, 0.0025, antennaMat));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), antennaMat);
    tip.position.copy(to);
    tv.add(tip);
  }
  tv.add(roundedBox(0.06, 0.02, 0.05, 0.008, antennaMat, 0, 0.345, -0.12));
  const tvGlow = new THREE.PointLight(0x9fc4ff, 0.18, 1.8, 2);
  tvGlow.position.set(0, 0.2, 0.42);
  tv.add(tvGlow);
  scene.add(tv);
  tag("film", tv);

  const tvState = { mode: "idle", element: null, osd: "", osdHold: true, blink: true, clock: clockText(true) };
  const noiseCanvas = document.createElement("canvas");
  noiseCanvas.width = 192;
  noiseCanvas.height = 144;
  const noiseContext = noiseCanvas.getContext("2d");
  const noiseImage = noiseContext.createImageData(192, 144);
  const redrawTv = () => {
    if (tvState.mode === "noise") {
      const data = noiseImage.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      noiseContext.putImageData(noiseImage, 0, 0);
    }
    drawTv(tvContext, 768, 576, tvState, noiseCanvas);
    tvTexture.needsUpdate = true;
  };
  const vfdState = { vcr: "clock", blink: true, clock: clockText() };
  const redrawVfd = () => {
    drawVfd(vfdContext, 256, 64, vfdState);
    vfdTexture.needsUpdate = true;
  };

  /* ---- 录像带（FILM）：由启动器根据首页与公开影像动态生成 */
  const tapeStack = new THREE.Group();
  tapeStack.position.set(0.45, DESK_TOP, -1.33);
  tapeStack.rotation.y = -0.12;
  scene.add(tapeStack);
  tag("film", tapeStack);
  const tapeBody = std(0x141418, 0.45);
  const blankLabel = std(0xe8e2d4, 0.8);
  const makeTape = (labelMaterial) => {
    const tape = new THREE.Group();
    tape.add(box(0.188, 0.025, 0.104, tapeBody));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.172, 0.0195), labelMaterial);
    label.position.z = 0.0525;
    tape.add(label);
    return tape;
  };
  /* 两盒没有标签的空白带垫在底下，只是让桌面看起来像一摞录像带。 */
  for (let i = 0; i < 2; i += 1) {
    const filler = makeTape(blankLabel);
    filler.position.set((i - 0.5) * 0.006, 0.0125 + i * 0.026, 0);
    filler.rotation.y = (i - 0.5) * 0.06;
    tapeStack.add(filler);
  }
  const tapes = [];
  const setTapes = (list) => {
    for (const tape of tapes) {
      tape.object.parent?.remove(tape.object);
      tape.object.traverse((node) => {
        if (node.material?.map) node.material.map.dispose();
      });
    }
    tapes.length = 0;
    list.slice(0, 4).forEach((item, index) => {
      const texture = tapeLabelTexture(item.label, item.en, item.color);
      texture.anisotropy = anisotropy;
      const tape = makeTape(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 }));
      tape.position.set(((index * 7) % 3 - 1) * 0.004, 0.0125 + (index + 2) * 0.026, 0.004);
      tape.rotation.y = (((index * 5) % 3) - 1) * 0.035;
      tape.userData.tape = index;
      tapeStack.add(tape);
      tapes.push({ object: tape, home: { position: tape.position.clone(), quaternion: tape.quaternion.clone() } });
    });
  };

  /* 放带 / 退带动画：在世界坐标里插值，最后把带子挂回原处或藏进录像机。 */
  let tapeMotion = null;
  let loadedTape = -1;
  const worldOf = (object) => ({
    position: object.getWorldPosition(new THREE.Vector3()),
    quaternion: object.getWorldQuaternion(new THREE.Quaternion()),
  });
  const moveTape = (index, inward, instant) => new Promise((resolve) => {
    const tape = tapes[index];
    if (!tape) {
      resolve();
      return;
    }
    if (tapeMotion) {
      tapeMotion.finish();
    }
    /* 录像机里只能有一盒带：换带时，先把原来那盒直接放回带堆。 */
    if (inward && loadedTape >= 0 && loadedTape !== index && tapes[loadedTape]) {
      const previous = tapes[loadedTape];
      tapeStack.attach(previous.object);
      previous.object.visible = true;
      previous.object.position.copy(previous.home.position);
      previous.object.quaternion.copy(previous.home.quaternion);
      loadedTape = -1;
    }
    const object = tape.object;
    scene.updateMatrixWorld();
    const slot = worldOf(vcrSlot);
    const inside = slot.position.clone().add(new THREE.Vector3(0, 0, -0.12).applyQuaternion(slot.quaternion));
    const front = slot.position.clone().add(new THREE.Vector3(0, 0.002, 0.11).applyQuaternion(slot.quaternion));
    let start;
    if (inward) {
      start = worldOf(object);
      scene.attach(object);
    } else {
      object.visible = true;
      scene.attach(object);
      object.position.copy(inside);
      object.quaternion.copy(slot.quaternion);
      start = { position: inside.clone(), quaternion: slot.quaternion.clone() };
    }
    tapeStack.updateMatrixWorld();
    const homeWorld = {
      position: tape.home.position.clone().applyMatrix4(tapeStack.matrixWorld),
      quaternion: tapeStack.getWorldQuaternion(new THREE.Quaternion()).multiply(tape.home.quaternion),
    };
    const lift = (inward ? start.position : homeWorld.position).clone().add(new THREE.Vector3(0, 0.16, 0.08));
    const keys = inward
      ? [start, { position: lift, quaternion: start.quaternion }, { position: front, quaternion: slot.quaternion }, { position: inside, quaternion: slot.quaternion }]
      : [start, { position: front, quaternion: slot.quaternion }, { position: lift, quaternion: homeWorld.quaternion }, homeWorld];
    const finish = () => {
      if (inward) {
        object.visible = false;
        object.position.copy(inside);
        loadedTape = index;
      } else {
        tapeStack.attach(object);
        object.position.copy(tape.home.position);
        object.quaternion.copy(tape.home.quaternion);
        if (loadedTape === index) loadedTape = -1;
      }
      tapeMotion = null;
      resolve();
    };
    if (instant) {
      finish();
      return;
    }
    /* 和镜头一样按真实时间走，再加一个兜底定时器：渲染被节流时带子也一定会到位。 */
    const motion = { object, keys, t: 0, duration: 1.0, finish, timer: 0 };
    motion.timer = window.setTimeout(() => {
      if (tapeMotion === motion) finish();
    }, 1700);
    motion.finish = () => {
      window.clearTimeout(motion.timer);
      finish();
    };
    tapeMotion = motion;
  });
  tickers.push((time, dt, realDt = dt) => {
    if (!tapeMotion) return;
    tapeMotion.t = Math.min(1, tapeMotion.t + realDt / tapeMotion.duration);
    const segments = tapeMotion.keys.length - 1;
    const scaled = tapeMotion.t * segments;
    const index = Math.min(segments - 1, Math.floor(scaled));
    const local = scaled - index;
    const k = local * local * (3 - 2 * local);
    const a = tapeMotion.keys[index];
    const b = tapeMotion.keys[index + 1];
    tapeMotion.object.position.lerpVectors(a.position, b.position, k);
    tapeMotion.object.quaternion.slerpQuaternions(a.quaternion, b.quaternion, k);
    if (tapeMotion.t >= 1) tapeMotion.finish();
  });

  /* ---- 遥控器（POSTS：图文电视） */
  const remote = new THREE.Group();
  remote.position.set(0.02, DESK_TOP, -0.98);
  remote.rotation.y = 0.18;
  remote.add(roundedBox(0.05, 0.016, 0.18, 0.008, std(0x1b1b20, 0.45), 0, 0.008, 0));
  const remoteButtons = new THREE.InstancedMesh(new THREE.BoxGeometry(0.009, 0.005, 0.008), std(0x8f8f96, 0.5), 15);
  const remoteMatrix = new THREE.Matrix4();
  for (let i = 0; i < 15; i += 1) {
    remoteMatrix.makeTranslation(((i % 3) - 1) * 0.013, 0.017, -0.035 + Math.floor(i / 3) * 0.016);
    remoteButtons.setMatrixAt(i, remoteMatrix);
  }
  remoteButtons.instanceMatrix.needsUpdate = true;
  remote.add(remoteButtons);
  remote.add(box(0.012, 0.006, 0.01, std(0xd23a2a, 0.4), 0, 0.017, -0.065));
  remote.add(hitBox(0.08, 0.05, 0.21, 0, 0.02, 0));
  scene.add(remote);
  tag("posts", remote);

  /* ---- 黄色记事本与铅笔（WORK） */
  const pad = new THREE.Group();
  pad.position.set(0.3, DESK_TOP, -0.95);
  pad.rotation.y = -0.12;
  pad.add(box(0.215, 0.012, 0.3, std(0xe9d26a, 0.85), 0, 0.006, 0));
  const padTop = new THREE.Mesh(new THREE.PlaneGeometry(0.215, 0.3), std(0xffffff, 0.85, 0, { map: legalPadTexture() }));
  padTop.rotation.x = -Math.PI / 2;
  padTop.position.y = 0.0125;
  padTop.receiveShadow = true;
  pad.add(padTop);
  pad.add(rod(new THREE.Vector3(-0.07, 0.018, 0.1), new THREE.Vector3(0.08, 0.018, 0.04), 0.0045, std(0xe8b13a, 0.5)));
  pad.add(hitBox(0.24, 0.05, 0.32, 0, 0.02, 0));
  scene.add(pad);
  tag("work", pad);

  /* ---- 计算器（装饰） */
  const calculator = new THREE.Group();
  calculator.position.set(0.52, DESK_TOP, -0.92);
  calculator.rotation.y = -0.28;
  calculator.add(roundedBox(0.085, 0.012, 0.14, 0.006, std(0x2b2b30, 0.5), 0, 0.006, 0));
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.02), new THREE.MeshBasicMaterial({ map: lcdTexture("0."), toneMapped: false }));
  lcd.rotation.x = -Math.PI / 2;
  lcd.position.set(0, 0.0125, -0.045);
  calculator.add(lcd);
  const calcKeys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.013, 0.004, 0.011), std(0x55555c, 0.5), 20);
  const calcMatrix = new THREE.Matrix4();
  const calcColor = new THREE.Color();
  for (let i = 0; i < 20; i += 1) {
    calcMatrix.makeTranslation(((i % 4) - 1.5) * 0.017, 0.0135, -0.016 + Math.floor(i / 4) * 0.016);
    calcKeys.setMatrixAt(i, calcMatrix);
    calcKeys.setColorAt(i, calcColor.set(i === 19 ? 0xe0603f : i % 4 === 3 ? 0x8b8b92 : 0x55555c));
  }
  calcKeys.instanceMatrix.needsUpdate = true;
  calcKeys.instanceColor.needsUpdate = true;
  calculator.add(calcKeys);
  scene.add(calculator);

  /* ---- 调制解调器（SERVICES） + 叠在上面的按键电话（ONLINE） */
  const modem = new THREE.Group();
  modem.position.set(0.86, DESK_TOP, -1.2);
  modem.rotation.y = -0.22;
  modem.add(roundedBox(0.23, 0.045, 0.2, 0.008, beigeShell, 0, 0.0225, 0));
  modem.add(box(0.2, 0.02, 0.004, std(0x1c1d22, 0.5), 0, 0.022, 0.101));
  const modemLeds = [];
  for (let i = 0; i < 8; i += 1) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.003), new THREE.MeshBasicMaterial({ color: 0x3a0d0a }));
    led.position.set(-0.08 + i * 0.023, 0.022, 0.104);
    modem.add(led);
    modemLeds.push(led);
  }
  scene.add(modem);
  tag("services", modem);
  const ledLit = new THREE.Color(0xff4b3a);
  const ledDark = new THREE.Color(0x3a0d0a);
  tickers.push((time) => {
    modemLeds.forEach((led, index) => {
      const always = index < 2;
      const flicker = Math.sin(time * (9 + index * 3.7) + index * 1.3) + Math.sin(time * (23 + index)) > 0.6;
      led.material.color.copy(always || flicker ? ledLit : ledDark);
    });
  });

  const phone = new THREE.Group();
  phone.position.set(0.86, DESK_TOP + 0.045, -1.2);
  phone.rotation.y = -0.22;
  const phoneShell = std(0xd8cfb9, 0.55);
  const phoneBase = roundedBox(0.19, 0.06, 0.2, 0.018, phoneShell, 0, 0.03, 0);
  phoneBase.rotation.x = -0.1;
  phone.add(phoneBase);
  const phoneKeys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 0.008, 0.017), std(0xf0ebe0, 0.5), 12);
  const phoneMatrix = new THREE.Matrix4();
  for (let i = 0; i < 12; i += 1) {
    phoneMatrix.makeTranslation(((i % 3) - 1) * 0.03, 0.068 - Math.floor(i / 3) * 0.004, 0.025 + Math.floor(i / 3) * 0.02);
    phoneKeys.setMatrixAt(i, phoneMatrix);
  }
  phoneKeys.instanceMatrix.needsUpdate = true;
  phone.add(phoneKeys);
  const handset = new THREE.Group();
  handset.position.set(0, 0.078, -0.055);
  handset.add(roundedBox(0.2, 0.026, 0.045, 0.012, phoneShell, 0, 0, 0));
  for (const x of [-0.085, 0.085]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.03, 20), phoneShell);
    cup.position.set(x, -0.012, 0);
    handset.add(shadowed(cup));
  }
  phone.add(handset);
  const cord = new THREE.Mesh(
    new THREE.TubeGeometry(new CoilCurve(new THREE.Vector3(-0.1, 0.06, -0.05), new THREE.Vector3(-0.115, 0.02, 0.09), 0.009, 22), 260, 0.0022, 5),
    phoneShell,
  );
  phone.add(cord);
  const messageLed = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.006), new THREE.MeshBasicMaterial({ color: 0xff3b2e }));
  messageLed.position.set(0.075, 0.062, 0.0);
  phone.add(messageLed);
  phone.add(hitBox(0.22, 0.12, 0.22, 0, 0.05, 0));
  scene.add(phone);
  tag("online", phone);

  /* ---- 窗台上的手提录音机：点一下播放 / 停止雨声，放的时候磁带轴会转 */
  const recorder = new THREE.Group();
  recorder.userData.action = "tape";
  recorder.position.set(0.62, WIN.y0, BACK + 0.04);
  recorder.rotation.y = -0.1;
  const recorderShell = std(0x3a3c43, 0.45, 0.25);
  recorder.add(roundedBox(0.3, 0.15, 0.075, 0.012, recorderShell, 0, 0.075, 0));
  const speaker = new THREE.Mesh(new THREE.CircleGeometry(0.05, 32), std(0xffffff, 0.8, 0, { map: grilleTexture() }));
  speaker.position.set(-0.075, 0.07, 0.0385);
  recorder.add(speaker);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.051, 0.004, 8, 40), silver);
  ring.position.set(-0.075, 0.07, 0.038);
  recorder.add(ring);
  recorder.add(box(0.12, 0.07, 0.004, std(0x0e0f12, 0.3, 0.2), 0.07, 0.078, 0.037));
  recorder.add(box(0.1, 0.03, 0.002, std(0xe8dfc6, 0.8), 0.07, 0.092, 0.0395));
  const reels = [];
  for (const x of [0.042, 0.098]) {
    const reel = new THREE.Group();
    reel.position.set(x, 0.072, 0.0405);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.004, 6), std(0xf2efe8, 0.5));
    hub.rotation.x = Math.PI / 2;
    reel.add(hub);
    for (let i = 0; i < 3; i += 1) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.009, 0.005), std(0x2a2a2e, 0.5));
      tooth.rotation.z = (i / 3) * Math.PI;
      reel.add(tooth);
    }
    recorder.add(reel);
    reels.push(reel);
  }
  ["0xd23a2a", "", "", "", "", ""].forEach((accent, index) => {
    recorder.add(box(0.03, 0.012, 0.026, accent ? std(0xd23a2a, 0.4) : silver, -0.0 + index * 0.033, 0.156, 0.012));
  });
  recorder.add(rod(new THREE.Vector3(-0.13, 0.15, 0), new THREE.Vector3(-0.13, 0.2, 0), 0.005, silver));
  recorder.add(rod(new THREE.Vector3(-0.03, 0.15, 0), new THREE.Vector3(-0.03, 0.2, 0), 0.005, silver));
  recorder.add(rod(new THREE.Vector3(-0.13, 0.2, 0), new THREE.Vector3(-0.03, 0.2, 0), 0.006, silver));
  recorder.add(rod(new THREE.Vector3(0.13, 0.15, -0.02), new THREE.Vector3(0.02, 0.36, -0.06), 0.0022, antennaMat));
  const recLed = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, 0.003), new THREE.MeshBasicMaterial({ color: 0x3a0d0a }));
  recLed.position.set(0.135, 0.13, 0.0385);
  recorder.add(recLed);
  recorder.add(hitBox(0.32, 0.22, 0.1, 0, 0.1, 0));
  scene.add(recorder);
  let recorderPlaying = false;
  const setRecorder = (playing) => {
    recorderPlaying = playing;
    recLed.material.color.set(playing ? 0xff3b2e : 0x3a0d0a);
  };
  tickers.push((time, dt) => {
    if (!recorderPlaying) return;
    reels[0].rotation.z -= dt * 3.2;
    reels[1].rotation.z -= dt * 2.4;
  });

  /* ---- 掌机（GAME） */
  const handheld = new THREE.Group();
  handheld.position.set(-0.3, DESK_TOP, -0.9);
  handheld.rotation.y = 0.35;
  handheld.add(box(0.13, 0.01, 0.07, std(0x17181e, 0.6), 0, 0.005, -0.012));
  const device = new THREE.Group();
  device.position.set(0, 0.062, 0.004);
  device.rotation.x = -0.5;
  device.add(roundedBox(0.205, 0.092, 0.02, 0.009, std(0xdcd6c6, 0.5)));
  const handheldScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.104, 0.065), new THREE.MeshBasicMaterial({ map: handheldTexture(), toneMapped: false }));
  handheldScreen.position.set(0, 0.002, 0.0103);
  device.add(handheldScreen);
  device.add(box(0.026, 0.008, 0.004, std(0x24252c, 0.5), -0.078, 0.004, 0.011));
  device.add(box(0.008, 0.026, 0.004, std(0x24252c, 0.5), -0.078, 0.004, 0.011));
  for (const [bx, by] of [[0.072, 0.012], [0.086, -0.004]]) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 16), std(CORAL, 0.4));
    button.rotation.x = Math.PI / 2;
    button.position.set(bx, by, 0.011);
    device.add(button);
  }
  handheld.add(device);
  handheld.add(hitBox(0.24, 0.14, 0.1, 0, 0.07, 0));
  scene.add(handheld);
  tag("game", handheld);

  /* ---- 马克杯 */
  const mug = new THREE.Group();
  mug.position.set(-0.2, DESK_TOP, -1.08);
  const mugProfile = [[0, 0], [0.036, 0], [0.04, 0.005], [0.04, 0.086], [0.0365, 0.086], [0.0365, 0.008], [0, 0.008]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  mug.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(mugProfile, 28), std(0xe9e2d0, 0.4, 0, { side: THREE.DoubleSide }))));
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), std(0x2a160c, 0.25));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.072;
  mug.add(coffee);
  const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.006, 8, 20, Math.PI), std(0xe9e2d0, 0.4));
  mugHandle.rotation.z = -Math.PI / 2;
  mugHandle.position.set(0.04, 0.046, 0);
  mug.add(shadowed(mugHandle));
  mug.rotation.y = 2.4;
  scene.add(mug);

  /* ---- 窗台上的盆栽 */
  const plantMat = std(0x2f5a3a, 0.7, 0, { side: THREE.DoubleSide });
  const makePlant = (x, y, z, scale, leavesCount, seed) => {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(scale);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.12, 22), std(0xb5683f, 0.85));
    pot.position.y = 0.06;
    group.add(shadowed(pot));
    const rng = makeRng(seed);
    for (let i = 0; i < leavesCount; i += 1) {
      const length = 0.1 + rng() * 0.09;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), plantMat);
      leaf.scale.set(0.035 + rng() * 0.02, length, 0.006);
      const pivot = new THREE.Group();
      pivot.position.y = 0.11;
      pivot.rotation.y = (i / leavesCount) * TAU + rng();
      pivot.rotation.z = 0.35 + rng() * 0.6;
      leaf.position.y = length * 0.95;
      pivot.add(shadowed(leaf));
      group.add(pivot);
    }
    scene.add(group);
    return group;
  };
  makePlant(-0.3, WIN.y0, BACK + 0.02, 0.95, 10, 23);
  makePlant(0.32, WIN.y0, BACK + 0.02, 0.75, 8, 41);

  /* ---- 台灯（电脑和电视之间，点一下开关） */
  const lamp = new THREE.Group();
  lamp.userData.action = "lamp";
  const lampMetal = std(0x1c1d24, 0.45, 0.6);
  const lampBase = new THREE.Vector3(-0.36, DESK_TOP, -1.46);
  const lampElbow = new THREE.Vector3(-0.42, 1.2, -1.5);
  const lampHead = new THREE.Vector3(-0.27, 1.3, -1.22);
  const lampTarget = new THREE.Vector3(-0.12, DESK_TOP, -0.98);
  const lampDirection = new THREE.Vector3().subVectors(lampTarget, lampHead).normalize();
  const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.082, 0.018, 28), lampMetal);
  baseDisc.position.copy(lampBase).add(new THREE.Vector3(0, 0.009, 0));
  lamp.add(shadowed(baseDisc));
  lamp.add(rod(lampBase.clone().add(new THREE.Vector3(0, 0.018, 0)), lampElbow, 0.008, lampMetal));
  lamp.add(rod(lampElbow, lampHead, 0.008, lampMetal));
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), lampMetal);
  joint.position.copy(lampElbow);
  lamp.add(joint);
  const shadeMaterial = std(0xc84f36, 0.45, 0.1, { side: THREE.DoubleSide, emissive: 0x4a1c0e, emissiveIntensity: 1 });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.085, 0.115, 28, 1, true), shadeMaterial);
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), lampDirection);
  shade.position.copy(lampHead).addScaledVector(lampDirection, 0.03);
  lamp.add(shade);
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffe2b8 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 12), bulbMaterial);
  bulb.position.copy(lampHead).addScaledVector(lampDirection, 0.05);
  lamp.add(bulb);
  const lampGlow = noPick(new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffb070, opacity: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  lampGlow.scale.set(0.45, 0.45, 1);
  lampGlow.position.copy(bulb.position);
  lamp.add(lampGlow);
  const lampHit = hitBox(0.22, 0.2, 0.22, 0, 0, 0);
  lampHit.position.copy(lampHead);
  lamp.add(lampHit);
  const spot = new THREE.SpotLight(0xffb469, 3.4, 4.6, rad(50), 0.65, 2);
  spot.position.copy(lampHead).addScaledVector(lampDirection, 0.04);
  spot.target.position.copy(lampTarget);
  spot.castShadow = quality === "high";
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.08;
  spot.shadow.camera.far = 3.6;
  spot.shadow.bias = -0.0006;
  spot.shadow.radius = 5;
  lamp.add(spot);
  lamp.add(spot.target);
  const bulbLight = new THREE.PointLight(0xffb070, 0.35, 2.4, 2);
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
    spot.intensity = 3.4 * lampLevel;
    bulbLight.intensity = 0.35 * lampLevel;
    lampGlow.material.opacity = 0.55 * lampLevel;
    bulbMaterial.color.setRGB(0.16 + 0.84 * lampLevel, 0.14 + 0.75 * lampLevel, 0.12 + 0.6 * lampLevel);
    shadeMaterial.emissiveIntensity = lampLevel;
  });

  /* ---- 挂钟：显示访客本地的真实时间 */
  const clock = new THREE.Group();
  clock.position.set(-1.08, 1.9, BACK + 0.012);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 12, 48), std(0x2a2420, 0.4, 0.5));
  rim.position.z = 0.012;
  clock.add(shadowed(rim));
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.155, 48), std(0xffffff, 0.7, 0, { map: clockFaceTexture() }));
  face.position.z = 0.006;
  clock.add(face);
  const handMat = std(0x1c1b22, 0.5);
  const makeHand = (length, width, z, material = handMat) => {
    const geometry = new THREE.BoxGeometry(width, length, 0.003);
    geometry.translate(0, length / 2 - 0.015, 0);
    const hand = new THREE.Mesh(geometry, material);
    hand.position.z = z;
    clock.add(hand);
    return hand;
  };
  const hourHand = makeHand(0.085, 0.009, 0.012);
  const minuteHand = makeHand(0.125, 0.006, 0.015);
  const secondHand = makeHand(0.135, 0.0025, 0.018, std(0xc8402a, 0.5));
  scene.add(clock);
  tickers.push(() => {
    const now = new Date();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    secondHand.rotation.z = -(seconds / 60) * TAU;
    minuteHand.rotation.z = -(minutes / 60) * TAU;
    hourHand.rotation.z = -(hours / 12) * TAU;
  });

  /* ---- 年份卡片（WORK） */
  const cards = new THREE.Group();
  const stringY = 1.5;
  const cardZ = BACK + 0.012;
  const spanStart = -1.4;
  const spanEnd = -0.78;
  const sag = (x) => stringY - 0.024 * Math.sin(((x - spanStart) / (spanEnd - spanStart)) * Math.PI);
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
      new THREE.PlaneGeometry(0.095, 0.119),
      std(0xffffff, 0.92, 0, { map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.14, side: THREE.DoubleSide }),
    );
    const holder = new THREE.Group();
    holder.position.set(x, sag(x), cardZ + 0.006 + index * 0.0004);
    holder.rotation.z = (cardRng() - 0.5) * 0.14;
    card.position.y = -0.062;
    card.castShadow = true;
    holder.add(card);
    holder.add(box(0.012, 0.022, 0.006, std(index === TIMELINE.length - 1 ? CORAL : 0x8a6a45, 0.6), 0, -0.006, 0.002));
    cards.add(holder);
  });
  cards.add(hitBox(0.76, 0.2, 0.04, (spanStart + spanEnd) / 2, stringY - 0.075, cardZ));
  scene.add(cards);
  tag("work", cards);
  const cardsCenter = new THREE.Vector3((spanStart + spanEnd) / 2, stringY - 0.07, cardZ);

  /* ---- 右墙上的宣传片海报（FILM） */
  const poster = new THREE.Group();
  poster.position.set(RIGHT - 0.016, 1.52, -1.12);
  poster.rotation.y = -Math.PI / 2;
  poster.add(box(0.62, 0.3612, 0.03, std(0x101014, 0.5, 0.2)));
  const posterMaterial = std(0x1a1a22, 0.6, 0, { emissive: 0x000000 });
  posterMaterial.userData.keepEmissive = true; /* 贴图异步到达，悬停高亮不能改它的自发光 */
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.32625), posterMaterial);
  picture.position.z = 0.0156;
  poster.add(picture);
  scene.add(poster);
  tag("film", poster);
  new THREE.TextureLoader().load(posterUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    posterMaterial.map = texture;
    posterMaterial.emissiveMap = texture;
    posterMaterial.color.set(0xffffff);
    posterMaterial.emissive.set(0xffffff);
    posterMaterial.emissiveIntensity = 0.5;
    posterMaterial.needsUpdate = true;
  }, undefined, () => {
    /* 海报加载失败就保留深色画框，其它一切照常。 */
  });

  /* ---- 帘杆上的串灯 */
  const fairyPoints = [];
  const fairyPins = [-0.78, -0.12, 0.54, 1.22];
  for (let i = 0; i < fairyPins.length - 1; i += 1) {
    for (let k = 0; k < 9; k += 1) {
      const t = k / 9;
      fairyPoints.push(new THREE.Vector3(lerp(fairyPins[i], fairyPins[i + 1], t), 2.3 - 0.09 * Math.sin(t * Math.PI), BACK + 0.12));
    }
  }
  fairyPoints.push(new THREE.Vector3(fairyPins[fairyPins.length - 1], 2.3, BACK + 0.12));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fairyPoints), 96, 0.0025, 5), std(0x15161b, 0.8)));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd08a }), fairyPoints.length);
  const haloPositions = new Float32Array(fairyPoints.length * 3);
  const bulbMatrix = new THREE.Matrix4();
  fairyPoints.forEach((point, index) => {
    bulbMatrix.makeTranslation(point.x, point.y - 0.013, point.z + 0.004);
    bulbs.setMatrixAt(index, bulbMatrix);
    haloPositions.set([point.x, point.y - 0.013, point.z + 0.01], index * 3);
  });
  bulbs.instanceMatrix.needsUpdate = true;
  scene.add(bulbs);
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute("position", new THREE.BufferAttribute(haloPositions, 3));
  scene.add(noPick(new THREE.Points(haloGeometry, new THREE.PointsMaterial({
    color: 0xffb060, size: 0.1, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, map: glow,
  }))));
  for (const x of [-0.4, 0.55]) {
    const warm = new THREE.PointLight(0xffb060, 0.25, 2.2, 2);
    warm.position.set(x, 2.2, BACK + 0.3);
    scene.add(warm);
    moodLights.push(warm);
  }

  /* ---- 光：暖色室内 + 窗外冷光 */
  scene.add(new THREE.HemisphereLight(0xc2a586, 0x2a1c14, 1.05));
  const windowLight = new THREE.PointLight(0x7f9df0, 2.6, 7, 2);
  windowLight.position.set(0.3, 1.6, BACK + 0.4);
  scene.add(windowLight);
  const fill = new THREE.PointLight(0xffc999, 1.6, 6, 2);
  fill.position.set(0.85, 2.35, 0.3);
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
    dustSeeds.push([-0.6 + dustRng() * 0.9, 0.8 + dustRng() * 0.5, -1.45 + dustRng() * 0.6, dustRng() * TAU, 0.3 + dustRng() * 0.7]);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = noPick(new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: 0xffd9a8, size: 0.0075, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, map: glow,
  })));
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
    /* 显像管的微弱闪烁 */
    computerGlow.intensity = 0.12 * (0.965 + 0.035 * Math.sin(time * 13.0));
    tvGlow.intensity = 0.18 * (0.95 + 0.05 * Math.sin(time * 9.0 + 1.3));
  });

  return {
    hotspots,
    tickers,
    lamp,
    recorder,
    toggleLamp,
    spot,
    setMood,
    screens: { computer: computerScreen, tv: tvScreen },
    cardsCenter,
    computerState,
    redrawComputer,
    tvState,
    redrawTv,
    vfdState,
    redrawVfd,
    setTapes,
    moveTape,
    setRecorder,
    get loadedTape() {
      return loadedTape;
    },
  };
}

/* ------------------------------------------------------------------ 挂载 */

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const VIEW_SCREENS = { about: "computer", online: "computer", posts: "tv", film: "tv" };

export async function mount({
  stage,
  quality: wantedQuality = "high",
  forced = false,
  reducedMotion = false,
  posterUrl = "/assets/hpy-promo-poster.jpg",
  onHover = () => {},
  onPick = () => {},
  onFail = () => {},
} = {}) {
  if (!stage) throw new Error("room: stage is required");

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
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b10);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 30);
  const probe = camera.clone();

  const built = buildScene({ scene, renderer, posterUrl, quality });
  const byId = Object.fromEntries(HOTSPOTS.map((hotspot) => [hotspot.id, hotspot]));
  const pickRoots = [...Object.values(built.hotspots).flatMap((entry) => entry.groups), built.lamp, built.recorder];

  /* 悬停时给受光材质一点暖色自发光。 */
  const highlight = new THREE.Color(CORAL);
  const heat = {};
  for (const [id, entry] of Object.entries(built.hotspots)) {
    const materials = new Set();
    for (const group of entry.groups) {
      group.traverse((node) => {
        const material = node.isMesh ? node.material : null;
        if (material?.isMeshStandardMaterial && !material.emissiveMap && !material.userData.keepEmissive) materials.add(material);
      });
    }
    entry.materials = [...materials].map((material) => ({ material, base: material.emissive.clone(), baseIntensity: material.emissiveIntensity }));
    heat[id] = 0;
  }

  /* ---- 取景 */
  let width = 1;
  let height = 1;
  let narrow = 0;
  const poses = {};
  const scratch = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const horizontalHalf = () => Math.atan(Math.tan(rad(camera.fov) / 2) * camera.aspect);

  /* 让某块屏幕在画面里占满 fill 的比例，正对屏幕法线。 */
  function fitScreen(mesh, fill) {
    mesh.updateWorldMatrix(true, false);
    const [w, h] = mesh.userData.size;
    const center = mesh.getWorldPosition(new THREE.Vector3());
    mesh.getWorldDirection(normal);
    const distance = Math.max(
      (h / fill) / (2 * Math.tan(rad(camera.fov) / 2)),
      (w / fill) / (2 * Math.tan(horizontalHalf())),
    );
    return { pos: center.clone().addScaledVector(normal, distance), look: center };
  }

  function computePoses() {
    poses.desk = {
      pos: new THREE.Vector3(lerp(0.02, -0.08, narrow), lerp(1.33, 1.4, narrow), lerp(1.12, 1.9, narrow)),
      look: new THREE.Vector3(lerp(-0.06, -0.1, narrow), lerp(1.16, 1.26, narrow), -1.5),
    };
    poses.about = fitScreen(built.screens.computer, 0.8);
    poses.online = poses.about;
    poses.posts = fitScreen(built.screens.tv, 0.8);
    poses.film = poses.posts;

    /* WORK：宽屏把卡片放在左边，右边留给记事本；窄屏卡片在上，记事本从下面升起。 */
    const c = built.cardsCenter;
    const half = horizontalHalf();
    const wide = width >= 720;
    /* 宽屏：卡片（约 0.72 米宽）要落在左边 58% 的区域里；窄屏：占满宽度的七成。 */
    const span = wide ? 0.72 / 0.58 : 0.72 / 0.72;
    const distance = Math.max(0.6, span / (2 * Math.tan(half)));
    const visibleHalfWidth = distance * Math.tan(half);
    const shiftX = wide ? visibleHalfWidth * 0.42 : 0;
    const shiftY = wide ? 0 : -distance * Math.tan(rad(camera.fov) / 2) * 0.5;
    poses.work = {
      pos: new THREE.Vector3(c.x + shiftX, c.y + shiftY, c.z + distance),
      look: new THREE.Vector3(c.x + shiftX, c.y + shiftY, c.z),
    };
  }

  function layout() {
    width = Math.max(1, stage.clientWidth || window.innerWidth);
    height = Math.max(1, stage.clientHeight || window.innerHeight);
    const aspect = width / height;
    narrow = clamp((1.25 - aspect) / 0.75, 0, 1);

    /* 横屏固定垂直视角；变窄时改为保住水平方向，再窄就把机位往后拉。 */
    const baseVertical = 40;
    const minHorizontal = 60;
    const horizontal = deg(2 * Math.atan(Math.tan(rad(baseVertical) / 2) * aspect));
    camera.fov = horizontal >= minHorizontal
      ? baseVertical
      : Math.min(70, deg(2 * Math.atan(Math.tan(rad(minHorizontal) / 2) / aspect)));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    probe.fov = camera.fov;
    probe.aspect = aspect;
    probe.updateProjectionMatrix();
    computePoses();
    renderer.setSize(width, height, false);

    /* 停在某个视图时窗口变了，直接对齐到新的机位。 */
    if (!flight) {
      view.pos.copy(poses[current].pos);
      view.look.copy(poses[current].look);
    }
  }

  /* 屏幕在某个视图的终点机位下，落在 stage 里的哪个矩形（CSS 像素）。 */
  function screenRect(viewId) {
    const key = VIEW_SCREENS[viewId];
    const pose = poses[viewId];
    if (!key || !pose) return null;
    const mesh = built.screens[key];
    probe.position.copy(pose.pos);
    probe.lookAt(pose.look);
    probe.updateMatrixWorld();
    mesh.updateWorldMatrix(true, false);
    const [w, h] = mesh.userData.size;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      scratch.set((sx * w) / 2, (sy * h) / 2, 0).applyMatrix4(mesh.matrixWorld).project(probe);
      const x = (scratch.x * 0.5 + 0.5) * width;
      const y = (-scratch.y * 0.5 + 0.5) * height;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    return { left, top, width: right - left, height: bottom - top };
  }

  /* ---- 指针 */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerPx = { x: 0, y: 0 };
  const parallax = { x: 0, y: 0, targetX: 0, targetY: 0, weight: 1 };
  let pointerActive = false;
  let pointerMoved = false;
  let hoverId = null;

  const plainClick = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

  function toNdc(event) {
    const rect = stage.getBoundingClientRect();
    pointerPx.x = event.clientX - rect.left;
    pointerPx.y = event.clientY - rect.top;
    pointer.set((pointerPx.x / rect.width) * 2 - 1, -(pointerPx.y / rect.height) * 2 + 1);
  }

  /* 返回命中的热点或动作；点在某盒录像带上时顺带返回带子的序号。 */
  function pick() {
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(pickRoots, true)) {
      let node = hit.object;
      let tape = null;
      while (node) {
        if (Number.isInteger(node.userData.tape)) tape = node.userData.tape;
        if (node.userData.hotspot) return { id: node.userData.hotspot, tape };
        if (node.userData.action) return { id: node.userData.action, tape: null };
        node = node.parent;
      }
    }
    return null;
  }

  function setHover(id) {
    if (hoverId !== id) {
      hoverId = id;
      built.computerState.hover = byId[id] ? id : null;
      built.redrawComputer();
    }
    if (!id) {
      onHover(null);
      return;
    }
    const hotspot = byId[id] || ACTIONS[id];
    onHover({
      id,
      label: hotspot.label,
      sub: hotspot.sub,
      external: Boolean(hotspot?.href && !hotspot.href.startsWith("#")),
      x: pointerPx.x,
      y: pointerPx.y,
    });
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
    if (current !== "desk" || flight || !plainClick(event)) return;
    toNdc(event);
    const hit = pick();
    if (!hit) return;
    if (hit.id === "lamp") built.toggleLamp();
    else onPick(hit.id, { tape: hit.tape });
  }

  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerleave", onPointerLeave);
  stage.addEventListener("click", onClick);

  /* ---- 镜头 */
  const view = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let current = "desk";
  let flight = null;

  function finishFlight() {
    const active = flight;
    if (!active) return;
    flight = null;
    window.clearTimeout(active.timer);
    view.pos.copy(poses[active.target].pos);
    view.look.copy(poses[active.target].look);
    active.resolve();
  }

  /* 推镜头到某个视图。按真实时间走，并带一个兜底定时器：
     浏览器节流渲染循环（后台标签页、极低帧率）时也一定会到达。 */
  function goTo(target, { instant = false } = {}) {
    if (!poses[target]) return Promise.resolve();
    if (flight) finishFlight();
    current = target;
    setHover(null);
    stage.style.cursor = "";
    built.computerState.mode = target === "about" || target === "online" ? target : "desk";
    built.redrawComputer();
    if (target === "posts") tv({ mode: "teletext" });
    else if (built.tvState.mode === "teletext") tv({ mode: "idle" });
    const seconds = instant || reducedMotion ? 0 : target === "desk" ? 0.9 : 1.05;
    return new Promise((resolve) => {
      if (seconds === 0) {
        view.pos.copy(poses[target].pos);
        view.look.copy(poses[target].look);
        resolve();
        return;
      }
      const active = {
        target,
        fromPos: view.pos.clone(),
        fromLook: view.look.clone(),
        elapsed: 0,
        seconds,
        resolve,
        timer: 0,
      };
      active.timer = window.setTimeout(() => {
        if (flight === active) finishFlight();
      }, seconds * 1000 + 700);
      flight = active;
    });
  }

  function reset() {
    if (flight) {
      window.clearTimeout(flight.timer);
      flight.resolve();
    }
    flight = null;
    current = "desk";
    built.computerState.mode = "desk";
    built.redrawComputer();
    view.pos.copy(poses.desk.pos);
    view.look.copy(poses.desk.look);
    parallax.weight = 1;
    setHover(null);
  }

  /* ---- 电视、录像机与录音机：由启动器驱动 */
  function tv(next) {
    Object.assign(built.tvState, { element: null, osd: "", osdHold: true }, next);
    built.redrawTv();
  }

  function setVcr(mode) {
    built.vfdState.vcr = mode;
    built.redrawVfd();
  }

  /* ---- 循环 */
  const offset = new THREE.Vector3();
  const sideways = new THREE.Vector3();
  let frameId = 0;
  let running = false;
  let disposed = false;
  let last = 0;
  let time = 0;
  let blinkAt = 0;
  let wantRunning = false;

  /* 帧率看门狗：先降画质，画质降到底还是太慢才放弃。
     阈值留在 30 以下：省电模式和部分移动浏览器会把刷新率锁在 30fps，那不算跑不动。 */
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
    const atDesk = current === "desk" && !flight;

    if (flight) {
      /* 用真实经过的时间：掉帧时镜头跳得快一点，但不会变成慢动作。 */
      flight.elapsed += realDt;
      const t = clamp(flight.elapsed / flight.seconds, 0, 1);
      const k = easeInOut(t);
      view.pos.lerpVectors(flight.fromPos, poses[flight.target].pos, k);
      view.look.lerpVectors(flight.fromLook, poses[flight.target].look, k);
      if (t >= 1) finishFlight();
    }

    /* 只在书桌视角跟随鼠标轻微晃动；推近之后机位必须稳定，好让 HTML 屏幕对齐。 */
    parallax.weight = lerp(parallax.weight, atDesk ? 1 : 0, 1 - Math.exp(-dt * (atDesk ? 3 : 12)));
    const follow = 1 - Math.exp(-dt * 4);
    parallax.x = lerp(parallax.x, parallax.targetX, follow);
    parallax.y = lerp(parallax.y, parallax.targetY, follow);
    const sway = reducedMotion ? 0 : Math.sin(time * 0.27) * 0.008;
    sideways.subVectors(view.look, view.pos).cross(camera.up).normalize();
    offset.copy(sideways).multiplyScalar((parallax.x * 0.1 + sway) * parallax.weight);
    offset.y += (parallax.y * 0.045 + (reducedMotion ? 0 : Math.sin(time * 0.19) * 0.004)) * parallax.weight;
    camera.position.copy(view.pos).add(offset);
    camera.lookAt(view.look);

    if (pointerMoved && pointerActive && atDesk) {
      pointerMoved = false;
      const hit = pick();
      stage.style.cursor = hit ? "pointer" : "";
      setHover(hit?.id ?? null);
    }

    for (const [id, entry] of Object.entries(built.hotspots)) {
      const goal = id === hoverId ? 1 : 0;
      if (Math.abs(heat[id] - goal) < 0.002) continue;
      heat[id] = lerp(heat[id], goal, 1 - Math.exp(-dt * 10));
      for (const item of entry.materials) {
        item.material.emissive.copy(item.base).lerp(highlight, heat[id] * 0.5);
        item.material.emissiveIntensity = lerp(item.baseIntensity, 0.32, heat[id]);
      }
    }

    for (const tick of built.tickers) tick(time, dt, realDt);

    blinkAt += dt;
    if (blinkAt > 0.5) {
      blinkAt = 0;
      const blink = reducedMotion ? true : !built.computerState.blink;
      built.computerState.blink = blink;
      built.computerState.clock = clockText();
      built.redrawComputer();
      built.vfdState.blink = blink;
      built.vfdState.clock = clockText();
      built.redrawVfd();
      built.tvState.blink = blink;
      built.tvState.clock = clockText(true);
      if (built.tvState.mode === "idle") built.redrawTv();
    }
    /* 正在放带或是雪花时，电视每一帧都要重画。 */
    if (built.tvState.mode === "media" || built.tvState.mode === "noise") built.redrawTv();
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

  const onContextLost = (event) => {
    event.preventDefault();
    pause();
    onFail("context-lost");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("visibilitychange", onVisibility);

  const layoutListeners = new Set();
  const relayout = () => {
    layout();
    for (const listener of layoutListeners) listener();
  };
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(relayout) : null;
  if (resizeObserver) resizeObserver.observe(stage);
  else window.addEventListener("resize", relayout);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (flight) {
      window.clearTimeout(flight.timer);
      flight.resolve();
    }
    flight = null;
    pause();
    wantRunning = false;
    layoutListeners.clear();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", relayout);
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
  }

  /* ---- 首帧：先编译着色器再交出控制权，避免淡入时卡一下。 */
  layout();
  reset();
  built.redrawComputer();
  built.redrawTv();
  built.redrawVfd();
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
    goTo,
    screenRect,
    toggleLamp: () => built.toggleLamp(),
    setTapes: (list) => built.setTapes(list),
    insertTape: (index) => built.moveTape(index, true, reducedMotion),
    ejectTape: () => (built.loadedTape >= 0 ? built.moveTape(built.loadedTape, false, reducedMotion) : Promise.resolve()),
    get loadedTape() {
      return built.loadedTape;
    },
    tv,
    setVcr,
    setRecorder: (playing) => built.setRecorder(playing),
    onLayout(listener) {
      layoutListeners.add(listener);
      return () => layoutListeners.delete(listener);
    },
    get view() {
      return current;
    },
    get quality() {
      return quality;
    },
  };
}
