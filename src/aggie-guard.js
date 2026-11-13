/* Aggie 3A 互动演示的手机保护与诊断。
   游戏本身（R2 public/experiences/aggie-3a-v6.html）是编译好的单文件，没有源码，网站这边不改它；
   Worker 在返回游戏页时把下面这段内联脚本插进 <head> 末尾，赶在游戏脚本之前运行。

   - 电脑：不带 ?debug=1 时立即退出，什么都不做。
   - 手机：把载入进度（#boot-msg 的阶段文字）记在 localStorage。系统因为内存不够把页面杀掉再自动重载时，
     上一次的记录没有正常收尾（没完成、也没离开），这一次就不再启动游戏（window.stop()，免得反复崩溃），
     改为说明停在哪一步，给出“再试一次 / 复制链接 / 返回首页”。
   - 同一阶段停留超过 45 秒：底部提示载入时间过长，可以继续等。
   - 游戏自己报启动失败（window.__fatal）：补上同样的出路。
   - ?debug=1（任何设备）：屏幕左上角显示设备、各阶段耗时和报错，方便截图。

   写成 ES2015 以内的语法（不用 ?. ?? 和无参 catch），旧 iPhone 上游戏脚本解析失败时这段也能跑并记下报错。
   脚本里不能出现反引号和 ${，因为它整个放在模板字符串里。 */

export const AGGIE_GUARD_VERSION = "1";

