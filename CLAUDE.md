# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 先读 AGENTS.md

本仓库的**权威工作流与规范在 [`AGENTS.md`](AGENTS.md)**,接到任务务必先读它,本文件不复制其内容。其中包含:

- 强制开发流程(任务确认 → 技能反馈 → 实现 → **强制代码审查** → 边缘案例 → Bug 修复纪律 → 错误反思)
- 代码质量底线、代码规范、子包规范

工作某功能前先读对应文档:后端 [`docs/specs/backend.md`](docs/specs/backend.md)、前端 [`docs/specs/frontend.md`](docs/specs/frontend.md);开发前查阅 [`docs/pitfalls.md`](docs/pitfalls.md)(避免重复踩坑)与 [`docs/todo/todo.md`](docs/todo/todo.md)。

## 命令

环境:Node >= 24,pnpm 10.33.0。

根命令:

- `pnpm dev` — 先构建 shared,再并行起 web + api
- `pnpm dev:web` / `pnpm dev:api` — 仅起单端(都会先构建 shared)
- `pnpm build` — `pnpm -r build`(按 workspace 顺序,shared 先行)
- `pnpm lint` — `pnpm -r lint`
- `pnpm test` — 仅跑 api 的 jest

子包级(代码审查用,与 AGENTS.md 第 4 节一致):

- api:`pnpm --filter @ai-image-codexu/api build` + `pnpm --filter @ai-image-codexu/api test`
- web:`pnpm --filter @ai-image-codexu/web lint` + `pnpm --filter @ai-image-codexu/web build`
- shared:`pnpm --filter @ai-image-codexu/shared build`

跑单个测试:

- 按文件/路径:`pnpm --filter @ai-image-codexu/api test -- <file-or-pattern>`
  - 例:`pnpm --filter @ai-image-codexu/api test -- image-generation.providers`
- 按用例名:追加 `-t "<test name>"`

**关键约束**:改动 `packages/shared` 后必须先 `pnpm --filter @ai-image-codexu/shared build`,否则 web/api 拿到旧类型——shared 通过构建产物 `dist/`(ESM + CJS)被引用,不是源码直引。

## 架构

**Monorepo 形态**:pnpm workspace(`apps/*` + `packages/*`),三包:

- `apps/web` — React 19 + Vite 8 + Tailwind CSS 4 + shadcn
- `apps/api` — NestJS 11
- `packages/shared` — Zod schema + 类型,同时输出 ESM(给前端)/ CJS(给后端)

**类型与契约的单一来源 = [`packages/shared/src/index.ts`](packages/shared/src/index.ts)**:所有跨端 schema/类型都在此定义(`imageModelConfigSchema`、`createImageJobSchema`、`assistantModelConfigSchema`、`ApiResponseCode` 等),前后端统一 `import type … from '@ai-image-codexu/shared'`。业务模块禁止自定义可复用类型,必须迁回 shared。

**前后端联通**:

- 后端全局前缀 `/api`,开发默认端口 3007([`apps/api/src/main.ts`](apps/api/src/main.ts));统一响应包装 `ApiResponseInterceptor` + 统一异常过滤 `ApiExceptionFilter`(均在 `apps/api/src/common/`)。
- 前端 [`apps/web/src/lib/api.ts`](apps/web/src/lib/api.ts) 是唯一 HTTP 客户端(axios,baseURL 默认 `/api`)。Vite dev 固定监听 `3008`，并用 proxy 把 `/api` 转发到 `localhost:3007`([`apps/web/vite.config.ts`](apps/web/vite.config.ts));`@` 别名指向 `src`。
- 前端是**单文件 hash 路由 SPA**:[`apps/web/src/App.tsx`](apps/web/src/App.tsx) 用 `window.location.hash` 在 generate / history / recognize / settings 四个页面间切换,无路由库。

**后端模块划分**([`apps/api/src/modules/`](apps/api/src/modules),细节见 backend.md):

- `image-generation/` — 生图模型配置(CRUD)+ 生图任务。`ImageProviderDispatcher`([image-generation.providers.ts](apps/api/src/modules/image-generation/image-generation.providers.ts))按 `providerType` 分发到 openai / onetopai / image-youyu / aicodewith / google 各 provider 实现。
- `image-processing/` — 本地图片存储与读取。`ImageStorageService` 落盘到 `IMAGE_STORAGE_PATH`,`GET /api/images/*path` 直接返回二进制(不走 JSON 包装),含目录穿越防护。
- `prompt-optimizer/` — 辅助模型配置(单条,固定 `id=default`)+ 提示词优化 + 识图;复用同一条 assistant-config,支持 openai / claude 两种模式。

**生图任务生命周期(关键异步流)**:`POST /api/image-jobs` 立即写入 `queued` 记录 → 后台调 provider 时转 `running` → 成功写 `image_url` / `image_urls`;**provider 或存图失败时硬删除该任务记录,不留失败历史**。前端 `App.tsx` 创建后以 ~1.5s 间隔轮询 `GET /api/image-jobs/:id`,直到状态非 queued/running 或超时(300s)。

**密钥安全**:API key 以 AES-256-GCM 加密入库(`apps/api/src/common/utils/secretCrypto.ts`),前端只收掩码(`api_key_masked`)。生产必须配 `API_KEY_ENCRYPTION_SECRET` 或 `APP_SECRET`,开发环境有固定 fallback。

**数据库**:MySQL + TypeORM([`apps/api/src/config.ts`](apps/api/src/config.ts)),库名 `ai_image_codexu`;开发环境 `synchronize: true`、生产关闭。env 文件 `.env.development` / `.env.production`,按 `NODE_ENV` 选取。实体在 [`apps/api/src/entity/`](apps/api/src/entity)(`ImageModelConfig`、`ImageJob`、`AssistantModelConfig`)。

## 改动连锁影响

- 改 shared 类型 → 重新 build shared → 前后端都受影响。
- 加新 provider → 改 `ImageProviderTypeEnum`(shared)+ `ImageProviderDispatcher` 分发 + 对应 provider 实现;先更新 `docs/specs/backend.md`。
- 涉及文件/图片路径 → 先在 `docs/specs/backend.md` 补约定,不在业务代码硬编码路径字符串。
