# PaperTrace 桌面前端

Windows 应用与浏览器共用 React、TypeScript 和原型的布局、证据弹层及页面样式。正式前端位于 `frontend/`，数据走[接口契约](../docs/contracts/README.md)。独立视觉原型保留在 `prototype/`。

## 运行与打包

使用 Node 24 与 pnpm 12。Windows 桌面构建还需 Rust、Microsoft C++ Build Tools 和 WebView2。[Tauri Windows 环境说明](https://v2.tauri.app/start/prerequisites/#windows)

```powershell
pnpm --dir prototype install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend desktop
```

`pnpm --dir frontend desktop:build` 生成 `frontend/src-tauri/target/release/papertrace.exe`。便携构建使用 `pnpm --dir frontend desktop:build --config src-tauri/tauri.portable.conf.json`，在可写目录启动生成的 exe 即可离线使用内置样例。此配置在应用旁保存 WebView 数据。本次桌面走查使用便携构建；当前环境启动标准构建时，Windows 在创建应用窗口前返回访问被拒绝。

| 入口 | 用途 |
|---|---|
| Windows 应用默认入口 | 桌面契约样例；数据保存在当前 WebView 用户资料目录 |
| `pnpm --dir frontend dev` → `http://localhost:5174/?mode=contract` | 浏览器契约样例；同一浏览器、来源和资料目录可读回上次记录 |
| `http://localhost:5174/?speed=4` | 独立脚本回放，刷新重置；也可用 `pnpm --dir prototype dev` 启动 |

`pnpm --dir frontend test` 运行客户端契约回归测试，`pnpm --dir frontend build` 与 `pnpm --dir prototype build` 分别校验两个入口。

## 走查样例

1. Home 点 **Try the demo**，在 Discover 确认检索范围，将 PubMedQA 加入主题。Read & ask 选择版本、提问、点出处，在原文旁保存笔记。侧栏可回到最近会话。
2. Library 选择同一主题，点 **Import papers** 导入两份演示材料；重复导入进入人工复核。选择论文可查看文件版本、标签和主题归属。移入回收站前可查看影响，恢复后重新可读。
3. 主题的 Compare 页选择两篇论文并确认维度，查看每格的依据或缺口，可修订后保存为笔记。Evidence wiki 选择来源笔记并生成草稿，在差异预览中选定变更后采纳。
4. Citation check 打开样例稿件或粘贴 Markdown，选择句子和目标材料后运行独立回查。审阅意见与改稿分别保存。预览措辞和引用，生成新稿版本，再运行回查。稿件、报告、比较 CSV、笔记、书目和证据可从此页导出。
5. Models & services 可保存服务配置、测试连接、设置预算、审查只读授权及校验备份。Home 的研究更新可打开相关记录和可恢复任务。

样例使用固定论文片段和模拟任务。样例导入展示预设文件，原 PDF、真实模型推理、外部检索、系统凭据和 Word/LaTeX 文件处理由接入的宿主提供。

## 真实宿主接入

构建或启动前设置 `$env:VITE_PAPERTRACE_TRANSPORT='rpc'`。桌面启动后通过 `protocol.version` 检查版本；`papertrace_rpc({request})` 接收 JSON-RPC 请求并返回同 ID 的响应，`papertrace_subscribe({request,channel})` 确认订阅后通过独立 Tauri Channel 转发 `task.event.params`。文件通过宿主交付的句柄传递。局部结果、错误、游标补收、任务取消及用户确认使用同一套前端控制器。[桌面适配器](src/api/desktop.ts) · [任务控制器](src/data/useTask.ts) · [页面与方法索引](../docs/contracts/README.md)
