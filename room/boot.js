/* 何鹏远个人网站 —— hi-fi 版启动器

   决定这位访客该看 3D 房间还是静态版，并负责房间里的一切 HTML：顶部导航、
   右下角的按钮、光标提示，以及推近镜头后盖在屏幕上的内容面板。
   面板里的文字和链接全部从首页已经服务器直出的栏目里读取（#work、#posts、
   #contact……），房间不保存任何自己的事实副本。录像带里的影像只有两个来源：
   首页 #personal-film 里的宣传片，以及只返回已发布内容的 /api/media.json。

   原则：房间只是盖在静态首页上的一层。任何一步出错都直接退回静态版。

   <html data-room> 的状态：boot（<head> 内联脚本预判）→ loading → on →
   leaving → 移除。样式在 /styles.css 的「hi-fi 房间」一节。 */
(() => {
  "use strict";

  const SCENE_URL = "/room/scene.js?v=20261113-tv";
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

  /* 顶部导航与快捷键。SERVICES 是离开房间的普通链接。 */
  const NAV = [
    { view: "about", label: "ABOUT", sub: "关于我", key: "a" },
    { view: "work", label: "WORK", sub: "履历与作品", key: "w" },
    { view: "posts", label: "POSTS", sub: "文章与档案", key: "p" },
    { view: "film", label: "FILM", sub: "录像带", key: "f" },
    { view: "online", label: "ONLINE", sub: "联系方式", key: "o" },
  ];
  const LEAVE_LINKS = { services: "/services/", game: "/aggie-3a/" };
  const HINTS = {
    desk: "A 关于 · W 履历 · P 文章 · F 录像带 · O 联系 · M 录音机 · L 台灯",
    about: "↑ ↓ 滚动 · 1–5 功能键 · ESC 回到桌面",
    work: "点条目打开 · ESC 放下记事本",
    posts: "1–9 打开 · ESC 回到桌面",
    film: "空格 暂停 · ← → 上一段 / 下一段 · 1–4 换带 · ESC 退带",
    online: "1–8 打开或复制 · ESC 挂断",
  };
  /* 老电脑底部的功能键，和首页导航同一套视图。 */
  const FKEYS = ["about", "online", "posts", "film", "work"];
  const ARCHIVES = [
    { category: "travel", label: "旅行", en: "TRAVEL", color: "#3a7bd5" },
    { category: "learning", label: "学习", en: "LEARNING", color: "#3aa86b" },
  ];
  const IMAGE_SECONDS = 6;

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
       而房间总共只有约 200KB（压缩后），不该因此被降级。 */
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

  /* ---------------------------------------------------------------- DOM 小工具 */
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const textOf = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();

  /* 复制首页里的链接：保留 href 和文字，去掉 id，避免和底下的静态页重复。 */
  function linkFrom(anchor, className, text) {
    const link = element("a", className, text ?? textOf(anchor));
    link.href = anchor.getAttribute("href");
    return link;
  }

  /* ---------------------------------------------------------------- 面板：内容取自首页 */
  function buildAbout() {
    const panel = element("section", "room-screen room-crt");
    panel.dataset.view = "about";
    panel.setAttribute("aria-label", "关于我");
    const body = element("div", "room-screen-body");
    body.append(element("p", "crt-bar", "HPY-DOS 1.0  ·  ABOUT.TXT"));
    const heading = element("h2", "crt-h", textOf(document.querySelector("main h1")) || "你好，我是何鹏远。");
    heading.tabIndex = -1;
    body.append(heading);
    const dek = textOf(document.querySelector(".pb-dek"));
    if (dek) body.append(element("p", "crt-p", dek));

    const role = document.querySelector("#aggie-role");
    if (role) {
      body.append(element("p", "crt-k", `> ${textOf(role.querySelector(".pb-hd .t"))} · ${textOf(role.querySelector(".pb-hd .y"))}`));
      const paragraph = role.querySelector("p");
      if (paragraph) body.append(element("p", "crt-p", textOf(paragraph)));
      const tags = element("p", "crt-links");
      role.querySelectorAll(".pb-tags a").forEach((anchor) => tags.append(linkFrom(anchor, "crt-a")));
      if (tags.childElementCount) body.append(tags);
    }
    const note = textOf(document.querySelector("#work .pb-note"));
    if (note) {
      body.append(element("p", "crt-k", "> AI"));
      body.append(element("p", "crt-p", note));
    }
    const more = element("p", "crt-links");
    document.querySelectorAll("main .pb-more a").forEach((anchor) => more.append(linkFrom(anchor, "crt-a")));
    if (more.childElementCount) body.append(more);
    body.append(element("p", "crt-prompt", "C:\\HPY> "));
    panel.append(body, fkeyBar());
    return panel;
  }

  function fkeyBar() {
    const bar = element("p", "crt-keys");
    FKEYS.forEach((id, index) => {
      const nav = NAV.find((item) => item.view === id);
      const key = element("button", "crt-key");
      key.type = "button";
      key.dataset.fkey = String(index + 1);
      key.setAttribute("aria-label", `${nav.label} · ${nav.sub}`);
      key.append(element("span", "crt-key-n", String(index + 1)), element("span", "crt-key-l", nav.label));
      key.addEventListener("click", () => openView(id));
      bar.append(key);
    });
    return bar;
  }

  function buildPosts() {
    const panel = element("section", "room-screen room-ttx");
    panel.dataset.view = "posts";
    panel.setAttribute("aria-label", "文章与档案");
    const body = element("div", "room-screen-body");
    const bar = element("p", "ttx-bar");
    bar.append(element("span", "", "HPY TELETEXT"), element("span", "", "P100"));
    body.append(bar);
    const heading = element("h2", "ttx-h", "文章 POSTS");
    heading.tabIndex = -1;
    body.append(heading);

    const list = element("ol", "ttx-list");
    let n = 0;
    const add = (anchor, title, meta) => {
      n += 1;
      const item = element("li");
      const link = linkFrom(anchor, "ttx-a", "");
      link.dataset.key = String(n);
      link.append(element("span", "ttx-n", String(n).padStart(2, "0")), element("span", "ttx-t", title), element("span", "ttx-d", meta));
      item.append(link);
      list.append(item);
    };
    document.querySelectorAll("#posts .pb-idx a").forEach((anchor) => {
      add(anchor, textOf(anchor.querySelector(".t")) || textOf(anchor), textOf(anchor.querySelector(".d")));
    });
    const all = document.querySelector("#posts .pb-more-link a");
    if (all) add(all, textOf(all).replace(/\s*→$/, ""), "");
    document.querySelectorAll("#posts .pb-item .pb-hd").forEach((head) => {
      const anchor = head.querySelector("a");
      if (anchor) add(anchor, textOf(anchor), textOf(head.querySelector(".y")));
    });
    body.append(list);
    body.append(element("p", "ttx-foot", "按数字键打开 · ESC 回到桌面"));
    panel.append(body);
    return panel;
  }

  function buildOnline() {
    const panel = element("section", "room-screen room-crt room-bbs");
    panel.dataset.view = "online";
    panel.setAttribute("aria-label", "联系方式");
    const body = element("div", "room-screen-body");
    body.append(element("p", "crt-bar", "HPY BBS  ·  ONLINE"));
    body.append(element("p", "bbs-dial", "ATDT HEPENGYUAN.COM"), element("p", "bbs-dial", "CONNECT 2400"));
    const heading = element("h2", "bbs-h", "HPY BBS");
    heading.tabIndex = -1;
    body.append(heading);
    body.append(element("p", "crt-k", "在这些地方找到我："));

    const list = element("ol", "bbs-list");
    let n = 0;
    const note = element("p", "bbs-note");
    note.setAttribute("role", "status");
    document.querySelectorAll("#contact .on-hd").forEach((head) => {
      const name = textOf(head.querySelector(".t"));
      const anchor = head.querySelector("a");
      const copy = head.querySelector("button[data-copy-public]");
      if (!name || (!anchor && !copy)) return;
      n += 1;
      const item = element("li");
      let control;
      if (anchor) {
        control = linkFrom(anchor, "bbs-row", "");
      } else {
        control = element("button", "bbs-row");
        control.type = "button";
        /* 交给首页原有的复制逻辑（含失败回退），再把它的提示同步过来。 */
        control.addEventListener("click", () => {
          copy.click();
          window.setTimeout(() => {
            note.textContent = textOf(document.querySelector("[data-contact-note]"));
          }, 120);
        });
      }
      control.dataset.key = String(n);
      control.append(
        element("span", "bbs-n", `[${n}]`),
        element("span", "bbs-name", name),
        element("span", "bbs-val", anchor ? textOf(anchor) : `${textOf(copy)} · 复制`),
      );
      item.append(control);
      list.append(item);
    });
    body.append(list, note, element("p", "crt-p", "按 1–8 打开或复制 · ESC 挂断"));
    panel.append(body);
    return panel;
  }

  /* FILM：电视屏幕上的录像机字幕层。画面本身在 3D 电视里播放，这里只放可读的标题。 */
  function buildFilm() {
    const panel = element("section", "room-screen room-tvfx");
    panel.dataset.view = "film";
    panel.setAttribute("aria-label", "录像带");
    const heading = element("h2", "sr-only", "录像带");
    heading.tabIndex = -1;
    const title = element("p", "tvfx-title");
    title.setAttribute("aria-live", "polite");
    const tapeName = element("p", "tvfx-tape");
    panel.append(heading, tapeName, title);
    panel.addEventListener("click", () => togglePause());
    panel.setInfo = (tapeText, titleText) => {
      tapeName.textContent = tapeText;
      title.textContent = titleText;
    };
    return panel;
  }

  function buildWork() {
    const pad = element("aside", "room-pad");
    pad.dataset.view = "work";
    pad.setAttribute("aria-label", "履历与作品");
    const body = element("div", "pad-body");
    const heading = element("h2", "pad-h", "Work");
    heading.tabIndex = -1;
    body.append(heading);

    const work = document.querySelector("#work");
    const items = work ? [...work.querySelectorAll(".pb-item")] : [];
    const split = work?.querySelector(".pb-grp");
    const before = (node) => !split || Boolean(node.compareDocumentPosition(split) & Node.DOCUMENT_POSITION_FOLLOWING);

    const section = (title, nodes) => {
      if (!nodes.length) return;
      body.append(element("p", "pad-k", title));
      const list = element("ol", "pad-list");
      nodes.forEach((node, index) => {
        const head = node.querySelector(".pb-hd");
        const titleNode = head?.querySelector(".t");
        const item = element("li");
        item.append(element("span", "pad-n", String(index + 1).padStart(2, "0")));
        const anchor = titleNode?.matches("a") ? titleNode : node.querySelector(".pb-tags a, p a");
        item.append(anchor ? linkFrom(anchor, "pad-t", textOf(titleNode)) : element("span", "pad-t", textOf(titleNode)));
        item.append(element("span", "pad-y", textOf(head?.querySelector(".y"))));
        list.append(item);
      });
      body.append(list);
    };
    section("履历", items.filter(before));
    section("作品", items.filter((node) => !before(node)));
    pad.append(body);
    return pad;
  }

  /* ---------------------------------------------------------------- 录像带 */
  const media = { tapes: [], tape: -1, index: 0, video: null, timer: 0, paused: false, token: 0, failures: 0, feed: null, pendingTapes: false };

  function sameOrigin(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.origin === window.location.origin || /^(www\.)?hepengyuan\.com$/.test(parsed.hostname)) return parsed.pathname + parsed.search;
    } catch {
      /* 解析不了的地址直接不放。 */
    }
    return null;
  }

  /* 宣传片：取自首页 #personal-film，不在脚本里写死。 */
  function collectTapes() {
    const tapes = [];
    const film = document.querySelector("#personal-film");
    const video = film?.querySelector("video");
    const src = sameOrigin(video?.querySelector("source")?.getAttribute("src") || video?.getAttribute("src"));
    if (src) {
      const named = [...film.querySelectorAll("figcaption span")].find((span) => textOf(span.querySelector("b")) === "片名");
      const title = named ? textOf(named).replace(/^片名\s*/, "") : textOf(film.querySelector("h2"));
      tapes.push({ id: "promo", label: "宣传片", en: "PROMO", color: "#d9583a", items: [{ kind: "video", src, poster: sameOrigin(video.getAttribute("poster")), title }] });
    }
    return tapes;
  }

  /* 旅行与学习影像：只来自 /api/media.json（服务端只返回已发布条目）。 */
  function loadArchiveTapes() {
    if (media.feed) return media.feed;
    media.feed = fetch("/api/media.json", { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((feed) => {
        const items = Array.isArray(feed?.items) ? feed.items : [];
        for (const archive of ARCHIVES) {
          const list = items
            .filter((item) => item?.category === archive.category && (item.mediaType === "video" || item.mediaType === "image"))
            .map((item) => ({ kind: item.mediaType, src: sameOrigin(item.contentUrl), poster: sameOrigin(item.thumbnailUrl), title: String(item.title || "").trim() }))
            .filter((item) => item.src);
          if (list.length) media.tapes.push({ id: archive.category, label: archive.label, en: archive.en, color: archive.color, items: list });
        }
        syncTapes();
      })
      .catch(() => {
        /* 影像档案拿不到时，只有宣传片这一盒带。 */
      });
    return media.feed;
  }

  function syncTapes() {
    if (!controller) return;
    /* 正在放的带子在录像机里，换掉整摞带子会把它弄丢：等退带之后再同步。 */
    if (media.tape >= 0) {
      media.pendingTapes = true;
      return;
    }
    media.pendingTapes = false;
    controller.setTapes(media.tapes.map((tape) => ({ label: tape.label, en: tape.en, color: tape.color })));
  }

  function filmInfo(status) {
    const tape = media.tapes[media.tape];
    const panel = ui?.panels.film;
    if (!tape || !panel) return;
    const item = tape.items[media.index];
    const counter = `${String(media.index + 1).padStart(2, "0")}/${String(tape.items.length).padStart(2, "0")}`;
    panel.setInfo(`${tape.label} ${tape.en} · ${counter}${status ? ` · ${status}` : ""}`, item?.title || "");
    if (ui.play) {
      ui.play.textContent = media.paused ? "PLAY" : "PAUSE";
      ui.play.setAttribute("aria-label", media.paused ? "继续播放（空格）" : "暂停（空格）");
    }
    return counter;
  }

  function ensureVideo() {
    if (media.video) return media.video;
    const video = document.createElement("video");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    video.addEventListener("ended", () => step(1));
    video.addEventListener("error", () => {
      if (media.tape < 0 || !video.getAttribute("src")) return;
      media.failures += 1;
      controller?.tv({ mode: "noise" });
      filmInfo("NO SIGNAL");
      const tape = media.tapes[media.tape];
      if (tape && media.failures < tape.items.length) media.timer = window.setTimeout(() => step(1), 1600);
    });
    media.video = video;
    return video;
  }

  function clearItem() {
    media.token += 1;
    window.clearTimeout(media.timer);
    if (media.video) {
      media.video.pause();
      media.video.removeAttribute("src");
      media.video.removeAttribute("poster");
      media.video.load();
    }
  }

  /* 放某一段。视频在用户点击的同一个调用栈里 play()，浏览器才允许带声音播放。 */
  function playItem(index) {
    const tape = media.tapes[media.tape];
    if (!tape || !controller) return;
    clearItem();
    const token = media.token;
    media.index = (index + tape.items.length) % tape.items.length;
    media.paused = false;
    const item = tape.items[media.index];
    controller.tv({ mode: "noise" });
    controller.setVcr("play");
    const counter = filmInfo("LOADING");

    if (item.kind === "video") {
      const video = ensureVideo();
      if (item.poster) video.poster = item.poster;
      video.src = item.src;
      const show = () => {
        if (token !== media.token) return;
        media.failures = 0;
        controller?.tv({ mode: "media", element: video, osd: `\u25B6 PLAY ${counter}`, osdHold: false });
        filmInfo("");
      };
      video.addEventListener("playing", show, { once: true });
      const attempt = video.play();
      attempt?.catch?.(() => {
        if (token !== media.token) return;
        media.paused = true;
        controller?.setVcr("pause");
        video.addEventListener("loadeddata", () => {
          if (token !== media.token) return;
          controller?.tv({ mode: "media", element: video, osd: `\u2016 PAUSE ${counter}`, osdHold: true });
          filmInfo("点画面播放");
        }, { once: true });
      });
      return;
    }

    if (media.video) media.video.pause();
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
      if (token !== media.token) return;
      media.failures = 0;
      controller?.tv({ mode: "media", element: image, osd: `\u25B6 PLAY ${counter}`, osdHold: false });
      filmInfo("");
      if (!media.paused) media.timer = window.setTimeout(() => step(1), IMAGE_SECONDS * 1000);
    }, { once: true });
    image.addEventListener("error", () => {
      if (token !== media.token) return;
      media.failures += 1;
      filmInfo("NO SIGNAL");
      if (media.failures < tape.items.length) media.timer = window.setTimeout(() => step(1), 1600);
    }, { once: true });
    image.src = item.src;
  }

  function step(direction) {
    if (media.tape < 0) return;
    playItem(media.index + direction);
  }

  function togglePause() {
    if (media.tape < 0 || !controller) return;
    const tape = media.tapes[media.tape];
    const item = tape?.items[media.index];
    if (!item) return;
    media.paused = !media.paused;
    const counter = `${String(media.index + 1).padStart(2, "0")}/${String(tape.items.length).padStart(2, "0")}`;
    if (item.kind === "video" && media.video) {
      if (media.paused) media.video.pause();
      else media.video.play()?.catch?.(() => {});
    } else {
      window.clearTimeout(media.timer);
      if (!media.paused) media.timer = window.setTimeout(() => step(1), IMAGE_SECONDS * 1000);
    }
    controller.setVcr(media.paused ? "pause" : "play");
    if (controller && (media.video || item.kind === "image")) {
      const element = item.kind === "video" ? media.video : null;
      if (element) controller.tv({ mode: "media", element, osd: `${media.paused ? "\u2016 PAUSE" : "\u25B6 PLAY"} ${counter}`, osdHold: media.paused });
    }
    filmInfo(media.paused ? "PAUSE" : "");
  }

  /* 换带：同步开始播放（保住点击带来的播放许可），带子的动画随后补上。 */
  function startTape(index) {
    if (!media.tapes[index] || !controller) return;
    const previous = controller.loadedTape;
    media.tape = index;
    media.failures = 0;
    playItem(0);
    const swap = previous >= 0 && previous !== index ? controller.ejectTape() : Promise.resolve();
    swap.then(() => (controller?.loadedTape === index ? null : controller?.insertTape(index)));
  }

  function stopMedia() {
    if (media.tape < 0) return;
    clearItem();
    media.tape = -1;
    media.paused = false;
    if (!controller) return;
    controller.tv({ mode: "idle" });
    controller.setVcr("clock");
    controller.ejectTape().then(() => {
      if (media.pendingTapes) syncTapes();
    });
  }

  /* ---------------------------------------------------------------- 雨声：WebAudio 现场合成，不加载音频文件 */
  const sound = { context: null, gain: null, on: false };

  function setSound(on) {
    sound.on = on;
    try {
      if (on && !sound.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const context = new AudioContext();
        const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
        const data = buffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < data.length; i += 1) {
          brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          data[i] = brown * 3.2 + (Math.random() * 2 - 1) * 0.18;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const low = context.createBiquadFilter();
        low.type = "lowpass";
        low.frequency.value = 1600;
        const high = context.createBiquadFilter();
        high.type = "highpass";
        high.frequency.value = 180;
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(high).connect(low).connect(gain).connect(context.destination);
        source.start();
        sound.context = context;
        sound.gain = gain;
      }
      if (!sound.context) return;
      const now = sound.context.currentTime;
      if (on) sound.context.resume();
      sound.gain.gain.cancelScheduledValues(now);
      sound.gain.gain.setTargetAtTime(on ? 0.22 : 0, now, 0.4);
      if (!on) window.setTimeout(() => !sound.on && sound.context?.suspend(), 1600);
    } catch {
      sound.on = false;
    }
  }

  function toggleSound(force) {
    setSound(typeof force === "boolean" ? force : !sound.on);
    controller?.setRecorder(sound.on);
    if (ui?.sound) {
      ui.sound.textContent = sound.on ? "SOUND ON" : "SOUND OFF";
      ui.sound.setAttribute("aria-pressed", String(sound.on));
    }
  }

  /* ---------------------------------------------------------------- 遮罩层 */
  let overlay = null;
  let stage = null;
  let ui = null;
  let controller = null;
  let state = "idle"; /* idle → opening → open → closing → idle */
  let view = "desk";
  let capability = null;
  let unLayout = null;

  function ensureOverlay() {
    if (overlay) {
      overlay.hidden = false;
      return overlay;
    }
    overlay = element("div", "room");
    overlay.id = "room";
    overlay.tabIndex = -1;
    overlay.setAttribute("role", "region");
    overlay.setAttribute("aria-label", "可交互的 3D 房间。顶部导航可以打开各个栏目，LO-FI 切到静态版。");

    stage = element("div", "room-stage");

    const hud = element("header", "room-hud");
    const name = element("p", "room-name");
    name.append(element("span", "cn", "何鹏远"), element("span", "en", "HE PENGYUAN"));
    const nav = element("nav", "room-nav");
    nav.setAttribute("aria-label", "房间导航");
    const navButtons = {};
    for (const item of NAV) {
      const button = element("button", "room-nav-b", item.label);
      button.type = "button";
      button.setAttribute("aria-label", `${item.label} · ${item.sub}`);
      button.addEventListener("click", () => (view === item.view ? openView("desk") : openView(item.view)));
      navButtons[item.view] = button;
      nav.append(button);
    }
    const services = element("a", "room-nav-b room-nav-ext", "SERVICES");
    services.href = "/services/";
    services.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      session.set(SEEN_KEY, "1");
    });
    nav.append(services);
    hud.append(name, nav);

    const panels = {
      about: buildAbout(),
      posts: buildPosts(),
      film: buildFilm(),
      online: buildOnline(),
      work: buildWork(),
    };
    for (const panel of Object.values(panels)) {
      panel.hidden = true;
      panel.inert = true;
    }

    const tip = element("p", "room-tip");
    tip.setAttribute("aria-hidden", "true");

    const dock = element("div", "room-dock");
    const keys = element("p", "room-keys", HINTS.desk);
    const buttons = element("div", "room-btns");
    const back = element("button", "room-btn room-back", "BACK TO DESK · ESC");
    back.type = "button";
    back.hidden = true;
    back.setAttribute("aria-label", "回到桌面（Esc）");
    back.addEventListener("click", () => openView("desk"));
    const play = element("button", "room-btn room-play", "PAUSE");
    play.type = "button";
    play.hidden = true;
    play.addEventListener("click", () => togglePause());
    const next = element("button", "room-btn room-next", "NEXT");
    next.type = "button";
    next.hidden = true;
    next.setAttribute("aria-label", "下一段（→）");
    next.addEventListener("click", () => step(1));
    const credits = element("button", "room-btn room-credits-b", "CREDITS");
    credits.type = "button";
    credits.setAttribute("aria-expanded", "false");
    const soundButton = element("button", "room-btn room-sound", "SOUND OFF");
    soundButton.type = "button";
    soundButton.setAttribute("aria-pressed", "false");
    soundButton.setAttribute("aria-label", "雨声");
    soundButton.addEventListener("click", () => toggleSound());
    const lofi = element("button", "room-btn room-lofi", "LO-FI");
    lofi.type = "button";
    lofi.title = "切到静态版，并记住这个选择";
    lofi.setAttribute("aria-label", "LO-FI：切到静态版，并记住这个选择");
    lofi.addEventListener("click", () => leave({ target: "#top", persist: true }));
    buttons.append(back, play, next, credits, soundButton, lofi);
    dock.append(keys, buttons);

    const creditsPanel = element("div", "room-credits");
    creditsPanel.hidden = true;
    creditsPanel.setAttribute("role", "dialog");
    creditsPanel.setAttribute("aria-label", "Credits");
    [
      ["场景", "程序化建模，没有使用外部模型"],
      ["渲染", "three.js r170 · MIT"],
      ["字体", "Literata · Fira Sans · Fira Code · VT323 · OFL"],
      ["雨声", "浏览器现场合成"],
      ["录像带", "宣传片取自首页；旅行与学习影像只来自已公开的影像档案"],
      ["布局灵感", "Felix Rieseberg 的个人网站 felixrieseberg.com"],
    ].forEach(([key, value]) => {
      const row = element("p", "rc-row");
      row.append(element("b", "", key), element("span", "", value));
      creditsPanel.append(row);
    });
    credits.addEventListener("click", () => {
      creditsPanel.hidden = !creditsPanel.hidden;
      credits.setAttribute("aria-expanded", String(!creditsPanel.hidden));
    });

    const status = element("p", "room-status", "正在布置房间…");
    status.setAttribute("role", "status");

    overlay.append(stage, ...Object.values(panels), hud, tip, creditsPanel, dock, status);
    overlay.addEventListener("keydown", onKey);
    document.body.append(overlay);
    ui = { navButtons, panels, tip, keys, back, play, next, sound: soundButton, credits, creditsPanel };
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

  /* ---------------------------------------------------------------- 视图 */
  function placePanel(id) {
    const panel = ui?.panels[id];
    if (!panel || !controller || id === "work") return;
    const rect = controller.screenRect(id);
    const stageWidth = stage.clientWidth;
    /* 太窄时，按物件真实大小投影出来的屏幕读不清：改成铺满中间的固定面板。 */
    const minWidth = Math.min(420, stageWidth * 0.62);
    /* 录像带的字幕层必须贴着电视屏幕，不能改成铺满的面板。 */
    const fixed = id !== "film" && (!rect || rect.width < minWidth || stageWidth < 720);
    panel.classList.toggle("is-fixed", fixed);
    if (fixed) {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.width = "";
      panel.style.height = "";
      return;
    }
    panel.style.left = `${rect.left.toFixed(1)}px`;
    panel.style.top = `${rect.top.toFixed(1)}px`;
    panel.style.width = `${rect.width.toFixed(1)}px`;
    panel.style.height = `${rect.height.toFixed(1)}px`;
  }

  function closePanels() {
    if (!ui) return;
    for (const panel of Object.values(ui.panels)) {
      panel.classList.remove("is-open");
      panel.inert = true;
      panel.hidden = true;
    }
  }

  let viewToken = 0;
  async function openView(next, { fromHistory = false, tape = null } = {}) {
    if (state !== "open" || !controller) return;
    if (next === view) {
      if (next === "film" && Number.isInteger(tape) && tape !== media.tape) startTape(tape);
      return;
    }
    const previous = view;
    view = next;
    const token = (viewToken += 1);
    if (previous === "film") stopMedia();
    if (next === "film") startTape(Number.isInteger(tape) ? tape : 0);

    closePanels();
    ui.creditsPanel.hidden = true;
    ui.credits.setAttribute("aria-expanded", "false");
    for (const [id, button] of Object.entries(ui.navButtons)) {
      if (id === next) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    ui.keys.textContent = HINTS[next] || "";
    ui.back.hidden = next === "desk";
    ui.back.textContent = next === "work" ? "PUT DOWN NOTEPAD · ESC" : next === "film" ? "EJECT · ESC" : next === "online" ? "HANG UP · ESC" : "BACK TO DESK · ESC";
    ui.play.hidden = next !== "film";
    ui.next.hidden = next !== "film";

    /* 进入某个视图时压一条历史记录，手机上的返回手势就会回到桌面而不是离开网站。 */
    if (!fromHistory) {
      try {
        if (next !== "desk" && previous === "desk") window.history.pushState({ hpyRoom: next }, "");
        else if (next !== "desk") window.history.replaceState({ hpyRoom: next }, "");
        else if (window.history.state?.hpyRoom) window.history.back();
      } catch {
        /* 历史记录不可用就只靠 Esc 和按钮。 */
      }
    }

    const panel = ui.panels[next];
    if (panel && next === "work") {
      /* 记事本不用等镜头：和镜头一起升起来。 */
      panel.hidden = false;
      panel.inert = false;
      requestAnimationFrame(() => panel.classList.add("is-open"));
    }
    await controller.goTo(next);
    if (token !== viewToken || state !== "open") return;

    if (panel && next !== "work") {
      panel.updateClock?.();
      placePanel(next);
      panel.hidden = false;
      panel.inert = false;
      requestAnimationFrame(() => panel.classList.add("is-open"));
    }
    if (panel) panel.querySelector("h2")?.focus({ preventScroll: true });
    else overlay.focus({ preventScroll: true });
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (!ui.creditsPanel.hidden) {
        ui.creditsPanel.hidden = true;
        ui.credits.setAttribute("aria-expanded", "false");
        ui.credits.focus();
      } else if (view !== "desk") {
        openView("desk");
      }
      event.preventDefault();
      return;
    }
    const nav = NAV.find((item) => item.key === key);
    if (nav) {
      openView(view === nav.view ? "desk" : nav.view);
      event.preventDefault();
      return;
    }
    if (key === "l" && view === "desk") {
      controller?.toggleLamp();
      return;
    }
    if (key === "m") {
      toggleSound();
      event.preventDefault();
      return;
    }
    if (view === "film") {
      if (key === " " || key === "spacebar") togglePause();
      else if (key === "arrowright") step(1);
      else if (key === "arrowleft") step(-1);
      else if (/^[1-4]$/.test(key)) openView("film", { tape: Number(key) - 1 });
      else return;
      event.preventDefault();
      return;
    }
    if (view === "about" && /^[1-5]$/.test(key)) {
      openView(FKEYS[Number(key) - 1]);
      event.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(key) && (view === "posts" || view === "online")) {
      const target = ui.panels[view].querySelector(`[data-key="${key}"]`);
      if (target) {
        target.click();
        event.preventDefault();
      }
    }
  }

  function onPick(id, detail = {}) {
    if (id === "tape") {
      toggleSound();
      return;
    }
    if (NAV.some((item) => item.view === id)) {
      openView(id, { tape: detail.tape });
      return;
    }
    const href = LEAVE_LINKS[id];
    if (!href) return;
    if (href.startsWith("#")) {
      leave({ target: href, persist: false });
      return;
    }
    session.set(SEEN_KEY, "1");
    window.location.assign(href);
  }

  function onHover(info) {
    const tip = ui?.tip;
    if (!tip) return;
    if (!info) {
      tip.classList.remove("is-on");
      return;
    }
    tip.textContent = `${info.label} · ${info.sub}${info.external ? " ↗" : ""}`;
    tip.style.transform = `translate3d(${Math.round(info.x + 16)}px, ${Math.round(info.y + 18)}px, 0)`;
    tip.classList.add("is-on");
  }

  function onPopState() {
    if (state !== "open") return;
    const target = window.history.state?.hpyRoom;
    openView(target && target !== view ? target : "desk", { fromHistory: true });
  }

  /* ---------------------------------------------------------------- 进出房间 */
  function teardown() {
    unLayout?.();
    unLayout = null;
    clearItem();
    media.tape = -1;
    controller?.dispose();
    controller = null;
    setSound(false);
    overlay?.remove();
    overlay = null;
    stage = null;
    ui = null;
    view = "desk";
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
          quality: capability?.quality || "high",
          forced,
          reducedMotion: matches("(prefers-reduced-motion: reduce)"),
          posterUrl: POSTER_URL,
          onHover,
          onPick,
          onFail: fail,
        }),
        timeout,
      ]);
      if (state !== "opening") {
        mounted.dispose();
        return;
      }
      controller = mounted;
      unLayout = controller.onLayout(() => {
        if (view !== "desk" && view !== "work") placePanel(view);
      });
      if (!media.tapes.length) media.tapes = collectTapes();
      syncTapes();
      loadArchiveTapes();
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

  function leave({ target, persist }) {
    if (state !== "open" && state !== "opening") return;
    const wasOpening = state === "opening";
    state = "closing";
    if (persist) local.set(PREF_KEY, "off");
    session.set(SEEN_KEY, "1");
    if (view === "film") stopMedia();
    toggleSound(false);
    closePanels();

    setBackgroundInert(false);
    root.setAttribute("data-room", "leaving");

    const section = target && target !== "#top" ? document.querySelector(target) : null;
    if (section) section.scrollIntoView({ block: "start", behavior: "instant" });
    else window.scrollTo(0, 0);
    try {
      window.history.replaceState(null, "", section ? target : window.location.pathname + window.location.search);
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
        view = "desk";
        if (ui) {
          for (const button of Object.values(ui.navButtons)) button.removeAttribute("aria-current");
          ui.keys.textContent = HINTS.desk;
          ui.back.hidden = true;
          ui.play.hidden = true;
          ui.next.hidden = true;
          ui.creditsPanel.hidden = true;
        }
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

    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", (event) => {
      if (!event.persisted || !controller || state !== "open") return;
      controller.reset();
      if (media.tape >= 0) stopMedia();
      view = "desk";
      closePanels();
      controller.start();
    });
    window.addEventListener("pagehide", () => {
      controller?.stop();
      if (view === "film") stopMedia();
      toggleSound(false);
    });

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
