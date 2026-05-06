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
const enableActionSidebar = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

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

const setTabPayload = (tabId, payload) => {
  tabState.set(tabId, payload);
  chrome.runtime.sendMessage({ type: "selector:update", payload, tabId }, () => {
    void chrome.runtime.lastError;
  });
  return payload;
};

const openDebugger = (tabId) =>
  tabId
    ? chrome.sidePanel
        .setOptions({ tabId, path: "sidebar.html", enabled: true })
        .then(() => chrome.sidePanel.open({ tabId }))
        .then(() => ensureDebuggerInput(tabId))
        .catch(() => undefined)
    : Promise.resolve();

chrome.action.onClicked.addListener((tab) => {
  openDebugger(tab?.id);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "reload-extension") {
    chrome.runtime.reload();
    return;
  }
  if (command !== "toggle-debugger") return;
  getActiveTab().then((tab) => openDebugger(tab?.id));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!isTabId(tabId)) return;
  const shouldReset = changeInfo?.status === "loading" || typeof changeInfo?.url === "string";
  if (!shouldReset) return;
  setTabPayload(tabId, { ...emptyPayload, tabId });
  onInjectableTab(tabId, changeInfo?.url, () =>
    ensureContentScript(tabId)
      .then(() => sendTabMessage(tabId, { type: "debugger:reset" }))
      .catch(() => undefined)
  );
});

if (chrome.sidePanel?.onOpened) {
  chrome.sidePanel.onOpened.addListener((panel) => {
    ensureDebuggerInput(panel?.tabId);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "selector:update") {
    const tabId = sender?.tab?.id;
    if (!tabId) return;
    setTabPayload(tabId, { ...message.payload, tabId });
    return;
  }
  if (message?.type === "debugger:ensure-open") {
    if (!message.tabId) return;
    ensureDebuggerInput(message.tabId);
    return;
  }
  if (message?.type === "debugger:close") {
    if (!message.tabId) return;
    ensureContentScript(message.tabId).then(() =>
      sendTabMessage(message.tabId, { type: "debugger:close" })
    );
    setTabPayload(message.tabId, { ...emptyPayload, tabId: message.tabId });
    return;
  }
  if (message?.type === "selector:focus") {
    if (!isTabId(message.tabId) || !Number.isInteger(message.index)) return;
    ensureContentScript(message.tabId).then(() =>
      sendTabMessage(message.tabId, { type: "selector:focus", index: message.index })
    );
    return;
  }
  if (message?.type !== "sidebar:init") return;
  sendResponse(tabState.get(message.tabId) || emptyPayload);
});

