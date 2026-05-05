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

const sendOpenMessage = (tabId) =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "debugger:open" }, () =>
      resolve(!chrome.runtime.lastError)
    );
  });

const injectContentScript = (tabId) =>
  chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });

const ensureDebuggerInput = (tabId) =>
  Number.isInteger(tabId)
    ? sendOpenMessage(tabId).then((hasReceiver) =>
        hasReceiver ? undefined : injectContentScript(tabId).then(() => sendOpenMessage(tabId))
      )
    : Promise.resolve();

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

if (chrome.sidePanel?.onOpened) {
  chrome.sidePanel.onOpened.addListener((panel) => {
    ensureDebuggerInput(panel?.tabId);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "selector:update") {
    const tabId = sender?.tab?.id;
    if (!tabId) return;
    const payload = { ...message.payload, tabId };
    tabState.set(tabId, payload);
    chrome.runtime.sendMessage({ type: "selector:update", payload, tabId });
    return;
  }
  if (message?.type === "debugger:ensure-open") {
    if (!message.tabId) return;
    ensureDebuggerInput(message.tabId);
    return;
  }
  if (message?.type === "selector:focus") {
    if (!Number.isInteger(message.tabId) || !Number.isInteger(message.index)) return;
    ensureDebuggerInput(message.tabId).then(() =>
      chrome.tabs.sendMessage(message.tabId, { type: "selector:focus", index: message.index })
    );
    return;
  }
  if (message?.type !== "sidebar:init") return;
  sendResponse(tabState.get(message.tabId) || emptyPayload);
});

