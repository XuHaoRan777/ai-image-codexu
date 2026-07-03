# 后端规格

## 范围

后端位于 `apps/api`，使用 NestJS。当前阶段已加入环境变量配置和 MySQL/TypeORM 基础配置；配置页数据和生图任务数据已接入 TypeORM 实体和 Repository。

## 当前职责

- 管理生图模型配置
- 管理固定单条辅助模型配置
- 提供提示词优化接口
- 提供无持久化识图接口
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
    prompt-optimizer/   # 辅助模型配置、提示词优化与识图
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
- `POST /api/image/recognize`
- `POST /api/image-jobs`
- `GET /api/image-jobs`
- `GET /api/image-jobs/:id`
- `DELETE /api/image-jobs/:id`
- `GET /api/images/*path`

`POST /api/image-jobs` 请求体由 shared schema 校验，当前字段为：`configId`、`prompt`、`aspectRatio`、`resolution`、`quantity`、可选 `referenceImages`。其中 `aspectRatio` 和 `resolution` 是模型配置中 `httpConfig.request.body` 选项的项目语义值，shared 只校验非空字符串；`quantity` 支持 1 到 16，`referenceImages` 最多 16 张，具体可选范围由当前模型的请求体参数配置控制。

配置页接口由 shared schema 校验，当前持久化范围：

- `image-model-configs` 使用 `ImageModelConfigEntity` 和 `image_model_config` 表持久化；新主流程以 `providerType = configurable-http` 和 `httpConfig` 为核心，后端保存 HTTP 请求头、请求体参数配置、响应提取路径、轮询配置、`api_key_encrypted` 密文和 `api_key_masked` 掩码，前端只接收 `apiKeyMasked`。旧的 `openai-compatible` / `google-compatible`、字段映射、旧 bindings 和旧轮询字段仅作为历史过渡字段保留，新建配置由前端统一保存为 `configurable-http`。
- `PATCH /api/image-model-configs/:id/enabled` 仅接收 `{ enabled: boolean }`，用于模型库列表项内快速启停配置；接口只更新 `enabled` 与 `updated_at`，不接收密钥、地址或模型名等其它配置字段。
- `assistant-config` 使用固定 `id = default` 的 `AssistantModelConfigEntity` 和 `assistant_model_config` 表维护单条辅助模型配置；后端保存完整请求地址 `url`、`api_key_encrypted` 密文和 `api_key_masked` 掩码，前端只接收 `apiKeyMasked`。
- `POST /api/prompt/optimize` 必须读取已保存的 `assistant-config` 并调用真实辅助模型 provider；辅助模型未启用、缺少请求地址、缺少模型名或缺少可解密 API key 时返回明确错误，不在后端本地拼接假优化结果。
- `POST /api/image/recognize` 复用同一条 `assistant-config`，只接收 `imageDataUrl` 与 `prompt`，返回 `{ result }`，不写入数据库、不保存图片文件、不产生历史记录。OpenAI 模式使用 Chat Completions 的 `image_url` 视觉消息格式，Claude 模式使用 Messages 的 base64 `image` 内容格式。
- `image-jobs` 使用 `ImageJobEntity` 和 `image_job` 表持久化；创建任务时立即写入 `queued` 记录，后台执行 provider 请求时更新为 `running`，成功后写入 `image_url` / `image_urls`。provider 或图片保存流程失败时硬删除该任务记录，不保留失败历史。生成记录不保存前端上传的参考图 base64，避免任务表膨胀。
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

### 当前实体

`image_model_config`：

- `id`：varchar(64) 主键
- `name`：配置名称
- `provider_type`：provider 类型，新主流程为 `configurable-http`
- `delivery_mode`：结果交付方式，`sync` 或 `polling`
- `base_url`：历史字段，新主流程不依赖；真实请求地址写入 `http_config.request.url`
- `generation_path`：历史字段，新主流程不依赖
- `edit_path`：历史字段，新主流程不依赖
- `model_name`：模型快照，仅用于配置列表和任务历史展示；真实请求模型名可作为固定字段写入 `http_config.request.body` 或 URL
- `field_mapping`：历史字段，新主流程不依赖
- `field_overrides`：历史字段，新主流程不依赖
- `polling_config`：历史字段，新主流程不依赖；轮询规则写入 `http_config.polling`
- `http_config`：通用 HTTP 生图配置 JSON，包含 `request`、`request.body` 请求体参数配置、`response`、`polling`；旧 `bindings/referenceImages` 仅短期兼容历史配置
- `api_key_masked`：掩码密钥，仅用于前端展示
- `api_key_encrypted`：加密密文，供后端真实请求时解密使用
- `enabled`：是否启用
- `created_at` / `updated_at`：创建与更新时间

`assistant_model_config`：

- `id`：varchar(64) 主键，当前固定为 `default`
- `mode`：`openai` 或 `claude`
- `base_url`：请求地址，对外 API 字段为 `url`，必须填写完整 endpoint；后端不自动补全 provider 路径
- `api_key_masked`：掩码密钥，仅用于前端展示
- `api_key_encrypted`：加密密文，供后端真实请求时解密使用
- `model_name`：模型名
- `enabled`：是否启用
- `created_at` / `updated_at`：创建与更新时间

`image_job`：

