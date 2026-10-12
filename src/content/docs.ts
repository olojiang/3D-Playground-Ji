/**
 * In-app documentation, bilingual. Rendered with the same markdown subset as lessons (src/core/markdown.ts).
 * A page with `widget` gets a live component appended (e.g. the shortcut table generated from the registry).
 */
export interface DocPage { slug: string; icon: "rocket" | "map" | "flask" | "keyboard" | "palette" | "shield" | "layers" | "pen" | "help"; widget?: "shortcuts" | "themes"; title: { zh: string; en: string }; body: { zh: string; en: string } }

export const DOCS: DocPage[] = [
  {
    slug: "getting-started", icon: "rocket",
    title: { zh: "快速开始", en: "Getting started" },
    body: {
      zh: `## 这是什么

3D Playground 是一个在浏览器里学习实时图形学的交互式实验室，分三条路径：

- **Three.js 核心**：场景、相机、材质、灯光、动画、后期处理。
- **WebGL 与着色器**：从一个三角形理解 GPU 渲染管线，亲手写 GLSL。
- **GPU 与 WebGPU 计算**：并行思维、WebGPU 渲染与计算管线、GPGPU 与性能。

每一节都包含三部分：**概念**文章、可编辑的**代码**、以及右侧实时运行的**效果**。

## 三步上手

1. 从首页或左侧导航进入一条学习路径，点开任意示例。
2. 先读“概念”，再切到“代码”标签修改参数，按 \`⌘/Ctrl + Enter\` 重新运行（默认停止输入 1 秒后会自动运行）。
3. 读完后按 \`C\` 标记完成，按 \`J\` 进入下一节。

## 访客与账号

不登录也能使用全部功能，数据保存在当前浏览器。注册登录后，进度、收藏、代码片段和设置会保存到云端，跨设备同步；首次登录时会自动把本机的访客数据合并进账号。

> 按 \`?\` 随时查看全部快捷键，按 \`⌘/Ctrl + K\` 打开命令面板搜索一切。`,
      en: `## What this is

3D Playground is an interactive lab for learning real-time graphics in the browser, organised into three tracks:

- **Three.js Essentials**: scenes, cameras, materials, lights, animation, post-processing.
- **WebGL & Shaders**: understand the GPU pipeline starting from one triangle, and write GLSL by hand.
- **GPU & WebGPU Compute**: thinking in parallel, WebGPU render and compute pipelines, GPGPU and performance.

Every lesson has three parts: a **Concepts** article, editable **Code**, and a live **preview** on the right.

## Three steps

1. Pick a track from Home or the sidebar and open any example.
2. Read Concepts, switch to the Code tab, tweak something, then press \`⌘/Ctrl + Enter\` to re-run (by default it also re-runs one second after you stop typing).
3. Press \`C\` to mark it done and \`J\` for the next lesson.

## Guest or account

Everything works without an account; data stays in this browser. Sign up and your progress, favorites, snippets and settings are stored in the cloud and follow you across devices. The first time you sign in, this browser's guest data is merged into your account automatically.

> Press \`?\` any time to see all shortcuts, and \`⌘/Ctrl + K\` to search everything.`,
    },
  },
  {
    slug: "tracks", icon: "map",
    title: { zh: "学习路径与建议顺序", en: "Tracks and suggested order" },
    body: {
      zh: `## 推荐顺序

如果你是第一次接触 3D 编程，建议按 **Three.js → WebGL 与着色器 → GPU** 的顺序：先用高层库建立直觉，再下潜到 GPU 管线和着色器，最后学习通用计算与性能。

## 每节课的结构

- **难度**：入门 / 进阶 / 高级。
- **运行要求**：WebGL、WebGL 2 或 WebGPU。WebGPU 示例在不支持的浏览器上会显示提示，而不会报错崩溃。
- **核心 API**：本节涉及的关键类和函数，方便你查阅官方文档。
- **动手试试**：2–4 个小练习，建议真的去改代码。

## 进度

在示例页按 \`C\` 或点击“标记为完成”。“我的实验室”会按路径显示完成度，首页的“继续”按钮会带你回到最近一次没学完的课。`,
      en: `## Suggested order

New to 3D programming? Go **Three.js → WebGL & Shaders → GPU**: build intuition with a high-level library first, then dive into the GPU pipeline and shaders, and finish with general-purpose compute and performance.

## Anatomy of a lesson

- **Difficulty**: beginner, intermediate or advanced.
- **Requires**: WebGL, WebGL 2 or WebGPU. WebGPU lessons show a friendly notice on browsers without support instead of crashing.
- **Key APIs**: the classes and functions the lesson uses, handy for looking up the official docs.
- **Try this**: two to four small exercises. Actually change the code.

## Progress

Press \`C\` on a lesson or click "Mark as done". My Lab shows completion per track, and the Resume button on Home takes you back to the most recent unfinished lesson.`,
    },
  },
  {
    slug: "playground", icon: "flask",
    title: { zh: "自由实验与运行时 API", en: "Playground and runtime API" },
    body: {
      zh: `## 自由实验

“自由实验”页提供三个模板：Three.js 场景、WebGL 2 全屏着色器、WebGPU 三角形。写好后按 \`⌘/Ctrl + S\` 保存为代码片段，之后可以在“我的实验室”里打开、重命名或删除。示例页里的修改同样可以保存为片段；未保存的修改会作为草稿保留在本机。

## 沙箱

代码运行在一个隔离的 iframe 沙箱中（无法访问本站的登录状态和数据），以 ES 模块执行，支持顶层 \`await\`。每次运行都会创建全新的页面，所以不需要手动清理。

## 可用的导入

\`\`\`js
import * as THREE from "three";
import * as WEBGPU from "three/webgpu";
import { color, time } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";
\`\`\`

three.js 从本站本地提供（无需外网），版本与示例一致。

## PG 全局对象

- \`PG.canvas\`：已铺满预览区的 \`<canvas>\`，直接用它创建 WebGL / WebGPU 上下文。
- \`PG.status(text)\`：在画面左下角显示一行文字，适合输出计时、结果或提示。
- \`console.log / warn / error\`：输出到“控制台”标签，错误会在标签上显示红色计数。

## 暂停与帧率

工具栏的暂停按钮（快捷键 \`P\`）会冻结所有 \`requestAnimationFrame\` 回调；右上角状态胶囊显示实时帧率。`,
      en: `## The playground

The Playground offers three templates: a Three.js scene, a WebGL 2 fullscreen shader and a WebGPU triangle. Press \`⌘/Ctrl + S\` to save your work as a snippet; open, rename or delete snippets in My Lab. Edits on lesson pages can be saved as snippets too, and unsaved edits are kept as a local draft.

## The sandbox

Code runs in an isolated iframe sandbox (it cannot see this site's session or data) as an ES module, so top-level \`await\` works. Every run starts a fresh page, so there is nothing to clean up.

## Available imports

\`\`\`js
import * as THREE from "three";
import * as WEBGPU from "three/webgpu";
import { color, time } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";
\`\`\`

three.js is served locally by this site (no CDN needed), at the same version the lessons use.

## The PG global

- \`PG.canvas\`: a \`<canvas>\` that fills the preview. Create your WebGL or WebGPU context on it.
- \`PG.status(text)\`: shows one line of text at the bottom-left of the preview, for timings, results or notices.
- \`console.log / warn / error\`: printed in the Console tab; errors show a red count on the tab.

## Pause and FPS

The pause button (shortcut \`P\`) freezes every \`requestAnimationFrame\` callback; the status pill shows the live frame rate.`,
    },
  },
  {
    slug: "shortcuts", icon: "keyboard", widget: "shortcuts",
    title: { zh: "键盘快捷键", en: "Keyboard shortcuts" },
    body: {
      zh: `## 设计原则

- **单键**用于浏览（\`J\` / \`K\` 切换课程、\`F\` 收藏、\`T\` 切主题），在输入框和编辑器里不会触发。
- **组合键**（\`⌘\` / \`Ctrl\`）在编辑器里也可用，例如 \`⌘/Ctrl + Enter\` 运行、\`⌘/Ctrl + S\` 保存。
- **序列键**：先按 \`G\`，再按一个字母跳转页面，例如 \`G\` 然后 \`T\` 去 Three.js。
- macOS 上显示 \`⌘\`，Windows / Linux 上显示 \`Ctrl\`。

## 自定义

在“设置 → 快捷键”里点击任意一项，按下新的组合键即可修改；按 \`Esc\` 取消，按退格键恢复默认。冲突会被标出。自定义会随账号同步。

## 全部快捷键`,
      en: `## Principles

- **Single keys** are for browsing (\`J\` / \`K\` between lessons, \`F\` to favorite, \`T\` for theme) and never fire while you type in an input or the editor.
- **Chords** with \`⌘\` / \`Ctrl\` also work inside the editor, e.g. \`⌘/Ctrl + Enter\` to run and \`⌘/Ctrl + S\` to save.
- **Sequences**: press \`G\`, then a letter to jump to a page, e.g. \`G\` then \`T\` for Three.js.
- macOS shows \`⌘\`; Windows and Linux show \`Ctrl\`.

## Customising

In Settings → Keyboard shortcuts, click any entry and press the new keys. \`Esc\` cancels, Backspace restores the default, and conflicts are flagged. Custom bindings sync with your account.

## All shortcuts`,
    },
  },
  {
    slug: "themes", icon: "palette", widget: "themes",
    title: { zh: "主题与个性化", en: "Themes and personalisation" },
    body: {
      zh: `## 九套主题

明亮、暗夜、护眼、黑红、黑金、星紫、深海、樱花、石墨，另有“跟随系统”。黑红与黑金主题使用衬线标题字体，营造更隆重的质感。每套主题都经过对比度测试：正文对比度不低于 12:1，次要文字不低于 4.5:1，代码高亮在各主题下都清晰可读。

## 切换方式

- 左下角调色板按钮，或“设置 → 外观”。
- 快捷键 \`T\` 依次切换。
- 命令面板输入主题名。

## 其他个性化

- **语言**：中文 / English，按 \`L\` 切换，所有界面文字和课程内容同步切换。
- **动效**：跟随系统 / 完整 / 减弱。选择“减弱”会关闭大部分过渡动画。
- **编辑器**：字号（\`⌘/Ctrl + =\` / \`-\`）、左右分栏或上下堆叠（\`⌘/Ctrl + \\\`）、是否自动运行。`,
      en: `## Nine themes

Light, Dark, Eye care, Black & Red, Black Gold, Nebula Purple, Deep Ocean, Sakura and Graphite, plus "Match system". Black & Red and Black Gold use a serif display face for a more ceremonial feel. Every theme is contrast-tested: body text at least 12:1, secondary text at least 4.5:1, and syntax colours readable in every theme.

## Switching

- The palette button at the bottom-left, or Settings → Appearance.
- Press \`T\` to cycle.
- Type a theme name in the command palette.

## More personalisation

- **Language**: Chinese or English; press \`L\` to switch. All UI text and lesson content switch together.
- **Motion**: system, full or reduced. Reduced turns off most transitions.
- **Editor**: font size (\`⌘/Ctrl + =\` / \`-\`), side-by-side or stacked layout (\`⌘/Ctrl + \\\`), and auto-run.`,
    },
  },
  {
    slug: "account", icon: "shield",
    title: { zh: "账号、隐私与数据", en: "Account, privacy and data" },
    body: {
      zh: `## 用户隔离

每个账号的设置、进度、收藏和代码片段都只属于该账号。服务端的每一次读写都按当前登录用户过滤，其他用户无法读取、修改或删除你的数据；这一点由自动化测试持续验证。

## 安全

- 密码使用 bcrypt 加盐哈希存储，服务器不保存明文。
- 登录状态保存在 HttpOnly、SameSite 的 Cookie 中，网页脚本无法读取。
- 连续输错密码会被临时锁定 5 分钟。
- 你运行的代码在隔离沙箱中执行，无法访问你的登录状态。

## 导出与导入

“设置 → 数据”可以导出一个 JSON 备份（设置、进度、收藏、全部片段），也可以把备份导入到任意账号；导入只会合并，不会删除已有数据。

## 删除账号

“设置 → 危险操作”中输入密码即可永久删除账号及其全部数据。`,
      en: `## User isolation

Each account's settings, progress, favorites and snippets belong to that account alone. Every server read and write is filtered by the signed-in user, so no other user can read, change or delete your data, and automated tests check this continuously.

## Security

- Passwords are stored as salted bcrypt hashes; the server never keeps plain text.
- Your session lives in an HttpOnly, SameSite cookie that page scripts cannot read.
- Repeated wrong passwords lock the email for 5 minutes.
- Code you run executes in an isolated sandbox with no access to your session.

## Export and import

Settings → Data exports a JSON backup (settings, progress, favorites, all snippets) and imports one into any account. Import only merges; it never deletes.

## Deleting your account

In Settings → Danger zone, enter your password to permanently delete the account and all its data.`,
    },
  },
  {
    slug: "architecture", icon: "layers",
    title: { zh: "架构与开发", en: "Architecture and development" },
    body: {
      zh: `## 技术栈

- **Next.js 15 + React 19 + TypeScript**，Tailwind CSS 设计令牌，motion 动效。
- **Neon Postgres**（Vercel 集成）存储用户数据；bcrypt + JWT Cookie 认证。
- **CodeMirror 6** 编辑器；three.js r186 本地托管，供沙箱通过 import map 加载。
- 部署在 **Vercel**，GitHub 推送 main 分支自动部署。

## 目录

- \`src/core\`：纯逻辑（主题、快捷键、i18n、markdown、高亮、搜索、用户数据校验），没有 DOM 依赖，全部单元测试覆盖。
- \`src/server\`：数据库、认证、与框架无关的请求处理器（\`Request → Response\`），用 PGlite（WASM 版 Postgres）做集成测试。
- \`src/client\`：数据源抽象（访客 localStorage / 账号 API 同一接口）、全局状态、快捷键分发。
- \`src/components\`：设计系统原语与页面组件。
- \`examples/<路径>/<slug>\`：每节课一个文件夹（\`meta.json\` + \`main.js\`）。
- \`public/sandbox.html\`：代码运行沙箱。

## TDD 与质量

\`npm test\` 运行全部测试，包括：主题对比度、快捷键解析与冲突检测、中英文案键完全一致、组件中禁止硬编码中文、每节课的元数据与代码校验、API 与用户隔离测试。新增功能先写测试。

## 新增一节课

1. 在 \`examples/<路径>/\` 下新建文件夹，写 \`meta.json\` 和 \`main.js\`。
2. \`npm test\` 校验格式、双语与导入规则。
3. \`node scripts/serve-dev.mjs\` 后用 \`python3 scripts/check_example.py <路径>/<slug>\` 在无头浏览器里运行并截图。

详细约定见仓库中的 \`docs/AUTHORING-EXAMPLES.md\`。`,
      en: `## Stack

- **Next.js 15 + React 19 + TypeScript**, Tailwind CSS design tokens, motion for animation.
- **Neon Postgres** (Vercel integration) for user data; bcrypt + JWT cookie auth.
- **CodeMirror 6** editor; three.js r186 served locally and loaded by the sandbox through an import map.
- Hosted on **Vercel**; pushes to main on GitHub deploy automatically.

## Layout

- \`src/core\`: pure logic (themes, shortcuts, i18n, markdown, highlighting, search, user-data validation), no DOM, fully unit-tested.
- \`src/server\`: database, auth and framework-agnostic handlers (\`Request → Response\`), integration-tested against PGlite (Postgres in WASM).
- \`src/client\`: the data-source abstraction (guest localStorage and account API behind one interface), global state, shortcut dispatch.
- \`src/components\`: design-system primitives and screens.
- \`examples/<track>/<slug>\`: one folder per lesson (\`meta.json\` + \`main.js\`).
- \`public/sandbox.html\`: the code sandbox.

## TDD and quality

\`npm test\` runs everything: theme contrast, shortcut parsing and conflict detection, identical zh/en key sets, a ban on hard-coded Chinese in components, metadata and code checks for every lesson, and API plus user-isolation tests. New features start with a test.

## Adding a lesson

1. Create a folder under \`examples/<track>/\` with \`meta.json\` and \`main.js\`.
2. \`npm test\` validates format, both languages and import rules.
3. Start \`node scripts/serve-dev.mjs\`, then \`python3 scripts/check_example.py <track>/<slug>\` runs it in a headless browser and takes a screenshot.

Full conventions live in \`docs/AUTHORING-EXAMPLES.md\` in the repository.`,
    },
  },
  {
    slug: "faq", icon: "help",
    title: { zh: "常见问题", en: "FAQ and troubleshooting" },
    body: {
      zh: `## WebGPU 示例显示“不支持”

WebGPU 需要 Chrome / Edge 113 及以上（Windows、macOS、ChromeOS、Android），Safari 26 及以上，Firefox 在部分平台已默认开启。Linux 上的 Chrome 可能需要在 \`chrome://flags\` 中开启 WebGPU。其他示例只需要 WebGL / WebGL 2，几乎所有现代浏览器都支持。

## 画面卡顿

- 在示例的参数面板里降低数量或分辨率。
- 关闭其他占用 GPU 的标签页。
- 笔记本请接通电源，或在系统设置里为浏览器选择高性能显卡。

## 代码改坏了

工具栏的“恢复原始代码”（\`⌘/Ctrl + Shift + R\`）会还原示例代码。保存过的片段不受影响。

## 着色器报错去哪看

着色器编译错误会输出到“控制台”标签，标签上会显示红色错误数；错误信息里通常带有行号。

## 我的数据安全吗

见“账号、隐私与数据”。简单说：每个用户只能访问自己的数据，密码只存哈希。`,
      en: `## WebGPU lessons say "not available"

WebGPU needs Chrome / Edge 113+ (Windows, macOS, ChromeOS, Android) or Safari 26+, and Firefox has it on by default on some platforms. Chrome on Linux may need WebGPU enabled in \`chrome://flags\`. All other lessons only need WebGL or WebGL 2, which nearly every modern browser supports.

## It's slow

- Lower counts or resolution in the lesson's parameter panel.
- Close other GPU-heavy tabs.
- On a laptop, plug in, or set the browser to use the high-performance GPU.

## I broke the code

"Restore original code" in the toolbar (\`⌘/Ctrl + Shift + R\`) brings the lesson code back. Saved snippets are not affected.

## Where do shader errors go?

Shader compile errors are printed in the Console tab, which shows a red error count. The messages usually include line numbers.

## Is my data safe?

See "Account, privacy and data". In short: each user can only access their own data, and passwords are stored only as hashes.`,
    },
  },
];

export const docBySlug = (s: string) => DOCS.find((d) => d.slug === s) ?? null;
