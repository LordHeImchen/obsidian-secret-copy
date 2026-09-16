/*
 * Secret Copy — Obsidian plugin
 * Injects a copy button next to every blurred ==secret== mark element.
 *
 * Feedback is a floating toast appended to document.body — completely outside
 * the table cell DOM. This avoids every cell-re-render race condition: the
 * button in the table is never mutated after the click, so Obsidian can do
 * whatever it wants with the cell and the feedback still shows correctly.
 */

const { Plugin } = require('obsidian');

const COPY_BTN_CLASS = 'secret-copy-btn';
const TOAST_ID = 'secret-copy-toast';

module.exports = class SecretCopyPlugin extends Plugin {

  async onload() {
    this._debounceTimer = null;
    this._toastTimer = null;

    // Build the toast element once and reuse it.
    this._toast = document.createElement('div');
    this._toast.id = TOAST_ID;
    this._toast.textContent = '✓ Copied';
    document.body.appendChild(this._toast);

    // mousedown: capture phase so we fire before Obsidian's editor activation.
    // preventDefault stops the cell from switching to edit mode entirely.
    this.registerDomEvent(document, 'mousedown', (evt) => {
      const btn = evt.target.closest('.' + COPY_BTN_CLASS);
      if (!btn) return;
      evt.stopPropagation();
      evt.preventDefault();

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
    }, { capture: true });

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this._scheduleInject())
    );
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this._scheduleInject())
    );

    this._scheduleInject();
  }

  onunload() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this._toastTimer) clearTimeout(this._toastTimer);
    if (this._toast && this._toast.parentNode) this._toast.parentNode.removeChild(this._toast);
    document.querySelectorAll('.' + COPY_BTN_CLASS).forEach(el => el.remove());
  }

  _showToast() {
    const t = this._toast;
    t.classList.add('secret-copy-toast--visible');

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove('secret-copy-toast--visible');
    }, 2000);
  }

  _scheduleInject() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._injectButtons(), 200);
  }

  _injectButtons() {
    const marks = document.querySelectorAll(
      '.markdown-rendered mark, .markdown-preview-view mark'
    );
    marks.forEach(mark => {
      if (mark.nextElementSibling &&
          mark.nextElementSibling.classList.contains(COPY_BTN_CLASS)) {
        return;
      }
      const btn = document.createElement('span');
      btn.className = COPY_BTN_CLASS;
      btn.title = 'Copy to clipboard';
      btn.dataset.secret = mark.textContent.trim();
      btn.contentEditable = 'false';
      const icon = document.createElement('span');
      icon.className = 'secret-copy-icon';
      icon.textContent = '⎘';
      btn.appendChild(icon);
      mark.insertAdjacentElement('afterend', btn);
    });
  }
};
