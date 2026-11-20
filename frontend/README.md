# PaperTrace 桌面前端

Windows 应用与浏览器共用 `frontend/src/` 中的 React 界面，数据走[接口契约](../docs/contracts/README.md)。`frontend/` 可独立安装、构建和运行。视觉原型位于 `prototype/`，有独立的源码和构建入口。

## Windows 桌面端构建与打包

仓库提供桌面端源码。`papertrace.exe` 由下面的步骤在本机生成，输出目录 `frontend/src-tauri/target/` 已被 Git 忽略。

### 1. 准备环境并安装依赖

安装 Node.js 24、pnpm 12、Rust stable（MSVC 工具链）、Microsoft C++ Build Tools（选择「使用 C++ 的桌面开发」）和 Microsoft Edge WebView2 Runtime。[Tauri Windows 环境说明](https://v2.tauri.app/start/prerequisites/#windows)

在 Windows PowerShell 中切换到仓库根目录，安装 `frontend/` 的依赖。

```powershell
pnpm --dir frontend install --frozen-lockfile
```

如果默认镜像无法访问，在安装命令末尾加上 `--registry=https://registry.npmjs.org/` 后重试。

### 2. 打包便携版

```powershell
pnpm --dir frontend desktop:build --config src-tauri/tauri.portable.conf.json
```

此命令会先构建前端，再编译 Tauri 桌面程序。仓库当前配置生成可直接运行的 EXE，安装程序打包已关闭。

### 3. 找到并启动 EXE

默认输出为 `frontend/src-tauri/target/release/papertrace.exe`（相对于仓库根目录）。构建成功后，在资源管理器双击该文件，或在仓库根目录运行：

```powershell
.\frontend\src-tauri\target\release\papertrace.exe
```

如设置了 `CARGO_TARGET_DIR`，请在该输出目录的 `release/` 下查找。便携版在 EXE 旁的 `papertrace-data/` 保存工作区数据，因此请从可写目录启动。默认可离线使用内置样例。

如需使用 WebView 默认用户资料目录，运行 `pnpm --dir frontend desktop:build` 生成标准版。两种构建使用相同的默认输出路径。

## 开发模式与浏览器预览

安装依赖后，从仓库根目录运行 `pnpm --dir frontend desktop`，启动带热更新的桌面窗口。

| 入口 | 用途 |
|---|---|
| `pnpm --dir frontend dev` → `http://localhost:5174/?mode=contract` | 浏览器契约样例；同一浏览器、来源和资料目录可读回上次记录 |
| `http://localhost:5174/?speed=4` | 桌面前端内置的脚本回放，刷新重置 |

`pnpm --dir frontend test` 运行客户端契约回归测试，`pnpm --dir frontend build` 校验前端类型与浏览器构建。

## 走查样例

1. Home 点 **Try the demo**，在 Discover 确认检索范围，将 PubMedQA 加入主题。Read & ask 选择版本、提问、点出处，在原文旁保存笔记。侧栏可回到最近会话。
2. Library 选择同一主题，点 **Import papers** 导入两份演示材料；重复导入进入人工复核。选择论文可查看文件版本、标签和主题归属。移入回收站前可查看影响，恢复后重新可读。
3. 主题的 Compare 页选择两篇论文并确认维度，查看每格的依据或缺口，可修订后保存为笔记。Evidence wiki 选择来源笔记并生成草稿，在差异预览中选定变更后采纳。
4. Citation check 打开样例稿件或粘贴 Markdown，选择句子和目标材料后运行独立回查。审阅意见与改稿分别保存。预览措辞和引用，生成新稿版本，再运行回查。稿件、报告、比较 CSV、笔记、书目和证据可从此页导出。
5. Models & services 可保存服务配置、测试连接、设置预算、审查只读授权及校验备份。Home 的研究更新可打开相关记录和可恢复任务。

样例使用固定论文片段和模拟任务。样例导入展示预设文件，原 PDF、真实模型推理、外部检索、系统凭据和 Word/LaTeX 文件处理由接入的宿主提供。

## 真实宿主接入

构建或启动前设置 `$env:VITE_PAPERTRACE_TRANSPORT='rpc'`。桌面启动后通过 `protocol.version` 检查版本；`papertrace_rpc({request})` 接收 JSON-RPC 请求并返回同 ID 的响应，`papertrace_subscribe({request,channel})` 确认订阅后通过独立 Tauri Channel 转发 `task.event.params`。文件通过宿主交付的句柄传递。局部结果、错误、游标补收、任务取消及用户确认使用同一套前端控制器。[桌面适配器](src/api/desktop.ts) · [任务控制器](src/data/useTask.ts) · [页面与方法索引](../docs/contracts/README.md)
