if (globalThis.__seldbg_booted) {
  void 0;
}

if (!globalThis.__seldbg_booted) {
  globalThis.__seldbg_booted = true;

  const ROOT_ID = "__seldbg_root__";
  const STYLE_ID = "__seldbg_style__";
  const HIT_CLASS = "__seldbg_hit__";
  const ACTIVE_CLASS = "__seldbg_active__";
  const ROW_CLASS = "__seldbg_row__";
  const COPY_BTN_CLASS = "__seldbg_copy_btn__";
  const TOAST_CLASS = "__seldbg_toast__";
  const TOAST_SHOW_CLASS = "__seldbg_toast_show__";
  const MAX_MATCHES = 150;

  const state = {
    input: null,
    hits: [],
    toastTimer: 0
  };

  const emptyPayload = { selector: "", count: 0, matches: [], error: "" };

  const sendUpdate = (payload) => {
    chrome.runtime.sendMessage({ type: "selector:update", payload }, () => {
      void chrome.runtime.lastError;
    });
  };
  const stopInputEventPropagation = (event) => event.stopPropagation();
  const attachInputListeners = (input) => {
    if (input.dataset.seldbgInputReady === "1") return input;
    input.dataset.seldbgInputReady = "1";
    input.addEventListener("keydown", stopInputEventPropagation);
    input.addEventListener("keyup", stopInputEventPropagation);
    input.addEventListener("keypress", stopInputEventPropagation);
    input.addEventListener("input", (event) => evaluate(event.target.value));
    return input;
  };

  const clearHits = () => {
    for (const node of state.hits) node.classList.remove(HIT_CLASS, ACTIVE_CLASS);
    state.hits = [];
  };

  const compactText = (text) => text.replace(/\s+/g, " ").trim().slice(0, 80);

  const toItem = (node) => ({
    tag: node.tagName.toLowerCase(),
    id: node.id || "",
    classes: [...node.classList].filter((name) => name !== HIT_CLASS && name !== ACTIVE_CLASS),
    attrs: [...node.attributes]
      .filter(({ name }) => name !== "id" && name !== "class")
      .map(({ name, value }) => [name, value]),
    text: compactText(node.innerText || node.textContent || "")
  });

  const isDebuggerNode = (node) =>
    node.id === ROOT_ID || node.id === STYLE_ID || node.closest?.(`#${ROOT_ID}`);

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
    for (const node of matches) node.classList.add(HIT_CLASS);
    state.hits = matches;
    const [first] = matches;
    first?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
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
    reset();
    if (state.toastTimer) clearTimeout(state.toastTimer);
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    state.input = null;
    state.toastTimer = 0;
  };

  const focusByIndex = (index) => {
    if (!Number.isInteger(index)) return;
    const node = state.hits[index];
    if (!node) return;
    for (const hit of state.hits) hit.classList.remove(ACTIVE_CLASS);
    node.classList.add(ACTIVE_CLASS);
    node.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  };

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
:root {
  --sdbg-bg: #220044;
  --sdbg-fg: rgba(255, 255, 255, 0.92);
  --sdbg-accent: #52d1ff;
  --sdbg-soft: rgba(255, 255, 255, 0.08);
  --sdbg-soft-strong: rgba(255, 255, 255, 0.16);
  --sdbg-highlight: #ff7a45;
  --sdbg-highlight-soft: rgba(255, 122, 69, 0.12);
}
.${HIT_CLASS} { outline: 2px dashed var(--sdbg-highlight) !important; outline-offset: -2px !important; box-shadow: inset 0 0 0 2px var(--sdbg-highlight) !important; background-color: var(--sdbg-highlight-soft) !important; }
.${ACTIVE_CLASS} { outline: 2px solid var(--sdbg-accent) !important; outline-offset: -2px !important; box-shadow: inset 0 0 0 2px var(--sdbg-accent), 0 0 0 3px var(--sdbg-accent), 0 0 12px 2px var(--sdbg-accent) !important; }
#${ROOT_ID} { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647; background: var(--sdbg-bg); padding: 8px 10px; }
#${ROOT_ID} .${ROW_CLASS} { display: flex; gap: 8px; align-items: center; direction: ltr; }
#${ROOT_ID} input { flex: 1; min-width: 0; box-sizing: border-box; border: 0; outline: 0; border-radius: 10px; padding: 10px 12px; font: 14px/1.2 monospace; background: var(--sdbg-bg); color: var(--sdbg-fg); direction: ltr; text-align: left; caret-color: var(--sdbg-accent); caret-shape: block; }
#${ROOT_ID} .${COPY_BTN_CLASS} { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 10px; background: var(--sdbg-soft); color: var(--sdbg-accent); cursor: pointer; padding: 0; transition: background-color 120ms ease, transform 120ms ease; }
#${ROOT_ID} .${COPY_BTN_CLASS}:hover { background: var(--sdbg-soft-strong); transform: translateY(-1px); }
#${ROOT_ID} .${COPY_BTN_CLASS}:focus-visible { outline: 2px solid var(--sdbg-accent); outline-offset: 1px; }
#${ROOT_ID} .${COPY_BTN_CLASS} img { width: 20px; height: 20px; display: block; pointer-events: none; }
#${ROOT_ID} .${TOAST_CLASS} { position: absolute; right: 10px; bottom: calc(100% + 8px); max-width: min(60vw, 320px); background: var(--sdbg-soft-strong); color: var(--sdbg-fg); border-radius: 8px; padding: 6px 10px; font: 12px/1.2 system-ui, sans-serif; opacity: 0; transform: translateY(6px); transition: opacity 120ms ease, transform 120ms ease; pointer-events: none; }
#${ROOT_ID} .${TOAST_CLASS}.${TOAST_SHOW_CLASS} { opacity: 1; transform: translateY(0); }
`;
    document.documentElement.append(style);
  };

  const showToast = (message) => {
    const toast = document.querySelector(`#${ROOT_ID} .${TOAST_CLASS}`);
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
    const button = document.createElement("button");
    const icon = document.createElement("img");
    button.type = "button";
    button.className = COPY_BTN_CLASS;
    button.ariaLabel = "Copy selector";
    icon.src = chrome.runtime.getURL("assets/copy.svg");
    icon.alt = "";
    button.append(icon);
    button.addEventListener("click", copySelector);
    return button;
  };

  const makeToast = () => {
    const toast = document.createElement("div");
    toast.className = TOAST_CLASS;
    toast.textContent = "Selector copied";
    return toast;
  };

  const mount = () => {
    if (state.input) return state.input;
    ensureStyle();
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      state.input = existing.querySelector("input");
      const row = existing.querySelector(`.${ROW_CLASS}`);
      const hasButton = existing.querySelector(`.${COPY_BTN_CLASS}`);
      if (row && !hasButton) row.append(makeCopyButton());
      if (!row && state.input) {
        const nextRow = document.createElement("div");
        nextRow.className = ROW_CLASS;
        state.input.replaceWith(nextRow);
        nextRow.append(state.input);
        nextRow.append(makeCopyButton());
      }
      if (!existing.querySelector(`.${TOAST_CLASS}`)) existing.append(makeToast());
      if (state.input) attachInputListeners(state.input);
      return state.input;
    }
    const root = document.createElement("div");
    const row = document.createElement("div");
    root.id = ROOT_ID;
    row.className = ROW_CLASS;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type CSS selector...";
    input.autocomplete = "off";
    input.spellcheck = false;
    row.append(attachInputListeners(input));
    row.append(makeCopyButton());
    root.append(row);
    root.append(makeToast());
    document.documentElement.append(root);
    state.input = input;
    return input;
  };

  const open = () => {
    const input = mount();
    const focusInput = () => {
      input.focus({ preventScroll: true });
      const point = input.value.length;
      input.setSelectionRange(point, point);
    };
    focusInput();
    requestAnimationFrame(focusInput);
    evaluate(input.value);
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "debugger:ping") return;
    if (message?.type === "debugger:open") {
      open();
      return;
    }
    if (message?.type === "debugger:reset") {
      reset();
      return;
    }
    if (message?.type === "debugger:close") {
      close();
      return;
    }
    if (message?.type !== "selector:focus") return;
    focusByIndex(message.index);
  });
}

