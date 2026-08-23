import { readFile } from "node:fs/promises";

const file = "samples/s1/index.html";
const failures = [];
let html = "";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAttribute(tag, attribute, value) {
  const name = escapeRegExp(attribute);
  const pattern = value === undefined
    ? new RegExp(`\\b${name}(?=\\s|=|>|/>)`, "i")
    : new RegExp(`\\b${name}\\s*=\\s*["']${escapeRegExp(value)}["']`, "i");
  return pattern.test(tag);
}

function hasClass(tag, className) {
  return new RegExp(`\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["']`, "i").test(tag);
}

function extractSection(content, id) {
  const openingPattern = new RegExp(
    `<section\\b(?=[^>]*\\bid\\s*=\\s*["']${escapeRegExp(id)}["'])[^>]*>`,
    "i",
  );
  const openingMatch = content.match(openingPattern);
  if (!openingMatch || openingMatch.index === undefined) return null;

  const closingIndex = content.indexOf("</section>", openingMatch.index + openingMatch[0].length);
  if (closingIndex === -1) return null;

  return content.slice(openingMatch.index, closingIndex + "</section>".length);
}

function extractElement(content, tagName, className) {
  const openingPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let openingMatch;

  while ((openingMatch = openingPattern.exec(content))) {
    if (!hasClass(openingMatch[0], className)) continue;
    const closingTag = `</${tagName}>`;
    const closingIndex = content.indexOf(closingTag, openingPattern.lastIndex);
    if (closingIndex === -1) return null;
    return content.slice(openingMatch.index, closingIndex + closingTag.length);
  }

  return null;
}

try {
  html = await readFile(file, "utf8");
} catch {
  failures.push(`${file}: missing`);
}

