import { readFile } from "node:fs/promises";

const file = "samples/s1/index.html";
const failures = [];
let html = "";

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

try {
  html = await readFile(file, "utf8");
} catch {
  failures.push(file + ": missing");
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
  console.error("S1 HTML validation failed:\n" + failures.map((item) => "- " + item).join("\n"));
  process.exit(1);
}

console.log("S1 HTML validation passed: semantic structure and compliance checks.");
