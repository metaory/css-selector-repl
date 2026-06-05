const { MSG, normalizePayload, send, isBareEscape, $id, el, mk, renderInspector, normText, truncate } =
  globalThis.LCS;

const boot = () => {
  if (globalThis.__lcs_booted) return;
  globalThis.__lcs_booted = true;

  const ROOT_ID = "__lcs_root__";
  const ROW_CLASS = "__lcs_row__";
  const COUNT_CLASS = "__lcs_count__";
  const COPY_BTN_CLASS = "__lcs_copy_btn__";
  const PANEL_CLASS = "__lcs_panel__";
  const PANEL_ERROR_CLASS = "__lcs_panel_error__";
  const PANEL_LIST_CLASS = "__lcs_panel_list__";
  const TOAST_CLASS = "__lcs_toast__";
  const TOAST_SHOW_CLASS = "__lcs_toast_show__";
  const HTML_ATTR = "data-lcs-active";
  const MATCH_ATTR = "data-lcs-match";
  const MAX_MATCHES = 150;
  const MAX_HITS = 500;
  const inputStopEvents = ["keydown", "keyup"];
  const log = (...args) => globalThis.__lcs_debug === true && console.log("[LCS]", ...args);

  const state = {
    active: false,
    input: null,
    countNode: null,
    hits: [],
    selectedIndex: null,
    hoveredIndex: null,
    toastTimer: 0,
    lastMatchCount: 0,
    panel: null,
    root: null
  };
  const rowRefs = new WeakMap();

  document.fonts.load('800 26px "Baloo 2"');

  const getActiveIndex = () =>
    Number.isInteger(state.hoveredIndex) && state.hoveredIndex >= 0
      ? state.hoveredIndex
      : state.selectedIndex;

  const markHits = (matches) => {
    const active = getActiveIndex();
    const prev = state.hits;
    const next = (matches ?? queryMatches().matches).slice(0, MAX_HITS);
    for (const node of prev) {
      if (node instanceof Element && !next.includes(node)) node.removeAttribute(MATCH_ATTR);
    }
    state.hits = next;
    for (const [i, hit] of state.hits.entries()) {
      if (!isLive(hit)) continue;
      hit.setAttribute(MATCH_ATTR, i === active ? "active" : "");
    }
  };

  const unmarkHits = () => {
    for (const node of state.hits) node.removeAttribute(MATCH_ATTR);
  };

  const reservePage = () => document.documentElement.setAttribute(HTML_ATTR, "");
  const releasePage = () => document.documentElement.removeAttribute(HTML_ATTR);

  const syncPanelRows = () => {
    const list = state.panel?.list;
    if (!(list instanceof HTMLElement)) return;
    for (const row of list.querySelectorAll("li[data-index]")) {
      const index = Number(row.dataset.index);
      row.classList.toggle("is-active", index === state.selectedIndex);
      row.classList.toggle("is-hovered", index === state.hoveredIndex);
    }
  };

  const bindRowRefs = () => {
    const list = state.panel?.list;
    if (!(list instanceof HTMLElement)) return;
    for (const row of list.querySelectorAll("li[data-index]")) {
      const node = state.hits[Number(row.dataset.index)];
      if (node) rowRefs.set(row, node);
    }
  };

  const refreshInspector = (payload) => {
    if (!state.panel) return;
    renderInspector(state.panel, payload, state.selectedIndex, state.hoveredIndex);
    bindRowRefs();
  };

  const paintSelection = () => {
    markHits();
    syncPanelRows();
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
  const sync = (active) => send({ type: MSG.SYNC, active });

  const onEscape = (event) => {
    if (!state.active || !isBareEscape(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!isInputEmpty(state.input)) return clearAndFocusInput();
    close();
  };

  const clearHits = () => {
    unmarkHits();
    state.hits = [];
    state.selectedIndex = null;
    state.hoveredIndex = null;
    state.lastMatchCount = 0;
  };

  const toItem = (node) => ({
    tag: node.tagName.toLowerCase(),
    id: node.id || "",
    classes: [...node.classList],
    attrs: [...node.attributes]
      .filter(({ name }) => name !== "id" && name !== "class" && name !== MATCH_ATTR)
      .map(({ name, value }) => [name, value]),
    text: truncate(normText(node.innerText || node.textContent || ""), 80),
    hidden: !isShown(node)
  });

  const isOverlayNode = (node) => {
    const root = state.root;
    return !!(root && node instanceof Element && (node === root || root.contains(node)));
  };
  const isLive = (node) => node instanceof Element && node.isConnected;

  const hasBox = (node) => {
    const { width, height } = node.getBoundingClientRect();
    return width > 0 || height > 0;
  };

  const isShown = (node) => {
    if (!isLive(node) || !hasBox(node)) return false;
    if (node.closest("[hidden]")) return false;
    for (let p = node; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (Number(s.opacity) === 0) return false;
    }
    return true;
  };

  const revealAnchor = (node) => {
    if (isShown(node)) return node;
    const toggler = node.closest('[aria-expanded="false"]');
    if (toggler instanceof Element && isShown(toggler)) return toggler;
    const details = node.closest("details:not([open])");
    if (details instanceof HTMLDetailsElement) {
      const summary = details.querySelector("summary");
      if (summary instanceof Element && isShown(summary)) return summary;
    }
    for (let p = node.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (isShown(p)) return p;
    }
    return node;
  };

  const isScrollable = (node) => {
    if (!(node instanceof Element)) return false;
    const { overflowY, overflowX } = getComputedStyle(node);
    const scrollY = /auto|scroll|overlay/.test(overflowY) && node.scrollHeight > node.clientHeight;
    const scrollX = /auto|scroll|overlay/.test(overflowX) && node.scrollWidth > node.clientWidth;
    return scrollY || scrollX;
  };

  const overlayInsets = () => ({
    bottom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lcs-input-reserve")) || 0,
    right: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lcs-panel-reserve")) || 0
  });

  const revealIn = (box, rect) => ({
    dy: rect.top < box.top ? rect.top - box.top : rect.bottom > box.bottom ? rect.bottom - box.bottom : 0,
    dx: rect.left < box.left ? rect.left - box.left : rect.right > box.right ? rect.right - box.right : 0
  });

  const scrollHitIntoView = (node) => {
    if (!isLive(node)) return;
    const hidden = !isShown(node);
    const target = hidden ? revealAnchor(node) : node;
    const root = document.scrollingElement;
    target.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const rect = () => target.getBoundingClientRect();
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (!isScrollable(parent)) continue;
      const { dy, dx } = revealIn(parent.getBoundingClientRect(), rect());
      if (dy) parent.scrollTop += dy;
      if (dx) parent.scrollLeft += dx;
    }
    if (!root) return;
    const { bottom, right } = overlayInsets();
    const view = {
      top: 0,
      left: 0,
      bottom: window.innerHeight - bottom,
      right: window.innerWidth - right
    };
    const r = rect();
    const { dy, dx } = revealIn(view, r);
    if (dy) root.scrollTop += dy;
    if (dx) root.scrollLeft += dx;
    return hidden;
  };

  const queryMatches = () => {
    const selector = state.input?.value?.trim();
    if (!selector) return { matches: [], error: "" };
    return selectNodes(selector);
  };

  const hitAt = (index) => {
    const { matches, error } = queryMatches();
    if (error) return null;
    return matches[index] ?? null;
  };

  const nodeForRow = (row) => {
    const pinned = rowRefs.get(row);
    if (isLive(pinned)) return pinned;
    return hitAt(Number(row.dataset.index));
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

  const applySelector = (selector, { scrollOnFirst = false, clear = false } = {}) => {
    const trimmed = `${selector ?? ""}`.trim();
    const prevCount = clear ? state.lastMatchCount : 0;
    if (clear) clearHits();
    if (!trimmed) {
      setCount();
      refreshInspector(normalizePayload({ selector: trimmed }));
      return;
    }
    const { matches, error } = selectNodes(trimmed);
    if (error) {
      setCount({ visible: true, count: 0 });
      refreshInspector(normalizePayload({ selector: trimmed, error }));
      return;
    }
    const count = matches.length;
    markHits(matches);
    if (scrollOnFirst && prevCount === 0 && count > 0) scrollHitIntoView(state.hits[0]);
    state.lastMatchCount = count;
    setCount({ visible: true, count });
    if (!clear) {
      if (Number.isInteger(state.selectedIndex) && state.selectedIndex >= count) state.selectedIndex = null;
      if (Number.isInteger(state.hoveredIndex) && state.hoveredIndex >= count) state.hoveredIndex = null;
    }
    refreshInspector(
      normalizePayload({
        selector: trimmed,
        count,
        matches: matches.slice(0, MAX_MATCHES).map(toItem)
      })
    );
  };

  const evaluate = (selector) => applySelector(selector, { scrollOnFirst: true, clear: true });
  const resyncInspector = () => {
    const selector = state.input?.value?.trim();
    if (!selector) return;
    applySelector(selector);
  };

  const close = () => {
    if (!state.active) return;
    state.active = false;
    releasePage();
    if (state.input) state.input.value = "";
    setCount();
    if (state.toastTimer) clearTimeout(state.toastTimer);
    clearHits();
    $id(ROOT_ID)?.remove();
    state.input = null;
    state.countNode = null;
    state.panel = null;
    state.root = null;
    state.toastTimer = 0;
    sync(false);
  };

  const clearHover = () => {
    if (state.hoveredIndex === null) return;
    state.hoveredIndex = null;
    paintSelection();
  };

  const focusNode = (node, index) => {
    state.hoveredIndex = null;
    state.selectedIndex = index;
    paintSelection();
    requestAnimationFrame(() => {
      if (!isLive(node)) return;
      if (scrollHitIntoView(node)) showToast("Hidden match — open menu to reveal");
    });
  };

  const hoverNode = (_node, index) => {
    if (state.hoveredIndex === index) return;
    state.hoveredIndex = index;
    paintSelection();
  };

  const actOnRow = (row, action) => {
    const index = Number(row.dataset.index);
    let node = nodeForRow(row);
    if (!isLive(node)) {
      resyncInspector();
      node = hitAt(index);
    }
    if (!isLive(node)) return;
    action(node, index);
  };

  const rowFromTarget = (target) =>
    target instanceof Element ? target.closest("li[data-index]") : null;

  const wirePanelList = (list) => {
    if (!(list instanceof HTMLElement) || list.dataset.lcsListReady === "1") return;
    list.dataset.lcsListReady = "1";
    list.addEventListener(
      "click",
      (event) => {
        const row = rowFromTarget(event.target);
        if (!row) return;
        actOnRow(row, focusNode);
      },
      true
    );
    list.addEventListener("pointerover", (event) => {
      const row = rowFromTarget(event.target);
      if (!row) return;
      actOnRow(row, hoverNode);
    });
    list.addEventListener("pointerout", (event) => {
      if (event.relatedTarget instanceof Element && list.contains(event.relatedTarget)) return;
      clearHover();
    });
  };

  const showToast = (message) => {
    const toast = state.input?.parentElement?.querySelector(`.${TOAST_CLASS}`);
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

  const mountPanel = () => {
    const meta = mk("div");
    const panelError = mk("p", { className: PANEL_ERROR_CLASS, hidden: true });
    const list = mk("ul", { className: PANEL_LIST_CLASS });
    wirePanelList(list);
    state.panel = { meta, error: panelError, list };
    return mk("div", { className: PANEL_CLASS, children: [meta, panelError, list] });
  };

  const mountFresh = () => {
    const root = Object.assign(el("div"), { id: ROOT_ID });
    state.root = root;
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
    row.append(attachInputListeners(input), count, copyBtn, mk("div", { className: TOAST_CLASS }));
    root.append(row, mountPanel());
    document.body.append(root);
    state.input = input;
    state.countNode = count;
    return input;
  };

  const mount = () => {
    if (state.input?.isConnected && $id(ROOT_ID)) return state.input;
    state.input = null;
    state.panel = null;
    state.root = null;
    $id(ROOT_ID)?.remove();
    return mountFresh();
  };

  const open = () => {
    state.active = true;
    reservePage();
    const input = mount();
    evaluate(input.value);
    focusInput(input);
    sync(true);
  };

  const toggle = () => (state.active ? close() : open());

  const messageHandlers = {
    [MSG.TOGGLE]: () => toggle(),
    [MSG.CLOSE]: () => close()
  };

  chrome.runtime.onMessage.addListener((message) => {
    const handler = messageHandlers[message?.type];
    if (!handler) return;
    handler(message);
  });
  document.addEventListener("keydown", onEscape, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !state.active) return;
    close();
  });
  log("booted — enable with globalThis.__lcs_debug = true");
};

boot();
