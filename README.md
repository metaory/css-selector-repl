# selector-debugger


- **selector-debugger** is a minimal Chrome extension for interactively building and debugging complex CSS selectors.  
- The UI has a live page view, a narrow sidebar for match diagnostics, and a full-width selector input overlay.  
- On every keypress, it clears prior state, re-evaluates the selector, highlights matches, and lists them in the sidebar.  
- Each evaluation is fully stateless, with no persistence, no incremental patching, and deterministic recompute-from-scratch behavior.  
- The tool is strictly vanilla, zero-dependency, browser-native, fast, and built for clean functional developer workflows.
