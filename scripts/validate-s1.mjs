import { readFile } from "node:fs/promises";

const file = "samples/s1/index.html";
const cssFile = "samples/s1/styles.css";
const scriptFile = "samples/s1/script.js";
const failures = [];
let html = "";
let css = "";
let script = "";

const serviceCards = [
  { id: "consulting", name: "入门咨询", kicker: "问清需求", points: ["需求诊断", "工具建议", "风险提醒"] },
  { id: "setup", name: "环境协助", kicker: "装好环境", points: ["安装配置", "故障排查", "上手指导"] },
  { id: "workflow", name: "工作流搭建", kicker: "跑通流程", points: ["流程梳理", "自动化建议", "交付说明"] },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
}

function getAttribute(tag, attribute) {
  const pattern = new RegExp(
    "(?:^|\\s)" + escapeRegExp(attribute) + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
    "i",
  );
  const match = tag.match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

function hasAttribute(tag, attribute, value) {
  if (value !== undefined) return getAttribute(tag, attribute) === value;
  return new RegExp("(?:^|\\s)" + escapeRegExp(attribute) + "(?=\\s|=|>|/>)", "i").test(tag);
}

function hasClass(tag, className) {
  const classValue = getAttribute(tag, "class");
  return classValue ? classValue.split(/\s+/).includes(className) : false;
}

function openingTags(content, tagName) {
  return [...content.matchAll(new RegExp("<" + tagName + "\\b[^>]*>", "gi"))].map((match) => match[0]);
}

function extractElements(content, tagName) {
  return [...content.matchAll(new RegExp("<" + tagName + "\\b[^>]*>[\\s\\S]*?<\\/" + tagName + "\\s*>", "gi"))].map((match) => ({
    html: match[0],
    openTag: match[0].match(new RegExp("^<" + tagName + "\\b[^>]*>", "i"))[0],
  }));
}

function elementText(element) {
  return element.html.replace(/^<[^>]*>/, "").replace(/<\/[^>]*>\s*$/, "");
}

function extractSection(content, id) {
  const openingPattern = new RegExp(
    "<section\\b(?=[^>]*\\bid\\s*=\\s*[\"']" + escapeRegExp(id) + "[\"'])[^>]*>",
    "i",
  );
  const openingMatch = content.match(openingPattern);
  if (!openingMatch || openingMatch.index === undefined) return null;

  const remainder = content.slice(openingMatch.index + openingMatch[0].length);
  const closingMatch = remainder.match(/<\/section\s*>/i);
  if (!closingMatch || closingMatch.index === undefined) return null;

  const end = openingMatch.index + openingMatch[0].length + closingMatch.index + closingMatch[0].length;
  return content.slice(openingMatch.index, end);
}

function extractElement(content, tagName, className) {
  return extractElements(content, tagName).find((element) => hasClass(element.openTag, className))?.html ?? null;
}

function decodeEntities(content) {
  const namedEntities = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    "#39": "'",
    yen: "¥",
  };
  const decodedNumbers = content.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (match, hex, decimal) => {
    const codePoint = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
    try {
      return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : match;
    } catch {
      return match;
    }
  });
  return decodedNumbers.replace(/&(nbsp|amp|lt|gt|quot|#39|yen);/gi, (match, name) => namedEntities[name.toLowerCase()] ?? match);
}

function normalizeVisibleText(content) {
  return decodeEntities(
    content
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ""),
  )
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function splitClauses(text) {
  return text.split(/[。！？!?；;，,]+/).map((clause) => clause.trim()).filter(Boolean);
}

function allMatches(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const matcher = new RegExp(pattern.source, flags);
  const matches = [];
  let match;

  while ((match = matcher.exec(text))) {
    matches.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) matcher.lastIndex += 1;
  }

  return matches;
}

function hasUncoveredPositiveOccurrence(text, pattern, negationPattern) {
  return splitClauses(text).some((clause) => {
    const negations = allMatches(clause, negationPattern);
    return allMatches(clause, pattern).some((positive) => (
      !negations.some((negation) => positive.start >= negation.start && positive.start < negation.end)
    ));
  });
}

function findComplianceViolations(content) {
  const visibleText = normalizeVisibleText(content);
  const compliancePatterns = [
    {
      label: "forbidden claim",
      pattern: /官方\s*充值|官方\s*渠道|OpenAI\s*官方|Anthropic\s*官方|官方\s*授权|官方\s*代理|销量|客户\s*案例|立即\s*支付|购买\s*账号|充值\s*套餐/i,
      negation: /(?:不提供|不属于|并非|不是|非)\s*(?:任何形式的)?(?:官方\s*充值|官方\s*渠道|OpenAI\s*官方|Anthropic\s*官方|官方\s*授权|官方\s*代理)/i,
    },
    {
      label: "price commitment",
      pattern: /[$¥￥]\s*\d+(?:[.,]\d+)?|\d+(?:\.\d+)?\s*元|(?:人民币|RMB|CNY)\s*\d+(?:[.,]\d+)?|(?:报价|售价|限时价|套餐价|低至|仅需)\s*(?:(?:人民币|RMB|CNY)\s*|[$¥￥]\s*)?\d+(?:[.,]\d+)?/i,
      negation: /(?:不展示|不提供|不标注|未公布)(?:任何形式的|任何|公开的|服务中的)?(?:价格|报价|售价|限时价|套餐价|低至|仅需|人民币|RMB|CNY|[$¥￥])/i,
    },
    {
      label: "timing or delivery commitment",
      pattern: /即时到账|秒到|\d+\s*(?:秒|分钟|小时|天)(?:内)?\s*到账|\d+\s*h\s*到账|当天到账|永久使用|无限时长/i,
      negation: /(?:不承诺|不提供)(?:任何形式的|任何|相关|上述|服务中的)?(?:即时到账|秒到|\d+\s*(?:秒|分钟|小时|天)(?:内)?\s*到账|\d+\s*h\s*到账|当天到账|永久使用|无限时长)/i,
    },
    {
      label: "result or guarantee commitment",
      pattern: /保证成功|确保成功|包成功|承诺有效|成功率\s*\d+(?:[.,]\d+)?%?|百分百|100%|零风险|绝对安全|问题有保障|永久免费/i,
      negation: /不保证成功|(?:不承诺|绝不会)(?:向(?:你|用户|客户|任何人))?(?:作出|给予|提供|承诺)?(?:任何)?(?:形式的)?(?:保证成功|确保成功|包成功|承诺有效)/i,
    },
  ];
  const violations = [];

  for (const { label, pattern, negation } of compliancePatterns) {
    if (hasUncoveredPositiveOccurrence(visibleText, pattern, negation)) violations.push(label);
  }
  return violations;
}

