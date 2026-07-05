# 可配置 HTTP 生图 Provider 设计

## 背景

生图的本质是后端根据模型配置，使用 axios 发起一次第三方 HTTP 请求，并把返回的图片保存到本地 `IMAGE_STORAGE_PATH`。旧方案把 OpenAI、Google 和部分中转商拆成不同 provider 分支，接入新平台时仍要改后端代码。

新方案把生图 provider 收敛为一个通用 HTTP 模板执行器。模型配置负责描述请求头、请求体、参考图注入方式、同步或轮询交付方式，以及响应图片和 token 消耗的提取路径。

## 设计目标

- 新接入主流兼容接口时优先只改配置，不新增后端 provider 方法。
- 配置页只暴露稳定业务参数：提示词、尺寸、分辨率、数量、参考图。
- 请求头使用 JSON 对象配置；请求体使用“项目业务字段 -> 第三方 API path/value”的参数配置，后端运行时生成最终请求体。
- API key 继续由后端加密保存，模板中只使用 `{{apiKey}}` 占位符。
- 返回图片使用完整路径提取，避免按同名字段扫描导致误取。
- 支持同步返回和任务轮询两种交付方式。
- 请求日志打印最终实际请求，headers 脱敏，图片 base64 只显示前 25 位。

## 核心配置

生图模型配置以 `providerType = configurable-http` 和 `httpConfig` 为核心。旧的 `openai-compatible`、`google-compatible`、`fieldMapping`、`fieldOverrides`、`pollingConfig` 字段只作为历史过渡字段保留，不再作为新主流程。

`httpConfig` 顶层结构：

```json
{
  "request": {
    "method": "POST",
    "url": "https://api.example.com/v1/images",
    "contentType": "json",
    "headers": {
      "Authorization": "Bearer {{apiKey}}"
    },
    "body": {
      "prompt": { "path": "prompt" },
      "aspectRatio": {
        "path": "size",
        "options": [{ "label": "1:1", "value": "1024x1024" }]
      },
      "quantity": {
        "enabled": true,
        "path": "n",
        "min": 1,
        "max": 3,
        "defaultValue": 1
      },
      "referenceImages": { "mode": "none", "maxCount": 16 },
      "extra": [{ "path": "model", "value": "gpt-image-2" }]
    }
  },
  "response": {},
  "polling": {}
}
```

## 请求模板

`request` 描述创建任务或同步生图的实际 HTTP 请求：

- `method`：`GET` 或 `POST`，当前主要使用 `POST`。
- `url`：完整请求地址，可使用 `{{apiKey}}`、`{{prompt}}`、`{{aspectRatio}}`、`{{resolution}}`、`{{quantity}}` 占位符。
- `contentType`：`json` 或 `multipart`。
- `headers`：JSON 对象，值可使用占位符。
- `body`：请求体参数配置，第一层 key 固定为项目业务字段，真实请求体由后端按 path 生成。

API key 不写入可回显配置，只在 headers 或 URL 中通过 `{{apiKey}}` 注入。

## 请求体参数配置

`request.body` 不再保存第三方原始 body 模板，而是描述项目业务字段如何写入第三方请求体：

```json
{
  "prompt": {
    "path": "contents[0].parts[0].text"
  },
  "aspectRatio": {
    "path": "generationConfig.imageConfig.aspectRatio",
    "options": [
      { "label": "auto", "value": null },
      { "label": "1:1", "value": "1:1" }
    ]
  },
  "resolution": {
    "path": "generationConfig.imageConfig.imageSize",
    "options": [
      { "label": "1k", "value": "1K" },
      { "label": "2k", "value": "2K" }
    ]
  },
  "quantity": {
    "path": "candidateCount",
    "enabled": false,
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
```

支持能力：

- `path`：写入路径，支持 `a.b`、`a[0].b`、`a.b[]`。
- `enabled: false`：不发送该业务参数。
- `options`：前端展示 `label`，后端发送 `value`；`value: null` 表示不写入该 path。
- `min/max/defaultValue`：控制数量选择范围；文档没有上限时默认按 3 处理。
- `referenceImages.maxCount`：参考图上限，未配置时默认 16。
- `extra`：第三方私有固定参数，按 path/value 写入最终请求体。

后端生成最终请求体时先写入 `extra`，再写入提示词、尺寸、分辨率、数量和参考图，最后才发起 axios 请求。

## 参考图

