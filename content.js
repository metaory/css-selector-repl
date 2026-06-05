const { MSG, normalizePayload, send, isBareEscape, $id, el } = globalThis.LCS;

if (!globalThis.__lcs_booted) {
  globalThis.__lcs_booted = true;

  const ROOT_ID = "__lcs_root__";
  const ROW_CLASS = "__lcs_row__";
  const COUNT_CLASS = "__lcs_count__";
  const COPY_BTN_CLASS = "__lcs_copy_btn__";
  const TOAST_CLASS = "__lcs_toast__";
  const TOAST_SHOW_CLASS = "__lcs_toast_show__";
  const MATCH_ATTR = "data-lcs-match";
  const MAX_MATCHES = 150;
  const MAX_HITS = 500;
  const inputStopEvents = ["keydown", "keyup"];

  const state = {
    active: false,
    input: null,
    countNode: null,
    hits: [],
    selectedIndex: null,
    hoveredIndex: null,
    toastTimer: 0,
    lastMatchCount: 0
  };

  const $ = document.querySelector.bind(document);

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
    if (!state.active) return;
    send({ type: MSG.UPDATE, payload });
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
  const requestDeactivate = () => send({ type: MSG.DEACTIVATE });

  const handleEscape = (event) => {
    if (!isBareEscape(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const input = state.input;
    if (!(input instanceof HTMLInputElement)) return requestDeactivate();
    if (!isInputEmpty(input)) return clearAndFocusInput(input);
    requestDeactivate();
  };

  const handleGlobalEscape = (event) => {
    if (!isBareEscape(event)) return;
    if (event.target === state.input) return;
    handleEscape(event);
  };

  const clearHits = () => {
    unmarkHits();
    state.hits = [];
    state.selectedIndex = null;
    state.hoveredIndex = null;
    state.lastMatchCount = 0;
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

  const isOverlayNode = (node) => node.id === ROOT_ID || node.closest(`#${ROOT_ID}`);
  const isLive = (node) => node instanceof Element && node.isConnected;

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
    if (!isLive(node)) return;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (isScrollable(parent)) scrollWithin(parent, node);
    }
    node.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  };

  const hitAt = (index) => {
    const cached = state.hits[index];
    if (isLive(cached)) return cached;
    const selector = state.input?.value?.trim();
    if (!selector) return cached;
    const { matches, error } = selectNodes(selector);
    if (error) return cached;
    const fresh = matches[index];
    if (fresh) state.hits[index] = fresh;
    return fresh ?? cached;
  };

  const selectNodes = (selector) => {
    try {
      return {
        matches: [...document.querySelectorAll(selector)].filter((node) => !isOverlayNode(node)),
        error: ""
      };
    } catch (error) {
      return { matches: [], error: error.message || "Invalid selector" };
    }
  };

  const evaluate = (selector) => {
    const prevCount = state.lastMatchCount;
    clearHits();
    if (!selector.trim()) {
      setCount();
      sendUpdate(normalizePayload({ selector }));
      return;
    }
    const { matches, error } = selectNodes(selector);
    if (error) {
      setCount({ visible: true, count: 0 });
      sendUpdate(normalizePayload({ selector, error }));
      return;
    }
    const count = matches.length;
    state.hits = matches.slice(0, MAX_HITS);
    markHits();
    if (prevCount === 0 && count > 0) scrollHitIntoView(state.hits[0]);
    state.lastMatchCount = count;
    setCount({ visible: true, count });
    sendUpdate(
      normalizePayload({
        selector,
        count,
        matches: matches.slice(0, MAX_MATCHES).map(toItem)
      })
    );
  };

  const close = () => {
    state.active = false;
    if (state.input) state.input.value = "";
    setCount();
    if (state.toastTimer) clearTimeout(state.toastTimer);
    clearHits();
    $id(ROOT_ID)?.remove();
    state.input = null;
    state.countNode = null;
    state.toastTimer = 0;
  };

  const focusByIndex = (index) => {
    index = Number(index);
    if (!Number.isInteger(index)) return;
    const node = hitAt(index);
    if (!isLive(node)) return;
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
    ["focus", (event) => event.target.select()],
    ["input", (event) => evaluate(event.target.value)]
  ];

  const attachInputListeners = (input) => {
    if (input.dataset.lcsInputReady === "1") return input;
    input.dataset.lcsInputReady = "1";
    for (const [eventName, handler] of inputListeners) {
      input.addEventListener(eventName, handler);
    }
    for (const eventName of inputStopEvents) {
      input.addEventListener(eventName, (event) => event.stopPropagation());
    }
    return input;
  };

  const mountFresh = () => {
    const root = Object.assign(el("div"), { id: ROOT_ID });
    const row = Object.assign(el("div"), { className: ROW_CLASS });
    const input = Object.assign(el("input"), {
      type: "text",
      placeholder: "Type CSS selector...",
      autocomplete: "off",
      spellcheck: false
    });
    const count = Object.assign(el("span"), {
      className: COUNT_CLASS,
      hidden: true,
      textContent: "0",
      ariaLabel: "Match count",
      ariaHidden: "true"
    });
    const copyBtn = Object.assign(el("button"), {
      type: "button",
      className: COPY_BTN_CLASS,
      ariaLabel: "Copy selector"
    });
    copyBtn.append(
      Object.assign(el("img"), { src: chrome.runtime.getURL("assets/copy.svg"), alt: "" })
    );
    copyBtn.addEventListener("click", copySelector);
    row.append(attachInputListeners(input), count, copyBtn);
    root.append(row, Object.assign(el("div"), { className: TOAST_CLASS }));
    document.body.append(root);
    state.input = input;
    state.countNode = count;
    return input;
  };

  const mount = () => {
    if (state.input) return state.input;
    $id(ROOT_ID)?.remove();
    return mountFresh();
  };

  const open = () => {
    state.active = true;
    const input = mount();
    evaluate(input.value);
    focusInput(input);
  };

  const messageHandlers = {
    [MSG.PING]: () => undefined,
    [MSG.OPEN]: () => open(),
    [MSG.FOCUS_INPUT]: () => focusInput(state.input || mount()),
    [MSG.RESET]: () => clearAndFocusInput(),
    [MSG.CLOSE]: () => close(),
    [MSG.FOCUS]: (message) => focusByIndex(message.index),
    [MSG.HOVER]: (message) => {
      const index = Number(message.index);
      if (!Number.isInteger(index) || !isLive(hitAt(index))) return;
      state.hoveredIndex = index;
      markHits();
    },
    [MSG.HOVER_CLEAR]: () => {
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
