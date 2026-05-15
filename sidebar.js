const $id = document.getElementById.bind(document);
const el = (tag) => document.createElement(tag);
const sendRuntime = (message, callback) =>
  chrome.runtime.sendMessage(message, callback || (() => void chrome.runtime.lastError));

const metaNode = $id("meta");
const errorNode = $id("error");
const listNode = $id("list");

const defaultPayload = {
  selector: "",
  count: 0,
  matches: [],
  error: ""
};

const state = {
  tabId: null,
  selectedIndex: null,
  hoveredIndex: null,
  payload: defaultPayload
};

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const fmtAttr = ([k, v]) => (v ? `${k}="${truncate(v, 24)}"` : k);

const normalizeText = (text = "") => `${text}`.trim().replace(/\s+/g, " ");
const rowSections = [
  ({ tag, id }) => ({
    key: "identity",
    tokens: [["tag", tag], ["id", id]]
  }),
  ({ classes }) => ({ key: "classes", tokens: classes.map((value) => ["cls", value]) }),
  ({ attrs }) => ({ key: "attrs", tokens: attrs.slice(0, 2).map((value) => ["attr", value]) }),
  ({ text }) => ({ key: "text", tokens: text ? [["text", `"${text}"`]] : [] })
];

const toLabelParts = (item) => ({
  tag: item.tag,
  id: item.id ? `#${item.id}` : "",
  classes: (item.classes || []).map((c) => `.${c}`),
  attrs: (item.attrs || []).slice(0, 2).map(fmtAttr),
  text: truncate(normalizeText(item.text), 56)
});

const render = (payload) => {
  const next = { ...defaultPayload, ...(payload || {}) };
  const selectorChanged = next.selector !== state.payload.selector;
  if (selectorChanged) clearHoveredIndex();
  const selectedIndex = selectorChanged ? null : state.selectedIndex;
  state.selectedIndex = selectedIndex !== null && selectedIndex < next.matches.length ? selectedIndex : null;
  state.payload = next;
  const { selector, count, matches, error } = next;
  if (selector) {
    const countNode = Object.assign(el("div"), { id: "meta-count" });
    const countNum = Object.assign(el("span"), { className: "meta-stat-num", textContent: String(count) });
    const countLabel = Object.assign(el("span"), {
      className: "meta-stat-label",
      textContent: count === 1 ? "match" : "matches"
    });
    countNode.append(countNum, countLabel);
    const selectorNode = Object.assign(el("code"), { id: "meta-selector", textContent: selector });
    metaNode.className = "meta-head";
    metaNode.replaceChildren(countNode, selectorNode);
  } else {
    metaNode.className = "meta-empty";
    metaNode.textContent = "No selector yet.";
  }
  errorNode.textContent = error;
  errorNode.style.display = error ? "block" : "none";
  const toRow = (item, index) => {
    const parts = toLabelParts(item);
    const row = el("li");
    for (const { key, tokens } of rowSections.map((build) => build(parts))) {
      if (!tokens.length) continue;
      const section = Object.assign(el("div"), { className: `row-section ${key}` });
      for (const [kind, value] of tokens.filter(([, value]) => value)) {
        const chip = Object.assign(el("span"), { className: `chip ${kind}`, textContent: value });
        section.append(chip);
      }
      row.append(section);
    }
    row.dataset.index = `${index}`;
    if (index === state.selectedIndex) row.classList.add("is-active");
    return row;
  };
  listNode.replaceChildren(...matches.map(toRow));
};

const setHoveredIndex = (index) => {
  if (!Number.isInteger(index) || !state.tabId) return;
  if (state.hoveredIndex === index) return;
  state.hoveredIndex = index;
  sendRuntime({ type: "selector:hover", tabId: state.tabId, index });
};

const clearHoveredIndex = () => {
  if (!state.tabId || state.hoveredIndex === null) return;
  state.hoveredIndex = null;
  sendRuntime({ type: "selector:hover-clear", tabId: state.tabId });
};

const markActiveRow = (index) => {
  for (const row of listNode.querySelectorAll("li[data-index]")) {
    row.classList.toggle("is-active", Number(row.dataset.index) === index);
  }
};

const focusItem = (index) => {
  if (!Number.isInteger(index) || !state.tabId) return;
  state.selectedIndex = index;
  sendRuntime({ type: "selector:focus", tabId: state.tabId, index });
  markActiveRow(index);
};

const getRowFromTarget = (target) =>
  target instanceof Element ? target.closest("li[data-index]") : null;

const fetchInitial = () => {
  if (!state.tabId) return;
  sendRuntime({ type: "debugger:ensure-open", tabId: state.tabId });
  sendRuntime({ type: "sidebar:init", tabId: state.tabId }, render);
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "selector:update" || message.tabId !== state.tabId) return;
  render(message.payload);
});

listNode.addEventListener("click", (event) => {
  const row = getRowFromTarget(event.target);
  if (!row) return;
  const index = Number(row.dataset.index);
  if (!Number.isInteger(index)) return;
  focusItem(index);
});

listNode.addEventListener("mouseover", (event) => {
  const row = getRowFromTarget(event.target);
  if (!row) return;
  if (row === getRowFromTarget(event.relatedTarget)) return;
  const index = Number(row.dataset.index);
  if (!Number.isInteger(index)) return;
  setHoveredIndex(index);
});

listNode.addEventListener("mouseout", (event) => {
  const row = getRowFromTarget(event.target);
  if (!row) return;
  const nextRow = getRowFromTarget(event.relatedTarget);
  if (row === nextRow) return;
  if (!nextRow) {
    clearHoveredIndex();
    return;
  }
  const index = Number(nextRow.dataset.index);
  if (!Number.isInteger(index)) return;
  setHoveredIndex(index);
});

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  state.tabId = tab?.id || null;
  fetchInitial();
});

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!state.tabId) return;
    event.preventDefault();
    event.stopPropagation();
    sendRuntime({ type: "debugger:reset", tabId: state.tabId });
  },
  true
);

