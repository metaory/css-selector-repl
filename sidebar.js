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

const fmtAttr = ([k, v]) =>
  v ? `[${k}="${v.length > 40 ? `${v.slice(0, 40)}…` : v}"]` : `[${k}]`;

const normalizeText = (text = "") => `${text}`.trim().replace(/\s+/g, " ");
const firstTextToken = (text = "") => text.match(/^\S+/)?.[0] || "";

const toLabelParts = (item) => {
  const selector = [
    item.tag,
    item.id && `#${item.id}`,
    item.classes?.length && `.${item.classes.join(".")}`,
    item.attrs?.length && item.attrs.map(fmtAttr).join("")
  ]
    .filter(Boolean)
    .join("");
  const fullText = normalizeText(item.text);
  const firstWord = firstTextToken(fullText);
  const previewText = firstWord ? `${firstWord}${fullText.length > firstWord.length ? "…" : ""}` : "";
  return { selector, previewText, fullText };
};

const render = (payload) => {
  const next = { ...defaultPayload, ...(payload || {}) };
  const selectorChanged = next.selector !== state.payload.selector;
  if (selectorChanged) clearHoveredIndex();
  const selectedIndex = next.selector !== state.payload.selector ? null : state.selectedIndex;
  state.selectedIndex = selectedIndex !== null && selectedIndex < next.matches.length ? selectedIndex : null;
  state.payload = next;
  const { selector, count, matches, error } = next;
  metaNode.textContent = selector ? `${count} match(es) for: ${selector}` : "No selector yet.";
  errorNode.textContent = error;
  errorNode.style.display = error ? "block" : "none";
  const toRow = (item, index) => {
    const { selector, previewText, fullText } = toLabelParts(item);
    const row = el("li");
    const selectorNode = Object.assign(el("span"), { className: "entry-selector", textContent: selector });
    row.append(selectorNode);
    if (previewText) {
      const previewNode = Object.assign(el("span"), {
        className: "entry-text-preview",
        textContent: ` "${previewText}"`
      });
      const fullNode = Object.assign(el("span"), {
        className: "entry-text-full",
        textContent: ` "${fullText}"`
      });
      row.append(previewNode, fullNode);
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

const focusItem = (index) => {
  if (!Number.isInteger(index) || !state.tabId) return;
  state.selectedIndex = index;
  sendRuntime({ type: "selector:focus", tabId: state.tabId, index });
  render(state.payload);
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

