# Simple Redirect

A Chrome extension that does one job: redirect URLs.

Set up rules to automatically redirect from one site to another. Useful for replacing sites with better alternatives (e.g., redirect `reddit.com` to `old.reddit.com`, or `youtube.com` to `read.readwise.io`).

## Features

- **Pattern-based redirects** — use wildcards like `youtube.com/*` to match entire domains including subdomains
- **Allowlist** — exempt specific URLs from redirects (e.g., allow `music.youtube.com` while redirecting everything else)
- **Global toggle** — pause/resume all redirects with a single click on the toolbar icon
- **Per-rule toggle** — enable/disable individual redirect rules

## Install

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder

## How it works

The extension uses Chrome's [Declarative Net Request API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) (Manifest V3) to intercept and redirect navigations before they hit the network. A `tabs.onUpdated` fallback catches navigations that bypass the network layer (sites with Service Workers).

All rules are stored in `chrome.storage.local` and synced to dynamic declarative rules whenever you make changes.

## Privacy

Simple Redirect runs entirely on your machine. No data is collected, no analytics, no external requests. Your redirect rules never leave your browser.
