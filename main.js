/*
 * Secret Copy — Obsidian plugin
 * Blurs every {{secret}} and injects a copy button next to it.
 *
 * {{…}} is not Markdown, so Obsidian renders it as plain text. We find it
 * ourselves in three places:
 *  - Reading view: a markdown post-processor wraps the rendered text.
 *  - Live Preview / Source: a CodeMirror extension decorates the raw text.
 *  - Rendered islands inside the editor (e.g. Live Preview table cells): a
 *    MutationObserver runs the same wrapping as reading view.
 *
 * Feedback is a floating toast appended to document.body — completely outside
 * the table cell DOM. This avoids every cell-re-render race condition: the
 * button in the table is never mutated after the click, so Obsidian can do
 * whatever it wants with the cell and the feedback still shows correctly.
 */

const { Plugin } = require('obsidian');
const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');

const COPY_BTN_CLASS = 'secret-copy-btn';
const SECRET_CLASS = 'secret-copy-secret';
const TOAST_ID = 'secret-copy-toast';

// {{secret}} on a single line; the secret itself may not contain "}}".
const SECRET_RE = /\{\{((?:(?!\}\})[^\n])+?)\}\}/g;

// Placeholders of Obsidian's core Templates plugin are not secrets.
const TEMPLATE_VAR_RE = /^\s*(date|time|title)(:[^}]*)?\s*$/i;

// Elements whose text is split into separate groups, so a secret can never
// span two paragraphs, list items or table cells.
const BLOCK_SEL = 'p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, div';

function isSecret(inner) {
  return !TEMPLATE_VAR_RE.test(inner);
}

function makeButton(secret) {
  const btn = document.createElement('span');
  btn.className = COPY_BTN_CLASS;
  btn.title = 'Copy to clipboard';
  btn.dataset.secret = secret;
  btn.contentEditable = 'false';
  const icon = document.createElement('span');
  icon.className = 'secret-copy-icon';
  icon.textContent = '⎘';
  btn.appendChild(icon);
  return btn;
}

// ── Reading view / rendered HTML ──────────────────────────────────────────

