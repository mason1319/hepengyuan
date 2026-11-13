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
  tape: { label: "MUSIC", sub: "录音机 · 放磁带听音乐" },
  cassette: { label: "CASSETTE", sub: "放进录音机" },
  book: { label: "WORK", sub: "作品" },
  deckPlay: { label: "PLAY", sub: "播放 / 暂停" },
  deckPause: { label: "PAUSE", sub: "暂停" },
  deckStop: { label: "STOP/EJ", sub: "停止 · 退出磁带" },
  deckNext: { label: "FF", sub: "下一首" },
  deckPrev: { label: "REW", sub: "上一首" },
  deckRec: { label: "REC", sub: "录音键（按着玩）" },
  calc: { label: "CALC", sub: "计算器 · 拿起来用" },
  card: { label: "CARD", sub: "名片 · 拿一张出来" },
  tvPower: { label: "POWER", sub: "电视开关" },
  tvPreset: { label: "CH", sub: "预选台 1–6" },
  tvChannel: { label: "TUNE", sub: "换台" },
  tvVolume: { label: "VOL", sub: "音量" },
  pcPower: { label: "POWER", sub: "电脑开关" },
  pcBright: { label: "BRIGHT", sub: "屏幕亮度" },
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
  if (s.power === false) {
    drawPowerOff(g, W, H, performance.now() - s.powerAt);
    return;
  }
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
      g.fillText((s.subs?.[hotspot.id] || hotspot.sub).split(" · ")[0], 330, y + 8);
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
  if (s.powerAt) drawWarmUp(g, W, H, performance.now() - s.powerAt);
}

/* 关机：画面先压成一条亮线，再缩成一个亮点慢慢熄灭。 */
function drawPowerOff(g, W, H, ms) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  if (ms < 150) {
    const k = ms / 150;
    const h = Math.max(3, H * (1 - k) * 0.6);
    g.fillStyle = `rgba(235,245,255,${0.45 + 0.5 * k})`;
    g.fillRect(W * 0.04 * k, (H - h) / 2, W * (1 - 0.08 * k), h);
  } else if (ms < 620) {
    const k = 1 - (ms - 150) / 470;
    const r = 6 + 34 * k;
    const dot = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r * 2.6);
    dot.addColorStop(0, `rgba(255,255,255,${k})`);
    dot.addColorStop(0.35, `rgba(200,225,255,${0.5 * k})`);
    dot.addColorStop(1, "rgba(200,225,255,0)");
    g.fillStyle = dot;
    g.fillRect(0, 0, W, H);
  }
}

/* 开机：显像管预热，从黑慢慢亮起来。 */
function drawWarmUp(g, W, H, ms) {
  if (ms >= 750) return;
  g.fillStyle = `rgba(0,0,0,${1 - ms / 750})`;
  g.fillRect(0, 0, W, H);
}

/* 老电视：测试卡、图文电视、雪花、正在播放的录像带；平时按面板上的 1–6 换台。 */
const BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0", "#101010"];

function tvShowsNoise(s) {
  return s.power !== false && (s.mode === "noise" || (s.mode === "idle" && (s.channel === 2 || s.channel === 5)));
}

function drawTeletextPage(g, W) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, W);
  g.fillStyle = "#1f34d8";
  g.fillRect(0, 40, W, 60);
  g.fillStyle = "#ffe14d";
  g.font = `44px ${OSD}`;
  g.textBaseline = "top";
  g.fillText("HPY TELETEXT   P100", 36, 48);
  g.fillStyle = "#55e3ff";
  for (let i = 0; i < 6; i += 1) g.fillRect(36, 140 + i * 62, 220 + ((i * 97) % 330), 20);
}

function drawTestCard(g, W, H, s) {
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
  g.fillText(s.insertText || "放入录像带 · FILM", W / 2, barH + H * 0.15);
}

function drawTv(g, W, H, s, noise) {
  const now = performance.now();
  if (s.power === false) {
    drawPowerOff(g, W, H, now - s.powerAt);
    return;
  }
  g.save();
  if (s.mode === "teletext") {
    drawTeletextPage(g, W);
  } else if (tvShowsNoise(s)) {
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
  } else if (s.channel === 3) {
    /* AV 输入：录像机没放带时的蓝屏 */
    g.fillStyle = "#1736c9";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#e9eeff";
    g.font = `48px ${OSD}`;
    g.textBaseline = "top";
    g.fillText("AV-1  VIDEO", 40, 36);
    g.textAlign = "center";
    g.font = `92px ${OSD}`;
    g.fillText(s.clock, W / 2, H / 2 - 50);
  } else if (s.channel === 4) {
    drawTeletextPage(g, W);
  } else if (s.channel === 6) {
    BARS.slice(0, 7).forEach((color, index) => {
      g.fillStyle = color;
      g.fillRect((index * W) / 7, 0, W / 7 + 1, H);
    });
    g.fillStyle = "#000";
    g.fillRect(W / 2 - 130, H / 2 - 40, 260, 80);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `56px ${OSD}`;
    g.fillText("HPY TV", W / 2, H / 2 + 2);
  } else {
    drawTestCard(g, W, H, s);
  }
  g.restore();
  /* 面板上换台、调音量时的绿色屏显 */
  if (s.panelOsd && now < s.panelOsdUntil) {
    g.save();
    g.font = `52px ${OSD}`;
    g.textBaseline = "top";
    g.textAlign = s.panelOsd.startsWith("VOL") ? "left" : "right";
    g.shadowColor = "rgba(0,0,0,.9)";
    g.shadowBlur = 8;
    g.fillStyle = "#6dff7a";
    if (s.panelOsd.startsWith("VOL")) g.fillText(s.panelOsd, 40, H - 110);
    else g.fillText(s.panelOsd, W - 40, 30);
    g.restore();
  }
  scanlines(g, W, H, 0.22);
  const vignette = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.45)");
  g.fillStyle = vignette;
  g.fillRect(0, 0, W, H);
  if (s.powerAt) drawWarmUp(g, W, H, now - s.powerAt);
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

function drawLcd(g, w, h, text) {
  g.fillStyle = "#9fae8c";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#1f2618";
  g.textAlign = "right";
  g.textBaseline = "middle";
  g.font = `60px ${OSD}`;
  const room = w - 24;
  const measured = g.measureText(text).width;
  if (measured > room) g.font = `${Math.floor((60 * room) / measured)}px ${OSD}`;
  g.fillText(text, w - 12, h / 2 + 3);
}

function lcdTexture(text) {
  return canvasTexture(256, 80, (g, w, h) => drawLcd(g, w, h, text));
}