参考图在 `request.body.referenceImages` 中独立表达，不当作普通字符串字段处理。

第一阶段支持：

- `inlineBase64`：从前端 data URL 解析 `mimeType` 与纯 base64，写入 JSON body。
- `multipart`：把参考图作为文件字段追加到 multipart 表单。
- `none`：该模型不支持参考图。

预留但暂不实现：

- `urlArray`：需要先接入 OSS 或其它公网可访问图片托管，不能把本地 data URL 伪装成公网 URL。

inline 示例：

```json
{
  "mode": "inlineBase64",
  "path": "contents[0].parts[]",
  "template": {
    "inlineData": {
      "mimeType": "{{mimeType}}",
      "data": "{{base64}}"
    }
  }
}
```

multipart 示例：

```json
{
  "mode": "multipart",
  "fieldName": "image"
}
```

## 响应提取

`response.images` 描述图片所在路径：

```json
{
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
```

支持图片类型：

- `base64`：路径取纯 base64，结合 `mimeTypePath` 或固定 `mimeType` 保存。
- `dataUrl`：路径取完整 data URL。
- `url`：路径取远程图片 URL，后端下载后保存到本地。

路径必须是完整层级路径，支持数组展开 `[]`，不支持全对象扫描属性名。`usage.totalTokensPath`、`inputTokensPath`、`outputTokensPath` 分别保存到 `image_job.token_usage`、`input_token_usage`、`output_token_usage`；如果未返回总消耗但输入/输出都存在，后端会自动用两者相加补总消耗。

## 轮询交付

当模型配置 `deliveryMode = polling` 时，`httpConfig.polling` 必填。

```json
{
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
```

创建请求先按 `taskIdPath` 提取任务 ID，再按轮询 request 模板请求任务状态。成功后优先使用 `polling.response` 提取图片；未配置时回退到顶层 `response`。

## 执行流程

```text
POST /api/image-jobs
  -> 读取启用的 image_model_config
  -> 写入 queued 任务
  -> 解密 API key
  -> 使用 httpConfig 组装最终请求
  -> 打印脱敏后的最终请求日志
  -> axios 请求第三方接口
  -> sync 直接提取图片，polling 轮询后提取图片
  -> 保存图片到 IMAGE_STORAGE_PATH
  -> image_job 写入 image_url / image_urls / token_usage / input_token_usage / output_token_usage 并置为 succeeded
```

失败时硬删除任务记录，前端轮询收到 404 后提示失败且不保留历史。

## 配置页

第一版配置页使用两个 Tab：

- 基础配置：名称、交付方式、模型快照、密钥、启用状态。
- HTTP 模板：请求地址、方法、Content-Type、请求头、请求体参数、返回格式。

HTTP 模板页使用前端表单草稿编辑，保存前再封装为后端持久化的 `httpConfig` JSON：

- 请求头：键值行，支持 `{{apiKey}}` 占位符。
- 请求体：按项目业务字段维护提示词路径、尺寸比例选项、分辨率选项、数量支持范围、参考图模式和额外参数。
- 返回格式：维护图片类型、图片路径、MIME 路径、固定 MIME、总 token 路径、输入 token 路径和输出 token 路径。
- 轮询配置：当交付方式为 polling 时维护轮询请求、任务 ID 路径、状态路径、成功/失败状态值、间隔、超时和可选独立返回格式。

额外参数值、参考图 inline 模板等复杂值仍按单个 JSON 值解析；表单校验失败时禁用保存并展示错误。

结构模板只保留官方 provider：

- OpenAI
- Google

每个分段标题右侧提供 OpenAI / Google 填充按钮。预设只填结构，不包含真实密钥。密钥仍在基础配置中单独填写，并由后端加密保存。

## 边界

- 本次采用推翻重做，旧模型配置允许手动重建。
- 不支持用户编写脚本或表达式。
- 不支持按属性名全局扫描响应对象。
- 不在前端回显真实 API key。
- 不把第三方返回图片 URL 直接交给前端，必须先落本地图片存储。
- `urlArray` 参考图模式只预留，等后续接入 OSS 或公网图片托管后实现。

## 验证命令

```bash
pnpm --filter @ai-image-codexu/shared build
pnpm --filter @ai-image-codexu/api build
pnpm --filter @ai-image-codexu/api test
pnpm --filter @ai-image-codexu/web lint
pnpm --filter @ai-image-codexu/web build
```
