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
    this._injectFrame = null;
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
    // shows the raw ==secret== text.
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

    // Watch the DOM instead of workspace events: Live Preview renders tables
    // lazily, often after layout-change / active-leaf-change have already
    // fired, so buttons only appeared on some later event. The observer sees
    // the <mark> the moment it is rendered and injects in the same frame.
    this._observer = new MutationObserver(() => this._scheduleInject());
    this._observer.observe(this.app.workspace.containerEl, {
      childList: true,
      subtree: true,
    });

    this._scheduleInject();
  }

  _copy(btn) {
    // Read the current mark text at click time so an edited secret is never
    // copied from a stale value.
    const mark = btn.previousElementSibling;
    const text = (mark && mark.tagName === 'MARK')
      ? mark.textContent.trim()
      : btn.dataset.secret;
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
    if (this._injectFrame) cancelAnimationFrame(this._injectFrame);
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

  _scheduleInject() {
    // Coalesce bursts of mutations into one scan before the next paint.
    if (this._injectFrame) return;
    this._injectFrame = requestAnimationFrame(() => {
      this._injectFrame = null;
      this._injectButtons();
    });
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
