<div align="center">
  <h1>🎬 Videobox</h1>
  <p>全平台视频下载 + 智能语音识别字幕工具</p>
</div>

Videobox 是一款集**视频下载**与**语音识别字幕生成**于一体的桌面工具。基于两个优秀的开源项目融合开发：

- [**Videdown**](https://github.com/cshuangyy/videdown) — 提供视频下载核心能力（yt-dlp 引擎、多平台解析）
- [**AsrTools**](https://github.com/WEIFENG2333/AsrTools) — 提供语音识别核心能力（Bcut / JianYing / KuaiShou ASR 引擎）

基于 Electron + Vue 3 构建，黑金配色界面，支持全球 1000+ 网站视频下载及自动字幕生成。

<p>
  <a href="https://github.com/xingxuanyu18-web/Videobox/releases"><img src="https://img.shields.io/github/downloads/xingxuanyu18-web/Videobox/total?color=369eff&labelColor=black&logo=github&label=Downloads" /></a>
  <a href="https://github.com/xingxuanyu18-web/Videobox/releases/latest"><img src="https://img.shields.io/github/v/release/xingxuanyu18-web/Videobox?color=369eff&labelColor=black&logo=github&label=Latest%20Release" /></a>
  <br /><br />
</p>

## 👋🏻 开始使用

[📥 下载 Videobox](https://github.com/xingxuanyu18-web/Videobox/releases)

## ✨ 功能特性

### 🌍 全球视频下载支持

通过强大的 yt-dlp 引擎，支持 1000+ 个网站，包括 YouTube、抖音、B站、小红书、Instagram 等。

### 🎙️ 智能语音识别

内置 Bcut（必剪）、JianYing（剪映）、KuaiShou（快手）三大 ASR 引擎，将音视频自动转为 SRT/ASS/TXT 字幕文件。

### 🎨 一流的界面体验

黑金配色，现代化简洁界面。实时进度追踪，下载队列管理，一键暂停/恢复/重试。

### 🍪 Cookie 支持

支持导入浏览器 Cookie，下载需要登录的视频内容。

### 🎵 多格式选择

支持选择不同视频质量和格式，多音轨选择，字幕下载。

## 🌐 支持的网站

- **国内平台**：抖音、B站、小红书、快手、西瓜视频
- **国际平台**：YouTube、Instagram、TikTok、Twitter/X、Facebook
- **其他**：支持几乎所有 yt-dlp 支持的网站

完整支持列表：[yt-dlp 支持网站](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

## 🚀 安装使用

### 下载安装

1. 访问 [Releases](https://github.com/xingxuanyu18-web/Videobox/releases) 页面
2. 下载最新版本安装程序 `Videobox.Setup.x.x.x.exe`
3. 运行安装程序，按提示完成安装

### 从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/xingxuanyu18-web/Videobox.git
cd Videobox

# 2. 下载依赖工具（yt-dlp + ffmpeg）
# Windows PowerShell:
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile "yt-dlp.exe"
Invoke-WebRequest -Uri "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" -OutFile "ffmpeg.zip"
Expand-Archive -Path "ffmpeg.zip" -DestinationPath "."
Copy-Item -Path "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe" -Destination "ffmpeg.exe"

# macOS (Homebrew):
brew install yt-dlp ffmpeg

# 3. 安装依赖
npm install

# 4. 开发 / 构建
npm run dev
npm run build
```

## 🛠️ 技术栈

- **Electron** — 跨平台桌面应用框架
- **Vue 3** — 渐进式 JavaScript 框架
- **TypeScript** — 类型安全的 JavaScript 超集
- **Tailwind CSS** — 实用优先的 CSS 框架
- **YT-DLP** — 视频下载引擎
- **FFmpeg** — 音视频处理
- **Puppeteer** — 部分平台爬虫解析

## 📄 开源协议

本项目基于 [MIT](LICENSE) 协议开源。

```
MIT License

Copyright (c) 2026 Videobox
```

## 🙏 致谢

### 基础项目

Videobox 基于以下两个优秀的开源项目融合开发：

| 项目 | 作者 | 贡献 |
|------|------|------|
| [Videdown](https://github.com/cshuangyy/videdown) | [@cshuangyy](https://github.com/cshuangyy) | 视频下载核心、Electron 框架、UI 布局 |
| [AsrTools](https://github.com/WEIFENG2333/AsrTools) | [@WEIFENG2333](https://github.com/WEIFENG2333) | ASR 语音识别引擎、字幕导出 |

### 依赖工具

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — 视频下载引擎
- [FFmpeg](https://ffmpeg.org/) — 音视频处理
- [Electron](https://www.electronjs.org/) — 桌面应用框架
- [Vue.js](https://vuejs.org/) — 前端框架
- [Vite](https://vitejs.dev/) — 构建工具
- [Tailwind CSS](https://tailwindcss.com/) — CSS 框架

---

Made with ❤️ based on [Videdown](https://github.com/cshuangyy/videdown) & [AsrTools](https://github.com/WEIFENG2333/AsrTools)
