importScripts("shared.js");

const { EMPTY_PAYLOAD, MSG, normalizePayload, send } = globalThis.LCS;

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "update") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.reload(tab.id);
});

const SESSION_KEY = "tabState";
const defaultTabState = { active: false, payload: { ...EMPTY_PAYLOAD } };
let activeTabId = null;
const readyTabs = new Set();

const enableActionSidebar = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);

enableActionSidebar();
chrome.runtime.onStartup.addListener(enableActionSidebar);

const isTabId = (tabId) => Number.isInteger(tabId);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getAllTabState = async () => {
  const { [SESSION_KEY]: data = {} } = await chrome.storage.session.get(SESSION_KEY);
  return data;
};

const getTabState = async (tabId) => {
  const all = await getAllTabState();
  return all[tabId] ?? defaultTabState;
};

const syncActiveTab = (tabId, active) => {
  if (!isTabId(tabId)) return;
  if (active) activeTabId = tabId;
  if (!active && activeTabId === tabId) activeTabId = null;
};

const setTabState = async (tabId, next) => {
  if (!isTabId(tabId)) return defaultTabState;
  const all = await getAllTabState();
  const value = { ...(all[tabId] ?? defaultTabState), ...next };
  if ("active" in next) syncActiveTab(tabId, next.active);
  await chrome.storage.session.set({ [SESSION_KEY]: { ...all, [tabId]: value } });
  return value;
};

const deleteTabState = async (tabId) => {
  if (activeTabId === tabId) activeTabId = null;
  readyTabs.delete(tabId);
  const all = await getAllTabState();
  if (!(tabId in all)) return;
  const { [tabId]: _, ...rest } = all;
  await chrome.storage.session.set({ [SESSION_KEY]: rest });
};

const sendTabMessage = async (tabId, message) => {
  if (!isTabId(tabId)) return false;
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
};

const ensureContentScript = async (tabId) => {
  if (!isTabId(tabId)) return false;
  if (readyTabs.has(tabId)) {
    if (await sendTabMessage(tabId, { type: MSG.PING })) return true;
    readyTabs.delete(tabId);
  }
  for (let i = 0; i < 2; i++) {
    if (await sendTabMessage(tabId, { type: MSG.PING })) {
      readyTabs.add(tabId);
      return true;
    }
    if (i < 1) await wait(50);
  }
  return false;
};

const setTabPayload = async (tabId, payload) => {
  const normalizedPayload = normalizePayload(payload);
  await setTabState(tabId, { payload: normalizedPayload });
  send({ type: MSG.UPDATE, payload: normalizedPayload, tabId });
  return normalizedPayload;
};

const isTabActive = (tabId) => activeTabId === tabId;

const closeSidePanel = async (tabId) => {
  if (!isTabId(tabId)) return;
  try {
    await chrome.sidePanel.close({ tabId });
    return;
  } catch {
    // tabId close may fail; try windowId fallback
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (Number.isInteger(tab?.windowId)) await chrome.sidePanel.close({ windowId: tab.windowId });
  } catch {
    // ignore
  }
};

const activate = async (tabId, { windowId } = {}) => {
  if (!isTabId(tabId)) return;
  const openPanel = Number.isInteger(windowId)
    ? chrome.sidePanel.open({ windowId })
    : chrome.sidePanel.open({ tabId });
  void openPanel.catch(() => undefined);
  await setTabState(tabId, { active: true });
  if (!(await ensureContentScript(tabId))) return;
  await sendTabMessage(tabId, { type: MSG.OPEN });
};

const deactivate = async (tabId) => {
  if (!isTabId(tabId)) return;
  await setTabState(tabId, { active: false });
  await setTabPayload(tabId, EMPTY_PAYLOAD);
  await Promise.all([
    closeSidePanel(tabId),
    ensureContentScript(tabId).then((ready) => ready && sendTabMessage(tabId, { type: MSG.CLOSE }))
  ]);
};

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab?.id;
  if (!isTabId(tabId)) return;
  if (isTabActive(tabId)) return void deactivate(tabId);
  void activate(tabId, { windowId: tab.windowId });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-selector-input") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  if (!isTabId(tabId)) return;
  if (isTabActive(tabId)) return deactivate(tabId);
  await activate(tabId, { windowId: tab.windowId });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void deleteTabState(tabId);
});

const shouldDeactivateOnUpdate = ({ status, url } = {}) =>
  status === "loading" || typeof url === "string";

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!shouldDeactivateOnUpdate(changeInfo)) return;
  if (!isTabId(tabId) || !isTabActive(tabId)) return;
  void deactivate(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (!isTabId(tabId)) return;
  void (async () => {
    const all = await getAllTabState();
    for (const [otherId, state] of Object.entries(all)) {
      if (Number(otherId) === tabId || !state.active) continue;
      await deactivate(Number(otherId));
    }
  })();
});

const forwardToTab = async (message) => {
  if (!(await ensureContentScript(message.tabId))) return;
  await sendTabMessage(message.tabId, message);
};

const FORWARD_MSGS = [MSG.FOCUS, MSG.HOVER, MSG.HOVER_CLEAR, MSG.RESET, MSG.FOCUS_INPUT];

const messageHandlers = {
  [MSG.UPDATE]: async (message, sender) => {
    const tabId = sender?.tab?.id;
    if (!isTabId(tabId)) return;
    if (!(await getTabState(tabId)).active) return;
    await setTabPayload(tabId, message.payload);
  },
  [MSG.DEACTIVATE]: async (message, sender) => {
    const tabId = message.tabId ?? sender?.tab?.id;
    if (!isTabId(tabId)) return;
    await deactivate(tabId);
  },
  [MSG.SIDEBAR_INIT]: async (message, _sender, sendResponse) => {
    sendResponse((await getTabState(message.tabId)).payload);
  }
};

for (const type of FORWARD_MSGS) messageHandlers[type] = forwardToTab;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message?.type];
  if (!handler) return;
  void handler(message, sender, sendResponse);
  return message?.type === MSG.SIDEBAR_INIT;
});
