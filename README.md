<div align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="selector-debugger logo">
  <h1>selector-debugger</h1>
</div>

Minimal MV3 Chrome extension for real-time CSS selector debugging.

## What it does

- Type a CSS selector into an in-page overlay input.
- Matches are highlighted on the page and summarized in the Side Panel.
- Click a match in the Side Panel to focus/scroll to that element.

## Install (unpacked)

- Chrome → `chrome://extensions`
- Enable **Developer mode**
- **Load unpacked** → select this folder

## Usage

- Click the extension action to toggle the debugger:
  - when off: opens Side Panel and in-page selector input
  - when on: closes both
- Shortcut: **Alt+S** → same toggle behavior.
- Shortcut: **Alt+R** → reload the extension.

## Notes / limits

- **Max matches**: 150 items listed in Side Panel (extra matches still get highlighted).
- **Invalid selectors**: surface an error in the Side Panel.
- **Injection**: only on `http(s)` + `file:`; Chrome Web Store pages are blocked.
- **Sidebar independence**: closing the Side Panel does not close the in-page selector input.
- **Navigation reset**: reload/navigation fully deactivates the debugger (both panel + input).

## Permissions

- `activeTab`: operate on the currently active tab.
- `scripting`: inject `content.js` when needed.
- `sidePanel`: provide the Side Panel UI.
- `host_permissions: <all_urls>`: allow running on any site you visit.

## Dev

- Edit files.
- In `chrome://extensions` press **Reload** on the extension (or use **Alt+R**).

## License

[MIT](LICENSE)
