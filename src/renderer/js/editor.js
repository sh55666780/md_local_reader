/**
 * Editor — Markdown source editor with formatting operations
 */
class MdEditor {
  constructor(container, textarea, onChanged) {
    this.container = container;
    this.textarea = textarea;
    this.onChanged = onChanged;
    this._debounceId = null;
    this._bindEvents();
  }

  // ================ Public API ================

  setContent(text) {
    this.textarea.value = text || '';
  }

  getContent() {
    return this.textarea.value;
  }

  focus() {
    this.textarea.focus();
  }

  // ================ Formatting Operations ================

  toggleBold() {
    this._wrapSelection('**', '**');
  }

  toggleUnderline() {
    this._wrapSelection('<u>', '</u>');
  }

  toggleInlineFormula() {
    this._wrapSelection('$', '$');
  }

  toggleBraces() {
    this._wrapSelection('{', '}');
  }

  // ================ Core ================

  /**
   * Wrap selected text with prefix/suffix, or insert if no selection.
   */
  _wrapSelection(prefix, suffix) {
    const ta = this.textarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;

    if (start === end) {
      // No selection — insert placeholder
      const placeholder = 'text';
      ta.value = text.slice(0, start) + prefix + placeholder + suffix + text.slice(end);
      const newPos = start + prefix.length;
      ta.setSelectionRange(newPos, newPos + placeholder.length);
    } else {
      const selected = text.slice(start, end);
      ta.value = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
      ta.setSelectionRange(start, end + prefix.length + suffix.length);
    }

    ta.focus();
    this._notifyChange();
  }

  // ================ Events ================

  _bindEvents() {
    // Debounced change notification
    this.textarea.addEventListener('input', () => {
      clearTimeout(this._debounceId);
      this._debounceId = setTimeout(() => this._notifyChange(), 300);
    });

    // Tab key inserts 2 spaces
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = this.textarea;
        const start = ta.selectionStart;
        ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = start + 2;
        this._notifyChange();
      }

      // Ctrl+S save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (this.onSave) this.onSave();
      }
    });
  }

  _notifyChange() {
    if (this.onChanged) this.onChanged(this.getContent());
  }
}
