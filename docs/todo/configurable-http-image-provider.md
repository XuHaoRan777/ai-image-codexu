# 可配置 HTTP 生图 Provider 实施文档

## 目的

当前生图 provider 仍以 `openai-compatible` 和 `google-compatible` 两类协议适配器为中心。它能覆盖一部分主流接口，但遇到 APIYI Nano Banana 这类 Gemini 风格、AiCodeWith 这类轮询风格、以及其它中转商自定义字段时，仍会出现几个问题：

- 配置页的字段映射偏 OpenAI 扁平字段，难以表达 `contents[].parts[]`、`generationConfig.imageConfig.aspectRatio` 这类嵌套结构。
- Google-compatible 已改为完整 endpoint，但请求体仍由后端固定组装，无法配置 `thinkingConfig`、`responseModalities` 等平台差异字段。
- 参考图可能是 multipart 文件、inline base64、data URL、公网 URL 数组等不同形态，单纯字段名映射不能表达数据形态差异。
- 返回图片可能来自 `data[].b64_json`、`data[].url`、`candidates[].content.parts[].inlineData.data`、`result_data[].url` 等不同路径，当前协议适配器仍要写死解析逻辑。
- 每次新平台出现“像 OpenAI / Google 但又差一点”的结构时，仍需要改后端 provider 代码。

本次核心改造目标是把生图 provider 从“协议适配器”升级为“可配置 HTTP 请求模板”。后端只保留通用执行器：根据配置组装请求头、请求体、参考图、轮询规则和响应提取路径；前端配置页负责维护模板和一键填充预设。

## 重做边界

本次改造以“通用 HTTP 请求模板”为目标，不要求保留当前 `openai-compatible` / `google-compatible` 的业务形态。如果旧逻辑、旧字段或旧 UI 会让新模型变得别扭，可以推翻重做。

当前代码只作为迁移时的事实参考，不作为新方案约束：

- 旧的 `providerType`、`baseUrl`、`modelName`、`fieldMapping`、`fieldOverrides`、`pollingConfig` 可以被新配置模型替代。
- 旧的 OpenAI / Google provider 分支可以删除或收敛为“预设模板”，不再作为后端核心抽象。
- 配置页可以重新组织，不必沿用“基础配置 / 参数映射”两页结构。
- 旧配置数据如果迁移成本高，可以接受手动重建配置；是否做自动迁移作为单独决策，而不是实施前提。

需要保留的是业务目标和用户工作流：

- 生图页面仍只暴露稳定业务参数：提示词、尺寸、分辨率、数量、参考图。
- API key 仍应后端加密保存，前端只展示掩码或空输入。
- 生图任务仍写入 `image_job`，成功图片仍落到 `IMAGE_STORAGE_PATH` 并通过 `/api/images/*` 访问。
- 失败任务仍不进入历史记录。

## 设计原则

- 请求配置以 JSON 为主，减少后端硬编码 provider 分支。
- API key 不直接混入可回显 JSON 配置；继续单独加密存储，通过 `{{apiKey}}` 占位符注入请求头或 URL。
- 生图页面业务参数保持稳定：`prompt`、`aspectRatio`、`resolution`、`quantity`、`referenceImages`。
- 请求体参数配置只描述“项目业务字段如何写入第三方 API path/value”，后端运行时据此组装最终请求体。
- 返回解析使用明确路径，不使用全对象同名字段扫描作为正式逻辑。
- 支持单次同步请求和创建任务后轮询两种交付方式。
- 先覆盖 JSON 与 multipart 两类请求体；公网 URL 参考图需要后续图片托管能力，不在第一阶段伪装支持。

## 建议配置结构

### 顶层配置

通用配置字段 `httpConfig` 用于描述完整 HTTP 请求。请求头和返回格式仍保持 JSON 对象；请求体不再直接填写第三方接口原始 body，而是改为“项目标准字段 -> 第三方 API path/value”的参数配置。

