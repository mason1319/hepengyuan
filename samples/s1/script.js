document.documentElement.classList.add("js");

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
  document.documentElement.classList.remove("js");
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
    document.documentElement.classList.remove("js");
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
const contactName = document.querySelector("[data-contact-name]");
const copyStatus = document.querySelector("[data-copy-status]");
let copyRequestId = 0;

function fallbackCopy(value) {
  const textarea = document.createElement("textarea");
  const previousFocus = document.activeElement;

  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
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
    textarea.setSelectionRange(0, textarea.value.length);
    return Boolean(document.execCommand("copy"));
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}

async function copyContactName() {
  if (!contactName || !copyStatus) return;

  const value = contactName.textContent.trim();
  if (!value) return;

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
  copyStatus.textContent = copied ? `已复制：${value}` : `请手动复制：${value}`;
}

if (copyButton && contactName && copyStatus) {
  copyButton.addEventListener("click", copyContactName);
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
