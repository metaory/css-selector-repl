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

const sendTabMessage = (tabId, message) =>
  isTabId(tabId)
    ? new Promise((resolve) =>
        chrome.tabs.sendMessage(tabId, message, () => resolve(!chrome.runtime.lastError))
      )
    : Promise.resolve(false);

const injectContentScript = (tabId) =>
  getTabUrl(tabId).then((url) =>
    isInjectableUrl(url)
      ? chrome.scripting
          .executeScript({ target: { tabId }, world: "ISOLATED", files: ["content.js"] })
          .catch(() => undefined)
      : undefined
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
  return chrome.sidePanel.close({ tabId }).catch(() =>
    chrome.tabs
      .get(tabId)
      .then((tab) =>
        Number.isInteger(tab?.windowId)
          ? chrome.sidePanel.close({ windowId: tab.windowId })
          : undefined
      )
      .catch(() => undefined)
  );
};

const openSidePanel = (tabId) =>
  isTabId(tabId)
    ? chrome.sidePanel.open({ tabId }).catch(() => undefined)
    : Promise.resolve();

const activateDebugger = (tabId) => {
  if (!isTabId(tabId)) return Promise.resolve();
  setTabActive(tabId, true);
  return ensureDebuggerInput(tabId);
};

const activateDebuggerWithSidePanel = (tabId) => {
  if (!isTabId(tabId)) return Promise.resolve();
  void openSidePanel(tabId).catch(() => undefined);
  return activateDebugger(tabId);
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

const toggleDebugger = (tabId, activate = activateDebugger) =>
  isTabActive(tabId) ? deactivateDebugger(tabId) : activate(tabId);

chrome.action.onClicked.addListener((tab) => {
  toggleDebugger(tab?.id, activateDebuggerWithSidePanel);
});

const commandHandlers = {
  "toggle-selector-input": () => getActiveTab().then((tab) => toggleDebugger(tab?.id))
};

chrome.commands.onCommand.addListener((command) => {
  commandHandlers[command]?.();
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

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (!isTabId(tabId)) return;
  for (const [otherId, state] of tabState) {
    if (otherId === tabId || !state.active) continue;
    deactivateDebugger(otherId);
  }
});

chrome.sidePanel.onOpened.addListener((panel) => {
  if (!isTabId(panel?.tabId)) return;
  setTabActive(panel.tabId, true);
  chrome.runtime.sendMessage({ type: "sidebar:opened", tabId: panel.tabId }, () =>
    void chrome.runtime.lastError
  );
});

const forwardToTab = (message) =>
  ensureContentScript(message.tabId).then(() => sendTabMessage(message.tabId, message));

const messageHandlers = {
  "selector:update": (message, sender) => {
    const tabId = sender?.tab?.id;
    if (!isTabId(tabId)) return;
    setTabPayload(tabId, message.payload);
  },
  "selector:focus": forwardToTab,
  "selector:hover": forwardToTab,
  "selector:hover-clear": forwardToTab,
  "debugger:reset": forwardToTab,
  "debugger:focus-input": forwardToTab,
  "sidebar:init": (message, _sender, sendResponse) => {
    sendResponse(getTabState(message.tabId).payload);
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  messageHandlers[message?.type]?.(message, sender, sendResponse);
});

