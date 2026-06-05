# 后端规格

## 范围

后端位于 `apps/api`，使用 NestJS。当前阶段已加入环境变量配置和 MySQL/TypeORM 基础配置；配置页数据已接入 TypeORM 实体和 Repository，生图任务数据仍暂存在内存中，后续再接入任务实体、迁移和持久化服务。

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
- `PATCH /api/image-model-configs/:id/enabled`
- `DELETE /api/image-model-configs/:id`
- `GET /api/assistant-config`
- `PUT /api/assistant-config`
- `POST /api/prompt/optimize`
- `POST /api/image-jobs`
- `GET /api/image-jobs/:id`
- `GET /api/images/*path`

`POST /api/image-jobs` 请求体由 shared schema 校验，当前字段为：`configId`、`prompt`、`aspectRatio`、`resolution`、`quantity`、可选 `referenceImages`。其中 `aspectRatio` 支持 `auto`、`1:1`、`4:3`、`3:4`、`16:9`、`9:16`，`resolution` 支持 `0.5k`、`1k`、`2k`、`4k`，`quantity` 支持 1 到 4，`referenceImages` 最多 6 张。

配置页接口由 shared schema 校验，当前持久化范围：

- `image-model-configs` 使用 `ImageModelConfigEntity` 和 `image_model_config` 表持久化；后端保存来源类型、`api_key_encrypted` 密文和 `api_key_masked` 掩码，前端只接收 `apiKeyMasked`。模型配置不再维护单独的模型类型，也不维护运营商请求地址；真实请求地址由后端 provider 方法固定，真实请求模型名由 `model_name_override` 或来源类型默认值决定。
- `PATCH /api/image-model-configs/:id/enabled` 仅接收 `{ enabled: boolean }`，用于模型库列表项内快速启停配置；接口只更新 `enabled` 与 `updated_at`，不接收密钥、地址或模型名等其它配置字段。
- `assistant-config` 使用固定 `id = default` 的 `AssistantModelConfigEntity` 和 `assistant_model_config` 表维护单条辅助模型配置；后端保存 `api_key_encrypted` 密文和 `api_key_masked` 掩码，前端只接收 `apiKeyMasked`。
- 配置页不注入默认测试配置；`image_model_config` 空表时 `GET /api/image-model-configs` 返回空列表，配置必须来自真实创建请求或数据库记录。
- API key 使用 AES-256-GCM 加密后入库。生产环境必须配置 `API_KEY_ENCRYPTION_SECRET` 或 `APP_SECRET`；开发环境未配置时使用固定开发 fallback。历史上只保存 `api_key_masked` 的记录无法反推原始密钥，需要在配置页重新填写密钥。

## 数据库规划

数据库计划使用 MySQL。当前配置通过 `.env.development` / `.env.production` 提供。引入业务持久化前需要先确定：

- ORM 或查询层方案
- migration 管理方式
- API key 轮换与外部 Secret Manager 接入方式
- 生图配置表结构
- 辅助模型配置表结构
- 生图任务表结构
- 生成图片资产与本地图片路径的关系

### 当前配置实体

`image_model_config`：

- `id`：varchar(64) 主键
- `name`：配置名称
- `provider_type`：`openai`、`google`、`onetopai` 或 `image-youyu`
- `api_key_masked`：掩码密钥，仅用于前端展示
- `api_key_encrypted`：加密密文，供后端真实请求时解密使用
- `model_name_override`：模型名 override，可为空
- `enabled`：是否启用
- `created_at` / `updated_at`：创建与更新时间

`assistant_model_config`：

- `id`：varchar(64) 主键，当前固定为 `default`
- `mode`：`openai` 或 `claude`
- `base_url`：请求地址，可为空
- `api_key_masked`：掩码密钥，仅用于前端展示
- `api_key_encrypted`：加密密文，供后端真实请求时解密使用
- `model_name`：模型名
- `enabled`：是否启用
- `created_at` / `updated_at`：创建与更新时间

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

生图真实请求通过 provider adapter 层执行，控制器不直接依赖第三方请求结构：

- 生图 provider：OpenAI 官方、Google Gemini、OneTopAI、image-youyu
- 辅助模型 provider：OpenAI 模式、Claude 模式
- 控制器不直接依赖第三方请求结构
- 第三方 API key 只在后端使用，前端只接收掩码字段
- `POST /api/image-jobs` 创建任务后立即返回 `queued`，后台异步执行真实请求；任务执行中置为 `running`，成功后写入 `imageUrl` / `imageUrls`，失败后写入 `failed` 和 `errorMessage`。
- 生图任务记录会保存任务实际使用的 `providerType` 与 `modelName`，用于前端历史展示和排查请求；`modelName` 优先来自配置的 `model_name_override`，否则按来源类型使用默认值：OpenAI/OneTopAI 为 `gpt-image-2`，Google 为 `gemini-3.1-flash-image`，image-youyu 为 `image-youyu`。
- OpenAI 官方和 OneTopAI 使用 OpenAI Images 兼容协议：基础地址写在后端 provider 方法内，无参考图时拼接 `/generations`，有参考图时拼接 `/edits`，由后端根据 `referenceImages` 判断；`aspectRatio = auto` 时 `size` 传 `auto`。
- Google 使用 Gemini 图像生成协议：基础地址写在后端 provider 方法内，后端拼接 `{modelName}:generateContent`，通过 `x-goog-api-key` 鉴权；`aspectRatio = auto` 时不发送固定 `imageConfig.aspectRatio`。
- image-youyu 使用固定地址 `https://image.youyu.help/v1/images`：无参考图时 `POST /generations` 并发送 JSON，有参考图时 `POST /edits` 并发送 multipart；请求字段只包含 `prompt`、`quality`、`size`、`output_format`、`n`，图生图额外包含 `image`，不发送 `model` 字段。`quality` 将 `0.5k/1k` 映射为 `1k`、`2k/4k` 映射为 `2k`；`size` 将 `auto/1:1` 映射为 `1024x1024`、`4:3/16:9` 映射为 `1536x1024`、`3:4/9:16` 映射为 `1024x1536`；`output_format` 固定为 `png`。
- provider 请求失败时，后端仅打印第三方接口返回信息摘要，包含 HTTP 状态和脱敏响应体摘要；日志不得包含 API Key、完整图片 base64、上传图片内容或任务上下文。
- 返回的 base64 图片或远程图片 URL 都会写入 `IMAGE_STORAGE_PATH`，前端只访问本地 `/api/images/*path`。

## 图片本地路径规划

图片使用本地路径，不使用对象存储服务。

- 本地启动通过 `IMAGE_STORAGE_PATH` 指定本地图片根目录
- 部署环境通过 `IMAGE_STORAGE_PATH` 指定服务器图片根目录
- `IMAGE_STORAGE_PATH` 是必填配置，缺失时服务启动失败
- 业务代码不得硬编码图片根路径
- 图片相对路径必须防止目录穿越
- `GET /api/images/*path` 从 `IMAGE_STORAGE_PATH` 读取本地图片并按图片 MIME 类型返回二进制内容，不走统一 JSON 包装。

## 验证命令

```bash
pnpm --filter @ai-image-codexu/api build
pnpm --filter @ai-image-codexu/api test
```
