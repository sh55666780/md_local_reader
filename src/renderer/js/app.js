/**
 * App - Main controller for Markdown Reader (multi-tab support)
 */
class App {
  constructor() {
    this.renderer = new MDToHTMLRenderer('');
    this.exporter = new Exporter(this);
    this.tabs = [];           // { id, filePath, fileName, fileDir, markdown, html }
    this.activeTabId = null;
    this.zoomLevel = 100;
    this.isDarkTheme = false;

    this.contentEl = document.getElementById('content');
    this.tocNav = document.getElementById('toc-nav');
    this.welcomeEl = document.getElementById('welcome');
    this.tabBar = document.getElementById('tab-bar');
  }

  get activeTab() {
    return this.tabs.find(t => t.id === this.activeTabId) || null;
  }

  _basename(p) {
    const api = window.electronAPI;
    return api && api.pathUtils ? api.pathUtils.basename(p) : p.replace(/\\/g, '/').split('/').pop();
  }
  _dirname(p) {
    const api = window.electronAPI;
    return api && api.pathUtils ? api.pathUtils.dirname(p) : p.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  }

  // ================ Init ================
  init() {
    console.log('[App] Init tabs...');
    this._loadPreferences();
    this._applyTheme();
    this._initMermaid();
    this._bindEvents();
    this._bindIPC();
    this._setupDragDrop();
    this._setupKeyboardShortcuts();
    this._loadRecentFiles();
    this._updateEmptyState();
    console.log('[App] Ready');
  }

  _initMermaid() {
    if (typeof window.mermaid === 'undefined') return;
    try {
      window.mermaid.initialize({ startOnLoad: false, theme: this.isDarkTheme ? 'dark' : 'default', securityLevel: 'loose' });
    } catch (e) { console.warn('[App] Mermaid init:', e.message); }
  }

  _bindIPC() {
    if (!window.electronAPI) { console.error('[App] electronAPI missing'); return; }
    window.electronAPI.onMenuAction(action => this._handleMenuAction(action));
    window.electronAPI.onFileOpened(data => {
      if (data && data.content) this._openFile(data.filePath, data.content);
    });
  }

  // ================ Preferences ================
  _loadPreferences() {
    try {
      if (localStorage.getItem('md-reader-theme') === 'dark') this.isDarkTheme = true;
      const z = parseInt(localStorage.getItem('md-reader-zoom'));
      if (z && z >= 50 && z <= 300) { this.zoomLevel = z; this._applyZoom(); }
    } catch (e) {}
  }
  _savePreferences() {
    try {
      localStorage.setItem('md-reader-theme', this.isDarkTheme ? 'dark' : 'light');
      localStorage.setItem('md-reader-zoom', this.zoomLevel.toString());
    } catch (e) {}
  }

  _applyTheme() {
    const il = document.getElementById('icon-light'), id = document.getElementById('icon-dark');
    if (this.isDarkTheme) {
      document.body.classList.add('dark-theme');
      if (il) il.style.display = 'none'; if (id) id.style.display = '';
    } else {
      document.body.classList.remove('dark-theme');
      if (il) il.style.display = ''; if (id) id.style.display = 'none';
    }
    const st = document.getElementById('status-theme');
    if (st) st.textContent = 'Theme: ' + (this.isDarkTheme ? 'Dark' : 'Light');
  }

  // ================ Tabs ================
  _openFile(filePath, content) {
    // Check if already open
    const existing = this.tabs.find(t => t.filePath === filePath);
    if (existing) {
      this._switchTab(existing.id);
      return;
    }
    this._addTab(filePath, content);
  }

  async _addTab(filePath, content) {
    console.log('[App] Add tab:', filePath);
    if (!content) {
      const r = await window.electronAPI.readFile(filePath);
      if (!r || !r.success) { alert('Failed to read: ' + (r?.error || 'unknown')); return; }
      filePath = r.filePath;
      content = r.content;
    }
    window.electronAPI.addRecentFile(filePath);

    const fileDir = this._dirname(filePath);
    this.renderer.setBasePath(fileDir);
    const html = await this.renderer.render(content);

    const tab = {
      id: 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      filePath,
      fileName: this._basename(filePath),
      fileDir,
      markdown: content,
      html
    };

    this.tabs.push(tab);
    this._renderTabBar();
    this._switchTab(tab.id);
  }

  _switchTab(tabId) {
    this.activeTabId = tabId;
    const tab = this.activeTab;
    this._renderTabBar();
    if (tab) {
      this._showContent(tab);
    }
    this.updateStatusBar();
    updateTitle(tab);
    this._saveLastTab();
  }

  _closeTab(tabId, e) {
    e && e.stopPropagation();
    const idx = this.tabs.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    this.tabs.splice(idx, 1);

    if (this.tabs.length === 0) {
      this.activeTabId = null;
      this._renderTabBar();
      this._updateEmptyState();
      updateTitle(null);
      this.updateStatusBar();
      return;
    }

    // Switch to adjacent tab
    const newIdx = Math.min(idx, this.tabs.length - 1);
    this._switchTab(this.tabs[newIdx].id);
  }