```json
{
  "request": {
    "method": "POST",
    "url": "https://api.apiyi.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
    "contentType": "json",
    "headers": {
      "Content-Type": "application/json",
      "x-goog-api-key": "{{apiKey}}"
    },
    "body": {
      "prompt": {
        "path": "contents[0].parts[0].text"
      },
      "aspectRatio": {
        "path": "generationConfig.imageConfig.aspectRatio",
        "options": [
          { "label": "1:1", "value": "1:1" },
          { "label": "16:9", "value": "16:9" }
        ]
      },
      "resolution": {
        "path": "generationConfig.imageConfig.imageSize",
        "options": [
          { "label": "0.5k", "value": "512" },
          { "label": "1k", "value": "1K" },
          { "label": "2k", "value": "2K" },
          { "label": "4k", "value": "4K" }
        ]
      },
      "quantity": {
        "enabled": false,
        "path": "candidateCount",
        "min": 1,
        "max": 3,
        "defaultValue": 1
      },
      "referenceImages": {
        "mode": "inlineBase64",
        "maxCount": 16,
        "path": "contents[0].parts[]",
        "template": {
          "inlineData": {
            "mimeType": "{{mimeType}}",
            "data": "{{base64}}"
          }
        }
      },
      "extra": [
        {
          "path": "generationConfig.responseModalities",
          "value": ["IMAGE"]
        }
      ]
    }
  },
  "response": {
    "images": {
      "type": "base64",
      "dataPath": "candidates[].content.parts[].inlineData.data",
      "mimeTypePath": "candidates[].content.parts[].inlineData.mimeType"
    },
    "usage": {
      "totalTokensPath": "usageMetadata.totalTokenCount",
      "inputTokensPath": "usageMetadata.promptTokenCount",
      "outputTokensPath": "usageMetadata.candidatesTokenCount"
    }
  }
}
```

### 请求头

请求头使用 JSON 对象配置，但密钥通过占位符：

```json
{
  "Authorization": "Bearer {{apiKey}}"
}
```

或：

```json
{
  "x-goog-api-key": "{{apiKey}}"
}
```

不建议允许用户把真实密钥直接写进 headers JSON。真实密钥继续走现有 `apiKeyEncrypted` / `apiKeyMasked` 机制，避免前端回显、日志和导出配置泄露。

### 请求体参数配置

请求体配置的第一层 key 固定为项目内部语义，不直接使用第三方字段名：

```json
{
  "prompt": {
    "path": "contents[0].parts[0].text"
  },
  "aspectRatio": {
    "path": "generationConfig.imageConfig.aspectRatio",
    "options": [
      { "label": "1:1", "value": "1:1" },
      { "label": "3:4", "value": "3:4" },
      { "label": "4:3", "value": "4:3" }
    ]
  },
  "resolution": {
    "path": "generationConfig.imageConfig.imageSize",
    "options": [
      { "label": "512", "value": "512" },
      { "label": "1k", "value": "1K" },
      { "label": "2k", "value": "2K" },
      { "label": "4k", "value": "4K" }
    ]
  },
  "quantity": {
    "enabled": true,
    "path": "n",
    "min": 1,
    "max": 3,
    "defaultValue": 1
  },
  "referenceImages": {
    "mode": "inlineBase64",
    "maxCount": 16,
    "path": "contents[0].parts[]",
    "template": {
      "inlineData": {
        "mimeType": "{{mimeType}}",
        "data": "{{base64}}"
      }
    }
  },
  "extra": [
    {
      "path": "output_format",
      "value": "png"
    },
    {
      "path": "generationConfig.thinkingConfig.includeThoughts",
      "value": false
    }
  ]
}
```

字段约定：

- `prompt`：提示词写入路径，通常不需要配置默认值。
- `aspectRatio`：尺寸/比例选项；前端只展示 `options` 里的项。若某接口的 `auto` 表示“不传字段”，可把该选项写成 `{ "label": "auto", "value": null }`，后端遇到 `null` 不写入对应 path，不再使用 `omitWhen`。
- `resolution`：分辨率选项，支持字符串数组或 `{ label, value }` 数组。前端展示 `label`，后端发送 `value`。
- `quantity`：生成数量支持能力。`enabled: false` 表示该接口不传数量；`enabled: true` 时按 `path` 传递，并用 `min/max/defaultValue` 控制前端选择范围。若文档没有给上限，默认上限为 3；参考图上限默认 16。
- `referenceImages`：参考图模式，支持 `inlineBase64`、`multipart`、`urlArray`、`none`。`urlArray` 仍需要后续 OSS/公网图片托管支持。
- `extra`：接口私有额外参数，使用数组明确表达 path 和 value，避免带点号的字段名和嵌套路径产生歧义。

请求体最终由后端根据这些配置构造，不再要求用户维护完整的第三方原始 body 模板。比如 `extra.path = generationConfig.responseModalities` 会先创建 `generationConfig` 对象，再写入 `responseModalities`。

### 请求体路径语法

路径需要支持：

- 对象路径：`generationConfig.imageConfig.aspectRatio`
- 固定数组下标：`contents[0].parts[0].text`
- 数组追加：`contents[0].parts[]`
- 返回解析数组展开：`candidates[].content.parts[].inlineData.data`

实现上继续使用统一 path 工具：

