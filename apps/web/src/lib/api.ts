import type {
  ApiResponse,
  AssistantModelConfig,
  CreateImageJobInput,
  CreateImageModelConfigInput,
  ImageJob,
  ImageRecognitionResponse,
  ImageModelConfig,
  PromptOptimizeResponse,
  UpdateAssistantModelConfigInput,
  UpdateImageModelConfigEnabledInput,
  UpdateImageModelConfigInput,
} from "@ai-image-codexu/shared"
import { isApiSuccessResponseCode } from "@ai-image-codexu/shared"
import axios, { AxiosError, type AxiosResponse } from "axios"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "/api"

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

http.interceptors.response.use(
  <T>(response: AxiosResponse<ApiResponse<T>>) => {
    const payload = response.data

    if (!isApiSuccessResponseCode(payload.code)) {
      throw new Error(payload.message)
    }

    return payload.data
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const message =
      error.response?.data?.message ?? error.message ?? "Request failed"

    return Promise.reject(new Error(message))
  },
)

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  data?: unknown
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET"

  switch (method) {
    case "POST":
      return http.post<unknown, T>(path, options.data)
    case "PUT":
      return http.put<unknown, T>(path, options.data)
    case "PATCH":
      return http.patch<unknown, T>(path, options.data)
    case "DELETE":
      return http.delete<unknown, T>(path)
    case "GET":
      return http.get<unknown, T>(path)
  }
}

export const api = {
  listImageModelConfigs: () =>
    request<ImageModelConfig[]>("/image-model-configs"),
  createImageModelConfig: (input: CreateImageModelConfigInput) =>
    request<ImageModelConfig>("/image-model-configs", {
      method: "POST",
      data: input,
    }),
  updateImageModelConfig: (id: string, input: UpdateImageModelConfigInput) =>
    request<ImageModelConfig>(`/image-model-configs/${id}`, {
      method: "PATCH",
      data: input,
    }),
  updateImageModelConfigEnabled: (
    id: string,
    input: UpdateImageModelConfigEnabledInput,
  ) =>
    request<ImageModelConfig>(`/image-model-configs/${id}/enabled`, {
      method: "PATCH",
      data: input,
    }),
  deleteImageModelConfig: (id: string) =>
    request<{ deleted: true }>(`/image-model-configs/${id}`, {
      method: "DELETE",
    }),
  getAssistantConfig: () => request<AssistantModelConfig>("/assistant-config"),
  updateAssistantConfig: (input: UpdateAssistantModelConfigInput) =>
    request<AssistantModelConfig>("/assistant-config", {
      method: "PUT",
      data: input,
    }),
  optimizePrompt: (prompt: string) =>
    request<PromptOptimizeResponse>("/prompt/optimize", {
      method: "POST",
      data: { prompt },
    }),
  recognizeImage: (input: { imageDataUrl: string; prompt: string }) =>
    request<ImageRecognitionResponse>("/image/recognize", {
      method: "POST",
      data: input,
    }),
  createImageJob: (input: CreateImageJobInput) =>
    request<ImageJob>("/image-jobs", {
      method: "POST",
      data: input,
    }),
  listImageJobs: () => request<ImageJob[]>("/image-jobs"),
  getImageJob: (id: string) => request<ImageJob>(`/image-jobs/${id}`),
  deleteImageJob: (id: string) =>
    request<{ deleted: true }>(`/image-jobs/${id}`, {
      method: "DELETE",
    }),
}
