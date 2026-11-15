/* 何鹏远个人网站 —— 首页轻交互
   每块功能都独立 try/catch：任何一块出错都不影响服务器直出的内容与链接。 */

const root = document.documentElement;

/* ------------------------------------------------------------------ 主题
   三态：跟随系统 → 浅色 → 深色。未选择时不写 data-theme，交给 CSS 的
   prefers-color-scheme 决定；选择后写入 localStorage。 */
const THEME_KEY = "hpy-theme";
const THEME_STATES = ["auto", "light", "dark"];
const THEME_LABELS = { auto: "跟随系统", light: "浅色", dark: "深色" };

function readStoredTheme() {
  try {
    const saved = window.localStorage?.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  } catch {
    return "auto";
  }
}

function writeStoredTheme(theme) {
  try {
    if (theme === "auto") window.localStorage?.removeItem(THEME_KEY);
    else window.localStorage?.setItem(THEME_KEY, theme);
  } catch {
    /* 隐私模式下写不进去，本次访问内仍然生效。 */
  }
}

/* 译文首页在按钮上用 data-theme-* 提供本语言的文字；没有时用中文。 */
function applyTheme(theme, button) {
  if (theme === "auto") root?.removeAttribute?.("data-theme");
  else root?.setAttribute?.("data-theme", theme);

  if (!button) return;
  button.textContent = theme.toUpperCase();
  const name = button.dataset?.[`theme${theme[0].toUpperCase()}${theme.slice(1)}`] || THEME_LABELS[theme];
  const template = button.dataset?.themeTemplate || "配色：{mode}（点击切换）";
  button.setAttribute("aria-label", template.replace("{mode}", name));
}

try {
  const themeButton = document.querySelector("#theme");
  if (themeButton) {
    let theme = readStoredTheme();
    applyTheme(theme, themeButton);
    themeButton.hidden = false;

    themeButton.addEventListener("click", () => {
      theme = THEME_STATES[(THEME_STATES.indexOf(theme) + 1) % THEME_STATES.length];
      writeStoredTheme(theme);
      applyTheme(theme, themeButton);
    });
  }
} catch {
  /* 没有按钮就保持跟随系统。 */
}

/* --------------------------------------------------- 公开联系方式一键复制
   两个按钮各自独立：晚到的失败不能覆盖后一次成功的提示。 */
const copyButtons = document.querySelectorAll("[data-copy-public]");
const contactName = document.querySelector("[data-contact-name]");
const copyStatus = document.querySelector("[data-contact-note]");
let copyRequestId = 0;

function fallbackCopy(value) {
  const textarea = document.createElement("textarea");
  const previousFocus = document.activeElement;

  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("tabindex", "-1");
  Object.assign(textarea.style, {
    position: "fixed",
    top: "0",
    left: "-9999px",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });

  try {
    document.body.append(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    return Boolean(document.execCommand("copy"));
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}

async function copyContactName(trigger) {
  if (!copyStatus) return;

  const value = trigger?.dataset.copyValue?.trim() || contactName?.textContent.trim();
  if (!value) return;

  const label = trigger?.dataset.copyLabel?.trim() || "";
  /* 译文首页在提示元素上用 data-copied / data-manual 提供本语言的句式；没有时用中文。 */
  const copiedTemplate = copyStatus.dataset?.copied || "已复制{label}：{value}";
  const manualTemplate = copyStatus.dataset?.manual || "请手动复制{label}：{value}";
  const format = (template) => template.replace("{label}", label).replace("{value}", value);

  const requestId = copyRequestId += 1;
  let copied = false;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      copied = true;
    } else {
      copied = fallbackCopy(value);
    }
  } catch {
    if (requestId !== copyRequestId) return;
    copied = fallbackCopy(value);
  }

  if (requestId !== copyRequestId) return;
  copyStatus.textContent = copied ? format(copiedTemplate) : format(manualTemplate);
}

if (copyStatus && copyButtons.length > 0) {
  copyButtons.forEach((button) => {
    button.addEventListener("click", () => copyContactName(button));
  });
}

/* ----------------------------------------------------------- 滚动渐显
   尊重 prefers-reduced-motion；没有 IntersectionObserver 时直接全部显示。 */
const revealItems = document.querySelectorAll(".reveal");

function reveal(item) {
  item.classList.add("is-visible");
}

function revealAll() {
  revealItems.forEach(reveal);
}

let reducedMotion = false;
try {
  reducedMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
} catch {
  reducedMotion = true;
}

let IntersectionObserverConstructor = null;
try {
  const candidate = window.IntersectionObserver;
  if (typeof candidate === "function") IntersectionObserverConstructor = candidate;
} catch {
  IntersectionObserverConstructor = null;
}

if (reducedMotion || !IntersectionObserverConstructor) {
  revealAll();
} else {
  try {
    const observer = new IntersectionObserverConstructor((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.1 });

    revealItems.forEach((item) => {
      const bounds = item.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) {
        reveal(item);
      } else {
        observer.observe(item);
      }
    });
  } catch {
    revealAll();
  }
}

/* 出口登记：带 data-go 的链接通往各个项目（Aggie 官网、演示、别的系统）。点的时候给本站记一次数——只记“哪个出口、
   哪一天、从页面还是 3D 房间”，不记是谁；通往外站的地址顺便带上来源标记，对方的统计里认得出是从这里去的。
   href 始终是真实地址：没有 JS、右键复制链接、搜索引擎看到的都是它，这里只在点击那一下补标记。 */
try {
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[data-go]") : null;
    const id = link?.dataset?.go;
    if (!id || !/^[a-z0-9-]{1,64}$/.test(id)) return;
    const source = link.closest("#room") ? "room" : "page";
    try {
      navigator.sendBeacon?.(`/go/${id}?from=${source}`);
    } catch {
      /* 记不上数不影响跳转。 */
    }
    try {
      const target = new URL(link.href);
      if (target.origin !== window.location.origin && !target.searchParams.has("utm_source")) {
        target.searchParams.set("utm_source", "hepengyuan.com");
        target.searchParams.set("utm_medium", source);
        target.searchParams.set("utm_campaign", id);
        link.href = target.href;
      }
    } catch {
      /* 地址解析不了就原样跳转。 */
    }
  }, true);
} catch {
  /* 没有 document（校验脚本里的最小环境）时跳过。 */
}