// Secrets as written in the Markdown source, so the copy button gets the
// exact value even when Obsidian rendered parts of it (e.g. *x* as italics).
function sourceSecrets(source) {
  const withoutCode = source.replace(/(`+)[\s\S]*?\1/g, '');
  return [...withoutCode.matchAll(SECRET_RE)]
    .map(m => m[1])
    .filter(isSecret);
}

function skipTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest('code, pre, .' + SECRET_CLASS + ', .' + COPY_BTN_CLASS)) return true;
  // Editor lines are handled by the CodeMirror extension, unless the text
  // sits in a rendered island nested inside that line.
  const line = parent.closest('.cm-line');
  const rendered = parent.closest('.markdown-rendered, .markdown-preview-view');
  return !!line && (!rendered || rendered.contains(line));
}

// Wraps every {{secret}} under root in a blurred span plus copy button.
// Returns the number of secrets wrapped. Idempotent: wrapped text is skipped.
function wrapSecrets(root, exactValues) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const groups = [];
  let current = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (skipTextNode(node)) { current = null; continue; }
    const block = node.parentElement.closest(BLOCK_SEL) || root;
    if (!current || current.block !== block) {
      current = { block, nodes: [] };
      groups.push(current);
    }
    current.nodes.push(node);
  }

  const found = [];
  groups.forEach(group => {
    const starts = [];
    let text = '';
    group.nodes.forEach(n => { starts.push(text.length); text += n.data; });
    if (!text.includes('{{')) return;

    // Maps a character offset in the group's text back to a DOM position.
    const locate = (pos, isEnd) => {
      for (let i = group.nodes.length - 1; i >= 0; i--) {
        if (isEnd ? pos > starts[i] : pos >= starts[i]) {
          return [group.nodes[i], pos - starts[i]];
        }
      }
      return [group.nodes[0], 0];
    };
    const rangeOf = (from, to) => {
      const r = document.createRange();
      r.setStart(...locate(from, false));
      r.setEnd(...locate(to, true));
      return r;
    };

    for (const m of text.matchAll(SECRET_RE)) {
      if (!isSecret(m[1])) continue;
      const start = m.index, end = start + m[0].length;
      found.push({
        rendered: m[1],
        open: rangeOf(start, start + 2),
        inner: rangeOf(start + 2, end - 2),
        close: rangeOf(end - 2, end),
      });
    }
  });

  // Only trust the source values when they line up one-to-one.
  const useExact = exactValues && exactValues.length === found.length;

  // Ranges are live, so earlier ones stay valid while later ones mutate the
  // DOM; working back to front keeps the edits from touching each other.
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i];
    const secret = (useExact ? exactValues[i] : f.rendered).trim();
    f.close.deleteContents();
    const span = document.createElement('span');
    span.className = SECRET_CLASS;
    span.appendChild(f.inner.extractContents());
    f.inner.insertNode(span);
    f.open.deleteContents();
    span.after(makeButton(secret));
  }
  return found.length;
}

// ── Live Preview / Source mode ────────────────────────────────────────────

class CopyWidget extends WidgetType {
  constructor(secret) {
    super();
    this.secret = secret;
  }
  eq(other) { return other.secret === this.secret; }
  toDOM() { return makeButton(this.secret); }
  ignoreEvent() { return true; }
}

const secretMark = Decoration.mark({ class: SECRET_CLASS });
const openBraceMark = Decoration.mark({ class: 'secret-copy-brace secret-copy-brace-open' });
const closeBraceMark = Decoration.mark({ class: 'secret-copy-brace secret-copy-brace-close' });

function inCode(tree, pos) {
  const name = tree.resolveInner(pos, 1).name;
  return /code|frontmatter|comment|math/i.test(name);
}

function buildDecorations(view) {
  const builder = new RangeSetBuilder();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const m of text.matchAll(SECRET_RE)) {
      if (!isSecret(m[1])) continue;
      const start = from + m.index, end = start + m[0].length;
      if (inCode(tree, start + 2)) continue;
      builder.add(start, start + 2, openBraceMark);
      builder.add(start + 2, end - 2, secretMark);
      builder.add(end - 2, end, closeBraceMark);
      builder.add(end, end, Decoration.widget({
        widget: new CopyWidget(m[1].trim()),
        side: 1,
      }));
    }
  }
  return builder.finish();
}

const secretEditorPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildDecorations(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.decorations = buildDecorations(update.view);
    }
  }
}, { decorations: v => v.decorations });

// ── Plugin ────────────────────────────────────────────────────────────────

module.exports = class SecretCopyPlugin extends Plugin {

  async onload() {
    this._scanFrame = null;
    this._toastTimer = null;

    // Build the toast element once and reuse it.
    this._toast = document.createElement('div');
    this._toast.id = TOAST_ID;
    this._toast.textContent = '✓ Copied';
    document.body.appendChild(this._toast);

    // Swallow every pointer event on the button, on window in the capture
    // phase so we run before anything Obsidian registers. Blocking mousedown
    // alone is not enough: the Live Preview table widget also reacts to
    // pointerdown / click and would switch the cell into edit mode, which
    // shows the raw {{secret}} text.
    const SWALLOW = ['pointerdown', 'pointerup', 'mousedown', 'mouseup',
                     'click', 'dblclick', 'touchstart', 'touchend'];
    SWALLOW.forEach(type => {
      this.registerDomEvent(window, type, (evt) => {
        const btn = evt.target.closest && evt.target.closest('.' + COPY_BTN_CLASS);
        if (!btn) return;
        evt.stopImmediatePropagation();
        evt.preventDefault();
        if (type === 'click') this._copy(btn);
      }, { capture: true });
    });

    this.registerMarkdownPostProcessor((el, ctx) => {
      const info = ctx.getSectionInfo(el);
      const exact = info
        ? sourceSecrets(info.text.split('\n').slice(info.lineStart, info.lineEnd + 1).join('\n'))
        : null;
      wrapSecrets(el, exact);
    });

    this.registerEditorExtension(secretEditorPlugin);

    // Live Preview renders some blocks (tables, callouts, embeds) as HTML
    // islands inside the editor, lazily and outside the post-processor. Watch
    // the DOM so their secrets are wrapped the moment they appear.
    this._observer = new MutationObserver(() => this._scheduleScan());
    this._observer.observe(this.app.workspace.containerEl, {
      childList: true,
      subtree: true,
    });

    this._scheduleScan();
  }

  _copy(btn) {
    const text = btn.dataset.secret;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      this._showToast();
    }).catch(() => {
      // Fallback: execCommand for environments where clipboard API is blocked.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this._showToast();
    });
  }

  onunload() {
    if (this._observer) this._observer.disconnect();
    if (this._scanFrame) cancelAnimationFrame(this._scanFrame);
    if (this._toastTimer) clearTimeout(this._toastTimer);
    if (this._toast && this._toast.parentNode) this._toast.parentNode.removeChild(this._toast);
    document.querySelectorAll('.' + COPY_BTN_CLASS).forEach(el => el.remove());
  }

  _showToast() {
    const t = this._toast;
    t.classList.add('secret-copy-toast--visible');

    // Replay the pulse on every copy, so a second copy while the toast is
    // still up gives visible feedback instead of looking like a no-op.
    // Driven via the Web Animations API so it can't be swallowed by CSS
    // class/restart quirks; cancel any running pulse so rapid copies replay.
    if (this._pulse) this._pulse.cancel();
    this._pulse = t.animate([
      { transform: 'translateX(-50%) scale(1)',    filter: 'brightness(1)' },
      { transform: 'translateX(-50%) scale(1.25)', filter: 'brightness(1.35)', offset: 0.35 },
      { transform: 'translateX(-50%) scale(1)',    filter: 'brightness(1)' },
    ], { duration: 400, easing: 'ease-out' });

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove('secret-copy-toast--visible');
    }, 2000);
  }

  _scheduleScan() {
    // Coalesce bursts of mutations into one scan before the next paint.
    if (this._scanFrame) return;
    this._scanFrame = requestAnimationFrame(() => {
      this._scanFrame = null;
      this.app.workspace.containerEl
        .querySelectorAll('.markdown-source-view .markdown-rendered')
        .forEach(el => wrapSecrets(el, null));
    });
  }
};
