const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector("#mobile-nav");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const updateHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const closeMenu = () => {
  if (!menuButton || !mobileNav) return;
  menuButton.setAttribute("aria-expanded", "false");
  const label = menuButton.querySelector(".sr-only");
  if (label) label.textContent = "打开导航";
  mobileNav.hidden = true;
  document.body.classList.remove("menu-open");
};

menuButton?.addEventListener("click", () => {
  if (!mobileNav) return;
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  const label = menuButton.querySelector(".sr-only");
  if (label) label.textContent = isOpen ? "打开导航" : "关闭导航";
  mobileNav.hidden = isOpen;
  document.body.classList.toggle("menu-open", !isOpen);
});

mobileNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

window.addEventListener("resize", () => {
  if (window.innerWidth > 860) closeMenu();
});

const revealItems = document.querySelectorAll(".reveal");

if (reducedMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.12 },
  );

  revealItems.forEach((item) => observer.observe(item));
}

const tiltCard = document.querySelector("[data-tilt-card]");

if (tiltCard && !reducedMotion && window.matchMedia("(pointer: fine)").matches) {
  tiltCard.addEventListener("pointermove", (event) => {
    const rect = tiltCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    tiltCard.style.transform = `rotateX(${-y * 4}deg) rotateY(${x * 5}deg) rotateZ(2.2deg)`;
  });

  tiltCard.addEventListener("pointerleave", () => {
    tiltCard.style.transform = "rotate(2.2deg)";
  });
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

function mediaMetaText(item) {
  const location = [item.country, item.city].filter(Boolean).join(" · ");
  const date = typeof item.capturedOn === "string" ? item.capturedOn : "";
  const seconds = Math.round(Number(item.durationSeconds));
  const duration = Number.isFinite(seconds) && seconds > 0
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : "";
  return [location, date, duration].filter(Boolean).join(" / ") || "地点与时间以详情页公开信息为准";
}

function createMediaArchiveCard(item) {
  const article = document.createElement("article");
  article.className = "media-entry-card";

  const storyUrl = safeSitePath(item.storyUrl);
  const contentUrl = safeSitePath(item.contentUrl, "");
  const thumbnailUrl = safeSitePath(item.thumbnailUrl, "");
  const visualLink = document.createElement("a");
  visualLink.className = "media-entry-visual";
  visualLink.href = storyUrl;
  visualLink.setAttribute("aria-label", `查看影像档案：${item.title || "未命名内容"}`);

  if (item.mediaType === "image" && contentUrl) {
    const image = document.createElement("img");
    image.src = contentUrl;
    image.alt = item.alt || item.title || "何鹏远公开旅行照片";
    image.loading = "lazy";
    image.decoding = "async";
    visualLink.append(image);
  } else {
    visualLink.classList.add("is-video");
    if (thumbnailUrl) {
      const image = document.createElement("img");
      image.src = thumbnailUrl;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      visualLink.append(image);
    }
    const playMark = document.createElement("span");
    playMark.className = "media-entry-play";
    playMark.setAttribute("aria-hidden", "true");
    playMark.textContent = "▶";
    visualLink.append(playMark);
  }

  const body = document.createElement("div");
  body.className = "media-entry-body";

  const label = document.createElement("p");
  label.className = "media-entry-label";
  const category = item.category === "learning" ? "LEARNING" : "TRAVEL";
  const mediaType = item.mediaType === "video" ? "VIDEO" : "PHOTO";
  label.textContent = `${category} / ${mediaType}`;

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
  meta.textContent = mediaMetaText(item);

  const detailLink = document.createElement("a");
  detailLink.className = "media-entry-link";
  detailLink.href = storyUrl;
  detailLink.textContent = "查看完整档案 ↗";

  body.append(label, title, description, meta, detailLink);
  article.append(visualLink, body);
  return article;
}

async function loadPublishedMedia() {
  if (!mediaBoard) return;

  const feedUrl = safeSitePath(mediaBoard.dataset.mediaFeed, "/api/media.json");
  const mediaItems = mediaBoard.querySelector("[data-media-items]");
  if (!mediaItems) return;

  try {
    const response = await fetch(feedUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) return;

    mediaItems.replaceChildren(...items.map(createMediaArchiveCard));
    mediaBoard.dataset.mediaStatus = "published";

    const status = mediaBoard.querySelector("[data-media-feed-status]");
    const title = mediaBoard.querySelector("[data-media-feed-title]");
    if (status) status.textContent = `STATUS / ${items.length} PUBLISHED`;
    if (title) title.textContent = `${items.length} 条本人确认的公开影像。`;
  } catch {
    // 静态发布规则本身就是可靠且不会过期的降级内容。
  }
}

loadPublishedMedia();

const contactNote = document.querySelector("[data-contact-note]");
const publicCopyButtons = document.querySelectorAll("[data-copy-public]");
let publicCopyRequestId = 0;

function fallbackPublicCopy(value) {
  const textarea = document.createElement("textarea");
  const previousFocus = document.activeElement;

  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("tabindex", "-1");
  Object.assign(textarea.style, {
    position: "fixed",
    left: "-9999px",
    width: "1px",
    height: "1px",
    opacity: "0",
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

async function copyPublicContact(button) {
  if (!contactNote) return;

  const value = button.dataset.copyValue?.trim();
  const label = button.dataset.copyLabel?.trim() || "账号";
  if (!value) return;

  const requestId = publicCopyRequestId += 1;
  let copied = false;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      copied = true;
    } else {
      copied = fallbackPublicCopy(value);
    }
  } catch {
    if (requestId !== publicCopyRequestId) return;
    copied = fallbackPublicCopy(value);
  }

  if (requestId !== publicCopyRequestId) return;
  contactNote.textContent = copied ? `已复制${label}：${value}` : `请手动复制${label}：${value}`;
}

publicCopyButtons.forEach((button) => {
  button.addEventListener("click", () => copyPublicContact(button));
});

const yearTarget = document.querySelector("[data-current-year]");
if (yearTarget) yearTarget.textContent = String(new Date().getFullYear());