function validateMobileNavigation(content) {
  const issues = [];
  const allTags = openingTags(content, "[a-z][\\w-]*");
  const toggleHooks = allTags.filter((tag) => hasAttribute(tag, "data-menu-toggle"));
  const mobileNavHooks = allTags.filter((tag) => hasAttribute(tag, "data-mobile-nav"));
  const mobileNavIds = allTags.filter((tag) => hasAttribute(tag, "id", "mobile-nav"));
  if (toggleHooks.length !== 1) {
    issues.push("expected exactly one [data-menu-toggle] element, found " + toggleHooks.length);
  }
  if (mobileNavHooks.length !== 1) {
    issues.push("expected exactly one [data-mobile-nav] element, found " + mobileNavHooks.length);
  }
  if (mobileNavIds.length !== 1) {
    issues.push("expected exactly one [id=mobile-nav] element, found " + mobileNavIds.length);
  }
  if (toggleHooks.length !== 1 || mobileNavHooks.length !== 1 || mobileNavIds.length !== 1) return issues;

  const toggles = extractElements(content, "button").filter((button) => button.openTag === toggleHooks[0]);
  if (toggles.length !== 1 || !hasAttribute(toggles[0].openTag, "type", "button")) {
    issues.push("data-menu-toggle must belong to one button[type=button]");
    return issues;
  }
  const mobileNavs = extractElements(content, "nav").filter((nav) => nav.openTag === mobileNavHooks[0]);
  if (mobileNavs.length !== 1 || mobileNavHooks[0] !== mobileNavIds[0] || !hasAttribute(mobileNavs[0].openTag, "hidden")) {
    issues.push("data-mobile-nav and id=mobile-nav must belong to the same hidden nav");
    return issues;
  }

  const toggle = toggles[0];
  if (!hasAttribute(toggle.openTag, "aria-expanded", "false")) {
    issues.push("mobile menu toggle must have aria-expanded=false");
  }
  if (getAttribute(toggle.openTag, "aria-controls") !== "mobile-nav") {
    issues.push("mobile menu toggle aria-controls must reference mobile-nav");
  }

  const ariaLabel = getAttribute(toggle.openTag, "aria-label");
  const srOnlyLabels = extractElements(toggle.html, "span").filter((span) => (
    hasClass(span.openTag, "sr-only") && normalizeVisibleText(elementText(span)) === "打开导航"
  ));
  if (!ariaLabel?.trim() && srOnlyLabels.length === 0) {
    issues.push("mobile menu toggle must have an accessible name");
  }

  const approvedLinks = [
    ["#services", "服务方案"],
    ["#process", "交付流程"],
    ["#faq", "常见问题"],
    ["#contact", "咨询方案"],
  ];
  const links = extractElements(mobileNavs[0].html, "a");
  if (links.length !== approvedLinks.length) {
    issues.push("mobile navigation must contain exactly 4 approved links, found " + links.length);
  }
  for (const [href, text] of approvedLinks) {
    const matches = links.filter((link) => (
      getAttribute(link.openTag, "href") === href && normalizeVisibleText(elementText(link)) === text
    ));
    if (matches.length !== 1) {
      issues.push("mobile navigation must contain one approved link: " + text + " -> " + href);
    }
  }
  return issues;
}

function validateServiceCards(content) {
  const issues = [];
  const servicesSection = extractSection(content, "services");
  if (!servicesSection) {
    issues.push("services section cannot be extracted");
    return issues;
  }

  const cardArticles = extractElements(servicesSection, "article").filter((article) => hasClass(article.openTag, "service-card"));
  if (cardArticles.length !== 3) {
    issues.push("expected exactly 3 article.service-card elements in #services, found " + cardArticles.length);
  }

  for (const card of serviceCards) {
    const matchingCards = cardArticles.filter((article) => hasAttribute(article.openTag, "data-service-card", card.id));
    if (matchingCards.length !== 1) {
      issues.push("expected exactly one service card with data-service-card=\"" + card.id + "\", found " + matchingCards.length);
      continue;
    }

    const cardElement = matchingCards[0];
    const cardHtml = cardElement.html;
    if (!hasAttribute(cardElement.openTag, "data-service-name", card.name) || !hasAttribute(cardElement.openTag, "data-selected", "false")) {
      issues.push(card.name + " card must have data-service-name and data-selected=\"false\"");
    }
    const kickers = extractElements(cardHtml, "span").filter((span) => (
      hasClass(span.openTag, "service-kicker") && normalizeVisibleText(elementText(span)) === card.kicker
    ));
    if (kickers.length !== 1) issues.push(card.name + " must have one service-kicker: " + card.kicker);

    const headings = extractElements(cardHtml, "h3");
    if (headings.length !== 1 || normalizeVisibleText(elementText(headings[0] ?? { html: "" })) !== card.name) {
      issues.push(card.name + " must have one matching h3");
    }

    const listItems = extractElements(cardHtml, "li");
    if (listItems.length !== 3) {
      issues.push(card.name + " must contain exactly 3 li elements, found " + listItems.length);
    }
    const itemTexts = listItems.map((item) => normalizeVisibleText(elementText(item)));
    for (const point of card.points) {
      if (itemTexts.filter((text) => text === point).length !== 1) {
        issues.push(card.name + " must contain approved point exactly once: " + point);
      }
    }

    const buttons = extractElements(cardHtml, "button");
    if (buttons.length !== 1) {
      issues.push(card.name + " must contain exactly one button, found " + buttons.length);
    } else if (
      !hasAttribute(buttons[0].openTag, "type", "button")
      || !hasAttribute(buttons[0].openTag, "data-service-select")
      || !hasAttribute(buttons[0].openTag, "aria-pressed", "false")
      || normalizeVisibleText(elementText(buttons[0])) !== "按需求评估"
    ) {
      issues.push(card.name + " assessment button is missing or invalid");
    }
    if (buttons.some((button) => extractElements(button.html, "h3").length > 0 || extractElements(button.html, "ul").length > 0)) {
      issues.push(card.name + " must not place headings or lists inside its button");
    }

    if (openingTags(cardHtml, "[a-z][\\w-]*").some((tag) => hasClass(tag, "card-number"))) {
      issues.push(card.name + " must not include a .card-number element");
    }
    if (/(?:^|>)[\s\r\n]*0[1-3][\s\r\n]*(?:<|$)/.test(cardHtml)) {
      issues.push(card.name + " must not include an independent 01/02/03 number");
    }
  }

  return issues;
}

function replaceFirst(content, pattern, replacement) {
  let changed = false;
  const result = content.replace(pattern, (...args) => {
    changed = true;
    return typeof replacement === "function" ? replacement(...args) : replacement;
  });
  return { changed, content: result };
}

function hasDuplicateCountIssue(issues, selector) {
  const pattern = new RegExp("^expected exactly one " + escapeRegExp(selector) + " element, found (\\d+)$");
  return issues.some((issue) => {
    const match = issue.match(pattern);
    return match && Number(match[1]) > 1;
  });
}

function stripCssComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, "");
}

