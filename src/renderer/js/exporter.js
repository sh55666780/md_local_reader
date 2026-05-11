/**
 * Exporter - Handles HTML/PDF/Word export for active tab
 */
class Exporter {
  constructor(app) {
    this.app = app;
  }

  _checkTab() {
    const tab = this.app.activeTab;
    if (!tab) { alert('Please open a Markdown file first.'); return null; }
    return tab;
  }

  async _waitForRender() {
    try {
      if (typeof window.mermaid !== 'undefined') {
        const els = document.querySelectorAll('.mermaid:not([data-processed])');
        if (els.length > 0) await window.mermaid.run({ nodes: Array.from(els), suppressErrors: true });
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }

  async exportHTML() {
    const tab = this._checkTab(); if (!tab) return;
    try {
      const renderer = new MDToHTMLRenderer(tab.fileDir);
      const fn = tab.fileName.replace(/\.(md|markdown)$/i, '');
      const html = await renderer.renderFullPage(tab.markdown, fn);
      const r = await window.electronAPI.saveFile('', html);
      if (r && r.success) this.app.updateStatus('Exported HTML to: ' + r.filePath);
    } catch (e) { console.error('HTML export:', e); alert('HTML export failed: ' + e.message); }
  }

  async exportPDF() {
    const tab = this._checkTab(); if (!tab) return;
    await this._waitForRender();
    try {
      const r = await window.electronAPI.exportPDF();
      if (r && r.success) this.app.updateStatus('Exported PDF to: ' + r.filePath);
    } catch (e) { console.error('PDF export:', e); }
  }

  async exportWord() {
    const tab = this._checkTab(); if (!tab) return;
    try {
      const renderer = new MDToHTMLRenderer(tab.fileDir);
      const bodyHtml = await renderer.render(tab.markdown);
      const fn = tab.fileName.replace(/\.(md|markdown)$/i, '');

      const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
        + '<style>body{font-family:"Segoe UI",Arial,sans-serif;font-size:11pt;line-height:1.5;color:#333;padding:20pt}'
        + 'h1{font-size:18pt;margin:12pt 0 6pt}h2{font-size:15pt;margin:10pt 0 5pt}h3{font-size:13pt;margin:8pt 0 4pt}'
        + 'p{margin:0 0 8pt}pre{background:#f5f5f5;border:1px solid #ddd;padding:8pt;font-family:Consolas,monospace;font-size:9pt}'
        + 'code{background:#f5f5f5;padding:1pt 3pt;font-family:Consolas,monospace;font-size:9pt}'
        + 'table{border-collapse:collapse;width:100%;margin:8pt 0}th,td{border:1px solid #999;padding:4pt 8pt}th{background:#f0f0f0;font-weight:bold}'
        + 'blockquote{border-left:3pt solid #ccc;padding-left:10pt;color:#666;margin:8pt 0}'
        + 'img{width:240pt;height:auto;display:block;margin:12pt auto}</style></head>'
        + '<body>' + bodyHtml + '</body></html>';

      const r = await window.electronAPI.exportDocx(htmlContent, {
        orientation: 'portrait',
        margins: { top: 720, right: 720, bottom: 720, left: 720 }
      });
      if (!r.success) { alert('Word export failed: ' + (r.error || 'Unknown')); return; }

      const sr = await window.electronAPI.saveDocx(fn + '.docx', r.buffer);
      if (sr && sr.success) this.app.updateStatus('Exported Word to: ' + sr.filePath);
    } catch (e) { console.error('Word export:', e); alert('Word export failed: ' + e.message); }
  }
}
