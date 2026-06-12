# Privacy Policy — Live CSS Queries

**Last updated:** June 5, 2026

Live CSS Queries evaluates CSS selectors on pages you open.

## Summary

**We do not collect, sell, or transfer your personal data.** Selector evaluation runs in your browser. We run no servers for this extension.

## What the extension accesses

After you toggle Live CSS Queries (toolbar action or keyboard shortcut), the extension:

- Runs `document.querySelectorAll` and related DOM reads on the **active tab** to find selector matches
- Injects a docked input and highlight styles on that tab
- Shows match metadata (tag, id, classes, attributes, text snippet) in an on-page match panel
- Copies a selector string to your clipboard when you use the copy control

The UI and evaluation stay off until you toggle the tool on.

## What is stored

| Data | Where | Duration |
| --- | --- | --- |
| Active tab id (which tab has the tool open) | In-memory in the extension service worker | Until the browser restarts |
| Match list and highlights | In-memory in the tab | Cleared when you close the tool or the tab |

Nothing is written to disk or synced to Google account storage by this extension.

## What is not collected

- No accounts or sign-in
- No analytics, crash reporting, or telemetry SDKs
- No third-party network requests
- No sale or sharing of user data

## Permissions (why they exist)

- **Content scripts on web pages** — evaluate selectors on origins you open; inactive until you toggle the tool

## Children

This extension is a developer tool and is not directed at children under 13.

## Changes

We update the date above when this policy changes.

## Contact

Open an issue on the project repository: [github.com/metaory/live-css-queries](https://github.com/metaory/live-css-queries)

## License

The extension software is distributed under the [MIT License](LICENSE).
