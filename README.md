<div align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="css-selector-repl logo">
  <h1>css-selector-repl</h1>
  <p><strong>Live CSS selector REPL</strong></p>
  <p>CSS selectors evaluated on the live DOM · matches highlighted on each keystroke · input and panel survive page interaction</p>
</div>

---

## Why

Crafting a precise selector against a real DOM is iterative, but the built-in tooling treats it as a one-shot operation.

### Existing approaches and their pain points

| Approach | Limitation |
|---|---|
| DevTools → **Add style rule** (e.g. `border: 1px solid red`) | One-shot; any DOM interaction or typo wipes the experiment. No match count, no list. |
| DevTools Console → `document.querySelectorAll(...)` | No live feedback on the page; you must expand the `NodeList` and click each entry to reveal it in the Elements tab. Re-typing every iteration. |
| Inspect (`Ctrl+Shift+C`) → right-click → **Copy selector / JS path / XPath** | Generates brittle, deeply-nested paths. Anchors on **auto-generated IDs** that change every render in any modern framework (React, Vue, Svelte, …). Output is rarely the selector you want to ship. |

### Core problems

- **Auto-generated IDs** · modern frameworks emit unstable `id` attributes; copied selectors break on the next mount.
- **Long, brittle paths** · generated selectors describe the *path* to an element, not its *identity*. A short, intentional query is almost always better.
- **No live feedback loop** · every existing flow is single-shot; refining a query means starting over.

## What it does

A persistent input docked at the bottom of the page. As you type:

- Matching elements are **highlighted live** on every keystroke.
- A **Side Panel** lists each match with its tag, `id`, classes, attributes, and a snippet of inner text.
- Clicking a match scrolls to and focuses the element.
- Invalid selectors surface inline without disrupting state.

The input and panel survive DOM mutations and page interaction · refine until the query is exactly what you want.

## Install (unpacked)

- Chrome → `chrome://extensions`
- Enable **Developer mode**
- **Load unpacked** → select this directory

## Usage

| Action | Binding |
| --- | --- |
| Toggle REPL (input + Side Panel) | extension action |
| Toggle selector input | **Alt+S** |

## Limits

- **150** matches listed in the Side Panel (additional matches are still highlighted).
- Injection runs on `http(s)` and `file:` only; Chrome Web Store pages are blocked.
- Closing the Side Panel does not close the in-page input.
- Page reload / navigation fully deactivates the REPL.

## Permissions

- `activeTab` · operate on the active tab.
- `scripting` · inject `content.js` on demand.
- `sidePanel` · Side Panel UI.
- `host_permissions: <all_urls>` · run on any site.

## License

[MIT](LICENSE)
