# 后端规格

## 范围

后端位于 `apps/api`，使用 NestJS。当前阶段已加入环境变量配置和 MySQL/TypeORM 基础配置；业务数据仍暂存在内存中，后续再接入实体、迁移和持久化服务。

## 当前职责

- 管理生图模型配置
- 管理固定单条辅助模型配置
- 提供提示词优化接口
- 创建与查询生图任务
- 管理本地图片存储路径
- 通过 shared 中的 Zod schema 校验请求数据

## 模块结构

`AppModule` 只负责注册基础设施和业务模块，不承载具体业务逻辑。

```text
apps/api/src/
  app.module.ts
  config.ts
  common/
    utils/
  entity/
  modules/
    image-generation/   # 生图配置与生图任务
    image-processing/   # 图片处理、本地图片路径
    prompt-optimizer/   # 辅助模型配置与提示词优化
```

## 当前接口

- `GET /api/image-model-configs`
- `POST /api/image-model-configs`
- `PATCH /api/image-model-configs/:id`
- `DELETE /api/image-model-configs/:id`
- `GET /api/assistant-config`
- `PUT /api/assistant-config`
- `POST /api/prompt/optimize`
- `POST /api/image-jobs`
- `GET /api/image-jobs/:id`

`POST /api/image-jobs` 请求体由 shared schema 校验，当前字段为：`configId`、`prompt`、`aspectRatio`、`resolution`、`quantity`、可选 `referenceImages`。其中 `resolution` 支持 `0.5k`、`1k`、`2k`、`4k`，`quantity` 支持 1 到 4，`referenceImages` 最多 6 张。

## 数据库规划

数据库计划使用 MySQL。当前配置通过 `.env.development` / `.env.production` 提供。引入业务持久化前需要先确定：

- ORM 或查询层方案
- migration 管理方式
- API key 加密存储方式
- 生图配置表结构
- 辅助模型配置表结构
- 生图任务表结构
- 生成图片资产与本地图片路径的关系

### 实体类规范

**实体类** (`src/entity/`)：显式配置风格，所有字段指定 `name`，数据库 `snake_case` / TypeScript `camelCase`，必须指定 `schema: 'ai_image_codexu'`，禁止 `@PrimaryGeneratedColumn()` 等简化装饰器。

```typescript
@Entity('table_name', { schema: 'ai_image_codexu' })
export class EntityName {
  @Column({ type: 'int', primary: true, name: 'id', generated: 'increment' })
  id: number;

  @Column({ type: 'datetime', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
```

## Provider 规划

接入真实第三方 API 前，先抽出 provider adapter 层：

- 生图 provider：GPT Image 2、Google Nano Banana 2
- 辅助模型 provider：OpenAI 模式、Claude 模式
- 控制器不直接依赖第三方请求结构
- 第三方 API key 只在后端使用，前端只接收掩码字段

## 图片本地路径规划

图片使用本地路径，不使用对象存储服务。

- 本地启动通过 `IMAGE_STORAGE_PATH` 指定本地图片根目录
- 部署环境通过 `IMAGE_STORAGE_PATH` 指定服务器图片根目录
- `IMAGE_STORAGE_PATH` 是必填配置，缺失时服务启动失败
- 业务代码不得硬编码图片根路径
- 图片相对路径必须防止目录穿越

## 验证命令

```bash
pnpm --filter @ai-image-codexu/api build
pnpm --filter @ai-image-codexu/api test
```