- `setValueByPath(target, path, value)`
- `appendValueByPath(target, pathEndingWithArrayAppend, value)`
- `getValuesByPath(payload, path)`

### 值转换与选项

值转换不再使用单独的 `map` 字段，而是由 `options` 直接承载：

```json
{
  "resolution": {
    "path": "generationConfig.imageConfig.imageSize",
    "options": [
      { "label": "1k", "value": "1K" },
      { "label": "2k", "value": "2K" }
    ]
  }
}
```

前端展示 `label`，创建任务时仍提交项目内业务值；后端根据配置把业务值解析成 API `value`。如果 option 是普通字符串，则 label 和 value 相同。

### 参考图

参考图在请求体参数配置中独立表达，不能只当普通字段：

```json
{
  "referenceImages": {
    "mode": "inlineBase64",
    "maxCount": 16,
    "path": "contents[0].parts[]",
    "template": {
      "inlineData": {
        "mimeType": "{{mimeType}}",
        "data": "{{base64}}"
      }
    }
  }
}
```

multipart 示例：

```json
{
  "referenceImages": {
    "mode": "multipart",
    "maxCount": 16,
    "fieldName": "image"
  }
}
```

首阶段建议支持：

- `inlineBase64`：从前端 data URL 解析出 `mimeType` 和纯 base64，写入 JSON body。
- `multipart`：把参考图作为文件字段上传，适配 OpenAI 风格接口。
- `none`：该模型不支持参考图。

暂不承诺支持：

- `urlArray`：把参考图变成公网 URL 数组。除非后续接入对象存储或可公网访问的图片托管，否则不能把本地 data URL 伪装成 `image_urls`。

### 返回图片提取

响应配置使用明确路径：

```json
{
  "images": {
    "type": "base64",
    "dataPath": "candidates[].content.parts[].inlineData.data",
    "mimeTypePath": "candidates[].content.parts[].inlineData.mimeType"
  }
}
```

支持类型建议：

- `base64`：路径取纯 base64，结合 `mimeTypePath` 或固定 `mimeType`。
- `url`：路径取远程图片 URL，后端下载后保存到本地。
- `dataUrl`：路径取完整 data URL，后端解析后保存到本地。

其它返回字段可作为扩展 metadata：

```json
{
  "usage": {
    "totalTokensPath": "usageMetadata.totalTokenCount",
    "inputTokensPath": "usageMetadata.promptTokenCount",
    "outputTokensPath": "usageMetadata.candidatesTokenCount"
  }
}
```

`usage.totalTokensPath`、`inputTokensPath`、`outputTokensPath` 分别提取总消耗、输入消耗和输出消耗。若上游不返回总消耗但返回输入/输出消耗，后端会用输入 + 输出补写总消耗。

### 轮询

保留 `deliveryMode = polling`，但轮询也改成模板化：

```json
{
  "polling": {
    "request": {
      "method": "GET",
      "url": "https://api.example.com/v1/tasks/{{taskId}}",
      "headers": {
        "Authorization": "Bearer {{apiKey}}"
      }
    },
    "taskIdPath": "id",
    "statusPath": "status",
    "successValue": "completed",
    "failureValue": "failed",
    "intervalMs": 5000,
    "timeoutMs": 300000,
    "response": {
      "images": {
        "type": "url",
        "urlPath": "result_data[].url"
      }
    }
  }
}
```

创建任务响应先用 `taskIdPath` 提取任务 ID，再按轮询 request 模板发起查询，成功后用轮询 response 配置提取图片。

## 一键预设

配置页需要提供一键填充模板，降低 JSON 配置门槛。

建议首批模板：

- OpenAI 官方结构
- Google 官方结构

预设只填充结构，不填真实密钥。密钥仍在基础配置里填。

## 实现步骤

### 1. shared 类型与 schema

- 新增通用 HTTP 生图配置类型，例如 `ImageProviderHttpConfig`。
- 覆盖 request、请求体参数配置、response、polling；旧 `bindings/referenceImages` 仅作为短期兼容字段，不作为新配置主线。
- 重新定义 `ImageModelConfig` 的核心字段，优先表达新配置模型，而不是围绕旧 `providerType` / `fieldMapping` 打补丁。
- 旧字段是否保留只服务迁移；如果确认可以手动重建配置，则可以直接从共享类型和表单中移除旧字段。

### 2. 数据库实体

- 在 `ImageModelConfigEntity` 新增或替换为 `http_config` simple-json 字段。
- 如果选择推翻重做，可以同步移除旧的协议字段、路径字段、字段映射字段和轮询字段。
- 如果希望减少数据库迁移风险，可以先保留旧列但业务不再读取，等配置重建稳定后再清理。
- `toImageModelConfig`、create/update 接口需要以 `httpConfig` 为主。

