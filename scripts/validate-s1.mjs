import { readFile } from "node:fs/promises";

const file = "samples/s1/index.html";
const failures = [];
let html = "";

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
    [/<h1\b[^>]*>\s*把 AI 工具真正装进你的\s*<span>\s*工作流！\s*<\/span>\s*<\/h1>/, "exact H1 is missing"],
    [/从工具咨询、环境协助，到工作流搭建和售后支持，复杂问题一次讲清。/, "exact hero description is missing"],
    [/何鹏远/, "何鹏远 identity is missing"],
    [/HPY/, "HPY identity is missing"],
    [/TerraSol 明远/, "TerraSol 明远 identity is missing"],
    [/id="services"/, "services section is missing"],
    [/id="process"/, "process section is missing"],
    [/id="faq"/, "FAQ section is missing"],
    [/id="contact"/, "contact section is missing"],
    [/data-service-card="consulting"/, "consulting service card is missing"],
    [/data-service-card="setup"/, "setup service card is missing"],
    [/data-service-card="workflow"/, "workflow service card is missing"],
    [/问清需求[\s\S]*入门咨询/, "consulting service labels are missing"],
    [/装好环境[\s\S]*环境协助/, "setup service labels are missing"],
    [/跑通流程[\s\S]*工作流搭建/, "workflow service labels are missing"],
    [/需求诊断/, "需求诊断 is missing"],
    [/工具建议/, "工具建议 is missing"],
    [/风险提醒/, "风险提醒 is missing"],
    [/安装配置/, "安装配置 is missing"],
    [/故障排查/, "故障排查 is missing"],
    [/上手指导/, "上手指导 is missing"],
    [/流程梳理/, "流程梳理 is missing"],
    [/自动化建议/, "自动化建议 is missing"],
    [/交付说明/, "交付说明 is missing"],
    [/提交需求/, "提交需求 process step is missing"],
    [/确认范围/, "确认范围 process step is missing"],
    [/协作交付/, "协作交付 process step is missing"],
    [/你们是否代售账号？/, "first FAQ question is missing"],
    [/不代售账号。本页只介绍工具咨询、环境协助、工作流建议和约定范围内的售后支持。/, "first FAQ answer is missing"],
    [/如何确认服务范围？/, "second FAQ question is missing"],
    [/先说明当前环境、目标和问题，再共同确认具体内容、预计周期、交付形式与费用。/, "second FAQ answer is missing"],
    [/交付后如何获得支持？/, "third FAQ question is missing"],
    [/按双方确认的服务范围提供说明和后续答疑；新增需求会重新确认范围。/, "third FAQ answer is missing"],
    [/准备把 AI 用起来？/, "contact heading is missing"],
    [/微信搜索：\s*<strong\s+data-contact-name>\s*TerraSol 明远\s*<\/strong>/, "contact WeChat label and name are missing"],
    [/复制联系名称/, "copy contact control is missing"],
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

  for (const card of serviceCards) {
    const cardPattern = new RegExp(
      `<article(?=[^>]*class="[^"]*\\bservice-card\\b[^"]*")(?=[^>]*data-service-card="${card.id}")(?=[^>]*data-service-name="${card.name}")(?=[^>]*data-selected="false")[^>]*>([\\s\\S]*?)<\\/article>`,
    );
    const cardMatch = html.match(cardPattern);

    if (!cardMatch) {
      failures.push(`${file}: ${card.name} must be an unselected service-card article with required data`);
      continue;
    }

    const cardHtml = cardMatch[1];
    if (!new RegExp(`<span\\s+class="service-kicker">\\s*${card.kicker}\\s*<\\/span>`).test(cardHtml)) {
      failures.push(`${file}: ${card.name} service kicker is missing`);
    }
    if (!new RegExp(`<h3>\\s*${card.name}\\s*<\\/h3>`).test(cardHtml)) {
      failures.push(`${file}: ${card.name} service heading is missing`);
    }
    for (const point of card.points) {
      if (!new RegExp(`<li>\\s*${point}\\s*<\\/li>`).test(cardHtml)) {
        failures.push(`${file}: ${card.name} point is missing: ${point}`);
      }
    }
    if (!/<button\s+class="service-select"[^>]*\bdata-service-select\b[^>]*aria-pressed="false"[^>]*>\s*按需求评估\s*<\/button>/.test(cardHtml)) {
      failures.push(`${file}: ${card.name} assessment button is missing or invalid`);
    }
    if (/<button\b[^>]*>[\s\S]*?(?:<h3\b|<ul\b)/.test(cardHtml)) {
      failures.push(`${file}: ${card.name} must not place headings or lists inside its button`);
    }
  }

  const serviceAssessmentCount = (html.match(/按需求评估/g) || []).length;
  if (serviceAssessmentCount < 3) {
    failures.push(`${file}: 按需求评估 must appear at least 3 times`);
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