/* 铭牌、面板上的小字。 */
function labelTexture(text, { width, height, color, bg, font, spacing = 0 }) {
  return canvasTexture(width, height, (g, w, h) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    g.fillStyle = color;
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (spacing && "letterSpacing" in g) g.letterSpacing = `${spacing}px`;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/* 显像管玻璃上的斜向高光（叠加混合，很淡）。 */
function sheenTexture() {
  return canvasTexture(256, 192, (g, w, h) => {
    const band = g.createLinearGradient(0, 0, w * 0.75, h);
    band.addColorStop(0, "rgba(255,255,255,0.30)");
    band.addColorStop(0.32, "rgba(255,255,255,0.06)");
    band.addColorStop(0.33, "rgba(255,255,255,0)");
    g.fillStyle = band;
    g.fillRect(0, 0, w, h);
    const spot = g.createRadialGradient(w * 0.22, h * 0.18, 2, w * 0.22, h * 0.18, w * 0.32);
    spot.addColorStop(0, "rgba(255,255,255,0.22)");
    spot.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = spot;
    g.fillRect(0, 0, w, h);
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

/* 电视下沿的扬声器网罩：密密的小孔。 */
function perforatedTexture() {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = "#1a1b1f";
    g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 9) {
      for (let x = 6 + ((y / 9) % 2) * 4.5; x < w; x += 9) {
        g.fillStyle = "#08080a";
        g.beginPath();
        g.arc(x, y, 2.6, 0, TAU);
        g.fill();
      }
    }
  });
}

/* 面板上印的小字：items 是 [文字, 物件坐标 x]，[x0, x1] 是这块贴片覆盖的物件坐标范围。 */
function panelLabelTexture(items = [], x0 = 0, x1 = 1) {
  return canvasTexture(1024, 36, (g, w, h) => {
    g.fillStyle = "#a3a4aa";
    g.font = `600 22px ${SANS}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const [text, x] of items) g.fillText(text, ((x - x0) / (x1 - x0)) * w, h / 2);
  });
}

/* 磁带：烟灰色外壳、贴纸、中间的小窗和两只带齿的轴；userData.reels 给录音机转动用。 */
function cassetteLabelTexture(color, en, label) {
  return canvasTexture(256, 104, (g, w, h) => {
    g.fillStyle = "#f3eee2";
    g.fillRect(0, 0, w, h);
    if (!en) {
      g.strokeStyle = "rgba(60,70,110,.35)";
      g.lineWidth = 2;
      for (let y = 30; y < h; y += 18) {
        g.beginPath();
        g.moveTo(14, y);
        g.lineTo(w - 14, y);
        g.stroke();
      }
      return;
    }
    g.fillStyle = color;
    g.fillRect(0, 0, w, 30);
    g.fillStyle = "#fff";
    g.font = `26px ${OSD}`;
    g.textBaseline = "middle";
    g.fillText(`A  ${en}`, 12, 16);
    g.fillStyle = "#1d2433";
    g.font = `600 30px ${SANS}`;
    g.fillText(label, 14, 60);
    g.strokeStyle = "rgba(60,70,110,.35)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(14, 86);
    g.lineTo(w - 14, 86);
    g.stroke();
  });
}

function cassetteMesh(color, en, label) {
  const group = new THREE.Group();
  const shell = std(0x2b2c31, 0.35, 0.25);
  group.add(box(0.1, 0.064, 0.012, shell));
  const labelMaterial = new THREE.MeshStandardMaterial({ map: cassetteLabelTexture(color, en, label), roughness: 0.8 });
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.036), labelMaterial);
  sticker.position.set(0, 0.009, 0.0062);
  group.add(sticker);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.014), new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.2 }));
  pane.position.set(0, -0.009, 0.0064);
  group.add(pane);
  const reels = [];
  for (const x of [-0.017, 0.017]) {
    const reel = new THREE.Group();
    reel.position.set(x, -0.009, 0.0066);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 6), new THREE.MeshBasicMaterial({ color: 0xf2efe8 }));
    reel.add(hub);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.0024, 12), new THREE.MeshBasicMaterial({ color: 0x14100c }));
    core.position.z = 0.0002;
    reel.add(core);
    group.add(reel);
    reels.push(reel);
  }
  group.add(box(0.07, 0.008, 0.003, std(0x3a3b41, 0.4), 0, -0.027, 0.006));
  group.userData.reels = reels;
  group.userData.labelMaterial = labelMaterial;
  return group;
}

/* 录音机显示屏：收音机刻度、TAPE 指示、7 段均衡器。 */
function drawDeckDisplay(g, W, H, deck) {
  g.fillStyle = "#0c100e";
  g.fillRect(0, 0, W, H);
  g.font = `22px ${OSD}`;
  g.textBaseline = "middle";
  g.fillStyle = "#ffb45e";
  const left = 18;
  const right = 300;
  g.fillText("FM", left, 22);
  [88, 92, 96, 100, 104, 108].forEach((mhz, index) => {
    const x = left + 40 + (index * (right - left - 50)) / 5;
    g.fillText(String(mhz), x - 10, 22);
    g.fillRect(x, 40, 2, 14);
  });
  g.fillRect(left + 40, 54, right - left - 46, 2);
  g.fillStyle = "#ff4a2e";
  g.fillRect(left + 40 + ((98.6 - 88) / 20) * (right - left - 50), 34, 3, 28);
  g.fillStyle = deck.loaded >= 0 ? "#7dff8a" : "#23402a";
  g.fillText(deck.playing ? "▶ TAPE" : "TAPE", left, 84);
  g.fillStyle = "#3a4a3e";
  g.fillText("STEREO", left + 110, 84);
  const bars = deck.level.length;
  for (let i = 0; i < bars; i += 1) {
    const x = 330 + i * 24;
    for (let s = 0; s < 8; s += 1) {
      const lit = deck.level[i] * 8 > s;
      const color = s > 5 ? "#ff4a2e" : s > 3 ? "#ffb45e" : "#7dff8a";
      g.fillStyle = lit ? color : "#16201a";
      g.fillRect(x, H - 14 - s * 11, 16, 8);
    }
  }
}

/* 书脊：中文竖排一字一行，西文转 90 度横着写；太长就截断。 */
function spineTexture(title, color) {
  return canvasTexture(64, 512, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(230,200,120,.85)";
    g.fillRect(6, 22, w - 12, 3);
    g.fillRect(6, h - 26, w - 12, 3);
    g.fillStyle = "#f3e7c4";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const text = String(title || "").trim();
    if (/[㐀-鿿]/.test(text)) {
      const chars = [...text.replace(/\s+/g, "")].slice(0, 12);
      const size = Math.min(34, Math.floor((h - 80) / Math.max(chars.length, 1)) - 2);
      g.font = `600 ${size}px ${SERIF}`;
      chars.forEach((char, index) => g.fillText(char, w / 2, 48 + size / 2 + index * (size + 2)));
    } else {
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(Math.PI / 2);
      let size = 30;
      g.font = `600 ${size}px ${SERIF}`;
      while (size > 14 && g.measureText(text).width > h - 70) {
        size -= 2;
        g.font = `600 ${size}px ${SERIF}`;
      }
      g.fillText(text, 0, 2);
      g.restore();
    }
  });
}

/* 八卦镜的八卦图：红底金色卦爻，中间留给小圆镜。 */
function baguaTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#a8281a";
    g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.fillStyle = "#e9c25a";
    [7, 3, 5, 1, 6, 2, 4, 0].forEach((bits, index) => {
      g.save();
      g.rotate((index / 8) * TAU);
      for (let line = 0; line < 3; line += 1) {
        const y = -100 + line * 14;
        if (bits & (1 << line)) g.fillRect(-26, y, 52, 8);
        else {
          g.fillRect(-26, y, 21, 8);
          g.fillRect(5, y, 21, 8);
        }
      }
      g.restore();
    });
    g.strokeStyle = "#e9c25a";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 50, 0, TAU);
    g.stroke();
  });
}

/* 图腾柱的三张脸：木色底、深色刻痕、红和青绿的彩绘。 */
function totemTexture() {
  const face = (variant) => canvasTexture(128, 192, (g, w, h) => {
    g.fillStyle = "#8a5a32";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3b2312";
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    const paint = ["#b3261d", "#1f7a74", "#c98a2a"][variant];
    g.fillStyle = paint;
    g.beginPath();
    g.ellipse(36, 70, 22, 16, 0, 0, TAU);
    g.ellipse(92, 70, 22, 16, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#f2e6c8";
    g.beginPath();
    g.arc(36, 70, 8, 0, TAU);
    g.arc(92, 70, 8, 0, TAU);
    g.fill();
    g.fillStyle = "#1a0f08";
    g.beginPath();
    g.arc(36, 70, 4, 0, TAU);
    g.arc(92, 70, 4, 0, TAU);
    g.fill();
    g.fillStyle = "#3b2312";
    g.fillRect(56, 82, 16, 34);
    g.fillStyle = paint;
    if (variant === 1) g.fillRect(28, 132, 72, 18);
    else {
      g.beginPath();
      g.moveTo(26, 128);
      g.quadraticCurveTo(64, 170, 102, 128);
      g.lineTo(26, 128);
      g.fill();
    }
    g.fillStyle = "#3b2312";
    for (let x = 34; x < 100; x += 10) g.fillRect(x, 134, 4, 10);
  });
  return [face(0), face(1), face(2)];
}

/* 符箓：黄纸、朱砂红边框，上面竖写“敕令”，中间一笔连写的符纹，下面竖写四个字。 */
function talismanTexture(top, bottom, seed) {
  return canvasTexture(128, 416, (g, w, h) => {
    g.fillStyle = "#efc83c";
    g.fillRect(0, 0, w, h);
    const rnd = makeRng(90 + seed);
    for (let i = 0; i < 260; i += 1) {
      g.fillStyle = `rgba(150,110,20,${0.05 + rnd() * 0.08})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.strokeStyle = "#b8231b";
    g.lineWidth = 3;
    g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = "#b8231b";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 36px ${SERIF}`;
    [...top].forEach((char, index) => g.fillText(char, w / 2, 40 + index * 40));
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(w / 2, 110);
    for (let i = 0; i < 6; i += 1) {
      const y = 122 + i * 16;
      g.quadraticCurveTo(i % 2 ? 22 : w - 22, y + 4, w / 2 + (rnd() - 0.5) * 20, y + 12);
    }
    g.stroke();
    g.beginPath();
    g.arc(w / 2, 232, 12, 0, TAU);
    g.stroke();
    g.font = `800 30px ${SERIF}`;
    [...bottom].forEach((char, index) => g.fillText(char, w / 2, 274 + index * 34));
  });
}

/* ------------------------------------------------------------------ 名片
   正反两面画在 canvas 上：深紫底、细波纹、香槟金描边；字全部来自首页 #card（由启动器读出来交给场景）。 */
const CARD_PX = { w: 1536, h: 970 };
const CARD_INK = { bright: "#efe9da", soft: "#cfc6e4", dim: "#b9b0d6", gold: "#d9c58f", silver: "#d9d2bf" };
const BRUSH = '"Xingkai SC", "STXingkai", "Kaiti SC", "STKaiti", "KaiTi", "Songti SC", serif';

function roundedRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* 按宽度折行：中文一字一断，西文按词断。 */
function wrapLines(g, text, maxWidth, maxLines = 3) {
  const tokens = String(text || "").match(/[㐀-鿿　-〿＀-￯]|[^\s㐀-鿿　-〿＀-￯]+|\s+/g) || [];
  const lines = [];
  let line = "";
  for (const token of tokens) {
    const next = line + token;
    if (line && g.measureText(next.trimEnd()).width > maxWidth) {
      lines.push(line.trim());
      line = token.trimStart();
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line.trim()) lines.push(line.trim());
  return lines.slice(0, maxLines);
}

/* 单行字：放不下就缩小字号。 */
function fitText(g, text, x, y, maxWidth, size, weight = 400, family = SANS) {
  let px = size;
  g.font = `${weight} ${px}px ${family}`;
  while (px > 14 && g.measureText(text).width > maxWidth) {
    px -= 2;
    g.font = `${weight} ${px}px ${family}`;
  }
  g.fillText(text, x, y);
  return px;
}

function drawCardBase(g, W, H) {
  const base = g.createRadialGradient(W * 0.2, H * 0.1, 40, W * 0.45, H * 0.5, W * 0.9);
  base.addColorStop(0, "#4a3b88");
  base.addColorStop(0.5, "#2b2154");
  base.addColorStop(1, "#191331");
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  /* 细波纹 */
  g.strokeStyle = "rgba(220,205,255,0.05)";
  g.lineWidth = 2;
  for (let y = 40; y < H; y += 26) {
    g.beginPath();
    for (let x = 0; x <= W; x += 24) g.lineTo(x, y + Math.sin(x / 70 + y / 50) * 6);
    g.stroke();
  }
  /* 斜向的拉丝光泽 */
  const sheen = g.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, "rgba(255,255,255,0.08)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0)");
  sheen.addColorStop(0.8, "rgba(255,255,255,0.04)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);
  const gold = g.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, "#efdcae");
  gold.addColorStop(0.5, "#a98b56");
  gold.addColorStop(1, "#e7d3a1");
  g.strokeStyle = gold;
  g.lineWidth = 7;
  roundedRectPath(g, 18, 18, W - 36, H - 36, 52);
  g.stroke();
  g.strokeStyle = "rgba(217,197,143,0.45)";
  g.lineWidth = 2;
  roundedRectPath(g, 38, 38, W - 76, H - 76, 40);
  g.stroke();
}

/* 银色压字：一层深色阴影 + 渐变填充，看起来像压出来的金属字。 */
function embossed(g, draw) {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowOffsetY = 4;
  g.shadowBlur = 6;
  draw();
  g.restore();
}

function drawChip(g, x, y, w, h) {
  const gold = g.createLinearGradient(x, y, x + w, y + h);
  gold.addColorStop(0, "#f3dfa2");
  gold.addColorStop(0.5, "#c9a254");
  gold.addColorStop(1, "#f0d898");
  g.fillStyle = gold;
  roundedRectPath(g, x, y, w, h, 22);
  g.fill();
  g.strokeStyle = "rgba(110,80,30,0.65)";
  g.lineWidth = 4;
  for (const fx of [0.34, 0.66]) {
    g.beginPath();
    g.moveTo(x + w * fx, y + 10);
    g.lineTo(x + w * fx, y + h - 10);
    g.stroke();
  }
  for (const fy of [0.34, 0.66]) {
    g.beginPath();
    g.moveTo(x + 10, y + h * fy);
    g.lineTo(x + w - 10, y + h * fy);
    g.stroke();
  }
}

function drawBaguaMark(g, cx, cy, r) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = "rgba(217,197,143,0.22)";
  g.fillStyle = "rgba(217,197,143,0.22)";
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 8; i += 1) {
    const a = (i / 8) * TAU + Math.PI / 8;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.42, 0, TAU);
  g.stroke();
  [7, 3, 5, 1, 6, 2, 4, 0].forEach((bits, index) => {
    g.save();
    g.rotate((index / 8) * TAU);
    for (let line = 0; line < 3; line += 1) {
      const y = -r * 0.86 + line * 12;
      if (bits & (1 << line)) g.fillRect(-26, y, 52, 6);
      else {
        g.fillRect(-26, y, 21, 6);
        g.fillRect(5, y, 21, 6);
      }
    }
    g.restore();
  });
  g.restore();
}

/* 名片上的书法名字：首页给的是一张白色字形透明图（assets/card/name.png），
   这里给它上银色渐变，再在右下叠几层深色做出压铸金属字的厚度和投影。 */
function drawNameArt(g, image, x, y, w, h) {
  const off = document.createElement("canvas");
  off.width = Math.ceil(w);
  off.height = Math.ceil(h);
  const o = off.getContext("2d");
  const tint = (fill) => {
    o.globalCompositeOperation = "source-over";
    o.clearRect(0, 0, off.width, off.height);
    o.drawImage(image, 0, 0, off.width, off.height);
    o.globalCompositeOperation = "source-in";
    o.fillStyle = fill;
    o.fillRect(0, 0, off.width, off.height);
    return off;
  };
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 16;
  g.shadowOffsetY = 10;
  g.drawImage(tint("#1d1922"), x + 6, y + 7);
  g.restore();
  const side = tint("#5f5a55");
  for (let step = 6; step >= 1; step -= 1) g.drawImage(side, x + step * 0.7, y + step);
  const face = o.createLinearGradient(0, 0, off.width * 0.25, off.height);
  face.addColorStop(0, "#fffcf4");
  face.addColorStop(0.45, "#d3ccbd");
  face.addColorStop(0.62, "#efe9dc");
  face.addColorStop(1, "#8f887b");
  g.drawImage(tint(face), x, y);
}

function drawCardFront(g, W, H, data, nameImage = null) {
  drawCardBase(g, W, H);
  if (!data) return;
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.fillStyle = CARD_INK.silver;
  if ("letterSpacing" in g) g.letterSpacing = "4px";
  fitText(g, data.en, 110, 175, 720, 40, 600);
  if ("letterSpacing" in g) g.letterSpacing = "0px";
  if (nameImage?.complete && nameImage.naturalWidth) {
    const w = 660;
    drawNameArt(g, nameImage, 100, 205, w, (w * nameImage.naturalHeight) / nameImage.naturalWidth);
  } else {
    embossed(g, () => {
      const silver = g.createLinearGradient(0, 220, 0, 400);
      silver.addColorStop(0, "#fbf7ee");
      silver.addColorStop(1, "#a9a294");
      g.fillStyle = silver;
      if ("letterSpacing" in g) g.letterSpacing = "18px";
      fitText(g, data.name, 100, 370, 720, 172, 400, BRUSH);
      if ("letterSpacing" in g) g.letterSpacing = "0px";
    });
  }
  embossed(g, () => {
    g.fillStyle = CARD_INK.bright;
    fitText(g, data.tag, 110, 470, 760, 60, 700);
  });
  g.fillStyle = CARD_INK.soft;
  fitText(g, data.sub, 112, 545, 760, 42, 500);
  drawChip(g, W - 330, 78, 190, 150);
  /* 右栏：两条定位 */
  let y = 300;
  for (const item of data.focus.slice(0, 2)) {
    g.fillStyle = CARD_INK.bright;
    embossed(g, () => fitText(g, item.title, 920, y, 520, 52, 700));
    g.fillStyle = CARD_INK.soft;
    g.font = `500 34px ${SANS}`;
    const lines = wrapLines(g, item.text, 500, 2);
    lines.forEach((line, index) => g.fillText(line, 922, y + 50 + index * 40));
    y += 60 + lines.length * 40 + 30;
  }
  drawBaguaMark(g, W - 300, H - 230, 150);
  const rule = g.createLinearGradient(100, 0, W - 100, 0);
  rule.addColorStop(0, "rgba(217,197,143,0.85)");
  rule.addColorStop(1, "rgba(217,197,143,0.1)");
  g.fillStyle = rule;
  g.fillRect(100, 612, W - 220, 3);
  embossed(g, () => {
    g.fillStyle = CARD_INK.bright;
    fitText(g, data.org, 110, 712, 820, 64, 700);
  });
  g.fillStyle = CARD_INK.silver;
  fitText(g, data.role, 112, 790, 820, 44, 600);
  g.fillStyle = CARD_INK.dim;
  fitText(g, data.open, 112, 880, 860, 36, 500);
}

function drawCardBack(g, W, H, data, images = []) {
  drawCardBase(g, W, H);
  const stripe = g.createLinearGradient(0, 70, 0, 170);
  stripe.addColorStop(0, "#121014");
  stripe.addColorStop(1, "#2b2733");
  g.fillStyle = stripe;
  g.fillRect(44, 70, W - 88, 96);
  if (!data) return;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  /* 四类服务：两列两行 */
  const cells = [[90, 250], [820, 250], [90, 445], [820, 445]];
  data.services.slice(0, 4).forEach((service, index) => {
    const [x, y] = cells[index];
    g.fillStyle = CARD_INK.bright;
    embossed(g, () => fitText(g, service.title, x, y, 640, 50, 700));
    g.fillStyle = CARD_INK.soft;
    g.font = `500 28px ${SANS}`;
    wrapLines(g, service.text, 640, 4).forEach((line, row) => g.fillText(line, x + 2, y + 44 + row * 34));
  });
  g.fillStyle = "rgba(217,197,143,0.5)";
  g.fillRect(780, 205, 2, 380);
  g.fillRect(90, 405, W - 180, 2);
  g.fillRect(90, 612, W - 180, 3);
  /* 联系方式 */
  data.contacts.slice(0, 3).forEach((contact, index) => {
    const y = 690 + index * 64;
    g.fillStyle = CARD_INK.silver;
    g.font = `500 38px ${SANS}`;
    g.fillText(contact.label, 92, y);
    const labelWidth = Math.max(110, g.measureText(contact.label).width + 26);
    g.fillStyle = "#ecd9a6";
    fitText(g, contact.value, 92 + labelWidth, y, 520, 42, 600, `"Fira Code", ${SANS}`);
  });
  g.fillStyle = CARD_INK.dim;
  data.notes.slice(0, 2).forEach((note, index) => fitText(g, note, 92, 878 + index * 36, 640, 28, 500));
  /* 三个二维码 */
  data.qrs.slice(0, 3).forEach((qr, index) => {
    const size = 180;
    const x = 810 + index * 228;
    const y = 650;
    g.fillStyle = "#cdb98d";
    roundedRectPath(g, x - 8, y - 8, size + 16, size + 16, 16);
    g.fill();
    g.fillStyle = "#ffffff";
    roundedRectPath(g, x - 2, y - 2, size + 4, size + 4, 12);
    g.fill();
    const image = images[index];
    if (image?.complete && image.naturalWidth) g.drawImage(image, x + 6, y + 6, size - 12, size - 12);
    g.textAlign = "center";
    g.fillStyle = CARD_INK.bright;
    fitText(g, qr.label, x + size / 2, y + size + 44, 220, 30, 700);
    g.fillStyle = CARD_INK.silver;
    fitText(g, qr.caption, x + size / 2, y + size + 76, 220, 24, 500);
    g.textAlign = "left";
  });
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

  /* ---- 两张桌子：窗下的主书桌（电视、台灯、记事本、计算器、电话），左边单独一张 90 年代电脑桌。 */
  const deskWood = std(0xffffff, 0.5, 0, { map: woodTexture("#7a5236", "#3d2616", "#a87a52", 11) });
  deskWood.map.anisotropy = anisotropy;
  const deskDark = std(0x3a2618, 0.6);
  const desk = new THREE.Group();
  desk.add(slab(-0.48, 1.1, DESK_TOP - 0.04, DESK_TOP, -1.585, -0.76, deskWood));
  for (const [x, z] of [[-0.44, -1.55], [1.06, -1.55], [-0.44, -0.8], [1.06, -0.8]]) {
    desk.add(slab(x - 0.025, x + 0.025, 0, DESK_TOP - 0.04, z - 0.025, z + 0.025, deskDark));
  }
  desk.add(slab(-0.42, 1.04, DESK_TOP - 0.12, DESK_TOP - 0.04, -0.81, -0.785, deskDark));
  scene.add(desk);

  /* 电脑桌：浅灰台面 + 黑色钢架，桌面下有一层放主机线和软盘盒的搁板。 */
  const pcDeskTop = std(0xd8d4ca, 0.55);
  const steel = std(0x232428, 0.45, 0.6);
  const pcDesk = new THREE.Group();
  pcDesk.add(slab(-1.32, -0.52, DESK_TOP - 0.035, DESK_TOP, -1.585, -0.84, pcDeskTop));
  pcDesk.add(slab(-1.32, -0.52, DESK_TOP - 0.04, DESK_TOP - 0.035, -1.585, -0.84, std(0x9a958a, 0.6)));
  for (const x of [-1.29, -0.55]) {
    pcDesk.add(slab(x - 0.018, x + 0.018, 0, DESK_TOP - 0.04, -1.56, -1.52, steel));
    pcDesk.add(slab(x - 0.018, x + 0.018, 0, DESK_TOP - 0.04, -0.9, -0.86, steel));
    pcDesk.add(slab(x - 0.018, x + 0.018, 0.02, 0.05, -1.56, -0.86, steel));
  }
  pcDesk.add(slab(-1.3, -0.54, 0.3, 0.32, -1.56, -1.1, pcDeskTop));
  scene.add(pcDesk);

  /* ---- 书架（左墙角）：五层。第二层左边是“作品书”——启动器从首页 Work 区的 Projects 读出来，
     以后首页多一个作品，书架上就多一本；其余是普通的书、录像带盒，加上风水摆件、图腾和符箓。 */
  const shelfWood = std(0xffffff, 0.6, 0, { map: woodTexture("#5d3b24", "#2c1a0e", "#7f5634", 29) });
  shelfWood.map.anisotropy = anisotropy;
  const SHELF = { x0: -1.93, x1: -1.37, z0: BACK + 0.005, z1: BACK + 0.31, top: 1.86 };
  const SHELF_LEVELS = [0.06, 0.42, 0.78, 1.14, 1.5];
  const bookshelf = new THREE.Group();
  bookshelf.add(slab(SHELF.x0, SHELF.x0 + 0.022, 0, SHELF.top, SHELF.z0, SHELF.z1, shelfWood));
  bookshelf.add(slab(SHELF.x1 - 0.022, SHELF.x1, 0, SHELF.top, SHELF.z0, SHELF.z1, shelfWood));
  bookshelf.add(slab(SHELF.x0, SHELF.x1, SHELF.top - 0.025, SHELF.top, SHELF.z0, SHELF.z1 + 0.01, shelfWood));
  bookshelf.add(slab(SHELF.x0 + 0.02, SHELF.x1 - 0.02, 0, SHELF.top, SHELF.z0, SHELF.z0 + 0.008, std(0x3a2616, 0.8)));
  for (const y of SHELF_LEVELS) bookshelf.add(slab(SHELF.x0 + 0.02, SHELF.x1 - 0.02, y - 0.022, y, SHELF.z0, SHELF.z1, shelfWood));
  bookshelf.add(slab(SHELF.x0, SHELF.x1, 0, 0.04, SHELF.z1 - 0.02, SHELF.z1, shelfWood));
  scene.add(bookshelf);

  /* 普通的书：按层随机排，颜色偏旧。 */
  const BOOK_COLORS = [0x6b2b2b, 0x24395c, 0x3f5b3a, 0xb58a3a, 0xe6dcc4, 0x2f5f63, 0x5a3d61, 0x8c4a2f, 0x1f2328, 0xc9b98f];
  const books = new THREE.Group();
  const bookGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bookMaterial = std(0xffffff, 0.75);
  const bookRng = makeRng(61);
  const bookSlots = [];
  /* 每层可以放书的区间：[层号, 起点, 终点]（相对书架内侧左边）。中间留出摆件的位置。 */
  const ranges = [[0, 0, 0.3], [1, 0.24, 0.52], [2, 0, 0.14], [3, 0.3, 0.52], [4, 0, 0.36]];
  for (const [level, from, to] of ranges) {
    let x = SHELF.x0 + 0.024 + from;
    while (x < SHELF.x0 + 0.024 + to) {
      const w = 0.018 + bookRng() * 0.026;
      const h = 0.19 + bookRng() * 0.11 - (level === 0 ? 0 : 0.02);
      const d = 0.15 + bookRng() * 0.07;
      const lean = bookRng() < 0.08 ? 0.12 : 0;
      bookSlots.push({ x: x + w / 2, y: SHELF_LEVELS[level], w, h, d, lean, color: BOOK_COLORS[Math.floor(bookRng() * BOOK_COLORS.length)] });
      x += w + 0.002;
    }
  }
  const plainBooks = new THREE.InstancedMesh(bookGeometry, bookMaterial, bookSlots.length);
  const bookMatrix = new THREE.Matrix4();
  const bookQuat = new THREE.Quaternion();
  const bookColor = new THREE.Color();
  bookSlots.forEach((slot, index) => {
    bookQuat.setFromEuler(new THREE.Euler(0, 0, slot.lean));
    bookMatrix.compose(new THREE.Vector3(slot.x, slot.y + slot.h / 2, SHELF.z0 + 0.02 + slot.d / 2), bookQuat, new THREE.Vector3(slot.w, slot.h, slot.d));
    plainBooks.setMatrixAt(index, bookMatrix);
    plainBooks.setColorAt(index, bookColor.set(slot.color));
  });
  plainBooks.instanceMatrix.needsUpdate = true;
  plainBooks.instanceColor.needsUpdate = true;
  plainBooks.castShadow = true;
  books.add(plainBooks);
  scene.add(books);
  tag("posts", books);

  /* 作品书：第二层左边，从左往右排；书脊上竖排作品名。 */
  const workBooks = new THREE.Group();
  workBooks.userData.action = "book";
  scene.add(workBooks);
  const WORK_COLORS = ["#7d2a22", "#1d3a5f", "#2f5634", "#8a6420", "#43305a", "#1f5560", "#5c2a3e", "#3b3b3b"];
  const setBooks = (list) => {
    for (const child of [...workBooks.children]) {
      workBooks.remove(child);
      child.traverse((node) => {
        node.geometry?.dispose?.();
        if (node.material?.map) node.material.map.dispose();
      });
    }
    let x = SHELF.x0 + 0.03;
    list.slice(0, 7).forEach((item, index) => {
      const w = 0.032;
      const h = 0.25 - (index % 3) * 0.012;
      const color = WORK_COLORS[index % WORK_COLORS.length];
      const spine = new THREE.MeshStandardMaterial({ map: spineTexture(item.title, color), roughness: 0.7 });
      const cover = std(new THREE.Color(color).getHex(), 0.7);
      const book = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), [cover, cover, cover, cover, spine, cover]);
      book.position.set(x + w / 2, SHELF_LEVELS[1] + h / 2, SHELF.z0 + 0.12);
      book.castShadow = true;
      book.userData.action = "book";
      book.userData.value = index;
      workBooks.add(book);
      x += w + 0.003;
    });
  };

  /* 风水摆件（第三层）：八卦镜、水晶球、金蟾；第四层：葫芦、图腾柱；顶上：香炉。 */
  const gold = std(0xd2a03c, 0.28, 0.9);
  const brass = std(0xb7893a, 0.32, 0.85);
  const redWood = std(0x7a2318, 0.55);
  const ornaments = new THREE.Group();
  const shelfX = (offset) => SHELF.x0 + 0.024 + offset;
  /* 八卦镜：红木八角框 + 八卦图 + 中间的小圆镜，靠在小支架上 */
  const bagua = new THREE.Group();
  bagua.position.set(shelfX(0.22), SHELF_LEVELS[2] + 0.075, SHELF.z0 + 0.1);
  bagua.rotation.x = -0.18;
  const baguaFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.012, 8), redWood);
  baguaFrame.rotation.x = Math.PI / 2;
  baguaFrame.rotation.y = Math.PI / 8;
  bagua.add(baguaFrame);
  const baguaFace = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), new THREE.MeshStandardMaterial({ map: baguaTexture(), roughness: 0.5 }));
  baguaFace.rotation.z = Math.PI / 8;
  baguaFace.position.z = 0.0065;
  bagua.add(baguaFace);
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.019, 28), std(0xe8eef5, 0.05, 1));
  mirror.position.z = 0.0072;
  bagua.add(mirror);
  bagua.add(box(0.012, 0.07, 0.012, redWood, 0, -0.04, -0.03));
  ornaments.add(bagua);
  /* 水晶球：木座上一颗通透的球 */
  const crystal = new THREE.Group();
  crystal.position.set(shelfX(0.37), SHELF_LEVELS[2], SHELF.z0 + 0.15);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.022, 20), redWood);
  stand.position.y = 0.011;
  crystal.add(stand);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.036, 28, 20), new THREE.MeshStandardMaterial({
    color: 0xd9ecff, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55, emissive: 0x24384f, emissiveIntensity: 0.4,
  }));
  ball.position.y = 0.056;
  crystal.add(ball);
  ornaments.add(crystal);
  /* 三脚金蟾：趴在一叠铜钱上，嘴里衔着一枚 */
  const toad = new THREE.Group();
  toad.position.set(shelfX(0.47), SHELF_LEVELS[2], SHELF.z0 + 0.14);
  toad.rotation.y = -0.5;
  const coinsPile = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.012, 24), gold);
  coinsPile.position.y = 0.006;
  toad.add(coinsPile);
  const toadBody = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), gold);
  toadBody.scale.set(1.15, 0.7, 1);
  toadBody.position.set(0, 0.03, 0);
  toad.add(toadBody);
  const toadHead = new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), gold);
  toadHead.scale.set(1.2, 0.8, 1);
  toadHead.position.set(0, 0.043, 0.022);
  toad.add(toadHead);
  for (const x of [-0.01, 0.01]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), std(0x7a1b12, 0.3, 0.2));
    eye.position.set(x, 0.056, 0.026);
    toad.add(eye);
  }
  const mouthCoin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.002, 18), brass);
  mouthCoin.rotation.x = Math.PI / 2;
  mouthCoin.position.set(0, 0.036, 0.042);
  toad.add(mouthCoin);
  ornaments.add(toad);
  /* 铜葫芦，系红穗子 */
  const gourd = new THREE.Group();
  gourd.position.set(shelfX(0.05), SHELF_LEVELS[3], SHELF.z0 + 0.14);
  const gourdLow = new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 14), brass);
  gourdLow.position.y = 0.035;
  gourd.add(gourdLow);
  const gourdHigh = new THREE.Mesh(new THREE.SphereGeometry(0.024, 18, 12), brass);
  gourdHigh.position.y = 0.084;
  gourd.add(gourdHigh);
  const gourdNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.024, 10), brass);
  gourdNeck.position.y = 0.114;
  gourd.add(gourdNeck);
  gourd.add(rod(new THREE.Vector3(0.006, 0.062, 0.02), new THREE.Vector3(0.012, 0.0, 0.03), 0.004, std(0xb3261d, 0.7)));
  ornaments.add(gourd);
  /* 图腾柱：三节木雕，上面一对展开的翅膀 */
  const totem = new THREE.Group();
  totem.position.set(shelfX(0.17), SHELF_LEVELS[3], SHELF.z0 + 0.15);
  const totemFaces = totemTexture();
  [[0.05, 0.075, 0], [0.046, 0.07, 1], [0.042, 0.065, 2]].forEach(([w, h, index], level) => {
    const material = new THREE.MeshStandardMaterial({ map: totemFaces[index], roughness: 0.8 });
    const segment = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.9), [std(0x6b4423, 0.85), std(0x6b4423, 0.85), std(0x6b4423, 0.85), std(0x6b4423, 0.85), material, std(0x6b4423, 0.85)]);
    segment.position.y = [0.0375, 0.11, 0.1775][level];
    totem.add(segment);
  });
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.016, 0.008), std(0x8f2f1c, 0.7));
    wing.position.set(side * 0.042, 0.2, 0);
    wing.rotation.z = side * 0.35;
    totem.add(wing);
  }
  ornaments.add(totem);
  /* 一串铜钱挂在第四层边上 */
  for (let i = 0; i < 3; i += 1) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.002, 18), brass);
    coin.rotation.x = Math.PI / 2;
    coin.position.set(shelfX(0.27), SHELF_LEVELS[3] - 0.035 - i * 0.028, SHELF.z1 + 0.003);
    ornaments.add(coin);
  }
  ornaments.add(rod(new THREE.Vector3(shelfX(0.27), SHELF_LEVELS[3] - 0.005, SHELF.z1 + 0.002), new THREE.Vector3(shelfX(0.27), SHELF_LEVELS[3] - 0.11, SHELF.z1 + 0.002), 0.0012, std(0xb3261d, 0.7)));
  /* 顶上：三足香炉，插三炷香 */
  const burner = new THREE.Group();
  burner.position.set(shelfX(0.38), SHELF.top, SHELF.z0 + 0.16);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.04, 24), std(0x6d5b3a, 0.4, 0.8));
  bowl.position.y = 0.036;
  burner.add(bowl);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * TAU;
    burner.add(rod(new THREE.Vector3(Math.cos(angle) * 0.03, 0.02, Math.sin(angle) * 0.03), new THREE.Vector3(Math.cos(angle) * 0.036, 0, Math.sin(angle) * 0.036), 0.004, std(0x6d5b3a, 0.4, 0.8)));
    const stick = rod(new THREE.Vector3((i - 1) * 0.012, 0.05, 0), new THREE.Vector3((i - 1) * 0.022, 0.17, 0.004), 0.0016, std(0x9b3a22, 0.8));
    burner.add(stick);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a3a }));
    ember.position.set((i - 1) * 0.022, 0.171, 0.004);
    burner.add(ember);
  }
  ornaments.add(burner);
  /* 符箓：三张黄纸朱砂符，贴在书架朝外的那块侧板上 */
  [["敕令", "镇宅平安"], ["敕令", "招财进宝"], ["敕令", "文昌开智"]].forEach(([top, bottom], index) => {
    const charm = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.19), new THREE.MeshStandardMaterial({ map: talismanTexture(top, bottom, index), roughness: 0.9, side: THREE.DoubleSide }));
    charm.position.set(SHELF.x1 + 0.0015, 1.45 - index * 0.012, SHELF.z0 + 0.08 + index * 0.075);
    charm.rotation.y = Math.PI / 2;
    charm.rotation.x = (index - 1) * 0.04;
    ornaments.add(charm);
  });
  ornaments.traverse((node) => {
    if (node.isMesh) node.castShadow = true;
  });
  scene.add(ornaments);
  /* 书架上方一盏暖色小射灯，照亮书和摆件。 */
  const shelfLight = new THREE.PointLight(0xffc68a, 0.9, 2.4, 2);
  shelfLight.position.set(-1.5, 2.05, -0.95);
  scene.add(shelfLight);

  /* ---- 椅子（左前景） */
  const chairMat = std(0xd8cfbd, 0.7);
  const chair = new THREE.Group();
  chair.position.set(-0.86, 0, -0.6);
  chair.rotation.y = 0.12;
  chair.add(box(0.44, 0.035, 0.42, chairMat, 0, 0.46, 0));
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) chair.add(box(0.03, 0.46, 0.03, chairMat, x, 0.23, z));
  chair.add(box(0.03, 0.5, 0.03, chairMat, -0.19, 0.73, 0.19));
  chair.add(box(0.03, 0.5, 0.03, chairMat, 0.19, 0.73, 0.19));
  chair.add(box(0.41, 0.07, 0.025, chairMat, 0, 0.94, 0.19));
  for (let i = 0; i < 4; i += 1) chair.add(box(0.018, 0.4, 0.018, chairMat, -0.12 + i * 0.08, 0.7, 0.19));
  scene.add(chair);

  /* ================================================================ 90 年代的房间
     左墙角：书架（作品书、风水摆件、图腾、符箓）；左：电脑桌（铂金色电脑、键盘、鼠标、软盘）；
     中：主书桌，大彩电放在录像机上，前面是遥控器；右：录像带、记事本、计算器、电话叠在调制解调器上；
     窗台上：手提录音机和一摞磁带。 */

  const beigeShell = std(0xd2c8ae, 0.62);
  const beigeDark = std(0xb3a98f, 0.7);
  const slotDark = std(0x111216, 0.6);
  const silver = std(0xc9c9c4, 0.35, 0.7);

  /* ---- 能按、能拧、能扳的开关。
     button：按下去再弹回；latch：一组里选中的那个保持按下（电视预选台）；toggle：按一下锁住、再按弹起（电源键）；
     knob：旋钮转一格（有白色刻线，看得出转了）。axis / sign 决定往哪个方向按（顶上的琴键是往下按）。 */
  const controls = [];
  const control = (mesh, action, { kind = "button", value = null, travel = 0.003, step = Math.PI / 4, hit = null, group = null, axis = "z", sign = -1 } = {}) => {
    if (action) mesh.userData.action = action;
    if (value !== null) mesh.userData.value = value;
    if (hit) mesh.add(hitBox(...hit));
    const entry = { mesh, kind, travel, step, group, axis, sign, rest: mesh.position[axis], t: 1, turn: 0, turnGoal: 0, on: false, depth: 0, latched: false };
    mesh.userData.control = entry;
    controls.push(entry);
    return mesh;
  };
  const actuate = (mesh) => {
    const entry = mesh?.userData.control;
    if (!entry) return;
    if (entry.kind === "button") entry.t = 0;
    else if (entry.kind === "knob") entry.turnGoal -= entry.step;
    else if (entry.kind === "toggle") entry.on = !entry.on;
  };
  const latch = (group, value) => {
    for (const entry of controls) if (entry.group === group) entry.latched = entry.mesh.userData.value === value;
  };
  tickers.push((time, dt, realDt = dt) => {
    const step = Math.min(realDt, 0.1);
    for (const entry of controls) {
      const { mesh } = entry;
      if (entry.kind === "button") {
        if (entry.t >= 1) continue;
        entry.t = Math.min(1, entry.t + step / 0.24);
        mesh.position[entry.axis] = entry.rest + entry.sign * entry.travel * Math.sin(Math.PI * entry.t);
      } else if (entry.kind === "latch" || entry.kind === "toggle") {
        const goal = (entry.kind === "latch" ? entry.latched : entry.on) ? entry.travel : 0;
        if (Math.abs(entry.depth - goal) < 1e-5) continue;
        entry.depth = lerp(entry.depth, goal, 1 - Math.exp(-step * 22));
        mesh.position[entry.axis] = entry.rest + entry.sign * entry.depth;
      } else if (entry.kind === "knob") {
        if (Math.abs(entry.turnGoal - entry.turn) < 1e-4) continue;
        entry.turn = lerp(entry.turn, entry.turnGoal, 1 - Math.exp(-step * 14));
        mesh.rotation.y = entry.turn;
      }
    }
  });

  /* 旋钮：圆柱轴线朝前，正面有一道白色刻线。 */
  const knobMesh = (radius, depth, material) => {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, depth, 28), material);
    knob.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, 0.0012, 24), std(0x2a2a2e, 0.35, 0.5));
    cap.position.y = depth / 2;
    knob.add(cap);
    const tick = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.16, 0.0016, radius * 0.62), new THREE.MeshBasicMaterial({ color: 0xf2efe6 }));
    tick.position.set(0, depth / 2 + 0.0004, -radius * 0.42);
    knob.add(tick);
    return knob;
  };
  /* 圆形按钮：圆柱轴线朝前。 */
  const roundButton = (radius, depth, material) => {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 24), material);
    button.rotation.x = Math.PI / 2;
    return button;
  };
  const led = (w, h, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.003), new THREE.MeshBasicMaterial({ color }));

  /* 显像管玻璃上的斜向高光，让屏幕看起来是凸出来的玻璃。 */
  const sheenMaterial = new THREE.MeshBasicMaterial({
    map: sheenTexture(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
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
  const sheenFor = (screen, w, h) => {
    const sheen = noPick(new THREE.Mesh(curved(w, h, 0.004), sheenMaterial));
    sheen.position.copy(screen.position);
    sheen.position.z += 0.0014;
    sheen.renderOrder = 2;
    return sheen;
  };
  const badge = (text, w, h, options, x, y, z) => {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: labelTexture(text, options), transparent: !options.bg }));
    plate.position.set(x, y, z);
    return plate;
  };

  /* ---- 90 年代的个人电脑（ABOUT / ONLINE）：铂金色卧式主机 + 15 英寸彩显，显示器坐在可转的底座上。
     主机正面：方形电源键（按下锁住）、复位键、电源 / 硬盘 / TURBO 指示灯、光驱、3.5 英寸软驱。
     显示器下沿：圆形电源键、两个亮度旋钮。整台点下去打开 ABOUT。 */
  const platinum = std(0xe8e0cb, 0.55);
  const platinumDark = std(0xcbc5b4, 0.6);
  const computer = new THREE.Group();
  computer.position.set(-0.78, DESK_TOP, -1.28);
  computer.rotation.y = 0.12;
  computer.add(roundedBox(0.46, 0.13, 0.42, 0.01, platinum, 0, 0.065, 0));
  computer.add(box(0.452, 0.122, 0.004, platinumDark, 0, 0.065, 0.2105));
  computer.add(box(0.44, 0.112, 0.003, platinum, 0, 0.065, 0.213));
  computer.add(badge("HPY  486DX2", 0.09, 0.016, { width: 512, height: 92, color: "#3e3b34", bg: "#e3ded0", font: `700 54px ${SANS}`, spacing: 6 }, -0.15, 0.1, 0.2148));
  const pcLeds = [];
  [[0x37d65a, "POWER"], [0xffa53a, "HDD"], [0xffd23a, "TURBO"]].forEach(([color], index) => {
    const light = led(0.007, 0.004, 0x1d1d1d);
    light.position.set(-0.19 + index * 0.022, 0.078, 0.2152);
    light.userData.on = color;
    computer.add(light);
    pcLeds.push(light);
  });
  computer.add(box(0.04, 0.04, 0.003, platinumDark, -0.175, 0.037, 0.2147));
  const pcPowerButton = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.012), std(0xd8d2c2, 0.5));
  pcPowerButton.position.set(-0.175, 0.037, 0.219);
  control(pcPowerButton, "pcPower", { kind: "toggle", travel: 0.0045, hit: [0.042, 0.042, 0.03, 0, 0, 0] });
  computer.add(pcPowerButton);
  const resetButton = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.008), platinumDark);
  resetButton.position.set(-0.13, 0.03, 0.217);
  computer.add(resetButton);
  /* 光驱 */
  computer.add(box(0.21, 0.044, 0.004, platinumDark, 0.1, 0.087, 0.2152));
  computer.add(box(0.18, 0.004, 0.003, slotDark, 0.09, 0.089, 0.2172));
  computer.add(box(0.016, 0.006, 0.006, platinum, 0.185, 0.074, 0.2172));
  const cdLed = led(0.006, 0.003, 0x3a1f08);
  cdLed.position.set(0.16, 0.074, 0.2172);
  computer.add(cdLed);
  computer.add(badge("COMPACT DISC", 0.04, 0.006, { width: 256, height: 40, color: "#5c574b", bg: "#cbc5b4", font: `600 26px ${SANS}`, spacing: 2 }, 0.03, 0.074, 0.2173));
  /* 3.5 英寸软驱 */
  computer.add(box(0.14, 0.03, 0.004, platinumDark, 0.135, 0.034, 0.2152));
  computer.add(box(0.095, 0.004, 0.003, slotDark, 0.125, 0.038, 0.2172));
  computer.add(box(0.012, 0.006, 0.006, platinum, 0.19, 0.027, 0.2172));
  const fddLed = led(0.006, 0.003, 0x0f2a12);
  fddLed.position.set(0.08, 0.027, 0.2172);
  computer.add(fddLed);
  for (let i = 0; i < 6; i += 1) computer.add(box(0.003, 0.05, 0.003, slotDark, -0.07 + i * 0.008, 0.06, 0.2152));

  /* 显示器底座（能转的圆盘）+ 显示器 */
  const swivel = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.018, 36), platinum);
  swivel.position.set(0, 0.139, 0.0);
  computer.add(shadowed(swivel));
  const monitorBody = new THREE.Group();
  monitorBody.position.set(0, 0.148, -0.02);
  monitorBody.add(roundedBox(0.44, 0.38, 0.07, 0.03, platinum, 0, 0.19, 0.165));
  monitorBody.add(roundedBox(0.4, 0.34, 0.2, 0.05, platinum, 0, 0.19, 0.04));
  monitorBody.add(roundedBox(0.28, 0.24, 0.14, 0.05, platinumDark, 0, 0.185, -0.11));
  monitorBody.add(roundedBox(0.375, 0.29, 0.01, 0.014, std(0x121316, 0.5), 0, 0.212, 0.198));
  for (const [w, h, x, y] of [[0.395, 0.01, 0, 0.362], [0.395, 0.012, 0, 0.061], [0.01, 0.31, -0.192, 0.212], [0.01, 0.31, 0.192, 0.212]]) {
    monitorBody.add(box(w, h, 0.004, platinumDark, x, y, 0.2015));
  }
  for (let i = 0; i < 10; i += 1) monitorBody.add(box(0.24, 0.0015, 0.008, slotDark, 0, 0.3605, -0.07 + i * 0.016));
  const computerCanvas = document.createElement("canvas");
  computerCanvas.width = 1024;
  computerCanvas.height = 768;
  const computerContext = computerCanvas.getContext("2d");
  const computerTexture = new THREE.CanvasTexture(computerCanvas);
  computerTexture.colorSpace = THREE.SRGBColorSpace;
  computerTexture.anisotropy = anisotropy;
  /* 屏幕是外凸的玻璃：四角最低处（中心减两倍凸度）也必须在黑色凹框前表面（z≈0.203）前面，否则只露出中间一个椭圆。 */
  const computerScreen = new THREE.Mesh(curved(0.35, 0.2625, 0.004), new THREE.MeshBasicMaterial({ map: computerTexture, toneMapped: false }));
  computerScreen.position.set(0, 0.212, 0.2125);
  computerScreen.userData.size = [0.35, 0.2625];
  monitorBody.add(computerScreen);
  monitorBody.add(sheenFor(computerScreen, 0.35, 0.2625));
  monitorBody.add(badge("HPY  SVGA 1024", 0.08, 0.011, { width: 512, height: 70, color: "#57524a", bg: "#e3ded0", font: `700 44px ${SANS}`, spacing: 6 }, -0.13, 0.03, 0.2005));
  const monitorPower = roundButton(0.0085, 0.008, std(0xd8d2c2, 0.5));
  monitorPower.position.set(0.175, 0.03, 0.203);
  control(monitorPower, "pcPower", { kind: "toggle", travel: 0.003, hit: [0.026, 0.02, 0.026, 0, 0, 0] });
  monitorBody.add(monitorPower);
  const monitorLed = led(0.006, 0.004, 0x37d65a);
  monitorLed.position.set(0.152, 0.03, 0.2005);
  monitorBody.add(monitorLed);
  for (const x of [0.085, 0.112]) {
    const knob = knobMesh(0.0075, 0.009, platinumDark);
    knob.position.set(x, 0.03, 0.203);
    control(knob, "pcBright", { kind: "knob", step: Math.PI / 3, hit: [0.024, 0.02, 0.024, 0, 0, 0] });
    monitorBody.add(knob);
  }
  computer.add(monitorBody);
  const computerGlow = new THREE.PointLight(0x6dff9a, 0.05, 1.2, 2);
  computerGlow.position.set(0, 0.36, 0.45);
  computer.add(computerGlow);
  moodLights.push(computerGlow);
  scene.add(computer);
  tag("about", computer);

  const computerState = { mode: "desk", hover: null, blink: true, clock: clockText(), power: true, powerAt: 0 };
  const redrawComputer = () => {
    drawComputer(computerContext, 1024, 768, computerState);
    computerTexture.needsUpdate = true;
  };

  /* 键盘与鼠标 */
  const keyboard = new THREE.Group();
  keyboard.position.set(-0.74, DESK_TOP, -0.9);
  keyboard.rotation.y = 0.1;
  keyboard.scale.setScalar(1.1);
  const board = roundedBox(0.44, 0.024, 0.17, 0.008, platinum, 0, 0.012, 0);
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
      keyColor.set(col > 12 || row === 0 ? 0xbdb6a3 : 0xece7da);
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
  const mouse = new THREE.Group();
  mouse.position.set(-0.43, DESK_TOP, -0.86);
  mouse.rotation.y = 0.2;
  mouse.add(box(0.13, 0.002, 0.11, std(0x2b3346, 0.9), 0, 0.001, 0));
  const mouseBody = roundedBox(0.058, 0.028, 0.095, 0.02, platinum, 0, 0.016, 0);
  mouse.add(mouseBody);
  mouse.add(box(0.001, 0.003, 0.035, slotDark, 0, 0.0305, -0.025));
  mouse.add(rod(new THREE.Vector3(0, 0.012, -0.048), new THREE.Vector3(-0.05, 0.003, -0.2), 0.0018, platinumDark));
  scene.add(mouse);
  tag("about", mouse);

  /* 软盘（标签空白：不在场景里写任何未确认的内容） */
  [[0x2b4d8a, 0.0, 0.3], [0x1f1f24, 0.004, -0.25]].forEach(([color, lift, turn], index) => {
    const disk = new THREE.Group();
    disk.position.set(-1.0 + index * 0.02, DESK_TOP + 0.0017 + lift, -0.98 + index * 0.03);
    disk.rotation.y = turn;
    disk.add(box(0.09, 0.0034, 0.094, std(color, 0.5)));
    disk.add(box(0.05, 0.0036, 0.03, silver, 0.008, 0.0002, -0.032));
    disk.add(box(0.068, 0.0036, 0.046, std(0xf1ece0, 0.8), 0, 0.0002, 0.022));
    scene.add(disk);
  });

  /* ---- 90 年代的银色录像机 + 黑色大彩电（FILM / POSTS）。
     电视下沿：左边一条扬声器网罩，右边 1–6 预选台（选中的保持按下）、CH ▲、VOL +、圆形电源键和电源灯。 */
  const AV_X = 0.12;
  const vcr = new THREE.Group();
  vcr.position.set(AV_X, DESK_TOP, -1.3);
  vcr.rotation.y = -0.03;
  vcr.add(roundedBox(0.46, 0.09, 0.32, 0.008, std(0xa8abb2, 0.4, 0.55), 0, 0.045, 0));
  vcr.add(box(0.44, 0.07, 0.004, std(0x16161a, 0.3, 0.3), 0, 0.045, 0.1605));
  vcr.add(box(0.2, 0.03, 0.004, std(0x26262c, 0.4, 0.3), -0.09, 0.056, 0.1625));
  vcr.add(box(0.2, 0.002, 0.004, std(0x55555c, 0.4, 0.5), -0.09, 0.0425, 0.1635));
  vcr.add(badge("HPY VIDEO · HQ · 4 HEAD", 0.12, 0.009, { width: 768, height: 58, color: "#c9cbd1", bg: "#16161a", font: `600 36px ${SANS}`, spacing: 4 }, 0.11, 0.074, 0.1632));
  const vfdCanvas = document.createElement("canvas");
  vfdCanvas.width = 256;
  vfdCanvas.height = 64;
  const vfdContext = vfdCanvas.getContext("2d");
  const vfdTexture = new THREE.CanvasTexture(vfdCanvas);
  vfdTexture.colorSpace = THREE.SRGBColorSpace;
  const vfd = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.0275), new THREE.MeshBasicMaterial({ map: vfdTexture, toneMapped: false }));
  vfd.position.set(0.115, 0.048, 0.1632);
  vcr.add(vfd);
  for (let i = 0; i < 5; i += 1) vcr.add(box(0.024, 0.008, 0.006, silver, -0.17 + i * 0.032, 0.02, 0.163));
  const vcrSlot = new THREE.Object3D();
  vcrSlot.position.set(-0.09, 0.056, 0.16);
  vcr.add(vcrSlot);
  scene.add(vcr);
  tag("film", vcr);

  const tv = new THREE.Group();
  tv.position.set(AV_X, DESK_TOP + 0.09, -1.3);
  tv.rotation.y = -0.03;
  const tvShell = std(0x1c1d21, 0.42, 0.18);
  tv.add(roundedBox(0.54, 0.42, 0.36, 0.05, tvShell, 0, 0.21, 0.01));
  tv.add(roundedBox(0.42, 0.32, 0.18, 0.06, tvShell, 0, 0.215, -0.24));
  tv.add(roundedBox(0.525, 0.405, 0.014, 0.045, std(0x232429, 0.35, 0.25), 0, 0.21, 0.186));
  tv.add(roundedBox(0.425, 0.322, 0.008, 0.018, std(0x0b0b0d, 0.5), 0, 0.236, 0.192));
  for (const [w, h, x, y] of [[0.44, 0.006, 0, 0.4], [0.44, 0.006, 0, 0.072], [0.006, 0.334, -0.219, 0.236], [0.006, 0.334, 0.219, 0.236]]) {
    tv.add(box(w, h, 0.003, std(0x2e2f35, 0.3, 0.45), x, y, 0.1935));
  }
  /* 两侧和背后的散热槽 */
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i += 1) tv.add(box(0.0015, 0.005, 0.18, slotDark, side * 0.2705, 0.33 - i * 0.016, 0.02));
  }
  const tvCanvas = document.createElement("canvas");
  tvCanvas.width = 768;
  tvCanvas.height = 576;
  const tvContext = tvCanvas.getContext("2d");
  const tvTexture = new THREE.CanvasTexture(tvCanvas);
  tvTexture.colorSpace = THREE.SRGBColorSpace;
  tvTexture.anisotropy = anisotropy;
  /* 同理：凹框前表面 z≈0.196，屏幕四角在 0.1985。 */
  const tvScreen = new THREE.Mesh(curved(0.4, 0.3, 0.004), new THREE.MeshBasicMaterial({ map: tvTexture, toneMapped: false }));
  tvScreen.position.set(0, 0.236, 0.2065);
  tvScreen.userData.size = [0.4, 0.3];
  tv.add(tvScreen);
  tv.add(sheenFor(tvScreen, 0.4, 0.3));
  tv.add(badge("HPY VISION", 0.08, 0.011, { width: 512, height: 70, color: "#d6d7dc", font: `italic 800 50px ${SANS}`, spacing: 8 }, 0, 0.392, 0.1932));
  /* 下沿：扬声器网罩 + 控制区 */
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.04), new THREE.MeshBasicMaterial({ map: perforatedTexture(), toneMapped: true }));
  grille.position.set(-0.1, 0.042, 0.1934);
  tv.add(grille);
  const panelLabels = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.008), new THREE.MeshBasicMaterial({ map: panelLabelTexture(), transparent: true }));
  panelLabels.position.set(0.13, 0.062, 0.1934);
  tv.add(panelLabels);
  const presets = [];
  for (let i = 0; i < 6; i += 1) {
    const preset = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.01, 0.007), std(0x3a3b41, 0.4, 0.4));
    preset.position.set(0.042 + i * 0.02, 0.048, 0.1965);
    control(preset, "tvPreset", { kind: "latch", value: i + 1, group: "tv", travel: 0.0028, hit: [0.02, 0.018, 0.02, 0, 0, 0] });
    tv.add(preset);
    presets.push(preset);
  }
  const channelButton = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.007), std(0x9a9ca3, 0.35, 0.6));
  channelButton.position.set(0.05, 0.028, 0.1965);
  control(channelButton, "tvChannel", { hit: [0.024, 0.016, 0.02, 0, 0, 0] });
  tv.add(channelButton);
  const volumeButton = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.007), std(0x9a9ca3, 0.35, 0.6));
  volumeButton.position.set(0.09, 0.028, 0.1965);
  control(volumeButton, "tvVolume", { hit: [0.024, 0.016, 0.02, 0, 0, 0] });
  tv.add(volumeButton);
  const tvPowerButton = roundButton(0.011, 0.01, std(0x9a9ca3, 0.35, 0.6));
  tvPowerButton.position.set(0.225, 0.042, 0.197);
  control(tvPowerButton, "tvPower", { kind: "toggle", travel: 0.003, hit: [0.03, 0.03, 0.026, 0, 0, 0] });
  tv.add(tvPowerButton);
  tvPowerButton.userData.control.on = true;
  const tvLedMaterial = new THREE.MeshBasicMaterial({ color: 0x3dff6a });
  const tvLed = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.003), tvLedMaterial);
  tvLed.position.set(0.2, 0.042, 0.1945);
  tv.add(tvLed);
  for (const x of [-0.2, 0.2]) tv.add(box(0.06, 0.008, 0.2, std(0x111114, 0.6), x, -0.004, 0.02));
  const antennaMat = std(0xd0d0cc, 0.3, 0.8);
  const tvGlow = new THREE.PointLight(0x9fc4ff, 0.2, 2, 2);
  tvGlow.position.set(0, 0.24, 0.5);
  tv.add(tvGlow);
  scene.add(tv);
  tag("film", tv);

  const tvState = {
    mode: "idle", element: null, osd: "", osdHold: true, blink: true, clock: clockText(true),
    power: true, powerAt: 0, channel: 1, volume: 6, panelOsd: "", panelOsdUntil: 0,
  };
  latch("tv", tvState.channel);
  const noiseCanvas = document.createElement("canvas");
  noiseCanvas.width = 192;
  noiseCanvas.height = 144;
  const noiseContext = noiseCanvas.getContext("2d");
  const noiseImage = noiseContext.createImageData(192, 144);
  const redrawTv = () => {
    if (tvShowsNoise(tvState)) {
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

  /* 开关的效果：电视和电脑的电源、换台、音量、亮度。 */
  const BRIGHTNESS = [1, 0.82, 0.64, 0.46];
  let brightness = 0;
  const showPanelOsd = (text) => {
    tvState.panelOsd = text;
    tvState.panelOsdUntil = performance.now() + 1800;
  };
  const setTvPower = (on) => {
    tvPowerButton.userData.control.on = on;
    if (tvState.power === on) return;
    tvState.power = on;
    tvState.powerAt = performance.now();
    tvLedMaterial.color.set(on ? 0x3dff6a : 0xff3b2e);
    redrawTv();
  };
  const setComputerPower = (on) => {
    pcPowerButton.userData.control.on = on;
    monitorPower.userData.control.on = on;
    if (computerState.power === on) return;
    computerState.power = on;
    computerState.powerAt = performance.now();
    pcLeds.forEach((light, index) => light.material.color.set(on && index !== 1 ? light.userData.on : 0x1d1d1d));
    monitorLed.material.color.set(on ? 0x37d65a : 0x2a1a08);
    redrawComputer();
  };
  pcPowerButton.userData.control.on = true;
  monitorPower.userData.control.on = true;
  pcLeds.forEach((light, index) => light.material.color.set(index !== 1 ? light.userData.on : 0x1d1d1d));
  /* 硬盘灯偶尔闪一下，像机器在干活。 */
  tickers.push((time) => {
    if (!computerState.power) return;
    const busy = Math.sin(time * 7.3) * Math.sin(time * 2.1) > 0.72;
    pcLeds[1].material.color.set(busy ? pcLeds[1].userData.on : 0x1d1d1d);
  });
  const operate = (action, value) => {
    if (action === "tvPower") {
      setTvPower(!tvState.power);
    } else if (action === "tvPreset" || action === "tvChannel") {
      if (action === "tvChannel") actuate(channelButton);
      if (!tvState.power) return;
      tvState.channel = action === "tvPreset" ? value : (tvState.channel % 6) + 1;
      latch("tv", tvState.channel);
      showPanelOsd(`CH ${String(tvState.channel).padStart(2, "0")}`);
      redrawTv();
    } else if (action === "tvVolume") {
      actuate(volumeButton);
      if (!tvState.power) return;
      tvState.volume = (tvState.volume + 1) % 11;
      showPanelOsd(`VOL ${"▮".repeat(tvState.volume)}${"▯".repeat(10 - tvState.volume)}`);
      redrawTv();
    } else if (action === "pcPower") {
      setComputerPower(!computerState.power);
    } else if (action === "pcBright") {
      for (const entry of controls) if (entry.mesh.userData.action === "pcBright") actuate(entry.mesh);
      brightness = (brightness + 1) % BRIGHTNESS.length;
      computerScreen.material.color.setScalar(BRIGHTNESS[brightness]);
    }
  };
  /* 进 POSTS / FILM / ABOUT / ONLINE 时，对应的屏幕必须是开着的。 */
  const powerFor = (view) => {
    if (view === "posts" || view === "film") setTvPower(true);
    if (view === "about" || view === "online") setComputerPower(true);
  };
  /* 正在开关机、显示面板屏显或雪花时，屏幕每一帧都要重画。 */
  const screensBusy = () => {
    const now = performance.now();
    return {
      tv: tvShowsNoise(tvState) || tvState.mode === "media" || now - tvState.powerAt < 900 || now < tvState.panelOsdUntil + 100,
      computer: now - computerState.powerAt < 900,
    };
  };

  /* ---- 录像带（FILM）：由启动器根据首页与公开影像动态生成 */
  const tapeStack = new THREE.Group();
  tapeStack.position.set(0.5, DESK_TOP, -1.36);
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

  /* ---- 计算器：点一下拿起来用（启动器里是一台真的能算的计算器），放下后液晶屏留着最后的结果 */
  const calculator = new THREE.Group();
  calculator.userData.action = "calc";
  const calcHome = new THREE.Vector3(0.52, DESK_TOP, -0.92);
  calculator.position.copy(calcHome);
  calculator.rotation.y = -0.28;
  calculator.add(roundedBox(0.085, 0.012, 0.14, 0.006, std(0x2b2b30, 0.5), 0, 0.006, 0));
  calculator.add(box(0.036, 0.0008, 0.008, std(0x3b2a20, 0.25, 0.5), -0.016, 0.0124, -0.062));
  const lcdMap = lcdTexture("0.");
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.02), new THREE.MeshBasicMaterial({ map: lcdMap, toneMapped: false }));
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
  calculator.add(hitBox(0.1, 0.03, 0.16, 0, 0.012, 0));
  scene.add(calculator);

  /* 拿起来：离开桌面、朝镜头翻过来，然后交给屏幕上的计算器；放下时反过来。 */
  let calcLift = 0;
  let calcGoal = 0;
  const placeCalculator = () => {
    const k = easeInOut(calcLift);
    calculator.position.set(calcHome.x - 0.06 * k, calcHome.y + 0.24 * k, calcHome.z + 0.34 * k);
    calculator.rotation.x = 1.05 * k;
    calculator.visible = calcLift < 0.97;
  };
  tickers.push((time, dt, realDt = dt) => {
    if (calcLift === calcGoal) return;
    const step = Math.min(realDt, 0.1) / 0.5;
    calcLift = calcGoal > calcLift ? Math.min(calcGoal, calcLift + step) : Math.max(calcGoal, calcLift - step);
    placeCalculator();
  });
  const liftCalculator = (up, instant = false) => {
    calcGoal = up ? 1 : 0;
    if (instant) {
      calcLift = calcGoal;
      placeCalculator();
    }
  };
  const setCalcDisplay = (text) => {
    drawLcd(lcdMap.image.getContext("2d"), lcdMap.image.width, lcdMap.image.height, text);
    lcdMap.needsUpdate = true;
  };

  /* ---- 名片盒（主书桌右前方）：金属卡座里斜靠着一摞名片，最外面那张能拿起来看正反面。
     名片上的字由启动器从首页 #card 读出来交给 setCard，场景里不写任何事实。 */
  const CARD_SIZE = [0.0856, 0.054];
  const cardHolder = new THREE.Group();
  cardHolder.userData.action = "card";
  cardHolder.position.set(0.77, DESK_TOP, -0.93);
  cardHolder.rotation.y = -0.4;
  const holderMetal = std(0x2b2a31, 0.32, 0.8);
  cardHolder.add(roundedBox(0.104, 0.008, 0.06, 0.003, holderMetal, 0, 0.004, 0));
  const holderBack = roundedBox(0.1, 0.06, 0.004, 0.002, holderMetal, 0, 0.034, -0.021);
  holderBack.rotation.x = -0.3;
  cardHolder.add(holderBack);
  cardHolder.add(box(0.1, 0.014, 0.004, holderMetal, 0, 0.012, 0.026));
  const cardTilt = new THREE.Group();
  cardTilt.position.set(0, 0.009, 0.004);
  cardTilt.rotation.x = -0.3;
  cardHolder.add(cardTilt);
  const cardBody = std(0x2c2156, 0.45, 0.35);
  const cardRimMaterial = std(0xd2bb85, 0.28, 0.9);
  for (let i = 0; i < 6; i += 1) {
    const spare = box(CARD_SIZE[0], CARD_SIZE[1], 0.0007, cardBody, 0, CARD_SIZE[1] / 2, -0.016 + i * 0.0011);
    cardTilt.add(spare);
  }
  cardHolder.add(hitBox(0.12, 0.08, 0.08, 0, 0.035, 0));
  scene.add(cardHolder);

  /* 能拿起来的那张：正反两面各一张 canvas 贴图，边是一圈香槟金。 */
  const cardCanvases = [0, 1].map(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_PX.w;
    canvas.height = CARD_PX.h;
    return canvas;
  });
  const cardTextures = cardCanvases.map((canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  });
  const cardShape = new THREE.Shape();
  {
    const [w, h] = CARD_SIZE;
    const r = 0.0032;
    cardShape.moveTo(-w / 2 + r, -h / 2);
    cardShape.lineTo(w / 2 - r, -h / 2);
    cardShape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    cardShape.lineTo(w / 2, h / 2 - r);
    cardShape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    cardShape.lineTo(-w / 2 + r, h / 2);
    cardShape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    cardShape.lineTo(-w / 2, -h / 2 + r);
    cardShape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  }
  const cardFaceGeometry = () => {
    const geometry = new THREE.ShapeGeometry(cardShape, 6);
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < position.count; i += 1) uv.setXY(i, position.getX(i) / CARD_SIZE[0] + 0.5, position.getY(i) / CARD_SIZE[1] + 0.5);
    uv.needsUpdate = true;
    return geometry;
  };
  const cardFaceMaterial = (texture) => new THREE.MeshStandardMaterial({
    map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.34, roughness: 0.38, metalness: 0.3,
  });
  const heroCard = new THREE.Group();
  heroCard.userData.action = "card";
  const cardFront = new THREE.Mesh(cardFaceGeometry(), cardFaceMaterial(cardTextures[0]));
  cardFront.position.z = 0.00042;
  const cardBack = new THREE.Mesh(cardFaceGeometry(), cardFaceMaterial(cardTextures[1]));
  cardBack.rotation.y = Math.PI;
  cardBack.position.z = -0.00042;
  const cardRim = new THREE.Mesh(new THREE.ExtrudeGeometry(cardShape, { depth: 0.0008, bevelEnabled: false, curveSegments: 6 }), [HIT_MATERIAL, cardRimMaterial]);
  cardRim.position.z = -0.0004;
  heroCard.add(cardFront, cardBack, cardRim);
  heroCard.position.set(0, CARD_SIZE[1] / 2, -0.0085);
  cardTilt.add(heroCard);
  /* 记下它在盒子里的世界位置，然后挂到场景上，拿出来时直接在世界坐标里插值。 */
  scene.updateMatrixWorld(true);
  const cardHome = {
    position: heroCard.getWorldPosition(new THREE.Vector3()),
    quaternion: heroCard.getWorldQuaternion(new THREE.Quaternion()),
  };
  scene.attach(heroCard);
  let cardData = null;
  let cardImages = [];
  let cardNameImage = null;
  const redrawCard = () => {
    drawCardFront(cardCanvases[0].getContext("2d"), CARD_PX.w, CARD_PX.h, cardData, cardNameImage);
    drawCardBack(cardCanvases[1].getContext("2d"), CARD_PX.w, CARD_PX.h, cardData, cardImages);
    for (const texture of cardTextures) texture.needsUpdate = true;
  };
  const setCard = (data) => {
    cardData = data;
    cardImages = (data?.qrs || []).map((qr) => {
      const image = new Image();
      image.decoding = "async";
      image.addEventListener("load", redrawCard, { once: true });
      image.src = qr.src;
      return image;
    });
    cardNameImage = null;
    if (data?.nameImage) {
      cardNameImage = new Image();
      cardNameImage.decoding = "async";
      cardNameImage.addEventListener("load", redrawCard, { once: true });
      cardNameImage.src = data.nameImage;
    }
    redrawCard();
  };
  redrawCard();

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

  /* ---- 窗台上的 90 年代手提录音机：双喇叭、中间卡座、顶上一排琴键、提手和拉杆天线。
     点机身打开 MUSIC：卡座门弹开，从旁边那摞磁带里取一盒放进去，关门、PLAY 键按下去，磁带转起来，均衡器跟着跳。
     磁带侧标只写栏目名（音乐 MUSIC），歌名只在播放时由启动器显示。 */
  const recorder = new THREE.Group();
  recorder.userData.action = "tape";
  recorder.position.set(0.6, WIN.y0, BACK + 0.035);
  recorder.rotation.y = -0.08;
  const boomBody = std(0x2a2c31, 0.42, 0.3);
  const boomSilver = std(0xb9bdc5, 0.32, 0.65);
  const chrome = std(0xe4e6ea, 0.18, 0.95);
  recorder.add(roundedBox(0.42, 0.19, 0.1, 0.03, boomBody, 0, 0.095, 0));
  recorder.add(roundedBox(0.404, 0.172, 0.006, 0.024, boomSilver, 0, 0.094, 0.048));
  /* 两只喇叭 */
  for (const x of [-0.14, 0.14]) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.006, 40), std(0x141518, 0.6));
    well.rotation.x = Math.PI / 2;
    well.position.set(x, 0.088, 0.0515);
    recorder.add(well);
    const grilleFace = new THREE.Mesh(new THREE.CircleGeometry(0.057, 40), std(0xffffff, 0.75, 0, { map: grilleTexture() }));
    grilleFace.position.set(x, 0.088, 0.0552);
    recorder.add(grilleFace);
    const speakerRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.0042, 10, 48), chrome);
    speakerRing.position.set(x, 0.088, 0.0552);
    recorder.add(speakerRing);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.015, 18, 12), std(0x26272c, 0.3, 0.4));
    dome.scale.z = 0.45;
    dome.position.set(x, 0.088, 0.0556);
    recorder.add(dome);
  }
  /* 中间的卡座凹槽、门和装进去的磁带 */
  recorder.add(box(0.126, 0.086, 0.004, slotDark, 0, 0.071, 0.0516));
  const deckCassette = cassetteMesh("#d9583a", "MUSIC", "", false);
  deckCassette.position.set(0, 0.071, 0.0485);
  deckCassette.visible = false;
  recorder.add(deckCassette);
  const door = new THREE.Group();
  door.position.set(0, 0.028, 0.0545);
  const doorFrame = std(0x33353b, 0.35, 0.4);
  for (const [w, h, x, y] of [[0.126, 0.012, 0, 0.08], [0.126, 0.014, 0, 0.007], [0.012, 0.086, -0.057, 0.043], [0.012, 0.086, 0.057, 0.043]]) {
    door.add(box(w, h, 0.004, doorFrame, x, y, 0));
  }
  const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.104, 0.06), new THREE.MeshStandardMaterial({
    color: 0x2e3440, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.32, depthWrite: false,
  }));
  doorGlass.position.set(0, 0.044, 0.0005);
  door.add(doorGlass);
  door.add(badge("AUTO REVERSE", 0.05, 0.006, { width: 256, height: 32, color: "#c9ccd3", font: `600 22px ${SANS}`, spacing: 3 }, 0, 0.007, 0.0022));
  recorder.add(door);
  /* 调谐刻度 + 均衡器 */
  const deckCanvas = document.createElement("canvas");
  deckCanvas.width = 512;
  deckCanvas.height = 112;
  const deckContext = deckCanvas.getContext("2d");
  const deckTexture = new THREE.CanvasTexture(deckCanvas);
  deckTexture.colorSpace = THREE.SRGBColorSpace;
  const deckDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.0285), new THREE.MeshBasicMaterial({ map: deckTexture, toneMapped: false }));
  deckDisplay.position.set(0, 0.142, 0.0515);
  recorder.add(deckDisplay);
  recorder.add(badge("HPY  STEREO RADIO CASSETTE", 0.12, 0.008, { width: 768, height: 52, color: "#2b2d33", font: `700 32px ${SANS}`, spacing: 5 }, -0.13, 0.166, 0.0512));
  recorder.add(badge("REC   PLAY   REW   FF   STOP/EJ   PAUSE", 0.19, 0.007, { width: 1024, height: 38, color: "#2b2d33", font: `700 24px ${SANS}`, spacing: 2 }, 0, 0.1745, 0.0512));
  /* 顶上的琴键：REC、PLAY（放的时候保持按下）、REW、FF、STOP/EJ、PAUSE */
  const DECK_KEYS = [["deckRec", 0xc23a2c], ["deckPlay", 0xc7cad1], ["deckPrev", 0xc7cad1], ["deckNext", 0xc7cad1], ["deckStop", 0xc7cad1], ["deckPause", 0xc7cad1]];
  const deckKeys = {};
  DECK_KEYS.forEach(([id, color], index) => {
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.034), std(color, 0.35, color === 0xc23a2c ? 0.1 : 0.6));
    key.position.set(-0.0825 + index * 0.033, 0.192, 0.016);
    control(key, id, { kind: id === "deckPlay" ? "toggle" : "button", axis: "y", sign: -1, travel: 0.006, hit: [0.032, 0.03, 0.04, 0, 0.004, 0] });
    recorder.add(key);
    deckKeys[id] = key;
  });
  /* 提手和拉杆天线 */
  for (const x of [-0.16, 0.16]) recorder.add(rod(new THREE.Vector3(x, 0.185, -0.012), new THREE.Vector3(x, 0.245, -0.02), 0.0055, chrome));
  recorder.add(rod(new THREE.Vector3(-0.16, 0.245, -0.02), new THREE.Vector3(0.16, 0.245, -0.02), 0.0065, chrome));
  recorder.add(rod(new THREE.Vector3(-0.07, 0.245, -0.02), new THREE.Vector3(0.07, 0.245, -0.02), 0.011, std(0x1b1c20, 0.8)));
  recorder.add(rod(new THREE.Vector3(0.19, 0.18, -0.035), new THREE.Vector3(0.07, 0.44, -0.08), 0.0022, antennaMat));
  const recLed = led(0.006, 0.004, 0x3a0d0a);
  recLed.position.set(0.075, 0.142, 0.052);
  recorder.add(recLed);
  /* 拉近 MUSIC 视角时要框住的面：录音机正面 */
  const deckFace = new THREE.Object3D();
  deckFace.position.set(0, 0.11, 0.06);
  deckFace.userData.size = [0.44, 0.27];
  recorder.add(deckFace);
  recorder.add(hitBox(0.44, 0.27, 0.12, 0, 0.12, 0));
  scene.add(recorder);

  /* 旁边那摞磁带（也在窗台上）。能放的磁带点了直接放；空白磁带点了打开录音机。 */
  const cassetteStack = new THREE.Group();
  cassetteStack.userData.action = "tape";
  cassetteStack.position.set(0.905, WIN.y0, BACK + 0.04);
  cassetteStack.rotation.y = -0.35;
  scene.add(cassetteStack);
  let cassettes = [];
  const deck = { open: 0, openGoal: 0, loaded: -1, playing: false, busy: Promise.resolve(), level: new Array(7).fill(0) };
  const setCassettes = (list) => {
    for (const entry of cassettes) {
      cassetteStack.remove(entry.object);
      entry.object.traverse((node) => node.geometry?.dispose?.());
    }
    const all = [...list.map((item, index) => ({ ...item, index })), { blank: true }, { blank: true }];
    cassettes = all.map((item, slot) => {
      const object = cassetteMesh(item.blank ? "#e8e2d2" : item.color, item.blank ? "" : item.en, item.blank ? "" : item.label, true);
      object.rotation.set(-Math.PI / 2, 0, ((slot * 37) % 9 - 4) * 0.035);
      object.position.set(((slot * 5) % 3 - 1) * 0.004, 0.0065 + slot * 0.0135, 0);
      if (!item.blank) {
        object.userData.action = "cassette";
        object.userData.value = item.index;
      }
      cassetteStack.add(object);
      return { object, index: item.blank ? -1 : item.index, home: { position: object.position.clone(), quaternion: object.quaternion.clone() } };
    });
  };

  /* 卡座门：角度追着目标走。 */
  tickers.push((time, dt, realDt = dt) => {
    const step = Math.min(realDt, 0.1);
    if (Math.abs(deck.open - deck.openGoal) > 1e-4) {
      deck.open = lerp(deck.open, deck.openGoal, 1 - Math.exp(-step * 12));
      door.rotation.x = deck.open * 0.9;
    }
    if (deck.playing) {
      for (const reel of deckCassette.userData.reels) reel.rotation.z -= step * 4.2;
    }
  });

  /* 磁带在空中飞：和录像带一样按真实时间走，再加一个兜底定时器。 */
  const flights = new Set();
  const fly = (object, keys, seconds) => new Promise((resolve) => {
    const flight = { object, keys, t: 0, seconds, done: false };
    const finish = () => {
      if (flight.done) return;
      flight.done = true;
      flights.delete(flight);
      const last = keys[keys.length - 1];
      object.position.copy(last.position);
      object.quaternion.copy(last.quaternion);
      window.clearTimeout(flight.timer);
      resolve();
    };
    flight.finish = finish;
    flight.timer = window.setTimeout(finish, seconds * 1000 + 700);
    flights.add(flight);
  });
  tickers.push((time, dt, realDt = dt) => {
    for (const flight of flights) {
      flight.t = Math.min(1, flight.t + Math.min(realDt, 0.1) / flight.seconds);
      const segments = flight.keys.length - 1;
      const scaled = flight.t * segments;
      const index = Math.min(segments - 1, Math.floor(scaled));
      const local = scaled - index;
      const k = local * local * (3 - 2 * local);
      flight.object.position.lerpVectors(flight.keys[index].position, flight.keys[index + 1].position, k);
      flight.object.quaternion.slerpQuaternions(flight.keys[index].quaternion, flight.keys[index + 1].quaternion, k);
      if (flight.t >= 1) flight.finish();
    }
  });
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const poseOf = (object) => ({ position: object.getWorldPosition(new THREE.Vector3()), quaternion: object.getWorldQuaternion(new THREE.Quaternion()) });
  const setDeckColor = (entry) => {
    const source = entry.object.userData.labelMaterial;
    deckCassette.userData.labelMaterial.map = source.map;
    deckCassette.userData.labelMaterial.needsUpdate = true;
  };

  /* 放进去：开门 → 从那摞里飞到卡座前 → 推进去 → 关门。动作排队执行，不会互相打架。 */
  const insertCassette = (index, instant = false) => {
    deck.busy = deck.busy.then(async () => {
      if (deck.loaded === index) return;
      if (deck.loaded >= 0) await ejectNow(instant);
      const entry = cassettes.find((item) => item.index === index);
      if (!entry) return;
      deck.openGoal = 1;
      if (!instant) await wait(320);
      scene.updateMatrixWorld();
      const slot = poseOf(deckCassette);
      const front = { position: slot.position.clone().add(new THREE.Vector3(0, 0.02, 0.12).applyQuaternion(slot.quaternion)), quaternion: slot.quaternion };
      const start = poseOf(entry.object);
      const lift = { position: start.position.clone().add(new THREE.Vector3(-0.06, 0.12, 0.1)), quaternion: slot.quaternion };
      scene.attach(entry.object);
      if (!instant) await fly(entry.object, [start, lift, front, slot], 0.95);
      entry.object.visible = false;
      setDeckColor(entry);
      deckCassette.visible = true;
      deck.loaded = index;
      deck.openGoal = 0;
      if (!instant) await wait(260);
    });
    return deck.busy;
  };
  async function ejectNow(instant) {
    const entry = cassettes.find((item) => item.index === deck.loaded);
    deck.openGoal = 1;
    if (!instant) await wait(320);
    deckCassette.visible = false;
    deck.loaded = -1;
    if (!entry) return;
    scene.updateMatrixWorld();
    const slot = poseOf(deckCassette);
    const front = { position: slot.position.clone().add(new THREE.Vector3(0, 0.02, 0.12).applyQuaternion(slot.quaternion)), quaternion: slot.quaternion };
    cassetteStack.updateMatrixWorld();
    const home = {
      position: entry.home.position.clone().applyMatrix4(cassetteStack.matrixWorld),
      quaternion: cassetteStack.getWorldQuaternion(new THREE.Quaternion()).multiply(entry.home.quaternion),
    };
    const lift = { position: home.position.clone().add(new THREE.Vector3(-0.06, 0.12, 0.1)), quaternion: home.quaternion };
    entry.object.visible = true;
    entry.object.position.copy(slot.position);
    entry.object.quaternion.copy(slot.quaternion);
    if (!instant) await fly(entry.object, [slot, front, lift, home], 0.85);
    cassetteStack.attach(entry.object);
    entry.object.position.copy(entry.home.position);
    entry.object.quaternion.copy(entry.home.quaternion);
    deck.openGoal = 0;
  }
  const ejectCassette = (instant = false) => {
    deck.busy = deck.busy.then(() => (deck.loaded >= 0 ? ejectNow(instant) : null)).then(() => {
      deck.openGoal = 0;
    });
    return deck.busy;
  };
  const setDeckOpen = (open) => {
    if (deck.loaded < 0) deck.openGoal = open ? 1 : 0;
  };
  const setDeckPlaying = (playing) => {
    deck.playing = playing;
    deckKeys.deckPlay.userData.control.on = playing;
    recLed.material.color.set(playing ? 0xff4a2e : 0x3a0d0a);
  };
  const pressDeckKey = (id) => {
    if (id !== "deckPlay") actuate(deckKeys[id]);
  };
  /* 显示屏：收音机刻度、TAPE 指示、7 段均衡器；放音乐时每帧跳动。 */
  let deckDrawAt = 0;
  tickers.push((time) => {
    if (time - deckDrawAt < 1 / 20) return;
    deckDrawAt = time;
    for (let i = 0; i < deck.level.length; i += 1) {
      const goal = deck.playing ? 0.25 + 0.75 * Math.abs(Math.sin(time * (2.1 + i * 0.73) + i * 1.7) * Math.sin(time * (0.9 + i * 0.31))) : 0;
      deck.level[i] = lerp(deck.level[i], goal, deck.playing ? 0.55 : 0.2);
    }
    drawDeckDisplay(deckContext, 512, 112, deck);
    deckTexture.needsUpdate = true;
  });
  drawDeckDisplay(deckContext, 512, 112, deck);
  deckTexture.needsUpdate = true;

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
  mug.position.set(-0.25, DESK_TOP, -1.06);
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
  const spanStart = -1.28;
  const spanEnd = -0.66;
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
    computerGlow.intensity = computerState.power ? 0.05 * BRIGHTNESS[brightness] * (0.965 + 0.035 * Math.sin(time * 13.0)) : 0;
    tvGlow.intensity = tvState.power ? 0.18 * (0.95 + 0.05 * Math.sin(time * 9.0 + 1.3)) : 0;
  });

  return {
    hotspots,
    tickers,
    lamp,
    recorder,
    calculator,
    calcAnchor: calcHome.clone(),
    cardHolder,
    heroCard,
    cardHome,
    CARD_SIZE,
    setCard,
    liftCalculator,
    setCalcDisplay,
    operate,
    powerFor,
    screensBusy,
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
    cassetteStack,
    workBooks,
    deckFace,
    setCassettes,
    insertCassette,
    ejectCassette,
    setDeckOpen,
    setDeckPlaying,
    pressDeckKey,
    setBooks,
    get loadedCassette() {
      return deck.loaded;
    },
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
  labels = {},
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
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: !forced,
    });
  } catch (error) {
    canvas.remove();
    throw error;
  }

  /* 手机屏幕像素密度高，按 1.25 倍渲染会发虚：起步就用 2 倍，帧率看门狗跑不动时再降。 */
  let pixelCap = 2;
  const applyPixelRatio = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
  applyPixelRatio();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b10);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 30);
  const probe = camera.clone();

  const built = buildScene({ scene, renderer, posterUrl, quality });
  /* 译文页传进来的物件说明与电视测试卡文字；没有时用中文默认值。 */
  const subs = labels.hotspots || {};
  built.computerState.subs = subs;
  built.tvState.insertText = labels.tvInsert || "";
  const byId = Object.fromEntries(HOTSPOTS.map((hotspot) => [hotspot.id, hotspot]));
  const pickRoots = [...Object.values(built.hotspots).flatMap((entry) => entry.groups), built.lamp, built.recorder, built.calculator, built.cassetteStack, built.workBooks, built.cardHolder, built.heroCard];

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
    const worldScale = mesh.getWorldScale(new THREE.Vector3());
    const w = mesh.userData.size[0] * worldScale.x;
    const h = mesh.userData.size[1] * worldScale.y;
    const center = mesh.getWorldPosition(new THREE.Vector3());
    mesh.getWorldDirection(normal);
    const distance = Math.max(
      (h / fill) / (2 * Math.tan(rad(camera.fov) / 2)),
      (w / fill) / (2 * Math.tan(horizontalHalf())),
    );
    return { pos: center.clone().addScaledVector(normal, distance), look: center };
  }

  /* 书桌视角的五个机位（“视角”按钮 / V 键轮流切换）：全景、电脑桌、书架、窗台录音机、电视。 */
  let deskIndex = 0;
  let deskPresets = [];
  function computePoses() {
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    deskPresets = [
      { pos: v(lerp(-0.33, -0.3, narrow), lerp(1.36, 1.4, narrow), lerp(1.3, 1.2, narrow)), look: v(lerp(-0.36, -0.32, narrow), lerp(1.15, 1.02, narrow), -1.5) },
      { pos: v(-0.6, 1.3, lerp(0.3, 0.95, narrow)), look: v(-0.96, 1.02, -1.3) },
      { pos: v(lerp(-1.42, -1.5, narrow), 1.24, lerp(0.35, 0.95, narrow)), look: v(-1.64, 1.0, -1.45) },
      { pos: v(0.66, 1.34, lerp(-0.3, 0.25, narrow)), look: v(0.68, 1.1, -1.62) },
      { pos: v(0.14, 1.3, lerp(0.35, 1.05, narrow)), look: v(0.16, 1.06, -1.35) },
    ];
    poses.desk = deskPresets[deskIndex];
    poses.about = fitScreen(built.screens.computer, 0.8);
    poses.online = poses.about;
    poses.posts = fitScreen(built.screens.tv, 0.8);
    poses.film = poses.posts;

    /* 书桌视角绕着画面中心那件东西转：全景是电视屏幕，其它机位是它对准的那一点。 */
    if (deskIndex === 0) {
      const deskDirection = scratch.subVectors(poses.desk.look, poses.desk.pos).normalize().clone();
      const tvCenter = built.screens.tv.getWorldPosition(new THREE.Vector3());
      pivotDistance = clamp(deskDirection.dot(tvCenter.sub(poses.desk.pos)), 1, 4);
    } else {
      pivotDistance = clamp(poses.desk.pos.distanceTo(poses.desk.look), 0.6, 4);
    }

    /* 计算器：从全景机位往右下角的计算器靠过去一点。 */
    const overview = deskPresets[0];
    const anchor = built.calcAnchor;
    poses.calc = {
      pos: overview.pos.clone().lerp(new THREE.Vector3(anchor.x - 0.08, anchor.y + 0.55, anchor.z + 1.05), 0.45),
      look: overview.look.clone().lerp(anchor, 0.5),
    };

    /* 名片：镜头往右前方的名片盒靠过去，名片拿到镜头跟前。 */
    const holderAt = built.cardHome.position;
    poses.card = {
      pos: overview.pos.clone().lerp(new THREE.Vector3(holderAt.x - 0.05, holderAt.y + 0.5, holderAt.z + 0.95), 0.5),
      look: overview.look.clone().lerp(holderAt, 0.55),
    };

    /* MUSIC：正对录音机，录音机放在画面上半部分，下面留给磁带封套面板。 */
    const deckPose = fitScreen(built.deckFace, width >= 720 ? 0.56 : 0.92);
    /* 宽屏时左边的电视会挡一点，机位往右挪；竖屏不挪。 */
    if (width >= 720) {
      deckPose.pos.x += 0.1;
      deckPose.look.x += 0.04;
    }
    const halfHeight = deckPose.pos.distanceTo(deckPose.look) * Math.tan(rad(camera.fov) / 2);
    const drop = new THREE.Vector3(0, -halfHeight * (width >= 720 ? 0.3 : 0.42), 0);
    poses.music = { pos: deckPose.pos.add(drop), look: deckPose.look.clone().add(drop) };

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

  /* ---- 指针
     电脑：悬停出提示，点一下打开。手机：第一下只出提示（“再点一次”），第二下才打开。
     书桌视角下：拖动转视角，右键 / Shift 拖动或双指拖动平移，滚轮或双指捏合缩放，双击空白处复位。 */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerPx = { x: 0, y: 0 };
  const parallax = { x: 0, y: 0, targetX: 0, targetY: 0, weight: 1 };
  let pointerActive = false;
  let pointerMoved = false;
  let hoverId = null;
  const CONTROL_ACTIONS = new Set(["tvPower", "tvPreset", "tvChannel", "tvVolume", "pcPower", "pcBright"]);
  /* 手机上可以连着按的东西：开关、旋钮、录音机琴键。 */
  const REPEATABLE = (id) => CONTROL_ACTIONS.has(id) || id.startsWith("deck");

  function toNdc(event) {
    const rect = stage.getBoundingClientRect();
    pointerPx.x = event.clientX - rect.left;
    pointerPx.y = event.clientY - rect.top;
    pointer.set((pointerPx.x / rect.width) * 2 - 1, -(pointerPx.y / rect.height) * 2 + 1);
  }

  /* 返回命中的热点或动作；点在某盒录像带上时带上带子的序号，点在预选台按键上时带上台号。 */
  function pick() {
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(pickRoots, true)) {
      let node = hit.object;
      let tape = null;
      while (node) {
        if (Number.isInteger(node.userData.tape)) tape = node.userData.tape;
        if (node.userData.hotspot) return { id: node.userData.hotspot, tape, value: null };
        if (node.userData.action) return { id: node.userData.action, tape: null, value: node.userData.value ?? null };
        node = node.parent;
      }
    }
    return null;
  }

  function setHover(id, { confirm = false, value = null } = {}) {
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
      label: id === "tvPreset" && value ? `CH ${value}` : hotspot.label,
      sub: subs[id] || hotspot.sub,
      external: Boolean(hotspot?.href && !hotspot.href.startsWith("#")),
      x: pointerPx.x,
      y: pointerPx.y,
      confirm,
    });
  }

  /* 书桌视角的旋转、平移、缩放：goal 是手指要去的地方，当前值每帧平滑地追过去。 */
  const ORBIT_KEYS = ["yaw", "pitch", "zoom", "panX", "panY"];
  const orbit = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0, goal: { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 } };
  const LIMIT = { yaw: 0.62, pitchDown: -0.14, pitchUp: 0.34, zoomIn: 0.42, zoomOut: 1.2, panX: 0.42, panY: 0.2 };
  let pivotDistance = 2;
  const pivot = new THREE.Vector3();
  const orbitDir = new THREE.Vector3();
  const orbitRight = new THREE.Vector3();
  const orbitUp = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const orbitPos = new THREE.Vector3();
  const orbitLook = new THREE.Vector3();
  const spherical = new THREE.Spherical();

  function clampOrbit() {
    const goal = orbit.goal;
    goal.yaw = clamp(goal.yaw, -LIMIT.yaw, LIMIT.yaw);
    goal.pitch = clamp(goal.pitch, LIMIT.pitchDown, LIMIT.pitchUp);
    goal.zoom = clamp(goal.zoom, LIMIT.zoomIn, LIMIT.zoomOut);
    goal.panX = clamp(goal.panX, -LIMIT.panX, LIMIT.panX);
    goal.panY = clamp(goal.panY, -LIMIT.panY, LIMIT.panY);
  }

  function resetOrbit(instant = false) {
    Object.assign(orbit.goal, { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 });
    if (instant) for (const key of ORBIT_KEYS) orbit[key] = orbit.goal[key];
  }

  /* 从某个机位出发，套上当前的旋转 / 平移 / 缩放。归零时结果就是原机位。 */
  function orbitPose(source, outPos, outLook) {
    orbitDir.subVectors(source.look, source.pos).normalize();
    orbitRight.crossVectors(orbitDir, camera.up).normalize();
    orbitUp.crossVectors(orbitRight, orbitDir).normalize();
    pivot.copy(source.pos).addScaledVector(orbitDir, pivotDistance)
      .addScaledVector(orbitRight, orbit.panX)
      .addScaledVector(orbitUp, orbit.panY);
    orbitOffset.copy(orbitDir).multiplyScalar(-pivotDistance);
    spherical.setFromVector3(orbitOffset);
    spherical.theta += orbit.yaw;
    spherical.phi = clamp(spherical.phi - orbit.pitch, 0.25, Math.PI - 0.25);
    spherical.radius *= orbit.zoom;
    orbitOffset.setFromSpherical(spherical);
    outPos.copy(pivot).add(orbitOffset);
    outLook.copy(pivot);
  }

  const canOrbit = () => current === "desk" && !flight;
  const pointers = new Map();
  let gesture = null;
  let lastEmptyTap = 0;
  let armed = null;
  let armTimer = 0;

  function disarm() {
    if (!armed) return;
    armed = null;
    window.clearTimeout(armTimer);
    setHover(null);
  }

  function panBy(dx, dy, size) {
    const metres = 1.1 * orbit.goal.zoom;
    orbit.goal.panX -= (dx / size) * metres;
    orbit.goal.panY += (dy / size) * metres;
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      /* 捕获失败也能用，只是拖出窗口后收不到抬起。 */
    }
    if (pointers.size === 1) {
      gesture = {
        type: event.pointerType,
        button: event.button,
        pan: event.button === 2 || event.shiftKey,
        moved: false,
        multi: false,
        startX: event.clientX,
        startY: event.clientY,
        startTime: performance.now(),
        pinch: 0,
        pinchZoom: orbit.goal.zoom,
      };
    } else if (gesture) {
      gesture.multi = true;
      gesture.moved = true;
      disarm();
      const [a, b] = [...pointers.values()];
      gesture.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.pinchZoom = orbit.goal.zoom;
    }
  }

  function onPointerMove(event) {
    toNdc(event);
    const mouse = event.pointerType === "mouse";
    if (mouse) {
      pointerActive = true;
      pointerMoved = true;
      if (!reducedMotion) {
        parallax.targetX = pointer.x;
        parallax.targetY = pointer.y;
      }
    }
    const tracked = pointers.get(event.pointerId);
    if (!tracked || !gesture) return;
    const dx = event.clientX - tracked.x;
    const dy = event.clientY - tracked.y;
    tracked.x = event.clientX;
    tracked.y = event.clientY;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > (mouse ? 4 : 9)) {
      gesture.moved = true;
      disarm();
      if (mouse && canOrbit()) stage.style.cursor = "grabbing";
    }
    if (!gesture.moved) return;
    const size = Math.max(320, Math.min(width, height));
    if (current === "card" && !flight) {
      cardAnim.yawGoal += (dx / size) * 3.2;
      cardAnim.pitchGoal = clamp(cardAnim.pitchGoal + (dy / size) * 2.4, -0.8, 0.8);
      return;
    }
    if (!canOrbit()) return;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.pinch > 0 && distance > 0) orbit.goal.zoom = gesture.pinchZoom * (gesture.pinch / distance);
      panBy(dx / 2, dy / 2, size);
    } else if (gesture.pan) {
      panBy(dx, dy, size);
    } else {
      orbit.goal.yaw -= (dx / size) * 1.7;
      orbit.goal.pitch += (dy / size) * 1.2;
    }
    clampOrbit();
  }

  /* 真正“点”下去只在 click 里处理：iPhone Safari 和微信只把 click / touchend 当成允许出声播放的点击，
     在 pointerup 里调 video.play() / audio.play() 会被拦下（录像带、磁带就放不出来）。
     pointerup 只判断这一下算不算“点”（没拖动、没多指、不太久）；万一 click 没来，400ms 后照样处理，只是不保证能出声。 */
  let pendingTap = null;

  function onPointerUp(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size) return;
    const finished = gesture;
    gesture = null;
    if (finished?.type === "mouse") stage.style.cursor = "";
    if (pendingTap) window.clearTimeout(pendingTap.timer);
    pendingTap = null;
    if (!finished || finished.moved || finished.multi || event.type === "pointercancel") return;
    if (performance.now() - finished.startTime > 650) return;
    if (finished.type === "mouse" && (finished.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    const info = { type: finished.type, clientX: event.clientX, clientY: event.clientY, timer: 0 };
    info.timer = window.setTimeout(() => {
      if (pendingTap !== info) return;
      pendingTap = null;
      tap(info, info.type);
    }, 400);
    pendingTap = info;
  }

  function onClick(event) {
    const info = pendingTap;
    if (!info) return;
    pendingTap = null;
    window.clearTimeout(info.timer);
    tap(event, info.type);
  }

  function activate(hit) {
    if (hit.id === "lamp") built.toggleLamp();
    else if (CONTROL_ACTIONS.has(hit.id)) built.operate(hit.id, hit.value);
    else {
      /* 录音机的琴键先在场景里按下去，播放逻辑交给启动器。 */
      if (hit.id.startsWith("deck")) built.pressDeckKey(hit.id);
      onPick(hit.id, { tape: hit.tape, value: hit.value });
    }
  }

  function tap(event, type) {
    if (current === "card") {
      if (!flight) flipCard();
      return;
    }
    if (!canOrbit()) return;
    toNdc(event);
    const hit = pick();
    const touch = type !== "mouse";
    if (!hit) {
      const now = performance.now();
      if (now - lastEmptyTap < 380) {
        resetOrbit();
        lastEmptyTap = 0;
      } else {
        lastEmptyTap = now;
      }
      if (touch) disarm();
      return;
    }
    lastEmptyTap = 0;
    if (touch) {
      const key = `${hit.id}:${hit.value ?? ""}`;
      const control = REPEATABLE(hit.id);
      if (armed !== key) {
        armed = key;
        window.clearTimeout(armTimer);
        armTimer = window.setTimeout(() => {
          armed = null;
          setHover(null);
        }, 4500);
        setHover(hit.id, { confirm: true, value: hit.value });
        return;
      }
      /* 开关、旋钮可以连着按；其它物件第二下打开后提示就收起。 */
      window.clearTimeout(armTimer);
      if (control) {
        armTimer = window.setTimeout(() => {
          armed = null;
          setHover(null);
        }, 4500);
      } else {
        armed = null;
        setHover(null);
      }
    }
    activate(hit);
  }

  function onWheel(event) {
    if (!canOrbit()) return;
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    orbit.goal.zoom *= Math.exp(delta * (event.ctrlKey ? 0.01 : 0.0012));
    clampOrbit();
  }

  function onPointerLeave(event) {
    if (event.pointerType !== "mouse") return;
    pointerActive = false;
    parallax.targetX = 0;
    parallax.targetY = 0;
    stage.style.cursor = "";
    setHover(null);
  }

  const stopDefault = (event) => event.preventDefault();
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("click", onClick);
  stage.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("pointerleave", onPointerLeave);
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("contextmenu", stopDefault);
  /* iOS Safari 的双指缩放会缩放整页，这里拦下来交给房间。 */
  stage.addEventListener("gesturestart", stopDefault);
  stage.addEventListener("gesturechange", stopDefault);

  /* ---- 名片：拿出来、翻面、拖着转 */
  const cardAnim = { out: 0, goal: 0, flip: 0, flipGoal: 0, yaw: 0, pitch: 0, yawGoal: 0, pitchGoal: 0 };
  const cardViewPos = new THREE.Vector3();
  const cardViewQuat = new THREE.Quaternion();
  const cardFacing = new THREE.Object3D();
  const cardSpin = new THREE.Quaternion();
  const cardEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const cardDir = new THREE.Vector3();
  function cardTarget() {
    const pose = poses.card;
    cardDir.subVectors(pose.look, pose.pos).normalize();
    const halfV = Math.tan(rad(camera.fov) / 2);
    const halfH = halfV * camera.aspect;
    const [w, h] = built.CARD_SIZE;
    const distance = Math.max(w / ((width >= 720 ? 0.48 : 0.84) * 2 * halfH), h / (0.6 * 2 * halfV));
    cardViewPos.copy(pose.pos).addScaledVector(cardDir, distance);
    cardFacing.position.copy(cardViewPos);
    cardFacing.up.copy(camera.up);
    cardFacing.lookAt(pose.pos);
    cardEuler.set(cardAnim.pitch, cardAnim.yaw + cardAnim.flip, 0, "YXZ");
    cardSpin.setFromEuler(cardEuler);
    cardViewQuat.copy(cardFacing.quaternion).multiply(cardSpin);
  }
  function placeCard(realDt) {
    const step = Math.min(realDt, 0.1);
    if (cardAnim.out !== cardAnim.goal) {
      const delta = step / (reducedMotion ? 0.05 : 0.75);
      cardAnim.out = cardAnim.goal > cardAnim.out ? Math.min(cardAnim.goal, cardAnim.out + delta) : Math.max(cardAnim.goal, cardAnim.out - delta);
    }
    const follow = 1 - Math.exp(-step * 10);
    cardAnim.flip = lerp(cardAnim.flip, cardAnim.flipGoal, follow);
    cardAnim.yaw = lerp(cardAnim.yaw, cardAnim.yawGoal, follow);
    cardAnim.pitch = lerp(cardAnim.pitch, cardAnim.pitchGoal, follow);
    const card = built.heroCard;
    if (cardAnim.out <= 0) {
      if (cardAnim.goal === 0 && (cardAnim.flipGoal || cardAnim.yawGoal || cardAnim.pitchGoal)) {
        Object.assign(cardAnim, { flip: 0, flipGoal: 0, yaw: 0, yawGoal: 0, pitch: 0, pitchGoal: 0 });
      }
      card.position.copy(built.cardHome.position);
      card.quaternion.copy(built.cardHome.quaternion);
      return;
    }
    cardTarget();
    const k = easeInOut(cardAnim.out);
    card.position.lerpVectors(built.cardHome.position, cardViewPos, k);
    card.position.y += Math.sin(k * Math.PI) * 0.06;
    card.quaternion.slerpQuaternions(built.cardHome.quaternion, cardViewQuat, k);
  }
  const flipCard = () => {
    if (current === "card") cardAnim.flipGoal += Math.PI;
  };

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
    if (current === "desk") {
      orbitPose(view, orbitPos, orbitLook);
      view.pos.copy(orbitPos);
      view.look.copy(orbitLook);
      resetOrbit(true);
    }
    current = target;
    armed = null;
    window.clearTimeout(armTimer);
    setHover(null);
    stage.style.cursor = target === "desk" ? "" : "default";
    built.powerFor(target);
    built.liftCalculator(target === "calc", reducedMotion);
    built.setDeckOpen(target === "music");
    cardAnim.goal = target === "card" ? 1 : 0;
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
    deskIndex = 0;
    computePoses();
    view.pos.copy(poses.desk.pos);
    view.look.copy(poses.desk.look);
    parallax.weight = 1;
    resetOrbit(true);
    built.liftCalculator(false, true);
    stage.style.cursor = "";
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
    if (quality === "high" || pixelCap > 1.25) {
      if (quality === "high") setQuality("low");
      else {
        pixelCap = 1.25;
        applyPixelRatio();
        renderer.setSize(width, height, false);
      }
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
    if (level === "low") pixelCap = Math.min(pixelCap, 1.5);
    applyPixelRatio();
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
    const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 12);
    for (const key of ORBIT_KEYS) orbit[key] = lerp(orbit[key], orbit.goal[key], ease);
    if (atDesk) {
      orbitPose(view, orbitPos, orbitLook);
      camera.position.copy(orbitPos).add(offset);
      camera.lookAt(orbitLook);
    } else {
      camera.position.copy(view.pos).add(offset);
      camera.lookAt(view.look);
    }

    if (pointerMoved && pointerActive && atDesk && !gesture?.moved) {
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
    placeCard(realDt);

    /* 正在放带、雪花、开关机或显示面板屏显时，屏幕每一帧都要重画。 */
    const busy = built.screensBusy();
    if (busy.tv) built.redrawTv();
    if (busy.computer) built.redrawComputer();
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
    window.clearTimeout(armTimer);
    stage.removeEventListener("pointerdown", onPointerDown);
    stage.removeEventListener("pointermove", onPointerMove);
    stage.removeEventListener("pointerup", onPointerUp);
    stage.removeEventListener("click", onClick);
    if (pendingTap) window.clearTimeout(pendingTap.timer);
    stage.removeEventListener("pointercancel", onPointerUp);
    stage.removeEventListener("pointerleave", onPointerLeave);
    stage.removeEventListener("wheel", onWheel);
    stage.removeEventListener("contextmenu", stopDefault);
    stage.removeEventListener("gesturestart", stopDefault);
    stage.removeEventListener("gesturechange", stopDefault);
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
    setCalcDisplay: (text) => built.setCalcDisplay(text),
    /* 键盘：方向键转视角，+ − 缩放，0 复位（只在书桌视角）。 */
    nudge({ yaw = 0, pitch = 0, zoom = 1 } = {}) {
      if (!canOrbit()) return;
      orbit.goal.yaw += yaw;
      orbit.goal.pitch += pitch;
      orbit.goal.zoom *= zoom;
      clampOrbit();
    },
    resetOrbit: () => resetOrbit(),
    setTapes: (list) => built.setTapes(list),
    insertTape: (index) => built.moveTape(index, true, reducedMotion),
    ejectTape: () => (built.loadedTape >= 0 ? built.moveTape(built.loadedTape, false, reducedMotion) : Promise.resolve()),
    get loadedTape() {
      return built.loadedTape;
    },
    tv,
    setVcr,
    setCassettes: (list) => built.setCassettes(list),
    insertCassette: (index) => built.insertCassette(index, reducedMotion),
    ejectCassette: () => built.ejectCassette(reducedMotion),
    setDeckPlaying: (playing) => built.setDeckPlaying(playing),
    get loadedCassette() {
      return built.loadedCassette;
    },
    setBooks: (list) => built.setBooks(list),
    setCard: (data) => built.setCard(data),
    flipCard,
    /* 换到下一个书桌机位；只在书桌视角下有效。返回新的机位序号。 */
    cycleDeskView(step = 1) {
      if (current !== "desk") return deskIndex;
      deskIndex = (deskIndex + step + deskPresets.length) % deskPresets.length;
      computePoses();
      goTo("desk");
      return deskIndex;
    },
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
