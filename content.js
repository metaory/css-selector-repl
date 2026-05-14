if (!globalThis.__csrepl_booted) {
  globalThis.__csrepl_booted = true;

  const ROOT_ID = "__csrepl_root__";
  const ROW_CLASS = "__csrepl_row__";
  const COPY_BTN_CLASS = "__csrepl_copy_btn__";
  const TOAST_CLASS = "__csrepl_toast__";
  const TOAST_SHOW_CLASS = "__csrepl_toast_show__";
  const MATCH_ATTR = "data-csrepl-match";
  const MAX_MATCHES = 150;
  const MAX_HITS = 500;

  const state = {
    input: null,
    hits: [],
    selectedIndex: null,
    hoveredIndex: null,
    toastTimer: 0
  };

  const emptyPayload = { selector: "", count: 0, matches: [], error: "" };
  const inputStopEvents = ["keydown", "keyup", "keypress"];

  const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
  const $ = document.querySelector.bind(document);
  const $id = document.getElementById.bind(document);
  const el = (tag) => document.createElement(tag);
  const getActiveIndex = () =>
    Number.isInteger(state.hoveredIndex) && state.hoveredIndex >= 0
      ? state.hoveredIndex
      : state.selectedIndex;

  const markHits = () => {
    const active = getActiveIndex();
    state.hits.forEach((node, i) => {
      if (!(node instanceof Element)) return;
      node.setAttribute(MATCH_ATTR, i === active ? "active" : "");
    });
  };

  const unmarkHits = () => {
    for (const node of state.hits) node?.removeAttribute?.(MATCH_ATTR);
  };

  const sendUpdate = (payload) => {
    if (!runtime?.sendMessage) return;
    runtime.sendMessage({ type: "selector:update", payload }, () => {
      void globalThis.chrome?.runtime?.lastError;
    });
  };
  const evaluateFromInputEvent = (event) => evaluate(event.target.value);
  const focusInputWithRetry = (input) => {
    if (!(input instanceof HTMLInputElement)) return false;
    const focusInput = () => {
      input.focus({ preventScroll: true });
      input.select();
    };
    focusInput();
    requestAnimationFrame(focusInput);
    setTimeout(focusInput, 120);
    return true;
  };
  const clearAndFocusInput = (input = state.input) => {
    if (!(input instanceof HTMLInputElement)) return false;
    input.value = "";
    evaluate("");
    focusInputWithRetry(input);
    return true;
  };
  const clearInputOnEscape = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    clearAndFocusInput(event.target);
  };
  const handleGlobalEscape = (event) => {
    if (event.key !== "Escape") return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target === state.input) return;
    if (!clearAndFocusInput()) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const stopInputEventPropagation = (event) => event.stopPropagation();
  const selectInputOnFocus = (event) => event.target.select();
  const attachInputListeners = (input) => {
    if (input.dataset.csreplInputReady === "1") return input;
    input.dataset.csreplInputReady = "1";
    input.addEventListener("keydown", clearInputOnEscape);
    input.addEventListener("keydown", copyInputAllOnAltC);
    input.addEventListener("focus", selectInputOnFocus);
    for (const eventName of inputStopEvents) {
      input.addEventListener(eventName, stopInputEventPropagation);
    }
    input.addEventListener("input", evaluateFromInputEvent);
    return input;
  };

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

  const isDebuggerNode = (node) =>
    node.id === ROOT_ID || node.closest?.(`#${ROOT_ID}`);

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

  const evaluate = (selector) => {
    clearHits();
    if (!selector.trim()) {
      sendUpdate({ ...emptyPayload, selector });
      return;
    }
    const { matches, error } = selectNodes(selector);
    if (error) {
      sendUpdate({ ...emptyPayload, selector, error });
      return;
    }
    state.hits = matches.slice(0, MAX_HITS);
    markHits();
    state.hits[0]?.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    sendUpdate({
      ...emptyPayload,
      selector,
      count: matches.length,
      matches: matches.slice(0, MAX_MATCHES).map(toItem)
    });
  };

  const close = () => {
    if (state.input) state.input.value = "";
    sendUpdate(emptyPayload);
    if (state.toastTimer) clearTimeout(state.toastTimer);
    unmarkHits();
    $id(ROOT_ID)?.remove();
    state.input = null;
    state.toastTimer = 0;
  };

  const focusByIndex = (index) => {
    if (!Number.isInteger(index)) return;
    const node = state.hits[index];
    if (!node) return;
    state.selectedIndex = index;
    markHits();
    node.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
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
    }, 993400);
  };

  const copyToClipboard = (text) => {
    if (!text) return showToast("Nothing to copy");
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("Selector copied"))
      .catch(() => showToast("Copy failed"));
  };
  const copySelector = () => copyToClipboard(state.input?.value?.trim() || "");
  const copyInputAllOnAltC = (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code !== "KeyC") return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    event.preventDefault();
    copyToClipboard(input.value);
  };

  const makeCopyButton = () => {
    const button = Object.assign(el("button"), {
      type: "button",
      className: COPY_BTN_CLASS,
      ariaLabel: "Copy selector"
    });
    const icon = Object.assign(el("img"), {
      src: chrome.runtime.getURL("assets/copy.svg"),
      alt: ""
    });
    button.append(icon);
    button.addEventListener("click", copySelector);
    return button;
  };

  const makeToast = () => Object.assign(el("div"), { className: TOAST_CLASS });

  const mount = () => {
    if (state.input) return state.input;
    const existing = $id(ROOT_ID);
    if (existing) {
      state.input = existing.querySelector("input");
      const row = existing.querySelector(`.${ROW_CLASS}`);
      const hasButton = existing.querySelector(`.${COPY_BTN_CLASS}`);
      if (row && !hasButton) row.append(makeCopyButton());
      if (!row && state.input) {
        const nextRow = el("div");
        nextRow.className = ROW_CLASS;
        state.input.replaceWith(nextRow);
        nextRow.append(state.input);
        nextRow.append(makeCopyButton());
      }
      if (!existing.querySelector(`.${TOAST_CLASS}`)) existing.append(makeToast());
      if (state.input) attachInputListeners(state.input);
      return state.input;
    }
    const root = el("div");
    const row = el("div");
    root.id = ROOT_ID;
    row.className = ROW_CLASS;
    const input = el("input");
    input.type = "text";
    input.placeholder = "Type CSS selector...";
    input.autocomplete = "off";
    input.spellcheck = false;
    row.append(attachInputListeners(input));
    row.append(makeCopyButton());
    root.append(row);
    root.append(makeToast());
    (document.body || document.documentElement).append(root);
    state.input = input;
    return input;
  };

  const open = () => {
    const input = mount();
    focusInputWithRetry(input);
    evaluate(input.value);
  };

  const messageHandlers = {
    "debugger:open": () => open(),
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

