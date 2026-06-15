const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- Markdown rendering engine (runs in main process, full Node.js access) ----
let marked, katex, hljs, htmlDocx;
try { marked = require('marked'); } catch (e) { console.error('[main] marked load error:', e.message); }
try { katex = require('katex'); } catch (e) { console.error('[main] katex load error:', e.message); }
try { hljs = require('highlight.js'); } catch (e) { console.error('[main] hljs load error:', e.message); }
try { htmlDocx = require('html-docx-js'); } catch (e) { console.error('[main] html-docx-js load error:', e.message); }

if (marked) {
  marked.use({
    gfm: true, breaks: false,
    renderer: {
      image(href, title, text) {
        if (typeof href === 'object' && href !== null) ({ href, title, text } = href);
        const t = title ? ` title="${title.replace(/"/g,'&quot;')}"` : '';
        const a = text ? ` alt="${text.replace(/"/g,'&quot;')}"` : '';
        return `<img src="${href||''}"${a}${t} loading="lazy" />`;
      },
      code(code, infostring) {
        let lang;
        if (typeof code === 'object' && code !== null) ({ text: code, lang } = code);
        else lang = infostring;
        if (lang === 'mermaid') return `<div class="mermaid">${escHtml(code)}</div>`;
        if (lang && hljs && hljs.getLanguage(lang)) {
          try { return `<pre><code class="language-${lang}">${hljs.highlight(code,{language:lang,ignoreIllegals:true}).value}</code></pre>`; }
          catch(e) {}
        }
        return `<pre><code${lang?` class="language-${lang}"`:''}>${escHtml(code)}</code></pre>`;
      },
      link(href, title, text) {
        if (typeof href === 'object' && href !== null) ({ href, title, text } = href);
        return `<a href="${href}"${title?` title="${title.replace(/"/g,'&quot;')}"`:''}>${text}</a>`;
      }
    }
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function resolveImgPath(href, basePath) {
  if (!href) return '';
  // Already loadable: http, data URLs
  if (/^(https?:|data:)\/\//i.test(href)) return href;

  // Resolve to absolute filesystem path
  let absolutePath;
  if (/^[a-zA-Z]:[\\/]/.test(href)) {
    absolutePath = href;
  } else if (basePath) {
    const base = basePath.replace(/\\/g, '/');
    const parts = href.replace(/\\/g, '/').split('/');
    const segs = base.split('/');
    const res = [];
    for (const p of parts) { if (p === '..') segs.pop(); else if (p !== '.') res.push(p); }
    absolutePath = [...segs, ...res].join('\\');
  } else {
    return href;
  }

  // Embed image as base64 data URL (most reliable cross-platform approach)
  try {
    const data = fs.readFileSync(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeMap = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    const mime = mimeMap[ext] || 'image/png';
    const base64 = data.toString('base64');
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.warn('[img] Not found:', absolutePath, '(' + e.message + ')');
    return href; // fallback to original path if file not found
  }
}

function renderMarkdown(text, basePath) {
  if (!text) return '<p><em>Empty document</em></p>';
  if (!marked) throw new Error('marked library not loaded');

  // Resolve images
  let md = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, href) => `![${alt}](${resolveImgPath(href, basePath)})`);

  // Extract math
  const blocks = [], inlines = [];
  md = md.replace(/\$\$([\s\S]*?)\$\$/g, (m, f) => {
    try { blocks.push(katex.renderToString(f.trim(),{displayMode:true,throwOnError:false,trust:true})); }
    catch(e) { blocks.push(`<div class="katex-error">${escHtml(f.trim())}</div>`); }
    return `\n%%MB${blocks.length-1}%%\n`;
  });
  md = md.replace(/(?<!\$)\$(?!\$|\s)([^\n]+?)(?<!\s|\$)\$(?!\$)/g, (m, f) => {
    try { inlines.push(katex.renderToString(f.trim(),{displayMode:false,throwOnError:false,trust:true})); }
    catch(e) { inlines.push(`<span class="katex-error">${escHtml(f.trim())}</span>`); }
    return `%%MI${inlines.length-1}%%`;
  });

  let html = marked.parse(md);

  // Restore math
  blocks.forEach((h,i) => { html = html.replace(`%%MB${i}%%`, h); });
  html = html.replace(/<p>\s*(<span class="katex-display">[\s\S]*?<\/span>)\s*<\/p>/g,'$1');
  html = html.replace(/<p>\s*(<div class="katex-error"[^>]*>[\s\S]*?<\/div>)\s*<\/p>/g,'$1');
  inlines.forEach((h,i) => { html = html.replace(`%%MI${i}%%`, h); });

  return html;
}

let mainWindow = null;
const MAX_RECENT_FILES = 10;

function recentFilePath() {
  return path.join(app.getPath('userData'), 'recent-files.json');
}

function getRecentFiles() {
  try {
    const fp = recentFilePath();
    if (fs.existsSync(fp)) {
      const data = fs.readFileSync(fp, 'utf-8');
      const files = JSON.parse(data);
      return Array.isArray(files) ? files.filter(f => fs.existsSync(f)) : [];
    }
  } catch (e) {
    // ignore
  }
  return [];
}

function saveRecentFiles(files) {
  fs.writeFileSync(recentFilePath(), JSON.stringify(files, null, 2), 'utf-8');
}

function addRecentFile(filePath) {
  const files = getRecentFiles();
  const idx = files.findIndex(f => f.toLowerCase() === filePath.toLowerCase());
  if (idx >= 0) files.splice(idx, 1);
  files.unshift(filePath);
  if (files.length > MAX_RECENT_FILES) files.length = MAX_RECENT_FILES;
  saveRecentFiles(files);
  rebuildRecentFilesMenu();
}

function removeRecentFile(filePath) {
  const files = getRecentFiles().filter(f => f.toLowerCase() !== filePath.toLowerCase());
  saveRecentFiles(files);
  rebuildRecentFilesMenu();
}

function rebuildRecentFilesMenu() {
  const menu = buildMenu();
  Menu.setApplicationMenu(menu);
}

function buildMenu() {
  const recentFiles = getRecentFiles();

  const recentSubmenu = recentFiles.length > 0
    ? [
        ...recentFiles.map((filePath, i) => ({
          label: path.basename(filePath),
          tooltip: filePath,
          click: () => openFile(filePath)
        })),
        { type: 'separator' },
        {
          label: 'Clear Recent Files',
          click: () => {
            saveRecentFiles([]);
            rebuildRecentFilesMenu();
          }
        }
      ]
    : [{ label: 'No Recent Files', enabled: false }];

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-action', 'open-file');
          }
        },
        {
          label: 'Recent Files',
          submenu: recentSubmenu
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Toggle Edit Mode',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-edit')
        },
        { type: 'separator' },
        {
          label: 'Bold',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('menu-action', 'fmt-bold')
        },
        {
          label: 'Underline',
          click: () => mainWindow.webContents.send('menu-action', 'fmt-underline')
        },
        {
          label: 'Inline Formula',
          click: () => mainWindow.webContents.send('menu-action', 'fmt-formula')
        },
        {
          label: 'Wrap Braces { }',
          click: () => mainWindow.webContents.send('menu-action', 'fmt-braces')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-action', 'save-file')
        }
      ]
    },
    {
      label: 'Export',
      submenu: [
        {
          label: 'Export to HTML',
          click: () => mainWindow.webContents.send('menu-action', 'export-html')
        },
        {
          label: 'Export to PDF',
          click: () => mainWindow.webContents.send('menu-action', 'export-pdf')
        },
        {
          label: 'Export to Word',
          click: () => mainWindow.webContents.send('menu-action', 'export-word')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow.webContents.send('menu-action', 'zoom-in')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('menu-action', 'zoom-out')
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.send('menu-action', 'zoom-reset')
        },
        { type: 'separator' },
        {
          label: 'Toggle Theme',
          click: () => mainWindow.webContents.send('menu-action', 'toggle-theme')
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Markdown Reader',
              message: 'Markdown Reader v1.1.0',
              detail: 'A local Markdown reader with HTML/PDF/Word export.\nBuilt with Electron.\n\nDeveloper: bigzenor\nEmail: bigzenor@qq.com'
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  return Menu.buildFromTemplate(template);
}

async function openFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    addRecentFile(filePath);
    mainWindow.webContents.send('file-opened', { filePath, content });
    mainWindow.setTitle(`${path.basename(filePath)} - Markdown Reader`);
    return { success: true, fileName: path.basename(filePath), content, filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Markdown Reader',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
function setupIPC() {
  // Core: markdown rendering (handled in main process to avoid contextBridge serialization)
  ipcMain.handle('render-markdown', async (event, { text, basePath }) => {
    return renderMarkdown(text, basePath);
  });

  ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Markdown File',
      filters: [
        { name: 'Markdown Files', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false };
    }

    const filePath = result.filePaths[0];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      addRecentFile(filePath);
      mainWindow.setTitle(`${path.basename(filePath)} - Markdown Reader`);
      return {
        success: true,
        fileName: path.basename(filePath),
        content,
        filePath
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('save-file', async (event, { filePath, content }) => {
    // If no filePath provided, show save dialog
    let targetPath = filePath;
    if (!targetPath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save File',
        defaultPath: 'export.html',
        filters: [
          { name: 'HTML Files', extensions: ['html', 'htm'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (result.canceled) return { success: false };
      targetPath = result.filePath;
    }

    try {
      fs.writeFileSync(targetPath, content, 'utf-8');
      return { success: true, filePath: targetPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Word export: render HTML to DOCX in main process
  ipcMain.handle('export-docx', async (event, { html, opts }) => {
    if (!htmlDocx) return { success: false, error: 'html-docx-js not loaded' };
    try {
      const blob = htmlDocx.asBlob(html, opts || { orientation: 'portrait', margins: { top: 720, right: 720, bottom: 720, left: 720 } });
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Array.from(new Uint8Array(arrayBuffer));
      return { success: true, buffer };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('export-pdf', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export to PDF',
      defaultPath: 'export.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (result.canceled) return { success: false };

    try {
      const pdfData = await mainWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true
      });
      fs.writeFileSync(result.filePath, pdfData);
      return { success: true, filePath: result.filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      addRecentFile(filePath);
      mainWindow.setTitle(`${path.basename(filePath)} - Markdown Reader`);
      return {
        success: true,
        fileName: path.basename(filePath),
        content,
        filePath
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-recent-files', () => {
    return getRecentFiles();
  });

  ipcMain.handle('add-recent-file', (event, filePath) => {
    addRecentFile(filePath);
  });

  ipcMain.handle('read-local-image', async (event, imagePath) => {
    try {
      const data = fs.readFileSync(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
      };
      const mime = mimeTypes[ext] || 'image/png';
      const base64 = data.toString('base64');
      return `data:${mime};base64,${base64}`;
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('save-docx', async (event, { filePath, buffer }) => {
    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export to Word',
      defaultPath: filePath || 'export.docx',
      filters: [
        { name: 'Word Documents', extensions: ['docx'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { success: false };

    try {
      fs.writeFileSync(result.filePath, Buffer.from(buffer));
      return { success: true, filePath: result.filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Handle file dropped on window
  ipcMain.on('file-dropped', (event, filePath) => {
    openFile(filePath);
  });
}

app.whenReady().then(() => {
  setupIPC();
  const menu = buildMenu();
  Menu.setApplicationMenu(menu);
  createWindow();

  // Handle file open via command line or drag to app icon
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
      openFile(filePath);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle second instance (Windows: open file with app)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Check for file path in command line arguments
      const filePath = commandLine.find(arg => /\.(md|markdown)$/i.test(arg));
      if (filePath) {
        openFile(filePath);
      }
    }
  });
}
