if (!globalThis.__seldbg_booted) {
  globalThis.__seldbg_booted = true;

  const ROOT_ID = "__seldbg_root__";
  const BACKDROP_ID = "__seldbg_backdrop__";
  const BACKDROP_SHADE_ROLE = "__seldbg_backdrop_shade__";
  const BACKDROP_BOXES_ROLE = "__seldbg_backdrop_boxes__";
  const ROW_CLASS = "__seldbg_row__";
  const COPY_BTN_CLASS = "__seldbg_copy_btn__";
  const TOAST_CLASS = "__seldbg_toast__";
  const TOAST_SHOW_CLASS = "__seldbg_toast_show__";
  const MAX_MATCHES = 150;
  const MAX_OVERLAY_RENDER = 200;

  const state = {
    input: null,
    hits: [],
    selectedIndex: null,
    hoveredIndex: null,
    toastTimer: 0,
    backdropRaf: 0,
    backdropTrackingReady: false,
    selectedNode: null,
    selectedNodeResizeObserver: null
  };

  const emptyPayload = { selector: "", count: 0, matches: [], error: "" };
  const inputStopEvents = ["keydown", "keyup", "keypress"];
  const SVG_NS = "http://www.w3.org/2000/svg";

  const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
  const $ = document.querySelector.bind(document);
  const $id = document.getElementById.bind(document);
  const el = (tag) => document.createElement(tag);
  const svgEl = (tag) => document.createElementNS(SVG_NS, tag);
  const setAttrs = (node, attrs) =>
    Object.entries(attrs).reduce((nextNode, [key, value]) => {
      nextNode.setAttribute(key, `${value}`);
      return nextNode;
    }, node);
  const toOverlayFrame = (box) => ({
    x: box.left - 3,
    y: box.top - 3,
    width: box.width + 6,
    height: box.height + 6
  });
  const applyRectFrame = (node, frame) =>
    setAttrs(node, {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      rx: 4,
      ry: 4
    });
  const getOverlayNodes = () => {
    const backdrop = $id(BACKDROP_ID);
    if (!(backdrop instanceof HTMLElement)) return null;
    const shade = backdrop.querySelector(`[data-role="${BACKDROP_SHADE_ROLE}"]`);
    const boxes = backdrop.querySelector(`[data-role="${BACKDROP_BOXES_ROLE}"]`);
    if (!(shade instanceof SVGPathElement) || !(boxes instanceof SVGGElement)) return null;
    return { backdrop, shade, boxes };
  };
  const getActiveIndex = () =>
    Number.isInteger(state.hoveredIndex) && state.hoveredIndex >= 0
      ? state.hoveredIndex
      : state.selectedIndex;

  const scheduleBackdropUpdate = () => {
    if (state.backdropRaf) return;
    state.backdropRaf = requestAnimationFrame(() => {
      state.backdropRaf = 0;
      renderOverlay();
    });
  };

  const ensureBackdropTracking = () => {
    if (state.backdropTrackingReady) return;
    state.backdropTrackingReady = true;
    document.addEventListener("scroll", scheduleBackdropUpdate, { capture: true, passive: true });
    globalThis.addEventListener("resize", scheduleBackdropUpdate, { passive: true });
    const viewport = globalThis.visualViewport;
    if (!viewport) return;
    viewport.addEventListener("scroll", scheduleBackdropUpdate, { passive: true });
    viewport.addEventListener("resize", scheduleBackdropUpdate, { passive: true });
  };

  const removeBackdropTracking = () => {
    if (!state.backdropTrackingReady) return;
    state.backdropTrackingReady = false;
    document.removeEventListener("scroll", scheduleBackdropUpdate, true);
    globalThis.removeEventListener("resize", scheduleBackdropUpdate);
    const viewport = globalThis.visualViewport;
    if (!viewport) return;
    viewport.removeEventListener("scroll", scheduleBackdropUpdate);
    viewport.removeEventListener("resize", scheduleBackdropUpdate);
  };

  const disconnectSelectedNodeObserver = () => {
    if (!state.selectedNodeResizeObserver) return;
    state.selectedNodeResizeObserver.disconnect();
    state.selectedNodeResizeObserver = null;
    state.selectedNode = null;
  };

  const syncSelectedNodeObserver = () => {
    const activeIndex = getActiveIndex();
    const activeNode = Number.isInteger(activeIndex) ? state.hits[activeIndex] : null;
    if (state.selectedNode === activeNode) return;
    disconnectSelectedNodeObserver();
    if (!(activeNode instanceof Element) || !globalThis.ResizeObserver) return;
    state.selectedNode = activeNode;
    const observer = new ResizeObserver(scheduleBackdropUpdate);
    observer.observe(activeNode);
    state.selectedNodeResizeObserver = observer;
  };

  const sendUpdate = (payload) => {
    if (!runtime?.sendMessage) return;
    runtime.sendMessage({ type: "selector:update", payload }, () => {
      void globalThis.chrome?.runtime?.lastError;
    });
  };
  const evaluateFromInputEvent = (event) => evaluate(event.target.value);
  const clearInputOnEscape = (event) => {
    if (event.key !== "Escape") return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.value) return;
    event.preventDefault();
    input.value = "";
    evaluate("");
  };
  const stopInputEventPropagation = (event) => event.stopPropagation();
  const selectInputOnFocus = (event) => event.target.select();
  const attachInputListeners = (input) => {
    if (input.dataset.seldbgInputReady === "1") return input;
    input.dataset.seldbgInputReady = "1";
    input.addEventListener("keydown", clearInputOnEscape);
    input.addEventListener("focus", selectInputOnFocus);
    for (const eventName of inputStopEvents) {
      input.addEventListener(eventName, stopInputEventPropagation);
    }
    input.addEventListener("input", evaluateFromInputEvent);
    return input;
  };

  const clearHits = () => {
    state.hits = [];
    state.selectedIndex = null;
    state.hoveredIndex = null;
    disconnectSelectedNodeObserver();
    if (state.backdropRaf) {
      cancelAnimationFrame(state.backdropRaf);
      state.backdropRaf = 0;
    }
    const overlay = getOverlayNodes();
    if (!overlay) return;
    const { backdrop, shade, boxes } = overlay;
    backdrop.setAttribute("hidden", "");
    shade.setAttribute("d", "");
    boxes.replaceChildren();
  };

  const destroyOverlay = () => {
    clearHits();
    removeBackdropTracking();
    $id(BACKDROP_ID)?.remove();
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
    node.id === ROOT_ID ||
    node.id === BACKDROP_ID ||
    node.closest?.(`#${ROOT_ID}`);

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
      sendUpdate({ selector, count: 0, matches: [], error });
      return;
    }
    state.hits = matches;
    syncSelectedNodeObserver();
    renderOverlay();
    const [first] = matches;
    first?.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    sendUpdate({
      selector,
      count: matches.length,
      matches: matches.slice(0, MAX_MATCHES).map(toItem),
      error: ""
    });
  };

  const reset = () => {
    if (state.input) state.input.value = "";
    clearHits();
    sendUpdate(emptyPayload);
  };

  const close = () => {
    if (state.input) state.input.value = "";
    sendUpdate(emptyPayload);
    if (state.toastTimer) clearTimeout(state.toastTimer);
    $id(ROOT_ID)?.remove();
    destroyOverlay();
    state.input = null;
    state.toastTimer = 0;
  };

  const focusByIndex = (index) => {
    if (!Number.isInteger(index)) return;
    const node = state.hits[index];
    if (!node) return;
    state.selectedIndex = index;
    syncSelectedNodeObserver();
    node.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    renderOverlay();
    scheduleBackdropUpdate();
  };

  const renderOverlay = () => {
    const overlay = getOverlayNodes();
    if (!overlay) return;
    const { backdrop, shade, boxes } = overlay;
    if (!state.hits.length) {
      shade.setAttribute("d", "");
      boxes.replaceChildren();
      backdrop.setAttribute("hidden", "");
      return;
    }
    const viewport = globalThis.visualViewport;
    const viewportWidth = viewport?.width || globalThis.innerWidth;
    const viewportHeight = viewport?.height || globalThis.innerHeight;
    const isBoxVisible = (box) =>
      box.width > 0 &&
      box.height > 0 &&
      box.bottom >= 0 &&
      box.right >= 0 &&
      box.top <= viewportHeight &&
      box.left <= viewportWidth;
    const overlayRects = state.hits
      .map((node, index) => ({ index, box: node.getBoundingClientRect() }))
      .filter(({ box }) => isBoxVisible(box))
      .slice(0, MAX_OVERLAY_RENDER);
    if (!overlayRects.length) {
      shade.setAttribute("d", "");
      boxes.replaceChildren();
      backdrop.setAttribute("hidden", "");
      return;
    }
    backdrop.removeAttribute("hidden");
    const toHolePath = (frame) =>
      `M${frame.x} ${frame.y}h${frame.width}v${frame.height}h-${frame.width}Z`;
    const activeIndex = getActiveIndex();
    const shadePath = `M0 0H${viewportWidth}V${viewportHeight}H0Z ${overlayRects
      .map(({ box }) => toHolePath(toOverlayFrame(box)))
      .join(" ")}`;
    shade.setAttribute("d", shadePath);
    const boxRects = overlayRects.map(({ index, box }) => {
      const highlight = svgEl("rect");
      const isActive = index === activeIndex;
      const stroke = isActive
        ? "var(--sdbg-accent, rgba(82, 209, 255, 1))"
        : "var(--sdbg-highlight, rgba(255, 122, 69, 1))";
      const fill = isActive
        ? "var(--sdbg-accent-soft, rgba(82, 209, 255, 0.2))"
        : "var(--sdbg-highlight-soft, rgba(255, 122, 69, 0.2))";
      const strokeWidth = isActive ? "3" : "2";
      applyRectFrame(highlight, toOverlayFrame(box));
      setAttrs(highlight, { fill, stroke, "stroke-width": strokeWidth });
      return highlight;
    });
    const activeRectIndex = overlayRects.findIndex(({ index }) => index === activeIndex);
    if (activeRectIndex >= 0) {
      const activeRect = boxRects.splice(activeRectIndex, 1);
      boxes.replaceChildren(...boxRects, ...activeRect);
      return;
    }
    boxes.replaceChildren(...boxRects);
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
    }, 1200);
  };

  const copySelector = () => {
    const selector = state.input?.value?.trim() || "";
    if (!selector) {
      showToast("Nothing to copy");
      return;
    }
    navigator.clipboard
      .writeText(selector)
      .then(() => showToast("Selector copied"))
      .catch(() => showToast("Copy failed"));
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

  const makeToast = () => {
    return Object.assign(el("div"), { className: TOAST_CLASS, textContent: "Selector copied" });
  };

  const mount = () => {
    if (state.input) return state.input;
    ensureBackdropTracking();
    if (!$id(BACKDROP_ID)) {
      const backdrop = el("div");
      const svg = svgEl("svg");
      const shade = svgEl("path");
      const boxes = svgEl("g");
      backdrop.id = BACKDROP_ID;
      setAttrs(backdrop, { hidden: "" });
      setAttrs(shade, {
        "data-role": BACKDROP_SHADE_ROLE,
        fill: "var(--sdbg-backdrop, rgba(8, 3, 24, 0.34))",
        "fill-rule": "evenodd",
        d: ""
      });
      setAttrs(boxes, {
        "data-role": BACKDROP_BOXES_ROLE,
        fill: "rgba(82, 209, 255, 0.16)"
      });
      svg.append(shade, boxes);
      backdrop.append(svg);
      (document.body || document.documentElement).append(backdrop);
    }
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
    const focusInput = () => {
      input.focus({ preventScroll: true });
      input.select();
    };
    focusInput();
    requestAnimationFrame(focusInput);
    setTimeout(focusInput, 120);
    evaluate(input.value);
  };

  const messageHandlers = {
    "debugger:open": () => open(),
    "debugger:reset": () => reset(),
    "debugger:close": () => close(),
    "selector:focus": (message) => focusByIndex(message.index),
    "selector:hover": (message) => {
      if (!Number.isInteger(message.index) || !state.hits[message.index]) return;
      state.hoveredIndex = message.index;
      syncSelectedNodeObserver();
      renderOverlay();
      scheduleBackdropUpdate();
    },
    "selector:hover-clear": () => {
      if (state.hoveredIndex === null) return;
      state.hoveredIndex = null;
      syncSelectedNodeObserver();
      renderOverlay();
      scheduleBackdropUpdate();
    }
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "debugger:ping") return;
    const handler = messageHandlers[message?.type];
    if (!handler) return;
    handler(message);
  });
}

