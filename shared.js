globalThis.LCS = {
  EMPTY_PAYLOAD: { selector: "", count: 0, matches: [], error: "" },
  MSG: {
    TOGGLE: "lcs:toggle",
    CLOSE: "lcs:close",
    SYNC: "lcs:sync"
  },
  CLS: {
    root: "__lcs_root__",
    row: "__lcs_row__",
    count: "__lcs_count__",
    copyBtn: "__lcs_copy_btn__",
    panel: "__lcs_panel__",
    panelError: "__lcs_panel_error__",
    panelList: "__lcs_panel_list__",
    panelMetaEmpty: "__lcs_panel_meta_empty__",
    panelMetaHead: "__lcs_panel_meta_head__",
    panelCount: "__lcs_panel_count__",
    panelSelector: "__lcs_panel_selector__",
    toast: "__lcs_toast__",
    toastShow: "__lcs_toast_show__",
    chip: "__lcs_chip__",
    rowChips: "__lcs_row_chips__"
  },
  normalizePayload: (payload) => ({ ...globalThis.LCS.EMPTY_PAYLOAD, ...(payload || {}) }),
  truncate: (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s),
  normText: (text = "") => `${text}`.trim().replace(/\s+/g, " "),
  send: (message, callback) => {
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage(message, callback ?? (() => void chrome.runtime.lastError));
    } catch {
      /* stale content script after extension reload */
    }
  },
  isBareEscape: (event) =>
    event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey
};

if (typeof document !== "undefined") {
  globalThis.LCS.$id = document.getElementById.bind(document);
  globalThis.LCS.el = (tag) => document.createElement(tag);
  globalThis.LCS.mk = (tag, { children, dataset, ...props } = {}) => {
    const node = Object.assign(globalThis.LCS.el(tag), props);
    if (dataset) Object.assign(node.dataset, dataset);
    if (children?.length) node.append(...children);
    return node;
  };
}

{
  const { LCS } = globalThis;
  const { CLS, truncate, normText } = LCS;
  const fmtAttr = ([k, v]) => (v ? `${k}="${truncate(v, 24)}"` : k);
  const chipDefs = [
    (p) => (p.hidden ? [["hidden", "hidden"]] : []),
    (p) => [["tag", p.tag], ["id", p.id]],
    (p) => p.classes.map((value) => ["cls", value]),
    (p) => p.attrs.map((value) => ["attr", value]),
    (p) => (p.text ? [["text", `"${p.text}"`]] : [])
  ];

  const toParts = (item) => ({
    hidden: item.hidden,
    tag: item.tag,
    id: item.id ? `#${item.id}` : "",
    classes: (item.classes || []).map((c) => `.${c}`),
    attrs: (item.attrs || []).slice(0, 2).map(fmtAttr),
    text: truncate(normText(item.text), 56)
  });

  LCS.renderInspector = ({ meta, error, list }, payload, selectedIndex, hoveredIndex) => {
    const { el, mk, normalizePayload } = LCS;
    const { selector, count, matches, error: err } = normalizePayload(payload);
    if (!selector) {
      Object.assign(meta, {
        className: CLS.panelMetaEmpty,
        textContent: "No selector yet."
      });
    } else {
      Object.assign(meta, { className: CLS.panelMetaHead });
      meta.replaceChildren(
        mk("span", { className: CLS.panelCount, textContent: String(count) }),
        mk("code", { className: CLS.panelSelector, textContent: selector })
      );
    }
    Object.assign(error, { textContent: err, hidden: !err });
    const indexed = matches.map((item, index) => ({ item, index }));
    const sections = [false, true]
      .map((hidden) => indexed.filter(({ item }) => item.hidden === hidden))
      .filter((section) => section.length);
    list.replaceChildren(
      ...sections.flatMap((section, sectionIndex) => [
        ...(sectionIndex ? [mk("li", { ariaHidden: "true", children: [el("hr")] })] : []),
        ...section.map(({ item, index }) => {
          const row = el("li");
          row.dataset.index = `${index}`;
          if (index === selectedIndex) row.classList.add("is-active");
          if (index === hoveredIndex) row.classList.add("is-hovered");
          if (item.hidden) row.classList.add("is-hidden");
          const chips = chipDefs
            .flatMap((build) => build(toParts(item)))
            .filter(([, value]) => value)
            .map(([kind, value]) =>
              mk("span", { className: CLS.chip, dataset: { kind }, textContent: value })
            );
          row.append(mk("div", { className: CLS.rowChips, children: chips }));
          return row;
        })
      ])
    );
  };
}
