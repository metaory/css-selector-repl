globalThis.LCS = {
  EMPTY_PAYLOAD: { selector: "", count: 0, matches: [], error: "" },
  MSG: {
    TOGGLE: "lcs:toggle",
    CLOSE: "lcs:close",
    SYNC: "lcs:sync"
  },
  normalizePayload: (payload) => ({ ...globalThis.LCS.EMPTY_PAYLOAD, ...(payload || {}) }),
  send: (message, callback) => {
    try {
      chrome.runtime.sendMessage(message, callback ?? (() => void chrome.runtime.lastError));
    } catch {
      // extension context invalidated (reload or navigation)
    }
  },
  isBareEscape: (event) =>
    event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey
};

if (typeof document !== "undefined") {
  globalThis.LCS.$id = document.getElementById.bind(document);
  globalThis.LCS.el = (tag) => document.createElement(tag);
  globalThis.LCS.mk = (tag, { children, ...props } = {}) => {
    const node = Object.assign(globalThis.LCS.el(tag), props);
    if (children?.length) node.append(...children);
    return node;
  };
}

(() => {
  const { LCS } = globalThis;
  const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const fmtAttr = ([k, v]) => (v ? `${k}="${truncate(v, 24)}"` : k);
  const normText = (text = "") => `${text}`.trim().replace(/\s+/g, " ");
  const chipDefs = [
    (p) => [["tag", p.tag], ["id", p.id]],
    (p) => p.classes.map((value) => ["cls", value]),
    (p) => p.attrs.map((value) => ["attr", value]),
    (p) => (p.text ? [["text", `"${p.text}"`]] : [])
  ];

  const toParts = (item) => ({
    tag: item.tag,
    id: item.id ? `#${item.id}` : "",
    classes: (item.classes || []).map((c) => `.${c}`),
    attrs: (item.attrs || []).slice(0, 2).map(fmtAttr),
    text: truncate(normText(item.text), 56)
  });

  LCS.renderInspector = ({ meta, error, list }, payload, selectedIndex) => {
    const { el, mk, normalizePayload } = LCS;
    const { selector, count, matches, error: err } = normalizePayload(payload);
    if (!selector) {
      Object.assign(meta, {
        className: "__lcs_panel_meta_empty__",
        textContent: "No selector yet."
      });
    } else {
      Object.assign(meta, { className: "__lcs_panel_meta_head__" });
      meta.replaceChildren(
        mk("span", { className: "__lcs_panel_count__", textContent: String(count) }),
        mk("code", { className: "__lcs_panel_selector__", textContent: selector })
      );
    }
    Object.assign(error, { textContent: err, hidden: !err });
    list.replaceChildren(
      ...matches.map((item, index) => {
        const row = el("li");
        row.dataset.index = `${index}`;
        if (index === selectedIndex) row.classList.add("is-active");
        if (item.hidden) row.classList.add("is-hidden");
        const chips = chipDefs
          .flatMap((build) => build(toParts(item)))
          .filter(([, value]) => value)
          .map(([kind, value]) =>
            mk("span", { className: `__lcs_chip__ __lcs_chip_${kind}__`, textContent: value })
          );
        if (item.hidden) {
          chips.unshift(
            mk("span", { className: "__lcs_chip__ __lcs_chip_hidden__", textContent: "hidden" })
          );
        }
        row.append(mk("div", { className: "__lcs_row_chips__", children: chips }));
        return row;
      })
    );
  };
})();
