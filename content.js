const ROOT_ID = "__seldbg_root__";
const STYLE_ID = "__seldbg_style__";
const HIT_CLASS = "__seldbg_hit__";
const ACTIVE_CLASS = "__seldbg_active__";
const MAX_MATCHES = 150;

const state = {
  input: null,
  hits: []
};

const sendUpdate = (payload) => {
  chrome.runtime.sendMessage({ type: "selector:update", payload });
};

const clearHits = () => {
  for (const node of state.hits) node.classList.remove(HIT_CLASS, ACTIVE_CLASS);
  state.hits = [];
};

const compactText = (text) => text.replace(/\s+/g, " ").trim().slice(0, 80);

const toItem = (node) => ({
  tag: node.tagName.toLowerCase(),
  id: node.id || "",
  classes: [...node.classList].filter((name) => name !== HIT_CLASS).slice(0, 4),
  text: compactText(node.innerText || node.textContent || "")
});

const isDebuggerNode = (node) =>
  node.id === ROOT_ID || node.id === STYLE_ID || node.closest?.(`#${ROOT_ID}`);

const selectNodes = (selector) => {
  try {
    return {
      matches: [...document.querySelectorAll(selector)].filter((node) => !isDebuggerNode(node)),
      error: ""
    };
  } catch (error) {
    return { matches: [], error: error.message || "Invalid selector" };
  }
};

const evaluate = (selector) => {
  clearHits();
  if (!selector.trim()) {
    sendUpdate({ selector, count: 0, matches: [], error: "" });
    return;
  }
  const { matches, error } = selectNodes(selector);
  if (error) {
    sendUpdate({ selector, count: 0, matches: [], error });
    return;
  }
  for (const node of matches) node.classList.add(HIT_CLASS);
  state.hits = matches;
  const [first] = matches;
  first?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  sendUpdate({
    selector,
    count: matches.length,
    matches: matches.slice(0, MAX_MATCHES).map(toItem),
    error: ""
  });
};

const focusByIndex = (index) => {
  if (!Number.isInteger(index)) return;
  const node = state.hits[index];
  if (!node) return;
  for (const hit of state.hits) hit.classList.remove(ACTIVE_CLASS);
  node.classList.add(ACTIVE_CLASS);
  node.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
};

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
:root {
  --sdbg-bg: #111;
  --sdbg-surface: #1d1d1d;
  --sdbg-text: #f7f7f7;
  --sdbg-match: #ff7a45;
  --sdbg-match-bg: rgba(255, 122, 69, 0.12);
  --sdbg-active: #52d1ff;
}
.${HIT_CLASS} { outline: 2px dashed var(--sdbg-match) !important; background: var(--sdbg-match-bg) !important; }
.${ACTIVE_CLASS} { outline: 2px dashed var(--sdbg-active) !important; }
#${ROOT_ID} { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647; background: var(--sdbg-bg); border-top: 2px solid var(--sdbg-match); padding: 8px 10px; }
#${ROOT_ID} input { width: 100%; box-sizing: border-box; border: 0; border-radius: 10px; padding: 10px 12px; font: 14px/1.2 monospace; background: var(--sdbg-surface); color: var(--sdbg-text); }
`;
  document.documentElement.append(style);
};

const mount = () => {
  if (state.input) return state.input;
  ensureStyle();
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    state.input = existing.querySelector("input");
    return state.input;
  }
  const root = document.createElement("div");
  root.id = ROOT_ID;
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type CSS selector...";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.addEventListener("input", (event) => evaluate(event.target.value));
  root.append(input);
  document.documentElement.append(root);
  state.input = input;
  return input;
};

const open = () => {
  const input = mount();
  input.focus();
  input.select();
  evaluate(input.value);
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "debugger:open") {
    open();
    return;
  }
  if (message?.type !== "selector:focus") return;
  focusByIndex(message.index);
});

