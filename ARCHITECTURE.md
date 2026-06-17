# Markdown Reader - 架构设计文档

## 1. 项目概述

**Markdown Reader** 是一个基于 Electron 的 Windows 桌面 Markdown 阅读器，支持完整的 Markdown 渲染（含扩展格式）、本地/网络图片加载，以及 HTML/PDF/Word 格式导出。

## 2. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | ^28.0.0 | 桌面应用框架 |
| marked | ^12.0.0 | Markdown 解析（GFM 模式） |
| highlight.js | ^11.9.0 | 代码语法高亮 |
| KaTeX | ^0.16.9 | 数学公式渲染（LaTeX） |
| Mermaid | ^10.9.0 | 流程图/时序图渲染 |
| html-docx-js | ^0.3.1 | Word (.docx) 导出 |
| electron-builder | ^24.9.1 | 打包为 Windows EXE |

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                   Electron Main Process                  │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────────┐  │
│  │ 窗口管理器 │  │  菜单系统  │  │   IPC 通信处理器     │  │
│  │ (Browser  │  │ (File/    │  │  - open-file        │  │
│  │  Window)  │  │  Export/  │  │  - read-file        │  │
│  │           │  │  View/    │  │  - save-file        │  │
│  │           │  │  Help)    │  │  - export-pdf       │  │
│  │           │  │           │  │  - read-local-image │  │
│  │           │  │           │  │  - get-recent-files │  │
│  └───────────┘  └───────────┘  └─────────────────────┘  │
│                           │                              │
│                ┌──────────┴──────────┐                   │
│                │   Preload (IPC桥)    │                   │
│                │ contextBridge 暴露   │                   │
│                │ electronAPI + 库    │                   │
│                └──────────┬──────────┘                   │
├───────────────────────────┼─────────────────────────────┤
│              Renderer Process (Chromium)                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                    index.html                        │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │ │
│  │  │  Toolbar   │  │  Split Pane  │  │  StatusBar  │  │ │
│  │  │  (按钮行)  │  │  ┌────┬────┐│  │  (信息栏)   │  │ │
│  │  │            │  │  │TOC │ 内容││  │             │  │ │
│  │  └────────────┘  │  └────┴────┘│  └─────────────┘  │ │
│  │                   └──────────────┘                   │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐  │
│  │renderer  │ │ app.js   │ │ exporter.js              │  │
│  │.js       │ │ (主控器) │ │ (HTML/PDF/Word 导出)     │  │
│  │(MD→HTML) │ │          │ │                          │  │
│  └──────────┘ └──────────┘ └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 4. 数据流

```
用户打开 .md 文件
       │
       ▼
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│ main.js     │────▶│ preload.js   │────▶│ app.js         │
│ (文件读取)   │ IPC │ (暴露API)    │ IPC │ (接收文件内容)  │
└─────────────┘     └──────────────┘     └────────────────┘
                                                 │
                                                 ▼
                                        ┌───────────────┐
                                        │ renderer.js   │
                                        │ (MD → HTML)   │
                                        │ ├─ marked     │
                                        │ ├─ KaTeX      │
                                        │ ├─ Mermaid    │
                                        │ └─ hljs       │
                                        └───────────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                               ┌────────┐  ┌────────┐  ┌──────────┐
                               │ HTML   │  │ PDF    │  │ Word     │
                               │ 导出   │  │ 导出   │  │ 导出     │
                               └────────┘  └────────┘  └──────────┘
```

## 5. 文件结构

```
md_local_reader/
├── package.json              # 项目配置 + 依赖
├── main.js                   # Electron 主进程
├── preload.js                # IPC 通信桥
├── test-sample.md            # 功能测试文档
├── src/
│   └── renderer/
│       ├── index.html        # 主窗口页面
│       ├── styles/
│       │   └── main.css      # 全局样式（含亮/暗主题）
│       └── js/
│           ├── app.js        # 主控制器
│           ├── renderer.js   # MD解析 + HTML渲染引擎
│           └── exporter.js   # 导出模块
└── assets/
    └── icon.ico              # 应用图标
```

## 6. 核心模块设计

### 6.1 MDToHTMLRenderer (renderer.js)

**职责**: 将 Markdown 文本渲染为 HTML

**处理流程**:
1. 提取并渲染 KaTeX 数学公式（$inline$, $$block$$）
2. 用 marked 解析标准 Markdown（GFM 模式）
3. 还原数学公式到 HTML
4. Mermaid 图表在 DOM 插入后异步渲染

**图片路径解析**:
- 网络 URL → 直接使用
- 绝对路径（C:\...） → 转为 `file:///C:/...`
- 相对路径 → 基于 MD 文件所在目录解析为 `file:///` URL

### 6.2 App (app.js)

**职责**: 应用程序主控制器

**功能**:
- 文件加载流程编排
- TOC 大纲自动生成（从 h1-h3 提取）
- 亮色/暗色主题切换（CSS 变量驱动）
- 字体缩放（Ctrl+滚轮）
- 拖拽文件支持
- 最近文件管理（最多 10 个）
- 状态栏更新

### 6.3 Exporter (exporter.js)

**职责**: 导出功能

| 格式 | 实现方式 |
|------|----------|
| HTML | 构建完整独立 HTML 页面 → 保存为 .html |
| PDF | Electron printToPDF() → 保存为 .pdf |
| Word | html-docx-js 转换 HTML → Blob → .docx |

## 7. 主题系统

使用 CSS 自定义属性（变量）实现双主题：

- **亮色主题** (默认): GitHub 风格，白底黑字
- **暗色主题**: VS Code Dark 风格，深色背景

切换方式: `body` 添加/移除 `dark-theme` 类，所有颜色通过 CSS 变量自动切换。

## 8. 导出样式处理

- **PDF**: 通过 `@media print` 隐藏工具栏/侧边栏，仅保留内容
- **HTML**: 生成独立页面，内联所有 CSS 样式
- **Word**: 构建简化 HTML（Word 兼容样式），通过 html-docx-js 转换

## 9. 安全性

- `contextIsolation: true` — 渲染进程与主进程隔离
- `nodeIntegration: false` — 渲染进程无 Node.js 权限
- `contextBridge` — 仅暴露安全的 API 接口
- CSP 策略 — 限制资源加载来源
