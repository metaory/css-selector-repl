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

const toLabel = (item) => {
  const id = item.id ? `#${item.id}` : "";
  const classes = (item.classes || []).length ? `.${item.classes.join(".")}` : "";
  const text = item.text ? ` "${item.text}"` : "";
  return `${item.tag}${id}${classes}${text}`;
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
  chrome.runtime.sendMessage({ type: "selector:focus", tabId: state.tabId, index });
  render(state.payload);
};

const fetchInitial = () => {
  if (!state.tabId) return;
  chrome.runtime.sendMessage({ type: "debugger:ensure-open", tabId: state.tabId });
  chrome.runtime.sendMessage({ type: "sidebar:init", tabId: state.tabId }, render);
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "selector:update" || message.tabId !== state.tabId) return;
  render(message.payload);
});

listNode.addEventListener("click", (event) => {
  const row = event.target.closest("li[data-index]");
  if (!row) return;
  focusItem(Number(row.dataset.index));
});

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  state.tabId = tab?.id || null;
  fetchInitial();
});

