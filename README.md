# 视频批量处理工具

Windows 本地短视频批量处理工具 MVP，支持批量重命名、统一音频替换、随机音频素材库替换。

## 技术栈

- Tauri 2
- React
- TypeScript
- Rust
- FFmpeg

## 本机依赖

需要先安装：

- Node.js LTS
- Rust stable
- FFmpeg，并把 `ffmpeg.exe` 加入系统 `PATH`

当前机器的 PATH 中没有可用的 `npm`、`cargo` 和 `ffmpeg`，所以暂时无法直接运行构建。

## 开发命令

```powershell
npm install
npm run tauri:dev
```

## 打包

```powershell
npm run tauri:build
```

## MVP 功能

- 选择视频文件夹
- 选择音频文件或音频文件夹
- 选择导出文件夹
- 自定义模板重命名预览
- 统一音频替换
- 随机素材库配音
- 音频过短循环或补静音
- 成功/失败数量和日志

## 命名变量

```text
{country}
{product}
{date}
{index}
{origin}
```
