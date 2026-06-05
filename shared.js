globalThis.LCS = {
  EMPTY_PAYLOAD: { selector: "", count: 0, matches: [], error: "" },
  MSG: {
    UPDATE: "lcs:update",
    FOCUS: "lcs:focus",
    HOVER: "lcs:hover",
    HOVER_CLEAR: "lcs:hover-clear",
    PING: "lcs:ping",
    OPEN: "lcs:open",
    FOCUS_INPUT: "lcs:focus-input",
    RESET: "lcs:reset",
    CLOSE: "lcs:close",
    DEACTIVATE: "lcs:deactivate",
    SIDEBAR_INIT: "lcs:sidebar-init"
  },
  normalizePayload: (payload) => ({ ...globalThis.LCS.EMPTY_PAYLOAD, ...(payload || {}) }),
  send: (message, callback) =>
    chrome.runtime.sendMessage(message, callback ?? (() => void chrome.runtime.lastError)),
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
