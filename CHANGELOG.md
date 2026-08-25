# 更新日志

## 1.2.0 (2026-08-25)

### 新功能

- 引入跨平台更新机制：Windows 应用内安装，macOS 检查后跳转 GitHub Release 手动安装
- 新增界面路由导航，提升多页面切换体验

### 改进

- 重构应用核心架构，优化组件结构，提升运行稳定性
- 集成代码格式化工具，统一代码风格，减少潜在错误

### 其他

- 完成 Electron 桌面运行环境搭建，正式发布首个版本

## 1.1.0 (2026-08-25)

### 新功能

- 添加一键发布脚本支持自动化版本管理和AI生成更新说明（build）

### 重构

- 重构应用架构并优化组件结构（app）

### 文档

- 更新文档和依赖配置以支持GitHub Releases自动更新（architecture）

### 样式

- 集成 Prettier 代码格式化工具（formatter）

### 其他

- Add auto-update pipeline, routing UI, and release configuration.
- Initial commit: Electron desktop runtime for Trading Diary.