if (html) {
  const checks = [
    [/<html\s+lang="zh-CN">/i, "html lang=zh-CN is missing"],
    [/<meta\s+name="viewport"\s+content="[^"]*width=device-width[^"]*">/i, "viewport meta is missing"],
    [/<a[^>]+class="skip-link"[^>]+href="#main-content"[^>]*>/i, "skip link is missing"],
    [/<h1\b[^>]*>\s*把 AI 工具真正装进你的(?:\s*工作流！|\s*<span\b[^>]*>\s*工作流！\s*<\/span>)\s*<\/h1>/, "exact H1 is missing or has invalid markup"],
    [/从工具咨询、环境协助，到工作流搭建和售后支持，复杂问题一次讲清。/, "exact hero description is missing"],
    [/何鹏远/, "何鹏远 identity is missing"],
    [/HPY/, "HPY identity is missing"],
    [/TerraSol 明远/, "TerraSol 明远 identity is missing"],
    [/id="services"/, "services section is missing"],
    [/id="process"/, "process section is missing"],
    [/id="faq"/, "FAQ section is missing"],
    [/id="contact"/, "contact section is missing"],
    [/不代售账号；实际范围、周期与费用以双方确认结果为准。/, "service disclaimer is missing"],
    [/何鹏远\s*\/\s*HPY\s*·\s*独立服务说明页\s*·\s*与 OpenAI、Anthropic 无隶属关系。/, "independent-service disclaimer is missing"],
    [/<meta\s+name="robots"\s+content="noindex,nofollow"\s*\/?\s*>/i, "noindex,nofollow robots meta is missing"],
  ];

  for (const [pattern, message] of checks) {
    if (!pattern.test(html)) failures.push(`${file}: ${message}`);
  }

  const serviceCards = [
    {
      id: "consulting",
      name: "入门咨询",
      kicker: "问清需求",
      points: ["需求诊断", "工具建议", "风险提醒"],
    },
    {
      id: "setup",
      name: "环境协助",
      kicker: "装好环境",
      points: ["安装配置", "故障排查", "上手指导"],
    },
    {
      id: "workflow",
      name: "工作流搭建",
      kicker: "跑通流程",
      points: ["流程梳理", "自动化建议", "交付说明"],
    },
  ];

  const articles = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)];
  const cardArticles = articles.filter((article) => hasClass(article[0].match(/^<article\b[^>]*>/i)[0], "service-card"));

  if (cardArticles.length !== 3) {
    failures.push(`${file}: expected exactly 3 article.service-card elements, found ${cardArticles.length}`);
  }

  for (const card of serviceCards) {
    const matchingCards = cardArticles.filter((article) => {
      const openingTag = article[0].match(/^<article\b[^>]*>/i)[0];
      return hasAttribute(openingTag, "data-service-card", card.id);
    });

    if (matchingCards.length !== 1) {
      failures.push(`${file}: expected exactly one service card with data-service-card="${card.id}", found ${matchingCards.length}`);
      continue;
    }

    const cardHtml = matchingCards[0][0];
    const openingTag = cardHtml.match(/^<article\b[^>]*>/i)[0];
    if (!hasAttribute(openingTag, "data-service-name", card.name) || !hasAttribute(openingTag, "data-selected", "false")) {
      failures.push(`${file}: ${card.name} card must have data-service-name and data-selected="false"`);
    }
    if (!new RegExp(`<span\\b[^>]*class="[^"]*\\bservice-kicker\\b[^"]*"[^>]*>\\s*${escapeRegExp(card.kicker)}\\s*<\\/span>`, "i").test(cardHtml)) {
      failures.push(`${file}: ${card.name} service kicker is missing`);
    }
    if (!new RegExp(`<h3\\b[^>]*>\\s*${escapeRegExp(card.name)}\\s*<\\/h3>`, "i").test(cardHtml)) {
      failures.push(`${file}: ${card.name} service heading is missing`);
    }
    for (const point of card.points) {
      if (!new RegExp(`<li\\b[^>]*>\\s*${escapeRegExp(point)}\\s*<\\/li>`, "i").test(cardHtml)) {
        failures.push(`${file}: ${card.name} point is missing: ${point}`);
      }
    }
    if (!/<button\b(?=[^>]*\bdata-service-select\b)(?=[^>]*\baria-pressed\s*=\s*["']false["'])[^>]*>\s*按需求评估\s*<\/button>/i.test(cardHtml)) {
      failures.push(`${file}: ${card.name} assessment button is missing or invalid`);
    }
    if (/<button\b[^>]*>[\s\S]*?(?:<h3\b|<ul\b)/i.test(cardHtml)) {
      failures.push(`${file}: ${card.name} must not place headings or lists inside its button`);
    }
    if (/\bclass\s*=\s*["'][^"']*\bcard-number\b[^"']*["']/i.test(cardHtml)) {
      failures.push(`${file}: ${card.name} must not include a .card-number element`);
    }
    if (/(?:^|>)[\s\r\n]*0[1-3][\s\r\n]*(?:<|$)/.test(cardHtml)) {
      failures.push(`${file}: ${card.name} must not include an independent 01/02/03 number`);
    }
  }

  const serviceAssessmentCount = (html.match(/按需求评估/g) || []).length;
  if (serviceAssessmentCount < 3) {
    failures.push(`${file}: 按需求评估 must appear at least 3 times`);
  }

  const processSection = extractSection(html, "process");
  if (!processSection) {
    failures.push(`${file}: process section cannot be extracted`);
  } else {
    const processList = extractElement(processSection, "ol", "process-list");
    if (!processList) {
      failures.push(`${file}: process section must contain an ol.process-list`);
    } else {
      const processItems = [...processList.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)];
      if (processItems.length !== 3) {
        failures.push(`${file}: ol.process-list must contain exactly 3 li elements, found ${processItems.length}`);
      }

      const processSteps = [
        ["1", "提交需求", "说明工具、环境与目标"],
        ["2", "确认范围", "确认内容、周期与边界"],
        ["3", "协作交付", "按步骤推进并完成说明"],
      ];

      for (const [index, [number, heading, description]] of processSteps.entries()) {
        const item = processItems[index]?.[0];
        if (!item) {
          failures.push(`${file}: process step ${number} is missing`);
          continue;
        }
        if (!new RegExp(`<[^>]*class="[^"]*\\bprocess-number\\b[^"]*"[^>]*>\\s*${number}\\s*<`, "i").test(item)) {
          failures.push(`${file}: process step ${number} must include process-number ${number}`);
        }
        if (!new RegExp(`<h3\\b[^>]*>\\s*${heading}\\s*<\\/h3>`, "i").test(item)) {
          failures.push(`${file}: process step ${number} heading must be ${heading}`);
        }
        if (!item.includes(description)) {
          failures.push(`${file}: process step ${number} description must be ${description}`);
        }
      }
    }
  }

  const faqSection = extractSection(html, "faq");
  if (!faqSection) {
    failures.push(`${file}: FAQ section cannot be extracted`);
  } else {
    const faqDetails = [...faqSection.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/gi)];
    const faqSummaries = [...faqSection.matchAll(/<summary\b[^>]*>/gi)];
    if (faqDetails.length !== 3) {
      failures.push(`${file}: FAQ section must contain exactly 3 details elements, found ${faqDetails.length}`);
    }
    if (faqSummaries.length !== 3) {
      failures.push(`${file}: FAQ section must contain exactly 3 summary elements, found ${faqSummaries.length}`);
    }

    const faqItems = [
      ["你们是否代售账号？", "不代售账号。本页只介绍工具咨询、环境协助、工作流建议和约定范围内的售后支持。"],
      ["如何确认服务范围？", "先说明当前环境、目标和问题，再共同确认具体内容、预计周期、交付形式与费用。"],
      ["交付后如何获得支持？", "按双方确认的服务范围提供说明和后续答疑；新增需求会重新确认范围。"],
    ];

    for (const [index, [question, answer]] of faqItems.entries()) {
      const details = faqDetails[index]?.[0];
      if (!details) {
        failures.push(`${file}: FAQ ${index + 1} is missing`);
        continue;
      }
      if (!new RegExp(`<summary\\b[^>]*>\\s*${escapeRegExp(question)}\\s*<\\/summary>`, "i").test(details)) {
        failures.push(`${file}: FAQ ${index + 1} summary must be ${question}`);
      }
      if (!details.includes(answer)) {
        failures.push(`${file}: FAQ ${index + 1} answer must be paired with its summary`);
      }
    }
  }

  const contactSection = extractSection(html, "contact");
  if (!contactSection) {
    failures.push(`${file}: contact section cannot be extracted`);
  } else {
    if (!/<[^>]*\bdata-selected-service\b[^>]*>\s*当前未选择服务方案\s*<\//i.test(contactSection)) {
      failures.push(`${file}: contact selected-service must initially be 当前未选择服务方案`);
    }
    if (!/<button\b(?=[^>]*\bdata-copy-contact\b)[^>]*>\s*复制联系名称\s*<\/button>/i.test(contactSection)) {
      failures.push(`${file}: contact copy button must visibly say 复制联系名称`);
    }
    if (!/<([a-z][\w-]*)\b(?=[^>]*\bdata-contact-name\b)[^>]*>\s*TerraSol 明远\s*<\/\1>/i.test(contactSection)) {
      failures.push(`${file}: contact data-contact-name must contain TerraSol 明远`);
    }

    const contactTags = contactSection.match(/<[a-z][\w-]*\b[^>]*>/gi) || [];
    if (!contactTags.some((tag) => (
      hasAttribute(tag, "role", "status")
      && hasAttribute(tag, "aria-live", "polite")
      && hasAttribute(tag, "data-copy-status")
    ))) {
      failures.push(`${file}: contact live status must include role=status, aria-live=polite, and data-copy-status`);
    }
  }

  const forbiddenTerms = [
    "官方充值",
    "官方渠道",
    "即时到账",
    "100% 官方",
    "OpenAI 官方",
    "Anthropic 官方",
    "官方授权",
    "官方代理",
    "成功率",
    "销量",
    "客户案例",
    "立即支付",
    "购买账号",
    "充值套餐",
  ];

  for (const term of forbiddenTerms) {
    if (html.includes(term)) failures.push(`${file}: forbidden claim found: ${term}`);
  }
}

if (failures.length > 0) {
  console.error("S1 HTML validation failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("S1 HTML validation passed: semantic structure and compliance checks.");
