/**
 * MDToHTMLRenderer - Thin wrapper, all rendering done in main process via IPC
 * IPC invoke() returns Promise, so all render methods are async
 */
class MDToHTMLRenderer {
  constructor(basePath) {
    this.basePath = basePath || '';
  }

  setBasePath(basePath) {
    this.basePath = basePath || '';
  }

  async render(markdownText) {
    if (!markdownText) return '<p><em>Empty document</em></p>';
    return await window.electronAPI.renderMarkdown(markdownText, this.basePath);
  }

  async renderFullPage(markdownText, title) {
    const bodyHtml = await this.render(markdownText);
    const safeTitle = (title || 'Markdown Document')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #24292e; background: #fff; max-width: 900px; margin: 0 auto; padding: 32px 48px; }
    h1 { font-size: 2em; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3em; }
    pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 16px; overflow-x: auto; }
    code { background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-family: Consolas, monospace; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #e1e4e8; padding: 6px 13px; } th { background: #f6f8fa; }
    blockquote { border-left: 0.25em solid #dfe2e5; padding: 0 1em; color: #6a737d; }
    img { max-width: 100%; width: 50%; height: auto; display: block; margin: 16px auto; }
    .katex-display { margin: 1em 0; overflow-x: auto; }
    .mermaid { text-align: center; margin: 16px 0; }
    .mermaid svg { max-width: 100%; }
    @media print { body { padding: 0; } img { display: block; width: 50%; height: auto; page-break-inside: avoid; } }
  </style>
</head>
<body class="markdown-body">${bodyHtml}</body>
</html>`;
  }
}
