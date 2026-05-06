const metaNode = document.getElementById("meta");
const errorNode = document.getElementById("error");
const listNode = document.getElementById("list");

const defaultPayload = {
  selector: "",
  count: 0,
  matches: [],
  error: ""
};

const state = {
  tabId: null,
  selectedIndex: null,
  payload: defaultPayload
};

const fmtAttr = ([k, v]) =>
  v ? `[${k}="${v.length > 40 ? `${v.slice(0, 40)}…` : v}"]` : `[${k}]`;

const toLabel = (item) => {
  const selector = [
    item.tag,
    item.id && `#${item.id}`,
    item.classes?.length && `.${item.classes.join(".")}`,
    item.attrs?.length && item.attrs.map(fmtAttr).join("")
  ]
    .filter(Boolean)
    .join("");

  return item.text ? `${selector} "${item.text}"` : selector;
};

const render = (payload) => {
  const next = { ...defaultPayload, ...(payload || {}) };
  const selectedIndex = next.selector !== state.payload.selector ? null : state.selectedIndex;
  state.selectedIndex = selectedIndex !== null && selectedIndex < next.matches.length ? selectedIndex : null;
  state.payload = next;
  const { selector, count, matches, error } = next;
  metaNode.textContent = selector ? `${count} match(es) for: ${selector}` : "No selector yet.";
  errorNode.textContent = error;
  errorNode.style.display = error ? "block" : "none";
  listNode.textContent = "";
  const rows = matches.reduce((fragment, item, index) => {
    const row = document.createElement("li");
    row.dataset.index = `${index}`;
    if (index === state.selectedIndex) row.classList.add("is-active");
    row.textContent = toLabel(item);
    fragment.append(row);
    return fragment;
  }, document.createDocumentFragment());
  listNode.append(rows);
};

const focusItem = (index) => {
  if (!Number.isInteger(index) || !state.tabId) return;
  state.selectedIndex = index;
  chrome.runtime.sendMessage({ type: "selector:focus", tabId: state.tabId, index }, () => {
    void chrome.runtime.lastError;
  });
  render(state.payload);
};

const getRowFromTarget = (target) =>
  target instanceof Element ? target.closest("li[data-index]") : null;

const fetchInitial = () => {
  if (!state.tabId) return;
  chrome.runtime.sendMessage({ type: "debugger:ensure-open", tabId: state.tabId }, () => {
    void chrome.runtime.lastError;
  });
  chrome.runtime.sendMessage({ type: "sidebar:init", tabId: state.tabId }, render);
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "selector:update" || message.tabId !== state.tabId) return;
  render(message.payload);
});

const closeDebugger = () => {
  if (!state.tabId) return;
  chrome.runtime.sendMessage({ type: "debugger:close", tabId: state.tabId }, () => {
    void chrome.runtime.lastError;
  });
};

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  closeDebugger();
});

window.addEventListener("pagehide", closeDebugger);

listNode.addEventListener("click", (event) => {
  const row = getRowFromTarget(event.target);
  if (!row) return;
  const index = Number(row.dataset.index);
  if (!Number.isInteger(index)) return;
  focusItem(index);
});

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  state.tabId = tab?.id || null;
  fetchInitial();
});

