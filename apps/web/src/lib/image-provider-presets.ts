import type { ImageProviderHttpConfig } from "@ai-image-codexu/shared"

export type ImageProviderHttpPreset = {
  id: "openai" | "google"
  label: string
  deliveryMode: "sync" | "polling"
  modelName: string
  config: ImageProviderHttpConfig
}

export type ImageProviderHttpSection = "headers" | "body" | "response"

// 这里的 preset 不是完整的“第三方平台配置”，而是官方 OpenAI/Google 的结构模板。
// UI 会按请求头、请求体参数、返回格式分段套用；body 分段不是最终请求体，
// 而是告诉后端运行时应把提示词、尺寸、分辨率、数量和参考图写到哪些 API path。
export const imageProviderHttpPresets: ImageProviderHttpPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    deliveryMode: "sync",
    modelName: "gpt-image-2",
    config: {
      request: {
        method: "POST",
        url: "",
        contentType: "json",
        headers: {
          Authorization: "Bearer {{apiKey}}",
          "Content-Type": "application/json",
        },
        body: {
          prompt: {
            path: "prompt",
          },
          aspectRatio: {
            path: "size",
            options: [
              { label: "auto", value: "auto" },
              { label: "1:1", value: "1024x1024" },
              { label: "4:3", value: "1536x1024" },
              { label: "3:4", value: "1024x1536" },
              { label: "16:9", value: "1536x864" },
              { label: "9:16", value: "864x1536" },
            ],
          },
          resolution: {
            path: "quality",
            options: [
              { label: "0.5k", value: "low" },
              { label: "1k", value: "medium" },
              { label: "2k", value: "high" },
              { label: "4k", value: "high" },
            ],
          },
          quantity: {
            enabled: true,
            path: "n",
            min: 1,
            max: 4,
            defaultValue: 1,
          },
          referenceImages: {
            mode: "none",
            maxCount: 16,
          },
          extra: [
            {
              path: "model",
              value: "gpt-image-2",
            },
            {
              path: "response_format",
              value: "b64_json",
            },
          ],
        },
      },
      response: {
        images: {
          type: "base64",
          dataPath: "data[].b64_json",
          mimeType: "image/png",
        },
      },
    },
  },
  {
    id: "google",
    label: "Google",
    deliveryMode: "sync",
    modelName: "gemini-2.5-flash-image-preview",
    config: {
      request: {
        method: "POST",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent",
        contentType: "json",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": "{{apiKey}}",
        },
        body: {
          prompt: {
            path: "contents[0].parts[0].text",
          },
          aspectRatio: {
            path: "generationConfig.imageConfig.aspectRatio",
            options: [
              { label: "auto", value: null },
              { label: "1:1", value: "1:1" },
              { label: "4:3", value: "4:3" },
              { label: "3:4", value: "3:4" },
              { label: "16:9", value: "16:9" },
              { label: "9:16", value: "9:16" },
            ],
          },
          resolution: {
            path: "generationConfig.imageConfig.imageSize",
            options: [
              { label: "0.5k", value: "512" },
              { label: "1k", value: "1K" },
              { label: "2k", value: "2K" },
              { label: "4k", value: "4K" },
            ],
          },
          quantity: {
            enabled: false,
            path: "candidateCount",
            min: 1,
            max: 3,
            defaultValue: 1,
          },
          referenceImages: {
            mode: "inlineBase64",
            maxCount: 16,
            path: "contents[0].parts[]",
            template: {
              inlineData: {
                mimeType: "{{mimeType}}",
                data: "{{base64}}",
              },
            },
          },
          extra: [
            {
              path: "generationConfig.responseModalities",
              value: ["IMAGE"],
            },
          ],
        },
      },
      response: {
        images: {
          type: "base64",
          dataPath: "candidates[].content.parts[].inlineData.data",
          mimeTypePath: "candidates[].content.parts[].inlineData.mimeType",
        },
        usage: {
          totalTokensPath: "usageMetadata.totalTokenCount",
          inputTokensPath: "usageMetadata.promptTokenCount",
          outputTokensPath: "usageMetadata.candidatesTokenCount",
        },
      },
    },
  },
]

export const defaultImageProviderHttpPreset = imageProviderHttpPresets[0]

export function formatJsonSection(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

export function getHttpConfigSection(
  config: ImageProviderHttpConfig,
  section: ImageProviderHttpSection,
) {
  switch (section) {
    case "headers":
      return config.request.headers ?? {}
    case "body":
      return config.request.body ?? {}
    case "response":
      return config.response
  }
}
