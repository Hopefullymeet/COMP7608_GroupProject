# PaperTrace 前端接入

桌面端与浏览器直接共用 `prototype/src` 中的 React 页面、布局、样式和动画。Discover、Read & Ask、Agent trace 和证据弹层都使用原型组件。前端接入代码集中在 `frontend/src`。

## 运行

```powershell
pnpm --dir prototype install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend desktop
```

Windows 上需先装 Rust、Microsoft C++ Build Tools 和 WebView2。[Tauri Windows 环境说明](https://v2.tauri.app/start/prerequisites/#windows)

`desktop` 启动 Vite 并打开 PaperTrace 独立窗口。`pnpm --dir frontend desktop:build` 将前端资源打入可执行文件，适合断开开发服务器后演示。`pnpm --dir frontend dev` 用于浏览器预览。

便携预览可在构建命令后加 `--config src-tauri/tauri.portable.conf.json`，演示数据会写入可执行文件旁的 `papertrace-data`。

| 入口 | 数据来源 |
|---|---|
| `http://localhost:5174/` | 原型的原版回放，包含 Compare 和侧栏工作区页面。加 `?speed=4` 可加速。 |
| `http://localhost:5174/?mode=contract` | 使用原型界面配合 v0.4 契约样例，浏览器本地保存主题、检索和会话。 |
| PaperTrace 桌面窗口 | 默认使用 PubMedQA 契约样例，在 WebView 内保存演示会话。 |

契约模式从 **Try the demo** 开始，选择 **Find papers** 并确认数据去向，将 PubMedQA **Add to topic**。进入 **Read & ask**，在右侧选择材料版本，使用建议问题并确认。点击回答的出处，右栏显示版本 `v1`，高亮 `v1-p2` 并打开原型的证据弹层。刷新后从侧栏展开主题和会话，可以读回回答和原出处。

## 宿主接入

- [MainlineProvider](src/data/MainlineProvider.tsx) 将主题、会话、候选、材料版本、任务步骤和回答转换为原型 Store 的界面数据。阅读问答使用右栏所选的可读版本，出处按回答 ID 和锚点 ID 查询历史版本。Compare、工作区管理和证据采纳目前由原型回放演示。
- [任务订阅](src/data/useTask.ts) 统一处理授权、幂等重发、流式预览、游标补收及取消。首版契约的 `discovery.latest` 返回最新检索 ID 和在途任务 ID。前端在收到终态时缓存检索 ID 与任务 ID 的对应关系，用于在同一客户端读回 Agent 步骤。跨客户端读取已完成检索的步骤仍需和宿主确认。
- 真实宿主提供命令后，在启动或构建前设置 `VITE_PAPERTRACE_TRANSPORT=rpc` 来启用[桌面适配器](src/api/desktop.ts)。适配器连接时检查协议版本。当前约定 `papertrace_rpc({ request })` 接收完整 JSON-RPC 请求，`papertrace_subscribe({ request, channel })` 通过独立 Channel 转发 `task.event` 的 `params`。两个命令都返回带对应请求 ID 的 JSON-RPC 响应。
- 字段与行为见 [发现 → 阅读 → 定位契约](../docs/contracts/discover-read-locate.md) 和 [共用协议](../docs/contracts/protocol.md)。