### 3. 后端通用 HTTP 执行器

新增通用执行流程：

```text
createImageJob
  -> 读取模型配置
  -> buildHttpRequest(httpConfig, businessParams, apiKey)
  -> axios request
  -> sync: extractImages(responseConfig)
  -> polling: extract taskId -> poll -> extractImages(pollResponseConfig)
  -> save images
```

需要实现：

- 占位符替换：`{{apiKey}}`、`{{prompt}}`、`{{taskId}}` 等。
- 请求头构建，日志打印时必须脱敏 key。
- 请求体参数配置解析：从空对象开始写入 `extra` 固定参数，再按 `prompt/aspectRatio/resolution/quantity/referenceImages` 的 path 生成最终 body。
- multipart body 构建。
- data URL 解析为 `{ mimeType, base64, buffer }`。
- 响应路径提取和图片保存。
- provider 请求前打印最终 URL、headers 脱敏结果、body 摘要；base64 只截断。

### 4. 旧配置处理策略

旧配置不是必须兼容，提供两种选择：

- **推荐策略：推翻重做。** 配置页只保存新 `httpConfig`，现有模型配置需要手动重建。实现简单，避免长期维护两套 provider。
- **过渡策略：短期 fallback。** 若配置有 `httpConfig`，走新通用执行器；若没有，继续走旧 provider。该策略适合担心现有配置丢失，但会增加测试面和代码复杂度。

本次核心功能建议优先按“推翻重做”设计，只有在确认必须保留存量配置时才引入 fallback。

### 5. 前端配置页

配置 Dialog 改为两个 Tab：

- 基础配置：名称、启用、密钥、交付方式、模型快照。
- HTTP 模板：请求地址、method、Content-Type，以及拆分后的请求头、请求体、返回格式表单。

前端需要提供：

- 请求头键值行编辑。
- 请求体字段表单：提示词路径、尺寸比例选项、分辨率选项、数量启用和上下限、参考图模式/上限/路径/模板、额外参数 path/value。
- 返回格式字段表单：图片类型、数据路径或 URL 路径、MIME 路径、固定 MIME、总 token 路径、输入 token 路径和输出 token 路径。
- 轮询配置表单：`deliveryMode = polling` 时维护轮询请求、请求头、任务 ID 路径、状态路径、成功/失败状态值、间隔、超时和可选独立返回格式。
- 保存前将表单草稿封装为后端持久化的 `httpConfig` JSON；校验失败时禁用保存并展示错误。
- 请求头、请求体、返回格式标题右侧提供 OpenAI / Google 官方结构模板填充按钮，不展示第三方中转商快捷模板。
- “请求预览”区域可作为后续增强：展示根据当前页面业务参数模拟后的最终请求体，便于调试。

### 6. 日志与调试

- 请求前日志必须打印最终请求结构，而不是内部业务参数。
- headers 中包含 `authorization`、`api-key`、`x-goog-api-key`、`token` 等字段时脱敏。
- body 中 base64、data URL、Blob 文件只显示前 25 位或文件摘要。
- 响应错误日志继续沿用当前多行 JSON 摘要。

### 7. 测试

后端单测：

- JSON 模板写入嵌套对象路径。
- 数组路径 `contents[0].parts[]` 追加参考图。
- response path 从 `candidates[].content.parts[].inlineData.data` 提取多张图片。
- URL 类型图片下载。
- polling 创建任务和结果轮询。
- headers 占位符替换且日志脱敏。
- 若选择过渡策略，再补充旧配置 fallback 测试；若选择推翻重做，则不需要保留旧 provider 测试。

前端验证：

- OpenAI / Google 官方结构模板可按请求头、请求体、返回格式分段填充。
- 表单草稿封装前能拦截缺失请求地址、提示词路径、数量范围错误、参考图模式错误、额外参数 JSON 值错误和返回路径错误。
- Gemini 类完整 endpoint 不再依赖单独模型名字段，模型名只作为配置和历史展示快照。

## 风险与边界

- 过度自由的 JSON 模板会降低可维护性，需要预设和校验兜底。
- 不支持用户写脚本或表达式，避免安全风险和调试复杂度。
- 不在第一阶段支持公网 `image_urls`，除非先设计图片托管。
- 不允许前端回显真实 API key。
- 不建议用“扫描属性名”作为正式响应提取策略，同名字段必须用完整路径。
- multipart 与 JSON 是不同 contentType，不能只靠 body JSON 描述所有文件上传细节。

