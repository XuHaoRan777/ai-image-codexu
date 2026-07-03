# AI Image Codexu 项目开发指南

## 项目概述

AI Image Codexu 是一个基于 **pnpm monorepo** 架构的自用 AI 生图应用。

**环境**: Node.js >= 24 | pnpm 10.33.0 | TypeScript 6

| 包名 | 路径 | 技术栈 |
| --- | --- | --- |
| `@ai-image-codexu/web` | `apps/web` | React 19 + Vite 8 + Tailwind CSS 4 + shadcn |
| `@ai-image-codexu/api` | `apps/api` | NestJS 11 |
| `@ai-image-codexu/shared` | `packages/shared` | Zod + TypeScript，输出 ESM/CJS/.d.ts |

**构建顺序**: `@ai-image-codexu/shared` 必须先于其他包构建；根命令 `pnpm build` 已处理 workspace 构建顺序。

---

## 开发流程

每次接收任务时执行以下流程，目的是让用户确认任务理解正确、技能选择合理：

### 1. 任务确认

简述任务所属领域（后端/前端/全栈/数据库/文档等）和实现思路，等待用户批准后再编写代码。需求模糊时，先提出澄清问题再动手。复杂任务（架构设计、多模块协调、性能优化）启用深度思考。

### 2. 技能反馈

列出本次激活的技能（最多 5 个），简要说明它们如何影响实现方案。简单任务可跳过。

### 3. 实现

- 开发前查阅 `docs/todo/todo.md` 和相关 `docs/` 文档
- 开发前查阅 `docs/pitfalls.md` 避免重复踩坑
- 开发前：若 `docs/specs/` 下存在与当前功能相关的文档，**必须先读取**，确保理解现有设计再动手
- 后端相关开发优先读取 `docs/specs/backend.md`
- 前端相关开发优先读取 `docs/specs/frontend.md`
- 遵循本文档中的代码规范和项目既有模式
- **任务拆分**：涉及多个独立逻辑单元时（如“后端服务”+“前端集成”），先拆分为子任务并列出，经用户确认后按序执行
- 复杂任务使用计划工具跟踪进度
- 完成后更新 `docs/todo/todo.md` 状态
- 完成后：若修改/新增了功能行为，**同步更新** `docs/specs/` 对应文档（不存在则新建）

### 4. 代码审查 (MANDATORY)

实现完成后立即执行，不等待用户要求：

| 包 | 命令 |
| --- | --- |
| `@ai-image-codexu/api` | `pnpm --filter @ai-image-codexu/api build` + `pnpm --filter @ai-image-codexu/api test` |
| `@ai-image-codexu/web` | `pnpm --filter @ai-image-codexu/web lint` + `pnpm --filter @ai-image-codexu/web build` |
| `@ai-image-codexu/shared` | `pnpm --filter @ai-image-codexu/shared build` |

通过标准：无类型错误 + 无 Lint 错误 + 相关测试通过。

### 5. 边缘案例与测试建议

新增功能或修复 Bug 后，列出可能的边缘案例并建议覆盖它们的测试用例。配置变更、文档修改等可跳过。

### 6. Bug 修复纪律

修复 Bug 时，**先编写能重现该 Bug 的测试**，再修复代码直到测试通过。无法编写自动化测试时，给出手动复现步骤。

### 7. 错误反思

每次被用户纠正时，反思错误根因并记录到 `docs/pitfalls.md`，确保同类错误不再重犯。

---

## 代码质量底线

以下规则防止“外科手术式堆屎山”——修改代码时不遵循项目既有模式的行为：

- **遵循文件既有模式**：修改代码时，命名、结构、错误处理方式必须与该文件已有代码一致。不要在一个文件中引入与周围代码风格不同的写法。
- **遵循模块既有模式**：新增文件时，参考同目录下已有文件的组织方式。不要发明新的文件结构或导出方式。
- **不做无关改动**：只修改任务需要的代码。不顺手重构、不添加未被要求的功能、不“改善”周围代码。
- **消除重复**：相同逻辑出现两次时提取为共享函数/组件，但三行以内的重复优于不必要的抽象。
- **注释策略**：新增公共函数添加 JSDoc；修改处的非显而易见逻辑添加行内注释；不为未改动的代码补注释。
- **生图 HTTP 配置注释要求**：涉及 `httpConfig`、请求头/请求体/返回格式模板、`bindings` 路径注入、参考图注入、预设按钮联动等逻辑时，必须在关键代码旁补充说明性注释，解释“配置模板”和“运行时实际请求”的关系，尤其说明哪些字段由用户手动控制、哪些字段由后端根据业务参数注入。

---

## 文档结构

```text
docs/
  todo/            ← 统一待办清单
    todo.md
  specs/           ← 功能规格、API 参考（按需读取）
    backend.md     ← 后端设计、接口、数据库规划
    frontend.md    ← 前端页面、交互、组件约定
  design/          ← 设计文档
  pitfalls.md      ← 项目踩坑记录（开发前务必查阅）
```

**功能专题文档**（工作在这些功能时务必先读取）：

- 后端/API/数据库：`docs/specs/backend.md`
- 前端/页面/交互：`docs/specs/frontend.md`

---

## 代码规范

### 格式化

遵循所在包的现有风格和工具配置：

- `apps/web`：React/Vite/shadcn 代码风格，当前文件以双引号、无分号为主
- `apps/api`：NestJS 代码风格，当前文件以单引号、分号为主
- `packages/shared`：类型与 schema 保持清晰导出，避免无关业务实现

### 类型定义

- 所有跨模块共享的类型定义在 `packages/shared/src/index.ts`，按业务域组织
- 业务模块**禁止**定义可复用类型，必须迁移到 shared
- 引用方式：`import type { ImageModelConfig } from '@ai-image-codexu/shared'`
- 修改后运行 `pnpm --filter @ai-image-codexu/shared build`

### 文件与图片存储

涉及文件上传、图片存储、缩略图、对象存储路径或 bucket 设计时，必须先在 `docs/specs/backend.md` 中补充约定，避免在业务代码中硬编码路径字符串。

---

## 子包规范

### `@ai-image-codexu/api`

- 路径：`apps/api`
- 后端细节放在 `docs/specs/backend.md`
- 添加数据库、ORM、迁移、密钥加密、provider adapter 前，先更新后端规格文档

### `@ai-image-codexu/web`

- 路径：`apps/web`
- 前端细节放在 `docs/specs/frontend.md`
- 页面、交互、组件结构变化后，同步更新前端规格文档

### `@ai-image-codexu/shared`

- 路径：`packages/shared`
- 负责前后端共享入参、返回类型、枚举、schema
- 输出同时服务前端 ESM 和后端 CJS；修改 shared 后必须构建验证
