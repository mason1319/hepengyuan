/* 何鹏远个人网站 —— hi-fi 版启动器

   决定这位访客该看 3D 房间还是静态版。真正的场景在 /room/scene.js（连同
   three.js 一起按需加载），这里只做判断、遮罩、降级提示和进出切换。

   原则：首页内容本来就是服务器直出的 HTML，房间只是盖在上面的一层。
   所以任何一步出错都直接退回静态版，不重试、不卡住。

   <html data-room> 的状态：boot（<head> 内联脚本预判）→ loading → on →
   leaving → 移除。样式在 /styles.css 的「hi-fi 房间」一节。 */
(() => {
  "use strict";

  const SCENE_URL = "/room/scene.js?v=20261112-room";
  const POSTER_URL = "/assets/hpy-promo-poster.jpg";

  const PREF_KEY = "hpy-room"; /* "off" 访客自己选了静态版；"auto-off" 实测跑不动 */
  const SEEN_KEY = "hpy-room-seen"; /* 本次会话已经进过房间，回到首页不再自动弹出 */
  const NOTICE_KEY = "hpy-static-notice"; /* "off" 静态版提示已被关掉 */
  const FADE_MS = 460;
  const LOAD_TIMEOUT_MS = 12000; /* 超过这个时间还没布置好，就不让访客继续对着黑屏等 */

  const root = document.documentElement;

  const NOTICE_INTRO = "个人网站是互联网上少数还能好玩的地方，所以这里还有一个可交互的版本。";
  const NOTICE_REASONS = {
    "no-webgl": "你的浏览器没有提供 WebGL 2，所以看到的是这个静态版本。",
    software: "你的浏览器现在没有硬件加速，3D 只能用软件渲染，所以被送到了这个静态版本。",
    "low-end": "你的设备被识别为可能跑不动它，所以被送到了这个静态版本。",
    "save-data": "你开启了省流量模式，所以默认给你这个静态版本。",
    "slow-network": "你当前的网络比较慢，所以默认给你这个静态版本。",
    "reduced-motion": "你的系统开启了「减少动态效果」，所以默认给你这个静态版本。",
    slow: "刚才在你的设备上试着运行过，帧率太低，所以换回了这个静态版本。",
    "load-failed": "可交互的版本这次没能加载成功，所以先给你这个静态版本。",
    "context-lost": "浏览器中断了 3D 渲染，所以换回了这个静态版本。",
  };

  /* ---------------------------------------------------------------- 存储 */
  const store = (area) => ({
    get(key) {
      try {
        return window[area].getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window[area].setItem(key, value);
      } catch {
        /* 隐私模式下记不住，本次访问内仍然生效。 */
      }
    },
    remove(key) {
      try {
        window[area].removeItem(key);
      } catch {
        /* 同上。 */
      }
    },
  });
  const local = store("localStorage");
  const session = store("sessionStorage");

  /* ---------------------------------------------------------------- 能力判断 */
  function hasContext(attributes) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2", attributes);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      return Boolean(gl);
    } catch {
      return false;
    }
  }

  function matches(query) {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  }

  function probe() {
    const result = { webgl: false, ok: false, reason: "no-webgl", quality: "high" };
    if (!window.WebGL2RenderingContext) return result;

    const hardware = hasContext({ failIfMajorPerformanceCaveat: true });
    if (!hardware && !hasContext({})) return result;
    result.webgl = true;
    if (!hardware) {
      result.reason = "software";
      return result;
    }

    const connection = navigator.connection;
    const memory = navigator.deviceMemory;
    const cores = navigator.hardwareConcurrency;

    if (matches("(prefers-reduced-motion: reduce)")) result.reason = "reduced-motion";
    else if (connection?.saveData) result.reason = "save-data";
    /* 只排除 2g。effectiveType 按往返延迟估算，跨境访问时延迟高但带宽够的访客常被报成 3g，
       而房间总共只有约 190KB（压缩后），不该因此被降级。 */
    else if (/^(slow-2g|2g)$/.test(connection?.effectiveType || "")) result.reason = "slow-network";
    else if ((memory && memory < 4) || (cores && cores < 4)) result.reason = "low-end";
    else {
      result.ok = true;
      result.reason = "";
    }

    const smallScreen = Math.min(window.screen?.width || 9999, window.screen?.height || 9999) < 700;
    if (matches("(pointer: coarse)") || smallScreen || (memory && memory <= 4)) result.quality = "low";
    return result;
  }

  const AUTOMATED = navigator.webdriver === true
    || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|chatgpt-user|claude-user|anthropic-ai|perplexity|bytespider/i
      .test(navigator.userAgent || "");

  /* ---------------------------------------------------------------- 静态版上的入口与提示 */
  const pills = () => document.querySelectorAll("[data-room]:not(html)");

  function showPills(visible) {
    pills().forEach((pill) => {
      pill.hidden = !visible;
    });
  }

  function hideNotice() {
    const box = document.querySelector("#bm-warn");
    if (box) box.hidden = true;
  }

  function showNotice(reason, canRetry) {
    if (local.get(NOTICE_KEY) === "off") return;
    const box = document.querySelector("#bm-warn");
    if (!box) return;

    const text = box.querySelector(".ph-warn-t");
    if (text && NOTICE_REASONS[reason]) text.textContent = NOTICE_INTRO + NOTICE_REASONS[reason];

    const retry = document.querySelector("#bm-try");
    if (retry) retry.hidden = !canRetry;

    const close = document.querySelector("#bm-warn-x");
    if (close && !close.dataset.bound) {
      close.dataset.bound = "1";
      close.hidden = false;
      close.addEventListener("click", () => {
        box.hidden = true;
        local.set(NOTICE_KEY, "off");
      });
    }
    box.hidden = false;
  }

  function cleanUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      url.searchParams.delete("static");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      /* 地址栏清不掉不影响功能。 */
    }
  }

  /* ---------------------------------------------------------------- 遮罩层 */
  let overlay = null;
  let stage = null;
  let tags = null;
  let controller = null;
  let state = "idle"; /* idle → opening → open → closing → idle */
  let capability = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function ensureOverlay() {
    if (overlay) {
      overlay.hidden = false;
      return overlay;
    }
    overlay = element("div", "room");
    overlay.id = "room";
    overlay.tabIndex = -1;
    overlay.setAttribute("role", "region");
    overlay.setAttribute("aria-label", "可交互的 3D 房间。按 Esc 或选择 STATIC 可以直接看静态版。");

    stage = element("div", "room-stage");
    tags = element("nav", "room-tags");
    tags.setAttribute("aria-label", "房间里的入口");

    const hud = element("div", "room-hud");
    const name = element("p", "room-name");
    name.append(element("span", "cn", "何鹏远"), element("span", "en", "HE PENGYUAN"));
    const toStatic = element("button", "room-static", "STATIC");
    toStatic.type = "button";
    toStatic.title = "切到静态版，并记住这个选择";
    toStatic.setAttribute("aria-label", "切到静态版，并记住这个选择");
    toStatic.addEventListener("click", () => leave({ target: "#top", persist: true }));
    hud.append(name, toStatic);

    const hint = element("p", "room-hint", "点屏幕进入网站 · 点物件直达栏目 · 点台灯开关灯");
    const status = element("p", "room-status", "正在布置房间…");
    status.setAttribute("role", "status");

    overlay.append(stage, tags, hud, hint, status);
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") leave({ target: "#top", persist: false });
    });
    document.body.append(overlay);
    return overlay;
  }

  /* 房间打开时，底下的静态页不能被 Tab 到，也不该被读屏读到。 */
  function setBackgroundInert(inert) {
    for (const node of document.body.children) {
      if (node === overlay || node.tagName === "SCRIPT") continue;
      node.inert = inert;
      if (inert) node.setAttribute("aria-hidden", "true");
      else node.removeAttribute("aria-hidden");
    }
  }

  function teardown() {
    controller?.dispose();
    controller = null;
    overlay?.remove();
    overlay = null;
    stage = null;
    tags = null;
    setBackgroundInert(false);
    root.removeAttribute("data-room");
    state = "idle";
  }

  /* 加载失败、运行太慢、上下文丢失：统一退回静态版并说明原因。 */
  function fail(reason) {
    teardown();
    session.set(SEEN_KEY, "1");
    if (reason === "slow") local.set(PREF_KEY, "auto-off");
    const canRetry = reason !== "no-webgl" && Boolean(capability?.webgl);
    showPills(canRetry);
    showNotice(reason, canRetry);
  }

  async function open({ forced }) {
    if (state !== "idle") return;
    state = "opening";
    hideNotice();
    showPills(false);
    root.setAttribute("data-room", "loading");
    ensureOverlay();
    setBackgroundInert(true);
    overlay.focus({ preventScroll: true });

    if (controller) {
      controller.reset();
      controller.start();
      root.setAttribute("data-room", "on");
      state = "open";
      return;
    }

    let timer = 0;
    try {
      const timeout = new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("room: load timeout")), LOAD_TIMEOUT_MS);
      });
      const module = await Promise.race([import(SCENE_URL), timeout]);
      if (state !== "opening") return;
      const mounted = await Promise.race([
        module.mount({
          stage,
          labels: tags,
          quality: capability?.quality || "high",
          forced,
          reducedMotion: matches("(prefers-reduced-motion: reduce)"),
          posterUrl: POSTER_URL,
          onNavigate: arrive,
          onFail: fail,
        }),
        timeout,
      ]);
      if (state !== "opening") {
        mounted.dispose();
        return;
      }
      controller = mounted;
    } catch {
      if (state === "opening") fail("load-failed");
      return;
    } finally {
      window.clearTimeout(timer);
    }

    controller.start();
    root.setAttribute("data-room", "on");
    state = "open";
  }

  /* 镜头飞到位之后，场景把目的地交回来。 */
  function arrive({ href }) {
    if (href.startsWith("#")) {
      leave({ target: href, persist: false });
      return;
    }
    session.set(SEEN_KEY, "1");
    window.location.assign(href);
  }

  function leave({ target, persist }) {
    if (state !== "open" && state !== "opening") return;
    const wasOpening = state === "opening";
    state = "closing";
    if (persist) local.set(PREF_KEY, "off");
    session.set(SEEN_KEY, "1");

    setBackgroundInert(false);
    root.setAttribute("data-room", "leaving");

    const section = target && target !== "#top" ? document.querySelector(target) : null;
    if (section) section.scrollIntoView({ block: "start", behavior: "instant" });
    else window.scrollTo(0, 0);
    try {
      window.history.replaceState(window.history.state, "", section ? target : window.location.pathname + window.location.search);
    } catch {
      /* 地址栏不更新也没关系。 */
    }
    const focusTarget = section || document.querySelector("#top");
    if (focusTarget) {
      if (!focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1");
      focusTarget.focus({ preventScroll: true });
    }

    window.setTimeout(() => {
      if (wasOpening) {
        /* 还在加载就点了跳过：整层拆掉，晚到的场景会被 open() 里的状态检查丢弃。 */
        teardown();
      } else {
        controller?.stop();
        controller?.reset();
        if (overlay) overlay.hidden = true;
        root.removeAttribute("data-room");
        state = "idle";
      }
      showPills(Boolean(capability?.webgl));
    }, FADE_MS);
  }

  /* ---------------------------------------------------------------- 启动 */
  function init() {
    const query = new URLSearchParams(window.location.search);
    const forced = query.get("room") === "1";
    const declined = query.get("room") === "0" || query.has("static");

    if (forced) {
      local.remove(PREF_KEY);
      session.remove(SEEN_KEY);
    }
    if (declined) local.set(PREF_KEY, "off");
    if (forced || declined) cleanUrl();

    capability = probe();

    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href="/?room=1"]') : null;
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!capability.webgl) return;
      event.preventDefault();
      local.remove(PREF_KEY);
      open({ forced: true });
    });

    window.addEventListener("pageshow", (event) => {
      if (!event.persisted || !controller || state !== "open") return;
      controller.reset();
      controller.start();
    });
    window.addEventListener("pagehide", () => controller?.stop());

    const preference = local.get(PREF_KEY);
    /* declined 单独判断：隐私模式下 localStorage 写不进去，不能只靠刚才存的偏好。 */
    const wantsRoom = forced || (
      !declined
      && preference !== "off"
      && preference !== "auto-off"
      && session.get(SEEN_KEY) !== "1"
      && window.location.hash.length <= 1
      && !AUTOMATED
    );

    if (wantsRoom && (capability.ok || (forced && capability.webgl))) {
      open({ forced });
      return;
    }

    root.removeAttribute("data-room");
    showPills(capability.webgl);
    if (wantsRoom) showNotice(capability.reason, capability.webgl);
    else if (preference === "auto-off") showNotice("slow", capability.webgl);
  }

  try {
    init();
  } catch {
    root.removeAttribute("data-room");
  }
})();