export const AGGIE_GUARD_SCRIPT = String.raw`(function () {
  "use strict";
  var KEY = "hpy-aggie3a-boot";
  var STALL_MS = 45000;
  var RECENT_MS = 180000;
  var debug = /[?&]debug=1(&|$)/.test(location.search);
  var ua = navigator.userAgent || "";
  var phone = /Android|iPhone|iPad|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
  if (!phone && !debug) return;

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function write(value) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (e) { /* 无痕模式等存不了，就只做本次的超时提示 */ } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* 同上 */ } }

  var start = Date.now();
  var prev = read();
  var recent = !!(prev && !prev.done && start - prev.at < RECENT_MS);
  var crashed = phone && recent && !prev.left;
  var errors = [];

  function remember(message) {
    message = String(message || "").replace(/\s+/g, " ").slice(0, 200);
    if (!message || errors[errors.length - 1] === message) return;
    errors.push(message);
    if (errors.length > 6) errors.shift();
  }
  window.addEventListener("error", function (event) {
    remember((event && event.message) || (event && event.target && event.target.src ? "载入失败 " + event.target.src : "error"));
    if (rec) { rec.err = errors[errors.length - 1]; write(rec); }
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    remember("Promise: " + (reason && reason.message ? reason.message : reason));
  });

  function device() {
    var ios = ua.match(/OS (\d+)[._](\d+)/);
    var android = ua.match(/Android (\d+(?:\.\d+)?)/);
    var name = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : android ? "Android" : phone ? "手机" : "电脑";
    var os = ios && /iPhone|iPad/.test(ua) ? " iOS " + ios[1] + "." + ios[2] : android ? " " + android[1] : "";
    var browser = /MicroMessenger/i.test(ua) ? "微信" : /Quark/i.test(ua) ? "夸克" : /UCBrowser/i.test(ua) ? "UC"
      : /HuaweiBrowser/i.test(ua) ? "华为浏览器" : /MQQBrowser/i.test(ua) ? "QQ 浏览器" : /MiuiBrowser|XiaoMi/i.test(ua) ? "小米浏览器"
      : /VivoBrowser/i.test(ua) ? "vivo 浏览器" : /HeyTapBrowser|OppoBrowser/i.test(ua) ? "OPPO 浏览器" : /EdgA|EdgiOS/i.test(ua) ? "Edge"
      : /CriOS/i.test(ua) ? "Chrome" : /iPhone|iPad/.test(ua) ? "Safari" : /Chrome\//.test(ua) ? "Chrome" : "";
    return name + os + (browser ? " · " + browser : "") + " · " + screen.width + "×" + screen.height + " @" + (window.devicePixelRatio || 1) + "x";
  }
  function seconds(ms) { return Math.max(0, Math.round(ms / 1000)); }
  function stageText() {
    var el = document.getElementById("boot-msg");
    var text = el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
    return text || "载入页面";
  }
  function bootDone() {
    var boot = document.getElementById("boot");
    return !!(window.__ready || (boot && boot.classList.contains("done")));
  }

  /* ---------- 界面 ---------- */
  var STYLE = [
    "#hpy-guard,#hpy-guard *{box-sizing:border-box}",
    "#hpy-guard{position:fixed;z-index:2147483600;left:0;right:0;font-family:'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',system-ui,sans-serif;color:#e8e4da;-webkit-text-size-adjust:100%}",
    "#hpy-guard.is-full{top:0;bottom:0;display:flex;align-items:center;justify-content:center;background:#0b0d0f;padding:24px max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}",
    "#hpy-guard.is-sheet{bottom:0;padding:0 max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}",
    "#hpy-guard .g-card{width:100%;max-width:440px;margin:0 auto;background:#0b0d0f;box-shadow:0 -12px 32px rgba(0,0,0,.6);border:1px solid rgba(232,228,218,.2);border-top:3px solid #ffb347;padding:20px 18px 16px}",
    "#hpy-guard.is-full .g-card{background:transparent;border:0;border-top:3px solid #ffb347;padding:22px 0 0}",
    "#hpy-guard h2{margin:0 0 10px;font-size:20px;line-height:1.35;font-weight:600;color:#ffb347;letter-spacing:.02em}",
    "#hpy-guard p{margin:0 0 10px;font-size:15px;line-height:1.65;color:#e8e4da}",
    "#hpy-guard .g-hint{color:rgba(232,228,218,.72);font-size:14px}",
    "#hpy-guard .g-row{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 10px}",
    "#hpy-guard button{flex:1 1 30%;min-height:44px;padding:10px 12px;font:inherit;font-size:15px;color:#e8e4da;background:transparent;border:1px solid rgba(232,228,218,.4);border-radius:0;cursor:pointer;-webkit-appearance:none;appearance:none}",
    "#hpy-guard button.g-primary{background:#ffb347;border-color:#ffb347;color:#0b0d0f;font-weight:600}",
    "#hpy-guard button:focus-visible{outline:2px solid #ffc977;outline-offset:2px}",
    "#hpy-guard .g-diag{margin:4px 0 0;font-size:12px;line-height:1.5;color:rgba(232,228,218,.5);word-break:break-all}",
    "#hpy-guard-debug{position:fixed;z-index:2147483601;top:max(6px,env(safe-area-inset-top));left:6px;max-width:min(92vw,520px);max-height:46vh;overflow:hidden;padding:6px 8px;background:rgba(0,0,0,.78);color:#9fe870;font:11px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;pointer-events:none}"
  ].join("");
  function ensureBody() {
    if (!document.getElementById("hpy-guard-style")) {
      var style = document.createElement("style");
      style.id = "hpy-guard-style";
      style.textContent = STYLE;
      (document.head || document.documentElement).appendChild(style);
    }
    return document.body || document.documentElement.appendChild(document.createElement("body"));
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function copyLink(button) {
    var link = location.origin + "/aggie-3a/";
    function done(ok) { button.textContent = ok ? "已复制链接" : link; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () { done(true); }, function () { done(fallback()); });
        return;
      }
    } catch (e) { /* 走下面的旧办法 */ }
    done(fallback());
    function fallback() {
      try {
        var input = document.createElement("textarea");
        input.value = link;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        var ok = document.execCommand("copy");
        input.remove();
        return ok;
      } catch (e) { return false; }
    }
  }
  var panel = null;
  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function showPanel(opts) {
    var body = ensureBody();
    closePanel();
    panel = el("div", opts.full ? "is-full" : "is-sheet");
    panel.id = "hpy-guard";
    panel.setAttribute("role", opts.full ? "dialog" : "status");
    if (opts.full) panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "hpy-guard-title");
    var card = el("div", "g-card");
    var title = el("h2", "", opts.title);
    title.id = "hpy-guard-title";
    card.appendChild(title);
    for (var i = 0; i < opts.lines.length; i++) card.appendChild(el("p", i === opts.lines.length - 1 && opts.lines.length > 1 ? "g-hint" : "", opts.lines[i]));
    var row = el("div", "g-row");
    var first = null;
    for (var j = 0; j < opts.actions.length; j++) {
      (function (action) {
        var button = el("button", action.primary ? "g-primary" : "", action.label);
        button.type = "button";
        button.addEventListener("click", function () { action.run(button); });
        row.appendChild(button);
        if (!first) first = button;
      })(opts.actions[j]);
    }
    card.appendChild(row);
    card.appendChild(el("p", "g-diag", opts.diag));
    panel.appendChild(card);
    body.appendChild(panel);
    if (opts.full && first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
  }
  var RETRY = { label: "再试一次", primary: true, run: function () { location.reload(); } };
  var COPY = { label: "复制链接", run: copyLink };
  var HOME = { label: "返回首页", run: function () { location.href = "/"; } };
  function diagLine(what, attempt, err) {
    return "诊断：" + device() + " · 第 " + attempt + " 次 · " + what + (err ? " · " + err : "");
  }

  /* ---------- 上一次被系统中止：这次不启动游戏 ---------- */
  if (crashed) {
    prev.left = true;
    write(prev);
    try { window.stop(); } catch (e) { /* 停不下来也照样给出说明 */ }
    var showCrash = function () {
      showPanel({
        full: true,
        title: "这台手机没能载入这部 3D 演示",
        lines: [
          "上次载入停在「" + (prev.stage || "载入页面") + "」时，页面被系统中止了。通常是手机的可用内存或图形性能不够——这是按电脑规格做的 3A 互动演示。",
          "在电脑浏览器打开 hepengyuan.com/aggie-3a/ 体验最好；也可以关掉其他标签页和应用后再试一次。"
        ],
        actions: [RETRY, COPY, HOME],
        diag: diagLine("约第 " + seconds((prev.seen || prev.stageAt || prev.at) - prev.at) + " 秒中止于「" + (prev.stage || "载入页面") + "」", prev.attempt || 1, prev.err)
      });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showCrash);
    showCrash();
    return;
  }

  /* ---------- 正常载入：记录进度、超时提示、启动失败 ---------- */
  var rec = { at: start, seen: start, stage: "载入页面", stageAt: start, attempt: recent ? (prev.attempt || 1) + 1 : 1, done: false, left: false, err: "" };
  var timeline = [[0, rec.stage]];
  write(rec);
  window.addEventListener("pagehide", function () {
    if (rec.done) return;
    rec.left = true;
    write(rec);
  });
  window.addEventListener("pageshow", function (event) {
    if (event.persisted && !rec.done) { rec.left = false; write(rec); }
  });

  var stallFor = null;
  var debugBox = null;
  function renderDebug(now) {
    if (!debug) return;
    if (!debugBox) {
      ensureBody();
      debugBox = el("div");
      debugBox.id = "hpy-guard-debug";
      document.body.appendChild(debugBox);
    }
    var lines = ["HPY guard v1 · " + device(), "t=" + ((now - start) / 1000).toFixed(1) + "s · " + (rec.done ? "完成" : rec.stage)];
    for (var i = Math.max(0, timeline.length - 9); i < timeline.length; i++) lines.push("+" + (timeline[i][0] / 1000).toFixed(1) + "s " + timeline[i][1]);
    if (prev) lines.push("上次：" + (prev.done ? "完成" : (prev.left ? "离开" : "未完成")) + " · 「" + prev.stage + "」 · 第 " + (prev.attempt || 1) + " 次");
    var gameErrors = window.__errors && window.__errors.length ? window.__errors : [];
    var all = errors.concat(gameErrors.slice(-3));
    for (var j = Math.max(0, all.length - 4); j < all.length; j++) lines.push("错误：" + String(all[j]).slice(0, 160));
    debugBox.textContent = lines.join("\n");
  }

  var timer = setInterval(tick, 500);
  function tick() {
    var now = Date.now();
    if (rec.done) { renderDebug(now); return; }
    var text = stageText();
    if (text !== rec.stage) {
      rec.stage = text;
      rec.stageAt = now;
      rec.seen = now;
      timeline.push([now - start, text]);
      write(rec);
      if (stallFor) { stallFor = null; closePanel(); }
    } else if (now - rec.seen >= 2000) {
      /* 心跳：被系统杀掉时，下次能说出大概在第几秒中止。 */
      rec.seen = now;
      write(rec);
    }
    if (window.__fatal) {
      rec.done = true;
      clear();
      showPanel({
        full: false,
        title: "3D 演示没能启动",
        lines: ["这台手机的浏览器没能启动 3D 画面，通常是不支持 WebGL 2，或图形驱动出错。", "在电脑浏览器打开 hepengyuan.com/aggie-3a/ 体验最好。"],
        actions: [RETRY, COPY, HOME],
        diag: diagLine("第 " + seconds(now - start) + " 秒失败于「" + rec.stage + "」", rec.attempt, String(window.__fatal).split("\n")[0].slice(0, 120))
      });
      if (!debug) clearInterval(timer);
      renderDebug(now);
      return;
    }
    if (bootDone()) {
      rec.done = true;
      clear();
      timeline.push([now - start, "完成"]);
      if (stallFor) { stallFor = null; closePanel(); }
      if (!debug) clearInterval(timer);
      renderDebug(now);
      return;
    }
    if (!stallFor && now - rec.stageAt > STALL_MS) {
      stallFor = rec.stage;
      var waited = now - rec.stageAt;
      showPanel({
        full: false,
        title: "载入时间有点长",
        lines: ["已经在「" + rec.stage + "」停了 " + seconds(waited) + " 秒。手机内存或图形性能不够时，可能一直进不去；也可以再等一会儿。", "在电脑浏览器打开 hepengyuan.com/aggie-3a/ 体验最好。"],
        actions: [
          { label: "继续等待", primary: true, run: function () { closePanel(); rec.stageAt = Date.now(); stallFor = null; } },
          COPY,
          HOME
        ],
        diag: diagLine("已载入 " + seconds(now - start) + " 秒", rec.attempt, errors[errors.length - 1])
      });
    }
    renderDebug(now);
  }
})();`;

export const AGGIE_GUARD_TAG = '<script id="hpy-aggie-guard" data-version="' + AGGIE_GUARD_VERSION + '">' + AGGIE_GUARD_SCRIPT + "</script>";
