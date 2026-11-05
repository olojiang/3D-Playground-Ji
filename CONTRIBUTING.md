# 参与贡献 · Contributing

感谢你愿意让 3D Playground 变得更好！本文中英双语，先中文后英文。
Thanks for helping make 3D Playground better! This guide is bilingual: Chinese first, then English.

- [中文](#中文)
- [English](#english)

---

## 中文

### 1. 本地环境

需要 Node.js 22+ 与 npm。

```bash
git clone <repo> && cd 3d-playground-ji
npm install
npm run dev            # 自动 vendor three.js、打包课程，然后启动 Next.js
npm test               # Vitest 全部测试
npx tsc --noEmit       # 类型检查
```

- 不连数据库也能以**访客模式**使用（数据存浏览器）。要测账号功能，设置 `DATABASE_URL`（Neon / Postgres）和 `JWT_SECRET`。
- 服务端测试使用进程内的 PGlite（WASM Postgres），无需真实数据库。

### 2. TDD 规则（必须遵守）

每个改动都**先写失败的测试，再写实现**：

1. 在 `tests/` 下找到与 `src/` 对应的位置（`tests/core`、`tests/server`、`tests/client`）写测试，确认它失败。
2. 写最少的实现让它通过，再重构。
3. 提交前 `npx tsc --noEmit` 与 `npx vitest run` 必须全绿。

约定：

- 纯逻辑放在 `src/core`，并有单元测试；服务端处理器是框架无关的 `Request → Response`，放在 `src/server`，用 PGlite 测。
- 所有数据表以 `tp_` 开头；schema 迁移写在 `src/server/db.ts`，必须幂等（`CREATE … IF NOT EXISTS`）。
- 每条用户数据都按 `user_id` 过滤；涉及权限的改动要补隔离测试（`tests/server/isolation.test.ts`、`tests/server/share.test.ts`）。
- **所有界面文字**都放进 `src/core/i18n.ts`，同时提供 `zh` 与 `en`；测试会禁止组件中出现中文字面量，并检查两种语言的键完全一致。
- 保持现有 UI 风格：使用 `src/components/ui.tsx` 的基础组件与主题 CSS 变量；9 套主题都要好看。

### 3. 编写课程

一节课 = 一个文件夹：`examples/<three|webgl|gpu>/<slug>/{meta.json, main.js}`。完整规范见 [docs/AUTHORING-EXAMPLES.md](docs/AUTHORING-EXAMPLES.md)。

1. 写 `meta.json`（中英标题、摘要、概念文章、核心 API、练习）和 `main.js`（只能 import `three` 相关模块，不访问网络，响应式画布）。
2. `node scripts/gen-examples.mjs` 打包；`npm test` 校验元数据与双语完整性。
3. `node scripts/serve-dev.mjs 4600` 后运行 `python3 scripts/check_example.py <track>/<slug>`，在 headless 浏览器里跑一遍并**查看截图**。
4. 新课会自动出现在导航、搜索、站点地图（`/sitemap.xml`）和分享卡片里，无需额外登记。

### 4. PR 检查清单

- [ ] 先写了测试，且测试覆盖新行为（包括失败/越权路径）
- [ ] `npx tsc --noEmit` 通过
- [ ] `npx vitest run` 全部通过
- [ ] 新文字都在 `i18n.ts` 中，中英齐全
- [ ] 新课程通过 `check_example.py`，截图正常
- [ ] 在亮色与暗色主题、桌面与手机宽度下看过界面
- [ ] 没有提交密钥、`.env` 或生成文件（`src/generated/`、`public/vendor/`）
- [ ] 提交信息清楚说明「做了什么、为什么」

---

## English

### 1. Local setup

Requires Node.js 22+ and npm.

```bash
git clone <repo> && cd 3d-playground-ji
npm install
npm run dev            # vendors three.js, bundles the lessons, then starts Next.js
npm test               # the whole Vitest suite
npx tsc --noEmit       # type check
```

- Without a database the app runs in **guest mode** (data stays in the browser). For account features set `DATABASE_URL` (Neon / Postgres) and `JWT_SECRET`.
- Server tests run against in-process PGlite (Postgres in WASM); no real database needed.

### 2. The TDD rule (required)

Every change starts with a **failing test, then the implementation**:

1. Add the test under `tests/`, mirroring `src/` (`tests/core`, `tests/server`, `tests/client`), and watch it fail.
2. Write the smallest implementation that passes, then refactor.
3. `npx tsc --noEmit` and `npx vitest run` must be green before you commit.

Conventions:

- Pure logic lives in `src/core` with unit tests; server handlers are framework-agnostic `Request → Response` functions in `src/server`, tested with PGlite.
- Every table is prefixed `tp_`; schema migrations go in `src/server/db.ts` and must be idempotent (`CREATE … IF NOT EXISTS`).
- Every user-owned row is filtered by `user_id`; permission changes need isolation tests (`tests/server/isolation.test.ts`, `tests/server/share.test.ts`).
- **Every user-facing string** goes in `src/core/i18n.ts` with both `zh` and `en`; tests ban CJK literals in components and require identical keys.
- Keep the UI style: build from `src/components/ui.tsx` primitives and theme CSS variables; all 9 themes must look right.

### 3. Authoring a lesson

One lesson = one folder: `examples/<three|webgl|gpu>/<slug>/{meta.json, main.js}`. The full contract is in [docs/AUTHORING-EXAMPLES.md](docs/AUTHORING-EXAMPLES.md).

1. Write `meta.json` (bilingual title, summary, concept article, key APIs, exercises) and `main.js` (only `three` imports, no network, responsive canvas).
2. Bundle with `node scripts/gen-examples.mjs`; `npm test` validates metadata and bilingual completeness.
3. Run `node scripts/serve-dev.mjs 4600`, then `python3 scripts/check_example.py <track>/<slug>` to run it headless, and **look at the screenshot**.
4. New lessons show up automatically in navigation, search, the sitemap (`/sitemap.xml`) and share cards; nothing else to register.

### 4. PR checklist

- [ ] Tests were written first and cover the new behaviour (including failure / unauthorized paths)
- [ ] `npx tsc --noEmit` passes
- [ ] `npx vitest run` passes
- [ ] New strings are in `i18n.ts`, in both languages
- [ ] New lessons pass `check_example.py` and the screenshot looks right
- [ ] Checked the UI in light and dark themes, at desktop and phone widths
- [ ] No secrets, `.env` or generated files committed (`src/generated/`, `public/vendor/`)
- [ ] The commit message says what changed and why

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
