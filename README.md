# Markdown Reader

A local Markdown reader for Windows, built with Electron.

## Features

- **GFM Markdown Rendering** — Full GitHub Flavored Markdown support
- **KaTeX Math** — Inline `$E=mc^2$` and display `$$\sum x$$` formulas
- **Mermaid Diagrams** — Flowcharts, sequence diagrams, Gantt charts
- **Multi-Tab** — Open multiple `.md` files simultaneously
- **Local Images** — Relative-path images auto-embedded as base64
- **Export** — HTML / PDF / Word (.docx)
- **Dark Theme** — Toggle light/dark mode
- **Zoom** — Ctrl+scroll / toolbar buttons

## Install

Download the latest `Markdown Reader Setup x.x.x.exe` from [Releases](https://github.com/sh55666780/md_local_reader/releases).

## Development

```bash
git clone https://github.com/sh55666780/md_local_reader.git
cd md-local-reader
npm install
npm start
```

## Build

```bash
npm run build
# Output: dist/Markdown Reader Setup x.x.x.exe
```

## Tech Stack

| Component | Library |
|-----------|---------|
| Framework | Electron 28 |
| Markdown | marked.js 12 |
| Math | KaTeX |
| Code Highlight | highlight.js |
| Diagrams | Mermaid 10 |
| Word Export | html-docx-js |

## Author

Developer: **bigzenor**  
Email: bigzenor@qq.com

## License

MIT
