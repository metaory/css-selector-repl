const { EMPTY_PAYLOAD, MSG, normalizePayload, send, isBareEscape, $id, el, mk } = globalThis.LCS;

const metaNode = $id("meta");
const errorNode = $id("error");
const listNode = $id("list");

const state = {
  tabId: null,
  selectedIndex: null,
  hoveredIndex: null,
  payload: EMPTY_PAYLOAD,
  activeRowEl: null
};

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const fmtAttr = ([k, v]) => (v ? `${k}="${truncate(v, 24)}"` : k);
const normalizeText = (text = "") => `${text}`.trim().replace(/\s+/g, " ");

const rowSections = [
  ({ tag, id }) => ({ key: "identity", tokens: [["tag", tag], ["id", id]] }),
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

const toRow = (item, index) => {
  const parts = toLabelParts(item);
  const row = el("li");
  for (const { key, tokens } of rowSections.map((build) => build(parts))) {
    if (!tokens.length) continue;
    row.append(
      mk("div", {
        className: `row-section ${key}`,
        children: tokens
          .filter(([, value]) => value)
          .map(([kind, value]) => mk("span", { className: `chip ${kind}`, textContent: value }))
      })
    );
  }
  row.dataset.index = `${index}`;
  if (index === state.selectedIndex) row.classList.add("is-active");
  return row;
};

const syncActiveRow = () => {
  state.activeRowEl = null;
  if (!Number.isInteger(state.selectedIndex)) return;
  const row = listNode.querySelector(`li[data-index="${state.selectedIndex}"]`);
  if (!row) return;
  row.classList.add("is-active");
  state.activeRowEl = row;
};

const render = (payload) => {
  const next = normalizePayload(payload);
  const selectorChanged = next.selector !== state.payload.selector;
  if (selectorChanged) clearHoveredIndex();
  const selectedIndex = selectorChanged ? null : state.selectedIndex;
  state.selectedIndex =
    selectedIndex !== null && selectedIndex < next.matches.length ? selectedIndex : null;
  state.payload = next;
  const { selector, count, matches, error } = next;
  if (!selector) {
    Object.assign(metaNode, { className: "meta-empty", textContent: "No selector yet." });
  } else {
    Object.assign(metaNode, { className: "meta-head" });
    metaNode.replaceChildren(
      mk("div", {
        id: "meta-count",
        children: [
          mk("span", { className: "meta-stat-num", textContent: String(count) }),
          mk("span", {
            className: "meta-stat-label",
            textContent: count === 1 ? "match" : "matches"
          })
        ]
      }),
      mk("code", { id: "meta-selector", textContent: selector })
    );
  }
  Object.assign(errorNode, { textContent: error, hidden: !error });
  listNode.replaceChildren(...matches.map(toRow));
  syncActiveRow();
};

const setHoveredIndex = (index) => {
  if (!Number.isInteger(index) || !state.tabId) return;
  if (state.hoveredIndex === index) return;
  state.hoveredIndex = index;
  send({ type: MSG.HOVER, tabId: state.tabId, index });
};

const clearHoveredIndex = () => {
  if (!state.tabId || state.hoveredIndex === null) return;
  state.hoveredIndex = null;
  send({ type: MSG.HOVER_CLEAR, tabId: state.tabId });
};

const markActiveRow = (index) => {
  if (state.activeRowEl) state.activeRowEl.classList.remove("is-active");
  const row = listNode.querySelector(`li[data-index="${index}"]`);
  if (!row) {
    state.activeRowEl = null;
    return;
  }
  row.classList.add("is-active");
  state.activeRowEl = row;
};

const focusItem = (index) => {
  if (!Number.isInteger(index) || !state.tabId) return;
  state.selectedIndex = index;
  send({ type: MSG.FOCUS, tabId: state.tabId, index });
  markActiveRow(index);
};

const getRowFromTarget = (target) =>
  target instanceof Element ? target.closest("li[data-index]") : null;

const focusPageInput = () =>
  state.tabId && send({ type: MSG.FOCUS_INPUT, tabId: state.tabId });

const fetchInitial = () => {
  if (!state.tabId) return;
  send({ type: MSG.SIDEBAR_INIT, tabId: state.tabId }, (payload) => render(payload));
};

chrome.runtime.onMessage.addListener((message) => {
  if (message.tabId !== state.tabId) return;
  if (message.type === MSG.UPDATE) render(message.payload);
});

listNode.addEventListener("click", (event) => {
  const row = getRowFromTarget(event.target);
  if (!row) return;
  const index = Number(row.dataset.index);
  if (!Number.isInteger(index)) return;
  focusItem(index);
});

listNode.addEventListener("pointerover", (event) => {
  const row = getRowFromTarget(event.target);
  if (!row) return;
  const index = Number(row.dataset.index);
  if (!Number.isInteger(index)) return;
  setHoveredIndex(index);
});

listNode.addEventListener("pointerout", (event) => {
  if (event.relatedTarget && listNode.contains(event.relatedTarget)) return;
  clearHoveredIndex();
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id || null;
  fetchInitial();
})();

document.addEventListener(
  "keydown",
  (event) => {
    if (!isBareEscape(event)) return;
    if (!state.tabId) return;
    event.preventDefault();
    event.stopPropagation();
    if (!state.payload.selector?.trim()) {
      send({ type: MSG.DEACTIVATE, tabId: state.tabId });
      return;
    }
    send({ type: MSG.RESET, tabId: state.tabId });
    focusPageInput();
  },
  true
);
