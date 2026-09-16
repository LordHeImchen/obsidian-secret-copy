# Secret Copy — Obsidian Plugin

Blurs `==highlighted==` text by default and adds a one-click copy button next to each secret. Reveal on hover, copy without ever exposing the value on screen.

## Features

- All `==highlighted==` text is blurred by default
- Hover to reveal
- Click `⎘` to copy the value to clipboard
- "✓ Copied" toast confirmation appears at the top of the window
- No value is ever shown in plain text during the copy action
- Works in reading view and preview mode

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

Wrap any secret in `==double equals==` in your notes:

```markdown
| Token | Value |
|-------|-------|
| API Key | ==sk-abc123== |
```

The value will be blurred. Hover to peek, click `⎘` to copy silently.

## License

MIT
