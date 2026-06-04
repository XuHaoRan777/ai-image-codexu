import { z } from 'zod';

export const imageModelTypes = ['gpt-image-2', 'nano-banana-2'] as const;

export const assistantProviderModes = ['openai', 'claude'] as const;

export const imageJobStatuses = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const;

export const aspectRatios = ['1:1', '4:3', '3:4', '16:9', '9:16'] as const;

export const imageResolutions = ['0.5k', '1k', '2k', '4k'] as const;

export const imageQuantities = [1, 2, 3, 4] as const;

export enum ApiResponseCode {
  Success = 200,
  Created = 201,
  Accepted = 202,
  NoContent = 204,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  Conflict = 409,
  UnprocessableEntity = 422,
  TooManyRequests = 429,
  InternalServerError = 500,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
}

const apiResponseCodeValues = Object.values(ApiResponseCode).filter(
  (value): value is ApiResponseCode => typeof value === 'number',
);

export const apiSuccessResponseCodes = [
  ApiResponseCode.Success,
  ApiResponseCode.Created,
  ApiResponseCode.Accepted,
  ApiResponseCode.NoContent,
] as const;

export function isApiResponseCode(code: number): code is ApiResponseCode {
  return apiResponseCodeValues.includes(code as ApiResponseCode);
}

export function isApiSuccessResponseCode(code: ApiResponseCode) {
  return (apiSuccessResponseCodes as readonly ApiResponseCode[]).includes(code);
}

export function toApiResponseCode(code: number): ApiResponseCode {
  return isApiResponseCode(code)
    ? code
    : ApiResponseCode.InternalServerError;
}

export const apiResponseCodeSchema = z.custom<ApiResponseCode>(
  (value) => typeof value === 'number' && isApiResponseCode(value),
);

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    code: apiResponseCodeSchema,
    message: z.string(),
    data: dataSchema,
  });

export const imageModelConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1, '配置名称不能为空'),
  modelType: z.enum(imageModelTypes),
  baseUrl: z.url('请求地址格式不正确'),
  apiKeyMasked: z.string().optional(),
  modelNameOverride: z.string().optional(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createImageModelConfigSchema = imageModelConfigSchema
  .omit({
    id: true,
    apiKeyMasked: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    apiKey: z.string().min(1, '密钥不能为空'),
  });

export const updateImageModelConfigSchema = createImageModelConfigSchema
  .partial()
  .extend({
    apiKey: z.string().optional(),
  });

export const assistantModelConfigSchema = z.object({
  mode: z.enum(assistantProviderModes),
  baseUrl: z.url('请求地址格式不正确').or(z.literal('')),
  apiKeyMasked: z.string().optional(),
  modelName: z.string(),
  enabled: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export const updateAssistantModelConfigSchema = z.object({
  mode: z.enum(assistantProviderModes),
  baseUrl: z.url('请求地址格式不正确').or(z.literal('')),
  apiKey: z.string().optional(),
  modelName: z.string(),
  enabled: z.boolean(),
});

export const promptOptimizeRequestSchema = z.object({
  prompt: z.string().min(1, '提示词不能为空'),
});

export const promptOptimizeResponseSchema = z.object({
  originalPrompt: z.string(),
  optimizedPrompt: z.string(),
});

export const createImageJobSchema = z.object({
  configId: z.string().min(1, '请选择生图模型配置'),
  prompt: z.string().min(1, '提示词不能为空'),
  aspectRatio: z.enum(aspectRatios),
  resolution: z.enum(imageResolutions),
  quantity: z.number().int().min(1).max(4),
  referenceImages: z.array(z.string()).max(6).optional(),
});

export const imageJobSchema = z.object({
  id: z.string(),
  configId: z.string(),
  configName: z.string(),
  modelType: z.enum(imageModelTypes),
  prompt: z.string(),
  aspectRatio: z.enum(aspectRatios),
  resolution: z.enum(imageResolutions),
  quantity: z.number().int().min(1).max(4),
  referenceImages: z.array(z.string()).max(6).optional(),
  status: z.enum(imageJobStatuses),
  imageUrl: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ImageModelType = (typeof imageModelTypes)[number];
export type AssistantProviderMode = (typeof assistantProviderModes)[number];
export type ImageJobStatus = (typeof imageJobStatuses)[number];
export type AspectRatio = (typeof aspectRatios)[number];
export type ImageResolution = (typeof imageResolutions)[number];
export type ImageQuantity = (typeof imageQuantities)[number];

export type ApiResponse<T> = {
  code: ApiResponseCode;
  message: string;
  data: T;
};

export type ImageModelConfig = z.infer<typeof imageModelConfigSchema>;
export type CreateImageModelConfigInput = z.infer<
  typeof createImageModelConfigSchema
>;
export type UpdateImageModelConfigInput = z.infer<
  typeof updateImageModelConfigSchema
>;
export type AssistantModelConfig = z.infer<typeof assistantModelConfigSchema>;
export type UpdateAssistantModelConfigInput = z.infer<
  typeof updateAssistantModelConfigSchema
>;
export type PromptOptimizeRequest = z.infer<typeof promptOptimizeRequestSchema>;
export type PromptOptimizeResponse = z.infer<
  typeof promptOptimizeResponseSchema
>;
export type CreateImageJobInput = z.infer<typeof createImageJobSchema>;
export type ImageJob = z.infer<typeof imageJobSchema>;
