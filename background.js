chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "update") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.reload(tab.id);
});

const SESSION_KEY = "tabState";
const emptyPayload = { selector: "", count: 0, matches: [], error: "" };
const defaultTabState = { active: false, payload: { ...emptyPayload } };
const activeNow = new Set();

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

const syncActiveNow = (tabId, active) => {
  if (!isTabId(tabId)) return;
  if (active) activeNow.add(tabId);
  if (!active) activeNow.delete(tabId);
};

const hydrateActiveNow = async () => {
  activeNow.clear();
  const all = await getAllTabState();
  for (const [id, state] of Object.entries(all)) {
    if (state.active) activeNow.add(Number(id));
  }
};

void hydrateActiveNow();
chrome.runtime.onStartup.addListener(() => void hydrateActiveNow());

const setTabState = async (tabId, next) => {
  if (!isTabId(tabId)) return defaultTabState;
  const all = await getAllTabState();
  const value = { ...(all[tabId] ?? defaultTabState), ...next };
  if ("active" in next) syncActiveNow(tabId, next.active);
  await chrome.storage.session.set({ [SESSION_KEY]: { ...all, [tabId]: value } });
  return value;
};

const deleteTabState = async (tabId) => {
  activeNow.delete(tabId);
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

const ensureContentScript = async (tabId, tries = 8) => {
  if (!isTabId(tabId)) return false;
  for (let i = 0; i < tries; i++) {
    if (await sendTabMessage(tabId, { type: "debugger:ping" })) return true;
    if (i < tries - 1) await wait(50);
  }
  return false;
};

const setTabPayload = async (tabId, payload) => {
  const normalizedPayload = { ...emptyPayload, ...(payload || {}) };
  await setTabState(tabId, { payload: normalizedPayload });
  chrome.runtime.sendMessage(
    { type: "selector:update", payload: normalizedPayload, tabId },
    () => void chrome.runtime.lastError
  );
  return normalizedPayload;
};

const isTabActive = (tabId) => activeNow.has(tabId);

const closeSidePanel = async (tabId) => {
  if (!isTabId(tabId)) return;
  try {
    await chrome.sidePanel.close({ tabId });
    return;
  } catch {
    // fall through
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (Number.isInteger(tab?.windowId)) await chrome.sidePanel.close({ windowId: tab.windowId });
  } catch {
    // ignore
  }
};

const activateDebugger = async (tabId) => {
  if (!isTabId(tabId)) return;
  await setTabState(tabId, { active: true });
  if (!(await ensureContentScript(tabId))) return;
  await sendTabMessage(tabId, { type: "debugger:open" });
  await sendTabMessage(tabId, { type: "debugger:focus-input" });
};

const openSidePanelNow = (tabId) => {
  if (!isTabId(tabId)) return;
  void chrome.sidePanel.open({ tabId }).catch(() => undefined);
};

const deactivateDebugger = async (tabId) => {
  if (!isTabId(tabId)) return;
  await setTabState(tabId, { active: false });
  await setTabPayload(tabId, emptyPayload);
  await Promise.all([
    closeSidePanel(tabId),
    ensureContentScript(tabId).then(
      (ready) => ready && sendTabMessage(tabId, { type: "debugger:close" })
    )
  ]);
};

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab?.id;
  if (!isTabId(tabId)) return;
  if (isTabActive(tabId)) {
    void deactivateDebugger(tabId);
    return;
  }
  openSidePanelNow(tabId);
  void activateDebugger(tabId);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-selector-input") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  if (!isTabId(tabId)) return;
  if (isTabActive(tabId)) return deactivateDebugger(tabId);
  if (Number.isInteger(tab.windowId)) {
    void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }
  await activateDebugger(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void deleteTabState(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo?.status !== "loading") return;
  void (async () => {
    if (!isTabId(tabId) || !isTabActive(tabId)) return;
    await deactivateDebugger(tabId);
  })();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (!isTabId(tabId)) return;
  void (async () => {
    const all = await getAllTabState();
    for (const [otherId, state] of Object.entries(all)) {
      if (Number(otherId) === tabId || !state.active) continue;
      await deactivateDebugger(Number(otherId));
    }
  })();
});

chrome.sidePanel.onOpened.addListener((panel) => {
  const tabId = panel?.tabId;
  if (!isTabId(tabId)) return;
  void (async () => {
    await setTabState(tabId, { active: true });
    if (!(await ensureContentScript(tabId))) return;
    await sendTabMessage(tabId, { type: "debugger:focus-input" });
  })();
});

const forwardToTab = async (message) => {
  if (!(await ensureContentScript(message.tabId))) return;
  await sendTabMessage(message.tabId, message);
};

const messageHandlers = {
  "selector:update": async (message, sender) => {
    const tabId = sender?.tab?.id;
    if (!isTabId(tabId)) return;
    await setTabPayload(tabId, message.payload);
  },
  "selector:focus": forwardToTab,
  "selector:hover": forwardToTab,
  "selector:hover-clear": forwardToTab,
  "debugger:reset": forwardToTab,
  "debugger:focus-input": forwardToTab,
  "debugger:deactivate": async (message, sender) => {
    const tabId = message.tabId ?? sender?.tab?.id;
    if (!isTabId(tabId)) return;
    await deactivateDebugger(tabId);
  },
  "sidebar:init": async (message, _sender, sendResponse) => {
    sendResponse((await getTabState(message.tabId)).payload);
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message?.type];
  if (!handler) return;
  void handler(message, sender, sendResponse);
  return message?.type === "sidebar:init";
});