- `id`：varchar(64) 主键
- `config_id`：创建任务时使用的生图配置 ID
- `config_name`：创建任务时的配置名称快照
- `provider_type`：来源类型
- `model_name`：实际请求模型名
- `prompt`：任务提示词
- `aspect_ratio` / `resolution` / `quantity`：任务参数；尺寸和分辨率保存配置选项的项目语义值
- `status`：`queued`、`running`、`succeeded`、`failed` 或 `canceled`；新任务失败时不再保存 `failed` 记录，该状态仅兼容历史旧数据或外部导入数据
- `image_url`：首张生成图片的本地访问地址，可为空
- `image_urls`：所有生成图片的本地访问地址数组，可为空
- `token_usage`：第三方响应中提取的 token 消耗，可为空
- `error_message`：任务失败错误信息，可为空
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

生图 provider 配置化的完整设计见 `docs/design/image-provider-config.md`。本节只保留后端规格中的关键约束。

生图真实请求通过通用 HTTP executor 执行，控制器不直接依赖第三方请求结构：

- 生图 provider：新主流程为 `configurable-http`
- 交付模式：`sync` 表示一次请求直接得到图片；`polling` 表示先创建第三方任务，再按配置轮询并提取结果图片
- 辅助模型 provider：OpenAI 模式、Claude 模式
- 控制器不直接依赖第三方请求结构
- 第三方 API key 只在后端使用，前端只接收掩码字段
- 辅助模型 OpenAI 模式使用 Chat Completions 协议：请求地址直接使用配置中的完整 `url`，后端不追加 `/chat/completions`，通过 `Authorization: Bearer <apiKey>` 鉴权，响应读取 `choices[0].message.content`。
- 辅助模型 Claude 模式使用 Anthropic Messages 协议：请求地址直接使用配置中的完整 `url`，后端不追加 `/v1/messages`，通过 `x-api-key` 和 `anthropic-version: 2023-06-01` 鉴权，响应读取首个 `type = text` 的 `content[].text`。
- 辅助模型提示词优化只返回优化后的提示词正文；请求失败时向前端返回第三方错误摘要，不记录或返回原始 API key。
- 辅助模型系统提示词必须以用户原意为最高优先级，只在不改变主体、动作、场景、风格、数量、视角和故事含义的前提下补充构图、镜头、光线、材质、质量和负面约束。
- 识图接口请求体通过 JSON 接收单张图片 data URL，API JSON body limit 为 30MB；后端只在请求生命周期内解析图片，不写入本地存储或数据库。
- 每个第三方中转商不再单独维护 provider 方法。`image-generation.providers.ts` 的新主入口为 `generateConfiguredHttp`，根据 `httpConfig.request` 组装最终 URL、headers、content type 和 body。
- `httpConfig.request.body` 是请求体参数配置，第一层 key 固定为 `prompt`、`aspectRatio`、`resolution`、`quantity`、`referenceImages`、`extra`。后端从空对象开始组装最终 body：先写入 `extra` 固定参数，再按 path 写入页面业务参数和参考图。
- `aspectRatio` / `resolution` 的 `options` 由前端展示 `label`，后端发送 `value`；`value: null` 表示不写入该 path，不再使用 `omitWhen`。
- `quantity.enabled = false` 表示不传数量；启用时按 `min/max/defaultValue` 控制前端选项并写入配置的 path。
- `request.body.referenceImages` 支持 `inlineBase64`、`multipart` 和 `none`；`urlArray` 仅预留，必须等后续 OSS 或公网图片托管能力接入后才能真正启用。
- `httpConfig.response.images` 使用完整路径提取图片，支持 `base64`、`dataUrl` 和远程 `url`；远程 URL 会由后端下载后保存到本地。
- `httpConfig.response.usage.totalTokensPath` 提取到的 token 消耗会写入 `image_job.token_usage`。
- `deliveryMode = polling` 时 `httpConfig.polling` 必填，创建响应用 `taskIdPath` 提取任务 ID，轮询响应用 `statusPath`、`successValue`、`failureValue` 判断状态，成功后使用 `polling.response` 或顶层 `response` 提取图片。
- `POST /api/image-jobs` 创建任务后立即在 `image_job` 表写入 `queued` 并返回，后台异步执行真实请求；任务执行中置为 `running`，成功后写入 `imageUrl` / `imageUrls`。provider 或图片保存失败后删除任务记录，前端轮询该任务会收到 404；`GET /api/image-jobs` 按创建时间倒序只返回仍持久化的任务历史。
- `DELETE /api/image-jobs/:id` 对历史任务执行硬删除，不做逻辑删除；接口会删除 `image_job` 数据库记录，并根据记录里的 `imageUrl` / `imageUrls` 清理对应 `/api/images/*` 本地文件。文件不存在时不阻塞记录删除；任务记录不存在时返回 404。
- 生图任务记录会保存任务实际使用的 `providerType`、`modelName` 和 `tokenUsage`，用于前端历史展示和排查请求；`providerType` 新配置下通常为 `configurable-http`，`modelName` 来自模型配置的模型快照。
- provider 请求超时时间为 5 分钟。请求前日志打印完成模板渲染、字段映射、参考图注入后的最终请求结构，包含 method、contentType、URL、脱敏 headers 和 body；headers 中的 key、token、authorization 等字段必须脱敏，body 中 data URL 或 base64 只保留前 25 位。
- 请求失败时，后端仅打印第三方接口返回信息摘要，包含 HTTP 状态和脱敏响应体摘要；日志使用多行缩进 JSON，若第三方响应体是 JSON 字符串会先解析为对象再输出；日志不得包含 API Key、完整图片 base64、上传图片内容或任务上下文。
- 返回的 base64 图片或远程图片 URL 都会写入 `IMAGE_STORAGE_PATH`，前端只访问本地 `/api/images/*path`。
- 删除历史任务时，后端只允许从 `/api/images/*` 公开 URL 还原存储根目录下的相对路径并删除对应文件，必须继续防止目录穿越和误删存储根目录外文件。

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