function scanCssUntil(content, start, targets) {
  let quote = null;
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;

  for (let index = start; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    if (character === ")") parentheses = Math.max(0, parentheses - 1);
    if (character === "[") brackets += 1;
    if (character === "]") brackets = Math.max(0, brackets - 1);
    if (parentheses === 0 && brackets === 0 && targets.has(character)) return index;
  }

  return -1;
}

function findClosingBrace(content, openingIndex) {
  let depth = 1;
  let quote = null;
  let escaped = false;

  for (let index = openingIndex + 1; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function splitCssOutside(content, delimiter) {
  const parts = [];
  let cursor = 0;
  let next = scanCssUntil(content, cursor, new Set([delimiter]));
  while (next !== -1) {
    parts.push(content.slice(cursor, next));
    cursor = next + 1;
    next = scanCssUntil(content, cursor, new Set([delimiter]));
  }
  parts.push(content.slice(cursor));
  return parts;
}

function normalizeCssSelector(selector) {
  return selector.trim().replace(/\s+/g, " ");
}

function parseCssDeclarations(content) {
  const declarations = new Map();
  for (const rawDeclaration of splitCssOutside(content, ";")) {
    const colon = scanCssUntil(rawDeclaration, 0, new Set([":"]));
    if (colon === -1) continue;
    const property = rawDeclaration.slice(0, colon).trim().toLowerCase();
    const value = rawDeclaration.slice(colon + 1).trim();
    if (property && value) declarations.set(property, value);
  }
  return declarations;
}

function parseCssRules(content) {
  const clean = stripCssComments(content);
  const rules = [];
  const order = { value: 0 };

  function parseBlock(block, media) {
    let cursor = 0;
    while (cursor < block.length) {
      const boundary = scanCssUntil(block, cursor, new Set(["{", ";"]));
      if (boundary === -1) {
        if (block.slice(cursor).trim()) throw new Error("unexpected trailing CSS");
        break;
      }
      if (block[boundary] === ";") {
        cursor = boundary + 1;
        continue;
      }

      const prelude = block.slice(cursor, boundary).trim();
      const closing = findClosingBrace(block, boundary);
      if (closing === -1) throw new Error("unbalanced CSS block: " + prelude.slice(0, 60));
      const body = block.slice(boundary + 1, closing);

      if (/^@media\b/i.test(prelude)) {
        parseBlock(body, [...media, prelude.replace(/^@media\s*/i, "").trim()]);
      } else if (/^@(supports|layer|container|document)\b/i.test(prelude)) {
        parseBlock(body, media);
      } else if (!prelude.startsWith("@")) {
        const declarations = parseCssDeclarations(body);
        const sourceOrder = order.value;
        order.value += 1;
        for (const selector of splitCssOutside(prelude, ",").map(normalizeCssSelector).filter(Boolean)) {
          rules.push({ selector, declarations, media: [...media], sourceOrder });
        }
      }

      cursor = closing + 1;
    }
  }

  parseBlock(clean, []);
  return rules;
}

function mediaApplies(rule, width, reducedMotion = false) {
  return rule.media.every((condition) => {
    if (/prefers-reduced-motion\s*:\s*reduce/i.test(condition)) return reducedMotion;
    if (/prefers-reduced-motion/i.test(condition)) return false;
    if (/\bprint\b/i.test(condition)) return false;
    const maximums = [...condition.matchAll(/max-width\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((match) => Number(match[1]));
    const minimums = [...condition.matchAll(/min-width\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((match) => Number(match[1]));
    return maximums.every((maximum) => width <= maximum) && minimums.every((minimum) => width >= minimum);
  });
}

function exactRules(rules, selector) {
  const normalized = normalizeCssSelector(selector);
  return rules.filter((rule) => rule.selector === normalized);
}

function effectiveDeclarations(rules, selector, width = 1440, reducedMotion = false) {
  const declarations = new Map();
  for (const rule of exactRules(rules, selector).filter((item) => mediaApplies(item, width, reducedMotion))) {
    for (const [property, value] of rule.declarations) declarations.set(property, value);
  }
  return declarations;
}

function hasMediaMaximum(rule, width) {
  return rule.media.some((condition) => new RegExp("max-width\\s*:\\s*" + width + "px", "i").test(condition));
}

function isHardOverflowLock(value) {
  return /^(?:hidden|clip)(?:\s*!important)?$/i.test(value ?? "");
}

function isMenuOpenBodySelector(selector) {
  return /body\.menu-open(?:\b|[.#[:])/i.test(selector)
    || /\.menu-open(?:\b|[.#[:])[^,{]*[\s>+~]body(?:\b|[.#[:])/i.test(selector);
}

function validateStyles(content, options = {}) {
  const { runRegressions = true } = options;
  const issues = [];
  const clean = stripCssComments(content);
  let rules = [];

  try {
    rules = parseCssRules(content);
  } catch (error) {
    return ["CSS parser error: " + error.message];
  }

  const tokens = [
    ["--orange", "#ff5312"],
    ["--ink", "#111111"],
    ["--paper", "#fffdf7"],
    ["--yellow", "#ffce19"],
    ["--blue", "#2e7eea"],
    ["--purple", "#7239dd"],
    ["--cream", "#f7f1e7"],
  ];
  const rootDeclarations = effectiveDeclarations(rules, ":root");
  for (const [token, value] of tokens) {
    if (rootDeclarations.get(token) !== value) issues.push("color token " + token + " must be exactly " + value);
  }

  const requiredSelectors = [
    ".site-header", ".brand", ".desktop-nav", ".header-cta", ".menu-toggle", "#mobile-nav",
    ".hero", ".hero-copy", ".hero-actions", ".burst-lines", ".comic-bubble", ".hero-portrait", ".portrait-sticker",
    ".button", ".button-primary", ".button-secondary", ".trust-strip", ".trust-strip ul", ".trust-strip li",
    ".services", ".section-heading", ".service-grid", ".service-card", ".service-kicker", ".service-select", ".service-disclaimer",
    ".process", ".process-list", ".process-number", ".faq", ".faq-list", ".contact", ".contact-copy",
  ];
  for (const selector of requiredSelectors) {
    if (exactRules(rules, selector).length === 0) issues.push("missing exact selector-list entry " + selector);
  }

  for (const width of [900, 640]) {
    if (!rules.some((rule) => hasMediaMaximum(rule, width))) issues.push("missing responsive breakpoint " + width + "px");
  }

  const touchSelectors = [".brand", ".button", ".header-cta", ".menu-toggle", ".service-select", ".contact-copy button", "summary", "#mobile-nav a"];
  for (const selector of touchSelectors) {
    const minimumHeight = effectiveDeclarations(rules, selector).get("min-height");
    if (!/^(?:2\.75rem|44px)$/i.test(minimumHeight ?? "")) {
      issues.push("touch target must have an explicit 44px minimum height: " + selector);
    }
  }

  for (const selector of ["a", "button"]) {
    if (effectiveDeclarations(rules, selector).get("touch-action") !== "manipulation") {
      issues.push(selector + " must set touch-action: manipulation");
    }
  }

  const typographySelectors = [".desktop-nav", ".header-cta", ".button", ".service-select", "#mobile-nav a", ".contact-copy button"];
  for (const selector of typographySelectors) {
    const declarations = effectiveDeclarations(rules, selector);
    for (const property of ["font-size", "font-weight", "line-height"]) {
      if (!declarations.has(property)) issues.push(selector + " must explicitly set " + property);
    }
  }

  const focusDeclarations = effectiveDeclarations(rules, ":focus-visible");
  const focusRules = exactRules(rules, ":focus-visible").filter((rule) => mediaApplies(rule, 1440));
  const finalFocusOrder = focusRules.at(-1)?.sourceOrder ?? -1;
  const finalComponentOrder = Math.max(...rules.filter((rule) => (
    [".header-cta", ".button", ".menu-toggle", ".service-select", ".contact-copy button"].includes(rule.selector)
  )).map((rule) => rule.sourceOrder));
  if (!/^(?:2px|3px)\s+solid\s+var\(--ink\)$/i.test(focusDeclarations.get("outline") ?? "")
    || !/^0\s+0\s+0\s+(?:3px|4px)\s+var\(--yellow\)\s*!important$/i.test(focusDeclarations.get("box-shadow") ?? "")
    || !/^none\s*!important$/i.test(focusDeclarations.get("transition") ?? "")
    || finalFocusOrder <= finalComponentOrder) {
    issues.push(":focus-visible must finish the cascade with an immediate black outline and !important yellow outer ring");
  }

  const skipLink = effectiveDeclarations(rules, ".skip-link");
  const focusedSkipLink = effectiveDeclarations(rules, ".skip-link:focus");
  if (skipLink.get("position") !== "fixed" || focusedSkipLink.get("transform") !== "translateY(0)") {
    issues.push("skip link must stay off-canvas until focused");
  }

  if (effectiveDeclarations(rules, ".reveal").get("opacity") !== "1") {
    issues.push(".reveal must be visible by default");
  }
  if (effectiveDeclarations(rules, ".js .reveal").get("opacity") !== "0") {
    issues.push(".js .reveal must provide the enhanced hidden state");
  }
  if (effectiveDeclarations(rules, ".js .reveal.is-visible").get("opacity") !== "1") {
    issues.push(".js .reveal.is-visible must restore visibility");
  }
  const reducedReveal = effectiveDeclarations(rules, ".js .reveal", 1440, true);
  const reducedUniversal = effectiveDeclarations(rules, "*", 1440, true);
  if (reducedReveal.get("opacity") !== "1"
    || !/^none\s*!important$/i.test(reducedUniversal.get("animation") ?? "")
    || !/^none\s*!important$/i.test(reducedUniversal.get("transition") ?? "")) {
    issues.push("reduced-motion mode must show reveal content without animation");
  }

  for (const [position, token] of [[1, "--blue"], [2, "--purple"], [3, "--orange"]]) {
    const declarations = effectiveDeclarations(rules, ".service-card:nth-child(" + position + ")");
    if (declarations.get("--card-accent") !== "var(" + token + ")"
      || !/var\(--(?:blue|purple|orange)\)/.test(declarations.get("box-shadow") ?? "")) {
      issues.push("service card " + position + " must use its approved accent in a hard shadow");
    }
  }
  const selectedCard = effectiveDeclarations(rules, '.service-card[data-selected="true"]');
  if (!selectedCard.has("transform") || !selectedCard.has("box-shadow")) {
    issues.push("selected service cards need an explicit pressed visual state");
  }

  for (const selector of [".header-cta", ".button-primary", "#mobile-nav a:last-child", ".contact-copy button"]) {
    if (effectiveDeclarations(rules, selector).get("color") !== "var(--ink)") {
      issues.push(selector + " must use ink text on orange");
    }
  }
  const kickerColors = [
    [".service-card:nth-child(1) .service-kicker", "var(--ink)"],
    [".service-card:nth-child(2) .service-kicker", "var(--paper)"],
    [".service-card:nth-child(3) .service-kicker", "var(--ink)"],
  ];
  for (const [selector, color] of kickerColors) {
    if (effectiveDeclarations(rules, selector).get("color") !== color) {
      issues.push(selector + " must use the approved contrast color " + color);
    }
  }

  const genericServiceHover = effectiveDeclarations(rules, ".service-select:hover");
  const purpleServiceHover = effectiveDeclarations(rules, ".service-card:nth-child(2) .service-select:hover");
  const selectedServiceHoverSelector = '.service-card[data-selected="true"] .service-select:hover';
  const selectedServiceHover = effectiveDeclarations(rules, selectedServiceHoverSelector);
  const purpleHoverOrder = exactRules(rules, ".service-card:nth-child(2) .service-select:hover").at(-1)?.sourceOrder ?? -1;
  const selectedHoverOrder = exactRules(rules, selectedServiceHoverSelector).at(-1)?.sourceOrder ?? -1;
  if (genericServiceHover.get("color") !== "var(--ink)") {
    issues.push("generic service-select hover must use ink text");
  }
  if (purpleServiceHover.get("color") !== "var(--paper)") {
    issues.push("purple service-select hover must use paper text");
  }
  if (selectedServiceHover.get("background") !== "var(--yellow)"
    || selectedServiceHover.get("color") !== "var(--ink)"
    || selectedHoverOrder <= purpleHoverOrder) {
    issues.push("selected service-select hover must finish with yellow background and ink text");
  }

  for (const width of [640, 900]) {
    const responsiveHero = effectiveDeclarations(rules, ".hero", width);
    if (!/^"copy"\s+"portrait"\s+"actions"$/i.test(responsiveHero.get("grid-template-areas") ?? "")) {
      issues.push(width + "px hero must finally order copy, portrait, then actions");
    }
    const responsivePortraitMargin = effectiveDeclarations(rules, ".hero-portrait", width).get("margin-bottom") ?? "";
    if (!/^clamp\(\s*16px\s*,/i.test(responsivePortraitMargin)) {
      issues.push(width + "px portrait-to-actions gap must use clamp with a 16px floor");
    }
  }
  if (effectiveDeclarations(rules, ".hero-copy").get("grid-area") !== "copy"
    || effectiveDeclarations(rules, ".hero-portrait").get("grid-area") !== "portrait"
    || effectiveDeclarations(rules, ".hero-actions").get("grid-area") !== "actions") {
    issues.push("hero children must declare named grid areas");
  }

  const mobileStates = [
    ["html:not(.js) .site-header", "position", "static", "no-JS fallback header must not obscure anchor targets"],
    [".menu-toggle", "display", "none", "no-JS menu toggle must remain hidden"],
    ["#mobile-nav[hidden]", "display", "grid", "no-JS fallback navigation must override hidden and stay visible"],
    ["#mobile-nav", "position", "static", "no-JS fallback navigation must participate in header layout"],
    [".js .site-header", "position", "sticky", "enhanced header must remain sticky"],
    [".js .menu-toggle", "display", "grid", "enhanced mode must show the menu toggle"],
    [".js #mobile-nav[hidden]", "display", "none", "enhanced mode must hide the collapsed mobile navigation"],
    [".js #mobile-nav", "position", "absolute", "enhanced mobile navigation must open as a compact overlay"],
  ];
  for (const width of [640, 900]) {
    for (const [selector, property, expected, message] of mobileStates) {
      if (effectiveDeclarations(rules, selector, width).get(property) !== expected) {
        issues.push(width + "px: " + message);
      }
    }
  }

  const forbiddenEffects = [
    [/\b(?:linear|radial|conic)-gradient\s*\(/i, "CSS gradients are forbidden"],
    [/\bbackdrop-filter\s*:/i, "backdrop-filter is forbidden"],
  ];
  for (const [pattern, message] of forbiddenEffects) {
    if (pattern.test(clean)) issues.push(message);
  }
  for (const rule of rules.filter((item) => isMenuOpenBodySelector(item.selector))) {
    if (["overflow", "overflow-x", "overflow-y"].some((property) => isHardOverflowLock(rule.declarations.get(property)))) {
      issues.push("menu-open state must not lock body overflow");
      break;
    }
  }

  if (runRegressions && issues.length === 0) {
    const regressions = [
      [
        "mobile grid spoof",
        content + '\n@media (max-width: 640px) {.hero {grid-template-areas: "actions" "portrait" "copy";} .unused .hero {grid-template-areas: "copy" "portrait" "actions";}}',
        "640px hero must finally order",
      ],
      [
        "portrait gap spoof",
        content + '\n@media (max-width: 640px) {.hero-portrait {margin-bottom: 0;} .unused .hero-portrait {margin-bottom: clamp(16px, 5vw, 28px);}}',
        "640px portrait-to-actions gap",
      ],
      [
        "tablet grid hidden by mobile override",
        content + '\n@media (max-width: 900px) {.hero {grid-template-areas: "actions" "portrait" "copy";}} @media (max-width: 640px) {.hero {grid-template-areas: "copy" "portrait" "actions";}}',
        "900px hero must finally order",
      ],
      [
        "tablet gap hidden by mobile override",
        content + "\n@media (max-width: 900px) {.hero-portrait {margin-bottom: 0;}} @media (max-width: 640px) {.hero-portrait {margin-bottom: clamp(16px, 4vw, 22px);}}",
        "900px portrait-to-actions gap",
      ],
      [
        "descendant menu lock",
        content + "\n.menu-open body {overflow: hidden;}",
        "menu-open state must not lock body overflow",
      ],
      [
        "body menu lock",
        content + "\nbody.menu-open {overflow-y: clip;}",
        "menu-open state must not lock body overflow",
      ],
      [
        "fallback header dead rule",
        content + "\n@media (max-width: 900px) {html:not(.js) .site-header {position: sticky;} html:not(.js) .unused .site-header {position: static;}}",
        "no-JS fallback header must not obscure anchor targets",
      ],
      [
        "service hover dead rule",
        content + "\n.service-select:hover {color: var(--paper);} .unused .service-select:hover {color: var(--ink);}",
        "generic service-select hover must use ink text",
      ],
    ];
    for (const [label, sample, expected] of regressions) {
      if (!validateStyles(sample, { runRegressions: false }).some((issue) => issue.includes(expected))) {
        issues.push("CSS regression " + label + " was not rejected");
      }
    }
  }

  return issues;
}

function stripJavaScriptComments(content) {
  let result = "";
  let state = "code";
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];

    if (state === "line-comment") {
      if (character === "\n" || character === "\r") {
        result += character;
        state = "code";
      } else {
        result += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += character === "\n" || character === "\r" ? character : " ";
      }
      continue;
    }

    if (state !== "code") {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        (state === "single-quote" && character === "'")
        || (state === "double-quote" && character === '"')
        || (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (character === "/" && next === "/") {
      result += "  ";
      index += 1;
      state = "line-comment";
    } else if (character === "/" && next === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
    } else {
      result += character;
      if (character === "'") state = "single-quote";
      if (character === '"') state = "double-quote";
      if (character === "`") state = "template";
    }
  }

  return result;
}

function validateInteractions(content, options = {}) {
  const { runRegressions = true } = options;
  const issues = [];
  const clean = stripJavaScriptComments(content);
  const source = clean.trim();

  if (!source) return ["empty"];

  if (!/^document\s*\.\s*documentElement\s*\.\s*classList\s*\.\s*add\(\s*["']js["']\s*\)\s*;/u.test(source)) {
    issues.push("progressive-enhancement class must be the first unconditional statement");
  }

  const requiredPatterns = [
    [/document\s*\.\s*querySelector\(\s*["']\[data-menu-toggle\]["']\s*\)/u, "mobile menu toggle hook is missing"],
    [/document\s*\.\s*querySelector\(\s*["']\[data-mobile-nav\]["']\s*\)/u, "mobile navigation hook is missing"],
    [/if\s*\(\s*menuToggle\s*&&\s*mobileNav\s*\)/u, "mobile navigation must tolerate missing hooks"],
    [/querySelector\(\s*["']\.sr-only["']\s*\)/u, "mobile menu accessible label hook is missing"],
    [/setAttribute\(\s*["']aria-expanded["']/u, "mobile menu aria-expanded synchronization is missing"],
    [/\.\s*hidden\s*=/u, "mobile navigation hidden synchronization is missing"],
    [/["']\u6253\u5f00\u5bfc\u822a["']/u, "mobile menu open label is missing"],
    [/["']\u5173\u95ed\u5bfc\u822a["']/u, "mobile menu close label is missing"],
    [/addEventListener\(\s*["']keydown["']/u, "Escape keyboard handling is missing"],
    [/["']Escape["']/u, "Escape keyboard handling is missing"],
    [/\.\s*focus\s*\(/u, "Escape must restore focus to the menu toggle"],
    [/document\s*\.\s*addEventListener\(\s*["']click["']/u, "outside-click menu closing is missing"],
    [/\.\s*contains\s*\(/u, "outside-click containment check is missing"],
    [/addEventListener\(\s*["']resize["']/u, "desktop resize menu reset is missing"],
    [/innerWidth\s*>\s*900/u, "desktop resize threshold must be greater than 900px"],
    [/mobileNav\s*\.\s*addEventListener\(\s*["']click["']/u, "mobile navigation link closing is missing"],
    [/\.\s*closest\(\s*["']a["']\s*\)/u, "mobile navigation must close from link activation"],
    [/document\s*\.\s*querySelectorAll\(\s*["']\[data-service-select\]["']\s*\)/u, "service selection button binding is missing"],
    [/serviceButtons\s*\.\s*forEach\s*\(/u, "service selection buttons are not iterated"],
    [/button\s*\.\s*addEventListener\(\s*["']click["']/u, "service selection must bind to the button click"],
    [/\.\s*closest\(\s*["']\[data-service-card\]["']\s*\)/u, "service selection card lookup is missing"],
    [/document\s*\.\s*querySelectorAll\(\s*["']\[data-service-card\]["']\s*\)/u, "service single-selection reset is missing"],
    [/\.\s*dataset\s*\.\s*selected\s*=\s*String\s*\(/u, "service card selected state is missing"],
    [/setAttribute\(\s*["']aria-pressed["']/u, "service button aria-pressed state is missing"],
    [/\.\s*dataset\s*\.\s*serviceName\b/u, "service-name hook is missing"],
    [/document\s*\.\s*querySelector\(\s*["']\[data-selected-service\]["']\s*\)/u, "selected-service status hook is missing"],
    [/`\u5f53\u524d\u5173\u6ce8\uff1a\$\{[^}]+\}`/u, "selected service live copy is missing"],
    [/document\s*\.\s*querySelector\(\s*["']\[data-copy-contact\]["']\s*\)/u, "copy-contact button hook is missing"],
    [/document\s*\.\s*querySelector\(\s*["']\[data-contact-name\]["']\s*\)/u, "contact-name hook is missing"],
    [/document\s*\.\s*querySelector\(\s*["']\[data-copy-status\]["']\s*\)/u, "copy-status hook is missing"],
    [/contactName\s*\.\s*textContent\s*\.\s*trim\s*\(\s*\)/u, "copy value must come from visible contact-name text"],
    [/navigator\s*\.\s*clipboard\s*\.\s*writeText\s*\(/u, "Clipboard API action is missing"],
    [/document\s*\.\s*createElement\(\s*["']textarea["']\s*\)/u, "clipboard fallback textarea is missing"],
    [/document\s*\.\s*execCommand\(\s*["']copy["']\s*\)/u, "clipboard fallback copy command is missing"],
    [/catch\s*\{[^}]*fallbackCopy\(\s*value\s*\)/su, "clipboard rejection must invoke the fallback copy path"],
    [/finally\s*\{[^}]*\.\s*remove\s*\(\s*\)/su, "clipboard fallback must always clean up its temporary node"],
    [/`\u5df2\u590d\u5236\uff1a\$\{[^}]+\}`/u, "clipboard success status is missing"],
    [/`\u8bf7\u624b\u52a8\u590d\u5236\uff1a\$\{[^}]+\}`/u, "clipboard manual fallback status is missing"],
    [/copyRequestId\s*\+=\s*1/u, "repeat-copy request ordering is missing"],
    [/matchMedia\(\s*["']\(prefers-reduced-motion:\s*reduce\)["']\s*\)/u, "reduced-motion JavaScript guard is missing"],
    [/IntersectionObserver/u, "IntersectionObserver reveal enhancement is missing"],
    [/new\s+IntersectionObserver\s*\(/u, "IntersectionObserver construction is missing"],
    [/querySelectorAll\(\s*["']\.reveal["']\s*\)/u, "reveal hooks are missing"],
    [/classList\s*\.\s*add\(\s*["']is-visible["']\s*\)/u, "reveal visible state is missing"],
    [/\.\s*unobserve\s*\(/u, "revealed items must be unobserved"],
    [/getBoundingClientRect\s*\(/u, "first-viewport reveal safeguard is missing"],
  ];

  for (const [pattern, message] of requiredPatterns) {
    if (!pattern.test(clean)) issues.push(message);
  }

  if (/\b(?:[A-Za-z_$][\w$]*Card|card|article)\s*\.\s*addEventListener\(\s*["'](?:click|keydown)["']/u.test(clean)) {
    issues.push("service cards must not be turned into click or keyboard controls");
  }
  if (/\bpreventDefault\s*\(/u.test(clean)) {
    issues.push("scripts must not intercept normal anchor navigation");
  }
  if (/\bmenu-open\b/iu.test(clean)) {
    issues.push("scripts must not add a menu-open class to html or body");
  }
  const overflowMutation = /\boverflow(?:-x|-y|X|Y)?\b[^;\n]{0,180}\b(?:hidden|clip)\b/iu;
  if (overflowMutation.test(clean)) {
    issues.push("scripts must not lock page overflow");
  }

  if (runRegressions && issues.length === 0) {
    const regressions = [
      [
        "comment-only spoof",
        "/* document.documentElement.classList.add(\"js\"); data-menu-toggle aria-pressed navigator.clipboard.writeText IntersectionObserver prefers-reduced-motion */",
        "empty",
      ],
      [
        "wrapped initializer",
        content.replace(
          /^\s*document\s*\.\s*documentElement\s*\.\s*classList\s*\.\s*add\(\s*["']js["']\s*\)\s*;/u,
          'try { document.documentElement.classList.add("js"); } catch {}',
        ),
        "first unconditional statement",
      ],
      [
        "menu-open mutation",
        content + '\ndocument.body.classList.add("menu-open");',
        "must not add a menu-open class",
      ],
      [
        "overflow-lock mutation",
        content + '\ndocument.documentElement.style.overflow = "hidden";',
        "must not lock page overflow",
      ],
      [
        "object overflow-lock mutation",
        content + '\nObject.assign(document.body.style, { overflow: "clip" });',
        "must not lock page overflow",
      ],
      [
        "service-card click mutation",
        content + '\nserviceCards.forEach((serviceCard) => serviceCard.addEventListener("click", () => {}));',
        "service cards must not be turned into click",
      ],
    ];

    for (const [label, sample, expected] of regressions) {
      if (!validateInteractions(sample, { runRegressions: false }).some((issue) => issue.includes(expected))) {
        issues.push("JavaScript regression " + label + " was not rejected");
      }
    }
  }

  return issues;
}

try {
  html = await readFile(file, "utf8");
} catch {
  failures.push(file + ": missing");
}

try {
  css = await readFile(cssFile, "utf8");
  if (!css.trim()) failures.push(cssFile + ": empty");
} catch {
  failures.push(cssFile + ": missing");
}

try {
  script = await readFile(scriptFile, "utf8");
  if (!script.trim()) failures.push(scriptFile + ": empty");
} catch {
  failures.push(scriptFile + ": missing");
}

if (css.trim()) {
  for (const issue of validateStyles(css)) failures.push(cssFile + ": " + issue);
}

if (script.trim()) {
  for (const issue of validateInteractions(script)) failures.push(scriptFile + ": " + issue);
}

if (html) {
  const htmlTag = openingTags(html, "html")[0];
  if (!htmlTag || !hasAttribute(htmlTag, "lang", "zh-CN")) failures.push(file + ": html lang=zh-CN is missing");

  const metaTags = openingTags(html, "meta");
  if (!metaTags.some((tag) => hasAttribute(tag, "name", "viewport") && getAttribute(tag, "content")?.includes("width=device-width"))) {
    failures.push(file + ": viewport meta is missing");
  }
  if (!metaTags.some((tag) => hasAttribute(tag, "name", "robots") && hasAttribute(tag, "content", "noindex,nofollow"))) {
    failures.push(file + ": noindex,nofollow robots meta is missing");
  }
  if (!extractElements(html, "a").some((link) => hasClass(link.openTag, "skip-link") && hasAttribute(link.openTag, "href", "#main-content"))) {
    failures.push(file + ": skip link is missing");
  }

  const checks = [
    [/<h1\b[^>]*>\s*把 AI 工具真正装进你的(?:\s*工作流！|\s*<span\b[^>]*>\s*工作流！\s*<\/span>)\s*<\/h1>/, "exact H1 is missing or has invalid markup"],
    [/从工具咨询、环境协助，到工作流搭建和售后支持，复杂问题一次讲清。/, "exact hero description is missing"],
    [/何鹏远/, "何鹏远 identity is missing"],
    [/HPY/, "HPY identity is missing"],
    [/TerraSol 明远/, "TerraSol 明远 identity is missing"],
    [/不代售账号；实际范围、周期与费用以双方确认结果为准。/, "service disclaimer is missing"],
    [/何鹏远\s*\/\s*HPY\s*·\s*独立服务说明页\s*·\s*与 OpenAI、Anthropic 无隶属关系。/, "independent-service disclaimer is missing"],
  ];
  for (const [pattern, message] of checks) {
    if (!pattern.test(html)) failures.push(file + ": " + message);
  }

  const visibleText = normalizeVisibleText(html);
  if ((visibleText.match(/按需求评估/g) || []).length < 3) {
    failures.push(file + ": 按需求评估 must appear at least 3 times");
  }
  for (const issue of findComplianceViolations(html)) failures.push(file + ": " + issue);
  for (const issue of validateMobileNavigation(html)) failures.push(file + ": " + issue);
  for (const issue of validateServiceCards(html)) failures.push(file + ": " + issue);

  const heroSection = extractSection(html, "top");
  const heroPortrait = heroSection && extractElement(heroSection, "figure", "hero-portrait");
  const portraitStickers = heroPortrait
    ? extractElements(heroPortrait, "span").filter((span) => (
      hasClass(span.openTag, "portrait-sticker")
      && hasAttribute(span.openTag, "aria-hidden", "true")
      && normalizeVisibleText(elementText(span)) === "AI × 工作流"
    ))
    : [];
  if (portraitStickers.length !== 1) {
    failures.push(file + ": hero portrait must include one visible portrait-sticker labelled AI × 工作流");
  }

  const processSection = extractSection(html, "process");
  if (!processSection) {
    failures.push(file + ": process section cannot be extracted");
  } else {
    const processList = extractElement(processSection, "ol", "process-list");
    if (!processList) {
      failures.push(file + ": process section must contain an ol.process-list");
    } else {
      const processItems = extractElements(processList, "li");
      if (processItems.length !== 3) {
        failures.push(file + ": ol.process-list must contain exactly 3 li elements, found " + processItems.length);
      }
      const processSteps = [
        ["1", "提交需求", "说明工具、环境与目标"],
        ["2", "确认范围", "确认内容、周期与边界"],
        ["3", "协作交付", "按步骤推进并完成说明"],
      ];
      for (const [index, [number, heading, description]] of processSteps.entries()) {
        const item = processItems[index];
        if (!item) {
          failures.push(file + ": process step " + number + " is missing");
          continue;
        }
        const numbers = extractElements(item.html, "span").filter((span) => (
          hasClass(span.openTag, "process-number") && normalizeVisibleText(elementText(span)) === number
        ));
        if (numbers.length !== 1) failures.push(file + ": process step " + number + " must include process-number " + number);
        const headings = extractElements(item.html, "h3");
        if (headings.length !== 1 || normalizeVisibleText(elementText(headings[0] ?? { html: "" })) !== heading) {
          failures.push(file + ": process step " + number + " heading must be " + heading);
        }
        if (!normalizeVisibleText(item.html).includes(normalizeVisibleText(description))) {
          failures.push(file + ": process step " + number + " description must be " + description);
        }
      }
    }
  }

  const faqSection = extractSection(html, "faq");
  if (!faqSection) {
    failures.push(file + ": FAQ section cannot be extracted");
  } else {
    const faqDetails = extractElements(faqSection, "details");
    const faqSummaries = extractElements(faqSection, "summary");
    if (faqDetails.length !== 3) failures.push(file + ": FAQ section must contain exactly 3 details elements, found " + faqDetails.length);
    if (faqSummaries.length !== 3) failures.push(file + ": FAQ section must contain exactly 3 summary elements, found " + faqSummaries.length);
    const faqItems = [
      ["你们是否代售账号？", "不代售账号。本页只介绍工具咨询、环境协助、工作流建议和约定范围内的售后支持。"],
      ["如何确认服务范围？", "先说明当前环境、目标和问题，再共同确认具体内容、预计周期、交付形式与费用。"],
      ["交付后如何获得支持？", "按双方确认的服务范围提供说明和后续答疑；新增需求会重新确认范围。"],
    ];
    for (const [index, [question, answer]] of faqItems.entries()) {
      const details = faqDetails[index];
      if (!details) {
        failures.push(file + ": FAQ " + (index + 1) + " is missing");
        continue;
      }
      const summaries = extractElements(details.html, "summary");
      if (summaries.length !== 1 || normalizeVisibleText(elementText(summaries[0] ?? { html: "" })) !== question) {
        failures.push(file + ": FAQ " + (index + 1) + " summary must be " + question);
      }
      if (!normalizeVisibleText(details.html).includes(normalizeVisibleText(answer))) {
        failures.push(file + ": FAQ " + (index + 1) + " answer must be paired with its summary");
      }
    }
  }

  const contactSection = extractSection(html, "contact");
  if (!contactSection) {
    failures.push(file + ": contact section cannot be extracted");
  } else {
    if (!extractElements(contactSection, "p").some((paragraph) => (
      hasAttribute(paragraph.openTag, "data-selected-service")
      && normalizeVisibleText(elementText(paragraph)) === "当前未选择服务方案"
    ))) {
      failures.push(file + ": contact selected-service must initially be 当前未选择服务方案");
    }
    if (!extractElements(contactSection, "button").some((button) => (
      hasAttribute(button.openTag, "data-copy-contact")
      && normalizeVisibleText(elementText(button)) === "复制联系名称"
    ))) {
      failures.push(file + ": contact copy button must visibly say 复制联系名称");
    }
    if (!extractElements(contactSection, "strong").some((strong) => (
      hasAttribute(strong.openTag, "data-contact-name")
      && normalizeVisibleText(elementText(strong)) === "TerraSol 明远"
    ))) {
      failures.push(file + ": contact data-contact-name must contain TerraSol 明远");
    }
    if (!openingTags(contactSection, "[a-z][\\w-]*").some((tag) => (
      hasAttribute(tag, "role", "status")
      && hasAttribute(tag, "aria-live", "polite")
      && hasAttribute(tag, "data-copy-status")
    ))) {
      failures.push(file + ": contact live status must include role=status, aria-live=polite, and data-copy-status");
    }
  }

  if (findComplianceViolations(html).length === 0) {
    const complianceRegressions = [
      ["split claim", html + "无。官方<span>渠道</span>，限时价 ¥99，保证成功。", ["forbidden claim", "price commitment", "result or guarantee commitment"]],
      ["quoted price and delivery", html + "无。报价人民币 99，24h 到账，包成功。", ["price commitment", "timing or delivery commitment", "result or guarantee commitment"]],
      ["unrelated negations", html + "不看别家，报价人民币99；不必久等，24h到账；不用担心，包成功；不用犹豫，官方渠道。", ["forbidden claim", "price commitment", "timing or delivery commitment", "result or guarantee commitment"]],
      ["mixed occurrences", html + "不展示价格但现在报价人民币99；不保证成功但本服务包成功；不提供官方渠道但这里就是官方渠道。", ["forbidden claim", "price commitment", "result or guarantee commitment"]],
      ["spaced split claim", html + "官方 <span>渠道</span>", ["forbidden claim"]],
    ];
    for (const [label, sample, expected] of complianceRegressions) {
      const violations = findComplianceViolations(sample);
      for (const category of expected) {
        if (!violations.includes(category)) {
          failures.push(file + ": compliance regression " + label + " missed " + category);
        }
      }
    }
    for (const [label, sample] of [
      ["negated claims", html + "不展示价格，不保证成功，不提供即时到账服务。"],
      ["long explicit negations", html + "本页面不提供任何形式的官方渠道服务，也绝不会向你承诺保证成功。"],
      ["service disclaimer", "不代售账号；实际范围、周期与费用以双方确认结果为准。"],
      ["independent disclaimer", "何鹏远 / HPY · 独立服务说明页 · 与 OpenAI、Anthropic 无隶属关系。"],
    ]) {
      if (findComplianceViolations(sample).length > 0) {
        failures.push(file + ": compliance regression " + label + " was incorrectly rejected");
      }
    }
  }

  if (validateMobileNavigation(html).length === 0) {
    const toggleMutation = replaceFirst(
      html,
      /(\s)data-menu-toggle(?=\s|=|>|\/)/i,
      (match, whitespace) => whitespace + "data-menu-broken",
    );
    if (!toggleMutation.changed) {
      failures.push(file + ": mobile navigation regression could not replace data-menu-toggle");
    } else if (!validateMobileNavigation(toggleMutation.content).some((issue) => issue.includes("[data-menu-toggle] element, found 0"))) {
      failures.push(file + ": mobile navigation regression did not reject a missing exact toggle hook");
    }

    const exactToggle = extractElements(html, "button").find((button) => hasAttribute(button.openTag, "data-menu-toggle"));
    if (!exactToggle) {
      failures.push(file + ": mobile navigation regression could not locate the exact toggle button");
    } else {
      const duplicateToggleMutation = replaceFirst(
        html,
        exactToggle.html,
        exactToggle.html + "<button type=\"submit\" data-menu-toggle>额外按钮</button>",
      );
      if (!duplicateToggleMutation.changed) {
        failures.push(file + ": mobile navigation regression could not insert a second toggle");
      } else if (!hasDuplicateCountIssue(validateMobileNavigation(duplicateToggleMutation.content), "[data-menu-toggle]")) {
        failures.push(file + ": mobile navigation regression did not reject a second toggle");
      }
    }

    const exactMobileNav = extractElements(html, "nav").find((nav) => hasAttribute(nav.openTag, "id", "mobile-nav"));
    if (!exactMobileNav) {
      failures.push(file + ": mobile navigation regression could not locate mobile-nav");
    } else {
      const duplicateNavMutation = replaceFirst(html, exactMobileNav.html, exactMobileNav.html + "<nav id=\"mobile-nav\"></nav>");
      if (!duplicateNavMutation.changed) {
        failures.push(file + ": mobile navigation regression could not insert a second mobile-nav id");
      } else if (!hasDuplicateCountIssue(validateMobileNavigation(duplicateNavMutation.content), "[id=mobile-nav]")) {
        failures.push(file + ": mobile navigation regression did not reject a duplicate mobile-nav id");
      }
    }

    const prefixedHookMutation = replaceFirst(
      html,
      /(\s)data-menu-toggle(?=\s|=|>|\/)/i,
      (match, whitespace) => whitespace + "x-data-menu-toggle",
    );
    if (!prefixedHookMutation.changed) {
      failures.push(file + ": mobile navigation regression could not prefix the toggle hook");
    } else if (!validateMobileNavigation(prefixedHookMutation.content).some((issue) => issue.includes("[data-menu-toggle] element, found 0"))) {
      failures.push(file + ": mobile navigation regression treated x-data-menu-toggle as a real hook");
    }
  }

  if (validateServiceCards(html).length === 0) {
    const servicesSection = extractSection(html, "services");
    const firstServiceCard = servicesSection
      ? extractElements(servicesSection, "article").find((article) => hasAttribute(article.openTag, "data-service-card", "consulting"))
      : null;
    if (!firstServiceCard) {
      failures.push(file + ": service-card regression could not locate the consulting card");
    } else {
      const fourthPointCard = replaceFirst(firstServiceCard.html, /<\/ul\s*>/i, "<li>永久免费</li></ul>");
      if (!fourthPointCard.changed) {
        failures.push(file + ": service-card regression could not add a fourth point");
      } else {
        const fourthPointMutation = replaceFirst(html, firstServiceCard.html, fourthPointCard.content);
        if (!fourthPointMutation.changed) {
          failures.push(file + ": service-card regression could not apply the fourth point mutation");
        } else if (!validateServiceCards(fourthPointMutation.content).some((issue) => issue.includes("exactly 3 li"))) {
          failures.push(file + ": service-card regression did not reject a fourth point");
        }
      }

      const extraButtonCard = replaceFirst(firstServiceCard.html, /<\/article\s*>$/i, "<button type=\"button\">额外按钮</button></article>");
      if (!extraButtonCard.changed) {
        failures.push(file + ": service-card regression could not add an ordinary button");
      } else {
        const extraButtonMutation = replaceFirst(html, firstServiceCard.html, extraButtonCard.content);
        if (!extraButtonMutation.changed) {
          failures.push(file + ": service-card regression could not apply the ordinary button mutation");
        } else if (!validateServiceCards(extraButtonMutation.content).some((issue) => issue.includes("exactly one button"))) {
          failures.push(file + ": service-card regression did not reject an ordinary extra button");
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error("S1 validation failed:\n" + failures.map((item) => "- " + item).join("\n"));
  process.exit(1);
}

console.log("S1 validation passed: semantic HTML, compliance, comic CSS, and interaction checks.");
