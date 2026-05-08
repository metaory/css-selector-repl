chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "update") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.reload(tab.id);
});

const tabState = new Map();
const emptyPayload = {
  selector: "",
  count: 0,
  matches: [],
  error: ""
};
const defaultTabState = { active: false, payload: { ...emptyPayload } };
const enableActionSidebar = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);

enableActionSidebar();
chrome.runtime.onStartup.addListener(enableActionSidebar);

const getActiveTab = () =>
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab);

const isTabId = (tabId) => Number.isInteger(tabId);

const blockedUrlMatchers = [
  /^https:\/\/chrome\.google\.com\/webstore/,
  /^https:\/\/chromewebstore\.google\.com\//
];

const isInjectableUrl = (url) =>
  typeof url === "string" &&
  /^(https?:|file:)/.test(url) &&
  !blockedUrlMatchers.some((re) => re.test(url));

const getTabUrl = (tabId) =>
  isTabId(tabId)
    ? chrome.tabs
        .get(tabId)
        .then((tab) => tab?.url)
        .catch(() => undefined)
    : Promise.resolve(undefined);

const onInjectableTab = (tabId, urlHint, effect) =>
  (typeof urlHint === "string" ? Promise.resolve(urlHint) : getTabUrl(tabId)).then((url) =>
    isInjectableUrl(url) ? effect(url) : undefined
  );

const sendTabMessage = (tabId, message) =>
  isTabId(tabId)
    ? new Promise((resolve) =>
        chrome.tabs.sendMessage(tabId, message, () => resolve(!chrome.runtime.lastError))
      )
    : Promise.resolve(false);

const injectContentScript = (tabId) =>
  onInjectableTab(tabId, undefined, () =>
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: "ISOLATED",
        files: ["content.js"]
      })
      .catch(() => undefined)
  );

const ensureContentScript = (tabId) =>
  isTabId(tabId)
    ? sendTabMessage(tabId, { type: "debugger:ping" }).then((hasReceiver) =>
        hasReceiver ? undefined : injectContentScript(tabId)
      )
    : Promise.resolve();

const ensureDebuggerInput = (tabId) =>
  isTabId(tabId)
    ? ensureContentScript(tabId).then(() => sendTabMessage(tabId, { type: "debugger:open" }))
    : Promise.resolve(false);

const getTabState = (tabId) => tabState.get(tabId) || defaultTabState;

const setTabState = (tabId, next) => {
  if (!isTabId(tabId)) return defaultTabState;
  const current = getTabState(tabId);
  const value = { ...current, ...next };
  tabState.set(tabId, value);
  return value;
};

const setTabPayload = (tabId, payload) => {
  const normalizedPayload = { ...emptyPayload, ...(payload || {}) };
  setTabState(tabId, { payload: normalizedPayload });
  chrome.runtime.sendMessage({ type: "selector:update", payload: normalizedPayload, tabId }, () => {
    void chrome.runtime.lastError;
  });
  return normalizedPayload;
};

const setTabActive = (tabId, active) => {
  setTabState(tabId, { active });
  return active;
};

const isTabActive = (tabId) => getTabState(tabId).active === true;

const closeSidePanel = (tabId) => {
  if (!isTabId(tabId)) return Promise.resolve();
  if (typeof chrome.sidePanel?.close === "function") {
    return chrome.sidePanel.close({ tabId }).catch(() =>
      chrome.tabs
        .get(tabId)
        .then((tab) =>
          Number.isInteger(tab?.windowId)
            ? chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => undefined)
            : undefined
        )
        .catch(() => undefined)
    );
  }
  return chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => undefined);
};

const openSidePanel = (tabId) =>
  isTabId(tabId)
    ? chrome.sidePanel.open({ tabId }).catch(() => undefined)
    : Promise.resolve();

const activateDebugger = (tabId) => {
  if (!isTabId(tabId)) return Promise.resolve();
  setTabActive(tabId, true);
  return openSidePanel(tabId).then(() => ensureDebuggerInput(tabId)).catch(() => undefined);
};

const deactivateDebugger = (tabId) => {
  if (!isTabId(tabId)) return Promise.resolve();
  setTabActive(tabId, false);
  setTabPayload(tabId, emptyPayload);
  return Promise.all([
    closeSidePanel(tabId),
    ensureContentScript(tabId).then(() => sendTabMessage(tabId, { type: "debugger:close" }))
  ]).catch(() => undefined);
};

const toggleDebugger = (tabId) =>
  isTabActive(tabId) ? deactivateDebugger(tabId) : activateDebugger(tabId);

chrome.action.onClicked.addListener((tab) => {
  toggleDebugger(tab?.id);
});

const commandHandlers = {
  "reload-extension": () => chrome.runtime.reload(),
  "toggle-debugger": () => getActiveTab().then((tab) => toggleDebugger(tab?.id))
};

chrome.commands.onCommand.addListener((command) => {
  const handler = commandHandlers[command];
  if (!handler) return;
  handler();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!isTabId(tabId)) return;
  if (changeInfo?.status !== "loading") return;
  if (!isTabActive(tabId)) return;
  deactivateDebugger(tabId);
});

if (chrome.sidePanel?.onOpened) {
  chrome.sidePanel.onOpened.addListener((panel) => {
    if (!isTabId(panel?.tabId)) return;
    setTabActive(panel.tabId, true);
    ensureDebuggerInput(panel.tabId);
  });
}

const messageHandlers = {
  "selector:update": (message, sender) => {
    const tabId = sender?.tab?.id;
    if (!isTabId(tabId)) return;
    setTabPayload(tabId, { ...emptyPayload, ...message.payload, tabId });
  },
  "debugger:ensure-open": (message) => {
    if (!isTabId(message.tabId)) return;
    setTabActive(message.tabId, true);
    ensureDebuggerInput(message.tabId);
  },
  "debugger:close": (message) => {
    deactivateDebugger(message.tabId);
  },
  "selector:focus": (message) => {
    if (!isTabId(message.tabId) || !Number.isInteger(message.index)) return;
    ensureContentScript(message.tabId).then(() =>
      sendTabMessage(message.tabId, { type: "selector:focus", index: message.index })
    );
  },
  "selector:hover": (message) => {
    if (!isTabId(message.tabId) || !Number.isInteger(message.index)) return;
    ensureContentScript(message.tabId).then(() =>
      sendTabMessage(message.tabId, { type: "selector:hover", index: message.index })
    );
  },
  "selector:hover-clear": (message) => {
    if (!isTabId(message.tabId)) return;
    ensureContentScript(message.tabId).then(() =>
      sendTabMessage(message.tabId, { type: "selector:hover-clear" })
    );
  },
  "sidebar:init": (message, _sender, sendResponse) => {
    sendResponse(getTabState(message.tabId).payload || emptyPayload);
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message?.type];
  if (!handler) return;
  handler(message, sender, sendResponse);
});

