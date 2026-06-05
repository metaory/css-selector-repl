const MSG = { TOGGLE: "lcs:toggle", CLOSE: "lcs:close", SYNC: "lcs:sync" };

let activeTabId = null;

const isTabId = (tabId) => Number.isInteger(tabId);

const sendTab = (tabId, message) => {
  if (!isTabId(tabId)) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
};

const toggleTab = (tabId) => {
  if (!isTabId(tabId)) return;
  if (activeTabId && activeTabId !== tabId) sendTab(activeTabId, { type: MSG.CLOSE });
  sendTab(tabId, { type: MSG.TOGGLE });
};

chrome.action.onClicked.addListener((tab) => toggleTab(tab?.id));

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-selector-input") return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => toggleTab(tab?.id));
});

chrome.runtime.onMessage.addListener(({ type, active }, { tab }) => {
  if (type !== MSG.SYNC || !isTabId(tab?.id)) return;
  activeTabId = active ? tab.id : activeTabId === tab.id ? null : activeTabId;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabId === tabId) activeTabId = null;
});

chrome.tabs.onUpdated.addListener((tabId, { status, url } = {}) => {
  if (activeTabId !== tabId) return;
  if (status === "loading" || typeof url === "string") activeTabId = null;
});
