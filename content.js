if (!globalThis.__csrepl_booted) {
  globalThis.__csrepl_booted = true;

  const ROOT_ID = "__csrepl_root__";
  const ROW_CLASS = "__csrepl_row__";
  const COUNT_CLASS = "__csrepl_count__";
  const COPY_BTN_CLASS = "__csrepl_copy_btn__";
  const TOAST_CLASS = "__csrepl_toast__";
  const TOAST_SHOW_CLASS = "__csrepl_toast_show__";
  const MATCH_ATTR = "data-csrepl-match";
  const MAX_MATCHES = 150;
  const MAX_HITS = 500;

  const state = {
    input: null,
    countNode: null,
    hits: [],
    selectedIndex: null,
    hoveredIndex: null,
    toastTimer: 0
  };

  const emptyPayload = { selector: "", count: 0, matches: [], error: "" };
  const inputStopEvents = ["keydown", "keyup"];

  const $ = document.querySelector.bind(document);
  const $id = document.getElementById.bind(document);
  const el = (tag) => document.createElement(tag);

  document.fonts.load('800 26px "Baloo 2"');

  const getActiveIndex = () =>
    Number.isInteger(state.hoveredIndex) && state.hoveredIndex >= 0
      ? state.hoveredIndex
      : state.selectedIndex;

  const markHits = () => {
    const active = getActiveIndex();
    for (const [i, node] of state.hits.entries()) {
      if (!(node instanceof Element)) continue;
      node.setAttribute(MATCH_ATTR, i === active ? "active" : "");
    }
  };

  const unmarkHits = () => {
    for (const node of state.hits) node.removeAttribute(MATCH_ATTR);
  };

  const sendUpdate = (payload) => {
    chrome.runtime.sendMessage({ type: "selector:update", payload }, () => {
      void chrome.runtime.lastError;
    });
  };
  const setCount = ({ visible = false, count = 0 } = {}) => {
    const node = state.countNode;
    if (!(node instanceof HTMLElement)) return;
    Object.assign(node, {
      textContent: `${count}`,
      hidden: !visible,
      ariaHidden: visible ? "false" : "true"
    });
  };
  const focusInput = (input) => {
    if (!(input instanceof HTMLInputElement)) return false;
    input.focus({ preventScroll: true });
    input.select();
    return true;
  };
  const clearAndFocusInput = (input = state.input) => {
    if (!(input instanceof HTMLInputElement)) return false;
    input.value = "";
    evaluate("");
    focusInput(input);
    return true;
  };
  const isInputEmpty = (input) => !(input instanceof HTMLInputElement) || !input.value.trim();
  const requestDeactivate = () => {
    chrome.runtime.sendMessage({ type: "debugger:deactivate" }, () => {
      void chrome.runtime.lastError;
    });
  };
  const handleEscape = (event) => {
    if (event.key !== "Escape") return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    const input = state.input;
    if (!(input instanceof HTMLInputElement)) return requestDeactivate();
    if (!isInputEmpty(input)) return clearAndFocusInput(input);
    requestDeactivate();
  };
  const handleGlobalEscape = (event) => {
    if (event.key !== "Escape") return;
    if (event.target === state.input) return;
    handleEscape(event);
  };
  const stopInputEventPropagation = (event) => event.stopPropagation();
  const selectInputOnFocus = (event) => event.target.select();

  const clearHits = () => {
    unmarkHits();
    state.hits = [];
    state.selectedIndex = null;
    state.hoveredIndex = null;
  };

  const compactText = (text) => text.replace(/\s+/g, " ").trim().slice(0, 80);

  const toItem = (node) => ({
    tag: node.tagName.toLowerCase(),
    id: node.id || "",
    classes: [...node.classList],
    attrs: [...node.attributes]
      .filter(({ name }) => name !== "id" && name !== "class")
      .map(({ name, value }) => [name, value]),
    text: compactText(node.innerText || node.textContent || "")
  });

  const isDebuggerNode = (node) => node.id === ROOT_ID || node.closest(`#${ROOT_ID}`);

  const isScrollable = (node) => {
    if (!(node instanceof Element)) return false;
    const { overflowY, overflowX } = getComputedStyle(node);
    const scrollY = /auto|scroll|overlay/.test(overflowY) && node.scrollHeight > node.clientHeight;
    const scrollX = /auto|scroll|overlay/.test(overflowX) && node.scrollWidth > node.clientWidth;
    return scrollY || scrollX;
  };

  const scrollWithin = (container, node) => {
    const nodeRect = node.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    if (nodeRect.bottom > box.bottom) container.scrollTop += nodeRect.bottom - box.bottom;
    if (nodeRect.top < box.top) container.scrollTop -= box.top - nodeRect.top;
    if (nodeRect.right > box.right) container.scrollLeft += nodeRect.right - box.right;
    if (nodeRect.left < box.left) container.scrollLeft -= box.left - nodeRect.left;
  };

  const scrollHitIntoView = (node) => {
    if (!(node instanceof Element)) return;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (isScrollable(parent)) scrollWithin(parent, node);
    }
    node.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  };

  const selectNodes = (selector) => {
    try {
      return {
        matches: [...document.querySelectorAll(selector)].filter((node) => !isDebuggerNode(node)),
        error: ""
      };
    } catch (error) {
      return { matches: [], error: error.message || "Invalid selector" };
    }
  };

  const hitAt = (index) => {
    const selector = state.input?.value?.trim();
    if (!selector) return state.hits[index];
    const { matches, error } = selectNodes(selector);
    if (error) return state.hits[index];
    const fresh = matches[index];
    if (fresh) state.hits[index] = fresh;
    return fresh ?? state.hits[index];
  };

  const evaluate = (selector) => {
    clearHits();
    if (!selector.trim()) {
      setCount();
      sendUpdate({ ...emptyPayload, selector });
      return;
    }
    const { matches, error } = selectNodes(selector);
    if (error) {
      setCount({ visible: true, count: 0 });
      sendUpdate({ ...emptyPayload, selector, error });
      return;
    }
    state.hits = matches.slice(0, MAX_HITS);
    markHits();
    scrollHitIntoView(state.hits[0]);
    setCount({ visible: true, count: matches.length });
    sendUpdate({
      ...emptyPayload,
      selector,
      count: matches.length,
      matches: matches.slice(0, MAX_MATCHES).map(toItem)
    });
  };

  const close = () => {
    if (state.input) state.input.value = "";
    setCount();
    sendUpdate(emptyPayload);
    if (state.toastTimer) clearTimeout(state.toastTimer);
    clearHits();
    $id(ROOT_ID)?.remove();
    state.input = null;
    state.countNode = null;
    state.toastTimer = 0;
  };

  const focusByIndex = (index) => {
    if (!Number.isInteger(index)) return;
    const node = hitAt(index);
    if (!node) return;
    state.selectedIndex = index;
    markHits();
    scrollHitIntoView(node);
  };

  const showToast = (message) => {
    const toast = $(`#${ROOT_ID} .${TOAST_CLASS}`);
    if (!(toast instanceof HTMLElement)) return;
    toast.textContent = message;
    toast.classList.add(TOAST_SHOW_CLASS);
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.classList.remove(TOAST_SHOW_CLASS);
      state.toastTimer = 0;
    }, 3_000);
  };

  const TOAST_COPIED = "Copied";
  const copyToClipboard = (text) => {
    if (!text) return showToast("Nothing to copy");
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(TOAST_COPIED))
      .catch(() => showToast("Copy failed"));
  };
  const copySelector = () => copyToClipboard(state.input?.value?.trim() || "");
  const inputHasSelection = (input) => input.selectionStart !== input.selectionEnd;
  const copyInputOnCtrlCWhenCollapsed = (event) => {
    if (event.code !== "KeyC" || event.altKey) return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    if (inputHasSelection(event.target)) return;
    event.preventDefault();
    copySelector();
  };

  const inputListeners = [
    ["keydown", handleEscape],
    ["keydown", copyInputOnCtrlCWhenCollapsed],
    ["copy", () => showToast(TOAST_COPIED)],
    ["focus", selectInputOnFocus],
    ["input", (event) => evaluate(event.target.value)]
  ];
  const attachInputListeners = (input) => {
    if (input.dataset.csreplInputReady === "1") return input;
    input.dataset.csreplInputReady = "1";
    for (const [eventName, handler] of inputListeners) {
      input.addEventListener(eventName, handler);
    }
    for (const eventName of inputStopEvents) {
      input.addEventListener(eventName, stopInputEventPropagation);
    }
    return input;
  };

  const makeCountNode = () =>
    Object.assign(el("span"), {
      className: COUNT_CLASS,
      hidden: true,
      textContent: "0",
      ariaLabel: "Match count",
      ariaHidden: "true"
    });

  const ensureCountInRow = (row) => {
    const existing = row.querySelector(`.${COUNT_CLASS}`);
    if (existing instanceof HTMLElement) {
      state.countNode = existing;
      return;
    }
    const count = makeCountNode();
    const button = row.querySelector(`.${COPY_BTN_CLASS}`);
    button ? row.insertBefore(count, button) : row.append(count);
    state.countNode = count;
  };

  const makeCopyButton = () => {
    const button = Object.assign(el("button"), {
      type: "button",
      className: COPY_BTN_CLASS,
      ariaLabel: "Copy selector"
    });
    button.append(
      Object.assign(el("img"), { src: chrome.runtime.getURL("assets/copy.svg"), alt: "" })
    );
    button.addEventListener("click", copySelector);
    return button;
  };

  const makeToast = () => Object.assign(el("div"), { className: TOAST_CLASS });

  const mountFresh = () => {
    const root = Object.assign(el("div"), { id: ROOT_ID });
    const row = Object.assign(el("div"), { className: ROW_CLASS });
    const input = Object.assign(el("input"), {
      type: "text",
      placeholder: "Type CSS selector...",
      autocomplete: "off",
      spellcheck: false
    });
    const count = makeCountNode();
    row.append(attachInputListeners(input), count, makeCopyButton());
    root.append(row, makeToast());
    document.body.append(root);
    state.input = input;
    state.countNode = count;
    return input;
  };

  const adoptExistingRoot = (existing) => {
    state.input = existing.querySelector("input");
    const row = existing.querySelector(`.${ROW_CLASS}`);

    if (row && !existing.querySelector(`.${COPY_BTN_CLASS}`)) row.append(makeCopyButton());
    if (row) ensureCountInRow(row);

    if (!row && state.input) {
      const nextRow = Object.assign(el("div"), { className: ROW_CLASS });
      state.input.replaceWith(nextRow);
      const count = makeCountNode();
      nextRow.append(state.input, count, makeCopyButton());
      state.countNode = count;
    }

    if (!existing.querySelector(`.${TOAST_CLASS}`)) existing.append(makeToast());
    if (state.input) attachInputListeners(state.input);
    return state.input;
  };

  const mount = () => {
    if (state.input) return state.input;
    const existing = $id(ROOT_ID);
    return existing ? adoptExistingRoot(existing) : mountFresh();
  };

  const open = () => {
    const input = mount();
    evaluate(input.value);
    focusInput(input);
  };

  const messageHandlers = {
    "debugger:ping": () => undefined,
    "debugger:open": () => open(),
    "debugger:focus-input": () => focusInput(state.input || mount()),
    "debugger:reset": () => clearAndFocusInput(),
    "debugger:close": () => close(),
    "selector:focus": (message) => focusByIndex(message.index),
    "selector:hover": (message) => {
      if (!Number.isInteger(message.index) || !state.hits[message.index]) return;
      state.hoveredIndex = message.index;
      markHits();
    },
    "selector:hover-clear": () => {
      if (state.hoveredIndex === null) return;
      state.hoveredIndex = null;
      markHits();
    }
  };

  chrome.runtime.onMessage.addListener((message) => {
    const handler = messageHandlers[message?.type];
    if (!handler) return;
    handler(message);
  });
  document.addEventListener("keydown", handleGlobalEscape, true);
}

