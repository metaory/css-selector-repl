<div align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Live CSS Queries logo">
  <h1>Live CSS Queries</h1>
  <p><strong>See live CSS selector results with instant highlights</strong></p>
  <p>Inspect matches in a focused Side Panel while you refine selectors in place</p>
</div>

---

## Why

Selector work on a real DOM is iterative; most DevTools flows are one-shot.

### Existing approaches and their pain points

| Approach | Limitation |
|---|---|
| DevTools → **Add style rule** (e.g. `border: 1px solid red`) | Fragile scratch test; DOM edits/typo reset work. No match count/list. |
| DevTools Console → `document.querySelectorAll(...)` | No on-page marks; grind through `NodeList` in Elements. Re-type each pass. |
| Inspect → **Copy selector / XPath** | Deep paths; unstable auto-generated `id`s on framework remount. Rarely ship-ready. |

### Core problems

- **Volatile ids** · copied selectors often break across framework remounts.
- **Brittle paths** · generated chains ≠ the query you maintain in CSS/JS tests.
- **Single-shot tooling** · little on-page iterate → tighten loop without leaving the DOM.

## What it does

Docked bottom input:

- Highlights on each keystroke; Side Panel lists tag, id, classes, attrs, text snippet (**150** listed, **500** highlighted cap).
- Row click → scroll + focus.
- Invalid selectors → inline error; prior state intact until corrected.

## Install (unpacked)

- Chrome → `chrome://extensions`
- Enable **Developer mode**
- **Load unpacked** → select this directory

## Usage

`chrome://extensions/shortcuts` · **toolbar icon** (Live CSS Queries + Side Panel)

| Action | Shortcuts label | Default |
| --- | --- | --- |
| Live CSS Queries + Side Panel | Toggle Live CSS Queries (+ Side Panel) | Toolbar — bind on Shortcuts |
| Toggle selector input | Toggle selector input | **Alt+S** |

## Limits

- Side Panel list cap **150**; highlight cap **500** (see above).

## Permissions

MV3: `sidePanel`, `storage` (session tab state). Content scripts inject via manifest `matches` (no broad host permissions).

## License

[MIT](LICENSE)
