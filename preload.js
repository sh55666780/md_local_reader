const { contextBridge, ipcRenderer } = require('electron');

// ============================================================
// Thin preload - ALL rendering logic is in main.js (full Node)
// This preload ONLY passes IPC calls through.
// No library requires - avoids contextBridge serialization issues.
// ============================================================

contextBridge.exposeInMainWorld('electronAPI', {
  // --- File operations ---
  openFile: () => ipcRenderer.invoke('open-file'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  exportPDF: () => ipcRenderer.invoke('export-pdf'),
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  addRecentFile: (filePath) => ipcRenderer.invoke('add-recent-file', filePath),
  readLocalImage: (imagePath) => ipcRenderer.invoke('read-local-image', imagePath),
  saveDocx: (filePath, buffer) => ipcRenderer.invoke('save-docx', { filePath, buffer }),

  // --- Core: renders markdown to HTML (main process handles this) ---
  renderMarkdown: (text, basePath) => ipcRenderer.invoke('render-markdown', { text, basePath }),

  // --- Mermaid (needs DOM; must run in renderer; main process hands off) ---
  // We can't run mermaid in main process (no DOM). 
  // Renderer will handle mermaid via the preloaded module or inline.
  // For now, mermaid divs are rendered by main, and renderer initializes them.
  // mermaid initialization is done via main process through a dedicated handler.
  mermaidRun: (htmlContent) => ipcRenderer.invoke('mermaid-render-svg', { htmlContent }),

  // --- Word export (rendered in main process) ---
  exportDocx: (htmlContent, opts) => ipcRenderer.invoke('export-docx', { html: htmlContent, opts }),

  // --- Path utilities (simple string ops, fine in preload) ---
  pathUtils: {
    basename: (fp) => { if (!fp) return ''; const p = fp.replace(/\\/g, '/'); return p.substring(p.lastIndexOf('/') + 1); },
    dirname: (fp) => { if (!fp) return ''; const p = fp.replace(/\\/g, '/'); const i = p.lastIndexOf('/'); return i >= 0 ? p.substring(0, i) : ''; },
    extname: (fp) => { if (!fp) return ''; const b = fp.replace(/\\/g, '/').split('/').pop(); const i = b.lastIndexOf('.'); return i >= 0 ? b.substring(i) : ''; }
  },

  // --- Event listeners ---
  onMenuAction: (cb) => ipcRenderer.on('menu-action', (_e, a) => cb(a)),
  onFileOpened: (cb) => ipcRenderer.on('file-opened', (_e, d) => cb(d)),
  removeAllListeners: () => { ipcRenderer.removeAllListeners('menu-action'); ipcRenderer.removeAllListeners('file-opened'); }
});