## 待确认问题

- 是否确认采用“推翻重做”，允许现有生图模型配置手动重建？ 确认推翻重做。
- 如果不推翻重做，旧配置 fallback 需要保留多久？ 推翻重做。
- 配置页 JSON 编辑器第一版是否用 textarea 即可？ 可以。
- 是否需要把 token 消耗等 metadata 持久化到 `image_job`，还是只先打印日志？ 当前持久化总 token、输入 token、输出 token 三个字段。
- API key 是否坚持继续单独加密存储，并在 headers JSON 中只使用 `{{apiKey}}`？ 可以。
- 是否第一阶段只支持 `inlineBase64` 和 `multipart` 两种参考图模式，暂不支持 `image_urls`？ 需要预留位置。这个需要本项目额外适配OSS配置，以后需要实现。

## 建议实施顺序

1. shared schema 与实体重定义为 `httpConfig` 优先的模型配置。
2. 后端实现 path 工具、模板渲染、响应提取。
3. 后端实现通用 HTTP executor，并替换旧 provider 主流程。
4. 添加 OpenAI / Google 官方结构模板作为首批验证样例。
5. 前端配置页落地“基础配置 / HTTP 模板”两页，HTTP 模板用表单分别编辑请求头、请求体、返回格式，并在每段标题右侧提供官方模板填充。
6. 更新后端和前端规格文档。
7. 跑 shared build、api build/test、web lint/build。
## 实施进度

1. [x] 2026-07-02 新增 shared `configurable-http` provider 类型与 `httpConfig` schema，并通过 `@ai-image-codexu/shared` 构建验证。
2. [x] 2026-07-02 后端接入 `http_config`、`token_usage` 字段，新增通用 HTTP executor、嵌套路径读写、参考图注入、同步/轮询响应提取，并通过 `@ai-image-codexu/api` build/test。
3. [x] 2026-07-02 前端配置页改为“基础配置 / HTTP 模板”两页，新增 HTTP 模板 textarea、JSON parse 校验和官方 OpenAI / Google 结构模板，并通过 `@ai-image-codexu/web` lint/build。
4. [x] 2026-07-02 同步更新 `docs/design/image-provider-config.md`、`docs/specs/backend.md`、`docs/specs/frontend.md`、`docs/todo/todo.md` 和 `docs/pitfalls.md`，文档口径统一为 `configurable-http` 通用 HTTP executor。
5. [x] 2026-07-02 完成最终验证：`@ai-image-codexu/shared` build、`@ai-image-codexu/api` build/test、`@ai-image-codexu/web` lint/build 均通过；web build 仅有 Vite chunk 超 500k 警告。
6. [x] 2026-07-02 按用户反馈移除第三方快捷填充，将 HTTP 模板拆为请求头、请求体、返回格式三段编辑；每段标题右侧只保留 OpenAI / Google 官方结构模板填充，并通过 `@ai-image-codexu/web` lint/build。
7. [x] 2026-07-02 修正请求体模板按钮的联动范围：点击 OpenAI / Google 请求体模板时保留当前请求地址，只更新请求体分段。
8. [x] 2026-07-03 将请求体分段从“原始 body + bindings”调整为“项目字段 body 参数配置”，同步 shared schema、后端请求组装、前端预设/生成页动态选项，并通过 `@ai-image-codexu/shared` build、`@ai-image-codexu/api` build/test、`@ai-image-codexu/web` lint/build；web build 仅保留 Vite chunk 超 500k 警告。
9. [x] 2026-07-03 将配置页 HTTP 模板从三段 JSON textarea 重构为结构化表单草稿，保存前封装为 `httpConfig` JSON；补充 polling 轮询配置表单，请求头、请求体和返回格式分段预设仍只替换对应分段，并通过 `@ai-image-codexu/web` lint/build。
10. [x] 2026-07-03 新增 AI 配置生成入口：配置 Dialog 增加 AI 配置页签，后端复用辅助模型把文档 URL/文本转换为 `configurable-http` 配置，生成结果强制未启用且不写入 API key，并在模型启用路径增加可解密密钥检查。
11. [x] 2026-07-04 重写 AI 配置生成提示词：补充基础生图参数完整生成规则、OpenAI/Google 缺省补齐策略、参考图模式选择、extra 固定参数、响应提取和 polling 规则，避免生成只可落库但缺少可用配置的记录。
12. [x] 2026-07-05 扩展 token 消耗记录：`response.usage` 增加输入/输出 token 路径，`image_job` 增加 `input_token_usage` 与 `output_token_usage`，上游缺少总消耗时由输入 + 输出自动补总消耗。
