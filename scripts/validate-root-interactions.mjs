import { readFile } from "node:fs/promises";
import { Script as VmScript, createContext } from "node:vm";

const scriptUrl = new URL("../script.js", import.meta.url);
const source = await readFile(scriptUrl, "utf8");

class FixtureClassList {
  constructor() {
    this.values = new Set();
  }

  add(...tokens) {
    tokens.forEach((token) => this.values.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
  }

  toggle(token, force) {
    const enabled = force === undefined ? !this.values.has(token) : Boolean(force);
    if (enabled) this.values.add(token);
    else this.values.delete(token);
    return enabled;
  }
}

class FixtureEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type, init = {}) {
    const event = { ...init, target: init.target ?? this };
    const results = (this.listeners.get(type) ?? []).map((listener) => listener(event));
    await Promise.all(results.filter((result) => result && typeof result.then === "function"));
  }
}

class FixtureElement extends FixtureEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.classList = new FixtureClassList();
    this.dataset = {};
    this.style = {};
    this.textContent = "";
    this.value = "";
    this.focusCalls = 0;
    this.selectCalls = 0;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  append(...elements) {
    for (const element of elements) {
      element.parentElement = this;
      this.children.push(element);
    }
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  focus() {
    this.focusCalls += 1;
    this.ownerDocument.activeElement = this;
  }

  select() {
    this.selectCalls += 1;
  }
}

class FixtureDocument extends FixtureEventTarget {
  constructor() {
    super();
    this.body = new FixtureElement("body", this);
    this.activeElement = this.body;
    this.createdElements = [];
    this.execCommandCalls = [];
    this.queries = new Map();
    this.queryLists = new Map();
  }

  querySelector(selector) {
    return this.queries.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    return this.queryLists.get(selector) ?? [];
  }

  createElement(tagName) {
    const element = new FixtureElement(tagName, this);
    this.createdElements.push(element);
    return element;
  }

  execCommand(command) {
    this.execCommandCalls.push(command);
    return command === "copy";
  }
}

function createFixture(clipboardWriteText) {
  const document = new FixtureDocument();
  const status = new FixtureElement("p", document);
  const wechatButton = new FixtureElement("button", document);
  const douyinButton = new FixtureElement("button", document);
  wechatButton.dataset.copyValue = "TerraSol-Ai";
  wechatButton.dataset.copyLabel = "微信号";
  douyinButton.dataset.copyValue = "HPY131419";
  douyinButton.dataset.copyLabel = "抖音号";

  document.queries.set("[data-contact-note]", status);
  document.queryLists.set("[data-copy-public]", [wechatButton, douyinButton]);
  document.queryLists.set(".reveal", []);

  const clipboardCalls = [];
  const navigator = {
    clipboard: {
      writeText(value) {
        clipboardCalls.push(value);
        return clipboardWriteText?.(value, clipboardCalls.length);
      },
    },
  };

  const window = new FixtureEventTarget();
  window.innerWidth = 390;
  window.scrollY = 0;
  window.matchMedia = () => ({ matches: true });

  const sandbox = {
    document,
    window,
    navigator,
    HTMLElement: FixtureElement,
    console: { log() {}, warn() {}, error() {} },
  };
  window.document = document;
  window.navigator = navigator;

  const context = createContext(sandbox, {
    name: "root-contact-interaction-validator",
    codeGeneration: { strings: false, wasm: false },
  });
  const compiled = new VmScript(source, {
    filename: scriptUrl.pathname,
    displayErrors: false,
  });
  compiled.runInContext(context, { timeout: 500, displayErrors: false });

  return {
    context,
    document,
    status,
    wechatButton,
    douyinButton,
    clipboardCalls,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Root interaction validation failed: ${message}`);
}

async function validateIndependentCopies() {
  const fixture = createFixture();
  await fixture.wechatButton.dispatch("click");
  assert(fixture.clipboardCalls[0] === "TerraSol-Ai", "WeChat button copied the wrong value");
  assert(fixture.status.textContent === "已复制微信号：TerraSol-Ai", "WeChat success status is incorrect");

  await fixture.douyinButton.dispatch("click");
  assert(fixture.clipboardCalls[1] === "HPY131419", "Douyin button copied the wrong value");
  assert(fixture.status.textContent === "已复制抖音号：HPY131419", "Douyin success status is incorrect");
}

async function validateCopyRace() {
  let rejectFirstCopy;
  const fixture = createFixture((_value, callNumber) => {
    if (callNumber !== 1) return undefined;
    return new Promise((_resolve, reject) => {
      rejectFirstCopy = reject;
    });
  });

  const firstCopy = fixture.wechatButton.dispatch("click");
  await fixture.douyinButton.dispatch("click");
  assert(typeof rejectFirstCopy === "function", "race fixture did not reach the first clipboard request");
  rejectFirstCopy(new Error("late clipboard failure"));
  await firstCopy;

  assert(fixture.document.execCommandCalls.length === 0, "stale clipboard failure triggered fallback copy");
  assert(
    fixture.status.textContent === "已复制抖音号：HPY131419",
    "stale WeChat failure overwrote the newer Douyin success",
  );
}

async function validateFallbackAndFocusRestore() {
  const fixture = createFixture(() => {
    throw new Error("clipboard denied");
  });
  const previousFocus = new FixtureElement("button", fixture.document);
  previousFocus.focus();
  previousFocus.focusCalls = 0;

  await fixture.wechatButton.dispatch("click");

  const textarea = fixture.document.createdElements.find((element) => element.tagName === "TEXTAREA");
  assert(Boolean(textarea), "clipboard failure did not create the fallback textarea");
  assert(fixture.document.execCommandCalls.join(",") === "copy", "fallback did not execute one copy command");
  assert(textarea.selectCalls === 1, "fallback textarea was not selected");
  assert(textarea.parentElement === null, "fallback textarea was not removed");
  assert(fixture.document.body.children.length === 0, "fallback left a temporary node in the document");
  assert(fixture.document.activeElement === previousFocus, "fallback did not restore the previously focused element");
  assert(previousFocus.focusCalls === 1, "fallback did not restore focus exactly once");
  assert(fixture.status.textContent === "已复制微信号：TerraSol-Ai", "fallback success status is incorrect");
}

await validateIndependentCopies();
await validateCopyRace();
await validateFallbackAndFocusRestore();

console.log("Root interaction validation passed: public contact copy, race, fallback, and focus restore.");
