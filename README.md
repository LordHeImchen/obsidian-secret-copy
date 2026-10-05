# Secret Copy — Obsidian Plugin

Blurs `{{secrets}}` by default and adds a one-click copy button next to each one. Reveal on hover, copy without ever exposing the value on screen.

## Features

- Everything wrapped in `{{double curly braces}}` is blurred by default
- Normal `==highlights==` stay untouched — and `=={{secret}}==` gives you a highlighted secret
- Hover to reveal
- Click `⎘` to copy the value to clipboard
- "✓ Copied" toast confirmation appears at the top of the window
- No value is ever shown in plain text during the copy action
- Copies the exact value as written, even if it contains `*`, `_` or spaces
- Works in reading view, Live Preview and source mode, including tables

## Installation

### Via BRAT (recommended until official listing)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. In BRAT settings, click **Add Beta Plugin**
3. Enter: `https://github.com/LordHeImchen/obsidian-secret-copy`
4. Enable **Secret Copy** in Settings → Community plugins

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/LordHeImchen/obsidian-secret-copy/releases)
2. Copy them to `<your-vault>/.obsidian/plugins/secret-copy/`
3. Enable **Secret Copy** in Settings → Community plugins

## Usage

Wrap any secret in `{{double curly braces}}` in your notes:

```markdown
| Token | Value |
|-------|-------|
| API Key | {{sk-abc123}} |
```

The value will be blurred. Hover to peek, click `⎘` to copy silently.

Notes:

- A secret must fit on one line and cannot contain `}}`.
- `{{date}}`, `{{time}}` and `{{title}}` (core Templates placeholders) are not treated as secrets.
- Inside inline code or code blocks, `{{…}}` is left as plain text.

## License

MIT
