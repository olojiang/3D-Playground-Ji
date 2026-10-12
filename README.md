# 3D Playground

An interactive, bilingual (中文 / English) lab for learning **Three.js**, **WebGL shaders** and **GPU / WebGPU compute** in the browser: concept articles, editable code and live results side by side.

Live: https://3d-playground-ji.vercel.app

## Features

- **Three tracks, 36 runnable lessons**: Three.js essentials · WebGL & GLSL from the first triangle to raymarching · GPU parallelism, WebGPU render/compute pipelines, GPGPU and performance.
- **Workbench**: CodeMirror editor, sandboxed live preview (pause, FPS, fullscreen), console with error counts, resizable split or stacked layout, auto-run, local drafts.
- **Playground** with Three.js / WebGL 2 / WebGPU templates; save any experiment as a snippet.
- **Accounts with strict per-user isolation**: progress, favorites, snippets and settings in Postgres; guest mode in localStorage, merged on first sign-in; JSON export/import; account deletion.
- **9 themes** (light, dark, eye care, black-red, black-gold, purple, ocean, sakura, graphite) + system, contrast-tested.
- **30 keyboard shortcuts** (chords, `G`-sequences, scoped to page/editor), fully customisable with conflict detection; command palette (`⌘/Ctrl K`).
- **In-app docs**: getting started, tracks, runtime API, shortcuts, themes, privacy, architecture, FAQ.

## Development

```bash
npm install
npm run dev          # vendors three.js into public/vendor and bundles lessons first
npm test             # Vitest: core logic, i18n, themes, shortcuts, lessons, API + isolation (PGlite)
npm run lint
```

Environment: `DATABASE_URL` (Neon/Postgres) and `JWT_SECRET`. Locally you can point the Neon HTTP driver at a PGlite shim with `NEON_FETCH_ENDPOINT`.

## Layout

| Path | What |
| --- | --- |
| `src/core` | Pure, unit-tested logic: themes, shortcuts, i18n, markdown, highlighter, search, user-data schemas, console model |
| `src/server` | Postgres access, auth, framework-agnostic handlers (`Request → Response`) |
| `src/client` | Data-source abstraction (guest vs. account), app state, shortcut dispatch |
| `src/components` | Design-system primitives (`ui.tsx`) and screens |
| `src/content` | Docs and playground templates |
| `examples/<track>/<slug>` | One lesson per folder: `meta.json` + `main.js` (see `docs/AUTHORING-EXAMPLES.md`) |
| `public/sandbox.html` | The iframe runtime lessons execute in |
| `scripts/` | Vendoring, lesson bundling, dev server, headless lesson checker |

Deployed on Vercel (region `sin1`); every push to `main` deploys.