  _renderTabBar() {
    this.tabBar.innerHTML = '';
    this.tabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.id === this.activeTabId ? ' active' : '');
      el.title = tab.filePath;
      el.innerHTML = '<span class="tab-title">' + this._esc(tab.fileName) + '</span>'
        + '<button class="tab-close" data-close="' + tab.id + '">&times;</button>';
      el.addEventListener('click', () => this._switchTab(tab.id));
      this.tabBar.appendChild(el);
    });

    // Close button handlers
    this.tabBar.querySelectorAll('.tab-close').forEach(btn => {
      btn.addEventListener('click', (e) => this._closeTab(btn.dataset.close, e));
    });

    // Scroll active tab into view
    const activeEl = this.tabBar.querySelector('.tab.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    this._updateEmptyState();
  }

  _showContent(tab) {
    if (this.welcomeEl) this.welcomeEl.style.display = 'none';
    this.contentEl.innerHTML = tab.html;
    this.generateTOC();
    this._runMermaid();
    this._saveLastTab();
  }

  _updateEmptyState() {
    if (this.tabs.length === 0) {
      if (this.welcomeEl) this.welcomeEl.style.display = '';
      this.contentEl.innerHTML = '';
      if (this.tocNav) this.tocNav.innerHTML = '';
    } else if (this.welcomeEl) {
      this.welcomeEl.style.display = 'none';
    }
  }

  _saveLastTab() {
    const tab = this.activeTab;
    if (tab) {
      try { localStorage.setItem('md-reader-last-tab', tab.filePath); } catch (e) {}
    }
  }

  // ================ Events ================
  _bindEvents() {
    const b = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    b('btn-open', 'click', () => this.openFileDialog());
    b('btn-theme', 'click', () => this.toggleTheme());
    b('btn-zoom-in', 'click', () => this.zoomIn());
    b('btn-zoom-out', 'click', () => this.zoomOut());
    b('btn-zoom-reset', 'click', () => this.resetZoom());
    b('btn-export-html', 'click', () => this.exporter.exportHTML());
    b('btn-export-pdf', 'click', () => this.exporter.exportPDF());
    b('btn-export-word', 'click', () => this.exporter.exportWord());
    b('btn-toggle-sidebar', 'click', () => this.toggleSidebar());
    b('btn-expand-sidebar', 'click', () => this.showSidebar());

    const recBtn = document.getElementById('btn-recent');
    const recDrop = document.getElementById('recent-dropdown');
    if (recBtn && recDrop) {
      recBtn.addEventListener('click', e => { e.stopPropagation(); this._loadRecentFiles(); recDrop.classList.toggle('active'); });
      document.addEventListener('click', () => recDrop.classList.remove('active'));
    }

    const ca = document.getElementById('content-area');
    if (ca) {
      ca.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); e.deltaY < 0 ? this.zoomIn() : this.zoomOut(); } }, { passive: false });
      ca.addEventListener('scroll', () => this._updateTocScrollSpy());
    }

    if (this.tocNav) {
      this.tocNav.addEventListener('click', e => {
        const item = e.target.closest('.toc-item');
        if (item && item.dataset.target) {
          const tgt = document.getElementById(item.dataset.target);
          if (tgt) { tgt.scrollIntoView({ behavior: 'smooth', block: 'start' }); this._highlightTocItem(item); }
        }
      });
    }
  }

  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'o') { e.preventDefault(); this.openFileDialog(); return; }
      if (e.ctrlKey && e.key === 'w') { e.preventDefault(); const t = this.activeTab; if (t) this._closeTab(t.id); return; }
    });
  }

  _setupDragDrop() {
    document.body.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    document.body.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      const files = e.dataTransfer.files;
      for (const f of files) {
        if (f.path && /\.(md|markdown)$/i.test(f.name)) {
          this._openFile(f.path, null);
        }
      }
    });
  }

  async openFileDialog() {
    const api = window.electronAPI;
    if (!api) { alert('App IPC not available.'); return; }
    try {
      const r = await api.openFile();
      if (r && r.success) this._openFile(r.filePath, r.content);
    } catch (e) { console.error('[App] Open error:', e); }
  }

  // ================ Mermaid ================
  async _runMermaid() {
    if (typeof window.mermaid === 'undefined') return;
    try {
      const els = this.contentEl.querySelectorAll('.mermaid');
      if (els.length > 0) await window.mermaid.run({ nodes: Array.from(els), suppressErrors: true });
    } catch (e) { console.warn('[App] Mermaid:', e.message); }
  }

  // ================ TOC ================
  generateTOC() {
    if (!this.tocNav) return;
    this.tocNav.innerHTML = '';
    const headings = this.contentEl.querySelectorAll('h1, h2, h3');
    if (!headings.length) {
      this.tocNav.innerHTML = '<div style="padding:12px 16px;font-size:12px;color:var(--text-tertiary);text-align:center;">No headings</div>';
      return;
    }
    headings.forEach((h, i) => {
      const lv = parseInt(h.tagName.charAt(1));
      const id = 'heading-' + i; h.id = id;
      const el = document.createElement('span');
      el.className = 'toc-item level-' + lv;
      el.textContent = h.textContent.trim();
      el.dataset.target = id;
      el.title = h.textContent.trim();
      this.tocNav.appendChild(el);
    });
  }

  _updateTocScrollSpy() {
    const ca = document.getElementById('content-area');
    const hs = this.contentEl.querySelectorAll('h1, h2, h3');
    const ti = this.tocNav.querySelectorAll('.toc-item');
    if (!hs.length || !ti.length) return;
    const st = ca.scrollTop + 80;
    let ci = 0;
    for (let i = hs.length - 1; i >= 0; i--) { if (hs[i].offsetTop <= st) { ci = i; break; } }
    this._highlightTocItem(ti[ci]);
  }
  _highlightTocItem(item) {
    this.tocNav.querySelectorAll('.toc-item').forEach(it => it.classList.remove('active'));
    if (item) item.classList.add('active');
  }

  // ================ Sidebar ================
  toggleSidebar() {
    const sb = document.getElementById('sidebar'), eb = document.getElementById('btn-expand-sidebar');
    if (sb.classList.contains('collapsed')) { sb.classList.remove('collapsed'); eb.style.display = 'none'; }
    else { sb.classList.add('collapsed'); eb.style.display = 'flex'; }
  }
  showSidebar() {
    document.getElementById('sidebar').classList.remove('collapsed');
    document.getElementById('btn-expand-sidebar').style.display = 'none';
  }

  // ================ Theme ================
  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    this._applyTheme();
    this._savePreferences();
    this._initMermaid();
  }

  // ================ Zoom ================
  zoomIn()  { if (this.zoomLevel < 300) { this.zoomLevel += 10; this._applyZoom(); this._savePreferences(); } }
  zoomOut() { if (this.zoomLevel > 50)  { this.zoomLevel -= 10; this._applyZoom(); this._savePreferences(); } }
  resetZoom() { this.zoomLevel = 100; this._applyZoom(); this._savePreferences(); }
  _applyZoom() {
    const ca = document.getElementById('content-area'), zl = document.getElementById('zoom-level');
    if (ca) ca.style.fontSize = this.zoomLevel + '%';
    if (zl) zl.textContent = this.zoomLevel + '%';
    this.updateStatusBar();
  }

  // ================ Status ================
  updateStatusBar() {
    const tab = this.activeTab;
    const sf = document.getElementById('status-filename');
    const sw = document.getElementById('status-wordcount');
    const sz = document.getElementById('status-zoom');
    if (sf) sf.textContent = tab ? tab.fileName : 'No file opened';
    const wc = tab ? (tab.markdown || '').trim().split(/\s+/).length : 0;
    if (sw) sw.textContent = 'Words: ' + wc;
    if (sz) sz.textContent = 'Zoom: ' + this.zoomLevel + '%';
  }
  updateStatus(msg) {
    const el = document.getElementById('status-filename');
    if (!el) return;
    const orig = el.textContent;
    el.textContent = msg;
    setTimeout(() => { if (el.textContent === msg) el.textContent = orig; }, 3000);
  }

  // ================ Recent Files ================
  async _loadRecentFiles() {
    if (!window.electronAPI) return;
    try {
      const files = await window.electronAPI.getRecentFiles();
      const listEl = document.getElementById('recent-list');
      if (!listEl) return;
      if (!files || !files.length) { listEl.innerHTML = '<div class="dropdown-empty">No recent files</div>'; return; }
      listEl.innerHTML = files.map(fp =>
        '<div class="dropdown-item" data-path="' + this._escAttr(fp) + '" title="' + this._escAttr(fp) + '">'
        + '<span>' + this._esc(this._basename(fp)) + '</span>'
        + '<span class="file-path">' + this._esc(this._dirname(fp)) + '</span></div>'
      ).join('');
      listEl.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', e => {
          e.stopPropagation();
          document.getElementById('recent-dropdown').classList.remove('active');
          this._openFile(item.dataset.path, null);
        });
      });
    } catch (e) { console.error('[App] Recent files:', e); }
  }

  // ================ Menu actions ================
  _handleMenuAction(action) {
    switch (action) {
      case 'open-file': this.openFileDialog(); break;
      case 'export-html': this.exporter.exportHTML(); break;
      case 'export-pdf': this.exporter.exportPDF(); break;
      case 'export-word': this.exporter.exportWord(); break;
      case 'zoom-in': this.zoomIn(); break;
      case 'zoom-out': this.zoomOut(); break;
      case 'zoom-reset': this.resetZoom(); break;
      case 'toggle-theme': this.toggleTheme(); break;
    }
  }

  // ================ Utils ================
  _esc(s) { const m={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}; return String(s).replace(/[&<>"']/g,c=>m[c]); }
  _escAttr(s) { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
}

// Helper: update window title
function updateTitle(tab) {
  document.title = tab ? tab.fileName + ' - Markdown Reader' : 'Markdown Reader';
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
