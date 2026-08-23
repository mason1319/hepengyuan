document.documentElement?.classList?.add?.("js");

const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");

function setMenuOpen(isOpen) {
  if (!menuToggle || !mobileNav) return;

  menuToggle.setAttribute("aria-expanded", String(isOpen));
  mobileNav.hidden = !isOpen;

  const label = menuToggle.querySelector(".sr-only");
  if (label) label.textContent = isOpen ? "关闭导航" : "打开导航";
}

function closeMenu({ restoreFocus = false } = {}) {
  setMenuOpen(false);
  if (restoreFocus && menuToggle) menuToggle.focus();
}

if (!menuToggle || !mobileNav) {
  document.documentElement?.classList?.remove?.("js");
} else {
  try {
    setMenuOpen(false);

    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") !== "true";
      setMenuOpen(isOpen);
    });

    mobileNav.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
        closeMenu({ restoreFocus: true });
      }
    });

    document.addEventListener("click", (event) => {
      if (menuToggle.getAttribute("aria-expanded") !== "true") return;
      if (!(event.target instanceof Node)) return;
      if (menuToggle.contains(event.target) || mobileNav.contains(event.target)) return;
      closeMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) closeMenu();
    });
  } catch {
    document.documentElement?.classList?.remove?.("js");
  }
}

const serviceButtons = document.querySelectorAll("[data-service-select]");
const serviceCards = document.querySelectorAll("[data-service-card]");
const selectedServiceStatus = document.querySelector("[data-selected-service]");

serviceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedCard = button.closest("[data-service-card]");
    if (!selectedCard) return;

    serviceCards.forEach((serviceCard) => {
      const isSelected = serviceCard === selectedCard;
      serviceCard.dataset.selected = String(isSelected);

      const selectButton = serviceCard.querySelector("[data-service-select]");
      if (selectButton) selectButton.setAttribute("aria-pressed", String(isSelected));
    });

    const serviceName = selectedCard.dataset.serviceName;
    if (selectedServiceStatus && serviceName) {
      selectedServiceStatus.textContent = `当前关注：${serviceName}`;
    }
  });
});

const copyButton = document.querySelector("[data-copy-contact]");
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

async function copyContactName(trigger = copyButton) {
  if (!copyStatus) return;

  const value = trigger?.dataset.copyValue?.trim() || contactName?.textContent.trim();
  if (!value) return;

  const label = trigger?.dataset.copyLabel?.trim();
  const statusPrefix = label ? `已复制${label}` : "已复制";
  const fallbackPrefix = label ? `请手动复制${label}` : "请手动复制";

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
  copyStatus.textContent = copied ? `${statusPrefix}：${value}` : `${fallbackPrefix}：${value}`;
}

if (copyStatus && copyButtons.length > 0) {
  copyButtons.forEach((button) => {
    button.addEventListener("click", () => copyContactName(button));
  });
}

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

const mediaBoard = document.querySelector("[data-media-feed]");

function safeSitePath(value, fallback = "#media") {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const resolved = new URL(value, window.location.origin);
    return resolved.origin === window.location.origin ? resolved.href : fallback;
  } catch {
    return fallback;
  }
}

function createMediaCard(item) {
  const article = document.createElement("article");
  article.className = "media-entry-card";
  const storyUrl = safeSitePath(item.storyUrl);
  const contentUrl = safeSitePath(item.contentUrl, "");
  const thumbnailUrl = safeSitePath(item.thumbnailUrl, "");
  const visual = document.createElement("a");
  visual.className = "media-entry-visual";
  visual.href = storyUrl;
  visual.setAttribute("aria-label", `查看影像档案：${item.title || "未命名内容"}`);

  if (item.mediaType === "image" && contentUrl) {
    const image = document.createElement("img");
    image.src = contentUrl;
    image.alt = item.alt || item.title || "何鹏远公开旅行照片";
    image.loading = "lazy";
    visual.append(image);
  } else {
    visual.classList.add("is-video");
    if (thumbnailUrl) {
      const image = document.createElement("img");
      image.src = thumbnailUrl;
      image.alt = "";
      image.loading = "lazy";
      visual.append(image);
    }
    const playMark = document.createElement("span");
    playMark.className = "media-entry-play";
    playMark.setAttribute("aria-hidden", "true");
    playMark.textContent = "▶";
    visual.append(playMark);
  }

  const body = document.createElement("div");
  body.className = "media-entry-body";
  const label = document.createElement("p");
  label.className = "media-entry-label";
  label.textContent = `${item.category === "learning" ? "LEARNING" : "TRAVEL"} / ${item.mediaType === "video" ? "VIDEO" : "PHOTO"}`;
  const title = document.createElement("h3");
  const titleLink = document.createElement("a");
  titleLink.href = storyUrl;
  titleLink.textContent = item.title || "未命名影像";
  title.append(titleLink);
  const description = document.createElement("p");
  description.className = "media-entry-description";
  description.textContent = item.description || "查看这条公开影像的完整说明。";
  const meta = document.createElement("p");
  meta.className = "media-entry-meta";
  meta.textContent = [item.country, item.city, item.capturedOn].filter(Boolean).join(" · ") || "地点与时间以详情页公开信息为准";
  body.append(label, title, description, meta);
  article.append(visual, body);
  return article;
}

async function loadPublishedMedia() {
  if (!mediaBoard) return;
  const itemsElement = mediaBoard.querySelector("[data-media-items]");
  if (!itemsElement) return;
  try {
    const response = await fetch(safeSitePath(mediaBoard.dataset.mediaFeed, "/api/media.json"), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) return;
    itemsElement.replaceChildren(...items.map(createMediaCard));
    mediaBoard.dataset.mediaStatus = "published";
    const status = mediaBoard.querySelector("[data-media-feed-status]");
    const title = mediaBoard.querySelector("[data-media-feed-title]");
    if (status) status.textContent = `STATUS / ${items.length} PUBLISHED`;
    if (title) title.textContent = `${items.length} 条本人确认的公开影像。`;
  } catch {
    // 静态空状态仍然完整可读。
  }
}

loadPublishedMedia();
