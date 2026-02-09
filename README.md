# Simple Redirect

A Chrome extension that does one job: redirect URLs.

Set up rules to automatically redirect from one site to another. For example, redirect `reddit.com/*` to `all.reddit.com/*` (keeps path and query), or `youtube.com` to `read.readwise.io`.

## Features

- Wildcard pattern matching (`youtube.com/*` matches all subdomains too)
- Optional path passthrough (`source/* -> target/*` keeps the original path + query)
- Allowlist specific URLs so they bypass redirects (e.g., keep `music.youtube.com` working while redirecting the rest)
- Toggle all redirects on/off by clicking the toolbar icon
- Toggle individual rules on/off
- Edit rules inline from the settings page

## Install

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select this folder

## How it works

Uses Chrome's [Declarative Net Request API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) (Manifest V3) to intercept and redirect navigations before they hit the network. A `tabs.onUpdated` fallback catches navigations that bypass the network layer, which happens on sites like `x.com` that use Service Workers to serve cached responses.

Rules are stored in `chrome.storage.local` and synced to dynamic declarative rules whenever you make changes.

## Privacy

Everything runs locally in your browser. No data leaves your machine, no analytics, no external requests.

