import { z } from 'zod';

export enum ImageProviderTypeEnum {
  ConfigurableHttp = 'configurable-http',
  OpenAICompatible = 'openai-compatible',
  GoogleCompatible = 'google-compatible',
}

export const imageProviderTypes = [
  ImageProviderTypeEnum.ConfigurableHttp,
  ImageProviderTypeEnum.OpenAICompatible,
  ImageProviderTypeEnum.GoogleCompatible,
] as const;

export const imageProviderDeliveryModes = ['sync', 'polling'] as const;

export const imageProviderFieldKeys = [
  'model',
  'prompt',
  'size',
  'quantity',
  'quality',
  'resolution',
  'responseFormat',
  'image',
] as const;

export const assistantProviderModes = ['openai', 'claude'] as const;

export const imageJobStatuses = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const;

export const aspectRatios = [
  'auto',
  '1:1',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
] as const;

export const imageResolutions = ['0.5k', '1k', '2k', '4k'] as const;

export const imageQuantities = [1, 2, 3, 4] as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

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

export const imageProviderFieldMappingSchema = z
  .object({
    model: z.string().optional(),
    prompt: z.string().optional(),
    size: z.string().optional(),
    quantity: z.string().optional(),
    quality: z.string().optional(),
    resolution: z.string().optional(),
    responseFormat: z.string().optional(),
    image: z.string().optional(),
  })
  .optional();

export const imageProviderFieldOverridesSchema = z
  .object({
    model: z.boolean().optional(),
    prompt: z.boolean().optional(),
    size: z.boolean().optional(),
    quantity: z.boolean().optional(),
    quality: z.boolean().optional(),
    resolution: z.boolean().optional(),
    responseFormat: z.boolean().optional(),
    image: z.boolean().optional(),
  })
  .optional();

export const imageProviderPollingConfigSchema = z
  .object({
    taskIdPath: z.string().optional(),
    pollPathTemplate: z.string().optional(),
    statusPath: z.string().optional(),
    successStatusValue: z.string().optional(),
    failureStatusValue: z.string().optional(),
    resultUrlsPath: z.string().optional(),
    intervalMs: z.number().int().min(1000).max(60000).optional(),
    timeoutMs: z.number().int().min(10000).max(600000).optional(),
  })
  .optional();

export const imageProviderHttpContentTypes = ['json', 'multipart'] as const;

export const imageProviderHttpImageValueTypes = [
  'base64',
  'url',
  'dataUrl',
] as const;

export const imageProviderReferenceImageModes = [
  'none',
  'inlineBase64',
  'multipart',
  'urlArray',
] as const;

const imageProviderHttpOptionSchema = z.union([
  z.object({
    label: z.string().min(1),
    value: jsonValueSchema.optional(),
  }),
  jsonValueSchema,
]);

const imageProviderHttpBodyFieldSchema = z.object({
  enabled: z.boolean().optional(),
  path: z.string().optional(),
  options: z.array(imageProviderHttpOptionSchema).optional(),
  defaultValue: jsonValueSchema.optional(),
});

const imageProviderHttpQuantityFieldSchema = z.object({
  enabled: z.boolean().optional(),
  path: z.string().optional(),
  min: z.number().int().min(1).optional(),
  max: z.number().int().min(1).max(16).optional(),
  defaultValue: z.number().int().min(1).max(16).optional(),
});

export const imageProviderHttpReferenceImagesSchema = z
  .object({
    mode: z.enum(imageProviderReferenceImageModes).default('none'),
    maxCount: z.number().int().min(0).max(16).optional(),
    path: z.string().optional(),
    fieldName: z.string().optional(),
    template: jsonValueSchema.optional(),
  })
  .optional();

const imageProviderHttpExtraBodyParamSchema = z.object({
  path: z.string().min(1),
  value: jsonValueSchema,
});

export const imageProviderHttpBodyConfigSchema = z.object({
  prompt: imageProviderHttpBodyFieldSchema.optional(),
  aspectRatio: imageProviderHttpBodyFieldSchema.optional(),
  resolution: imageProviderHttpBodyFieldSchema.optional(),
  quantity: imageProviderHttpQuantityFieldSchema.optional(),
  referenceImages: imageProviderHttpReferenceImagesSchema,
  extra: z.array(imageProviderHttpExtraBodyParamSchema).optional(),
}).strict();

export const imageProviderHttpRequestSchema = z.object({
  method: z.enum(['GET', 'POST']).default('POST'),
  url: z.string().min(1, 'Request URL is required'),
  contentType: z.enum(imageProviderHttpContentTypes).default('json'),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.union([imageProviderHttpBodyConfigSchema, jsonValueSchema]).optional(),
});

export const imageProviderHttpBindingSchema = z.object({
  path: z.string().optional(),
  enabled: z.boolean().optional(),
  omitWhen: jsonValueSchema.optional(),
  map: z.record(z.string(), jsonValueSchema).optional(),
  defaultValue: jsonValueSchema.optional(),
});

export const imageProviderHttpBindingsSchema = z
  .object({
    prompt: imageProviderHttpBindingSchema.optional(),
    aspectRatio: imageProviderHttpBindingSchema.optional(),
    resolution: imageProviderHttpBindingSchema.optional(),
    quantity: imageProviderHttpBindingSchema.optional(),
  })
  .optional();

export const imageProviderHttpImageResponseSchema = z.object({
  type: z.enum(imageProviderHttpImageValueTypes),
  dataPath: z.string().optional(),
  urlPath: z.string().optional(),
  mimeTypePath: z.string().optional(),
  mimeType: z.string().optional(),
});

export const imageProviderHttpResponseSchema = z.object({
  images: imageProviderHttpImageResponseSchema,
  metadata: z.record(z.string(), z.string()).optional(),
  usage: z
    .object({
      totalTokensPath: z.string().optional(),
    })
    .optional(),
});

export const imageProviderHttpPollingSchema = z
  .object({
    request: imageProviderHttpRequestSchema,
    taskIdPath: z.string().min(1, 'Task ID path is required'),
    statusPath: z.string().min(1, 'Status path is required'),
    successValue: z.string().min(1, 'Success status value is required'),
    failureValue: z.string().optional(),
    intervalMs: z.number().int().min(1000).max(60000).optional(),
    timeoutMs: z.number().int().min(10000).max(600000).optional(),
    response: imageProviderHttpResponseSchema.optional(),
  })
  .optional();

export const imageProviderHttpConfigSchema = z.object({
  request: imageProviderHttpRequestSchema,
  bindings: imageProviderHttpBindingsSchema,
  referenceImages: imageProviderHttpReferenceImagesSchema,
  response: imageProviderHttpResponseSchema,
  polling: imageProviderHttpPollingSchema,
});

/**
 * OpenAI 模式必须填模型名(作请求体参数);Google 模式模型名在完整请求地址里,可留空。
 * 校验以 superRefine 挂在最外层,基础 object 单独抽出供 update schema 派生 partial。
 */
function requireModelNameForOpenAi(
  value: {
    providerType: ImageProviderType;
    deliveryMode?: ImageProviderDeliveryMode;
    modelName?: string;
    httpConfig?: ImageProviderHttpConfig;
  },
  ctx: z.RefinementCtx,
) {
  if (
    value.providerType === ImageProviderTypeEnum.OpenAICompatible &&
    !value.modelName?.trim()
  ) {
    ctx.addIssue({
      code: 'custom',
      message: '模型名称不能为空',
      path: ['modelName'],
    });
  }

  if (
    value.providerType === ImageProviderTypeEnum.ConfigurableHttp &&
    !value.httpConfig
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'HTTP 请求模板不能为空',
      path: ['httpConfig'],
    });
  }

  if (
    value.providerType === ImageProviderTypeEnum.ConfigurableHttp &&
    value.deliveryMode === 'polling' &&
    !value.httpConfig?.polling
  ) {
    ctx.addIssue({
      code: 'custom',
      message: '轮询交付需要配置 polling',
      path: ['httpConfig', 'polling'],
    });
  }
}

export const imageModelConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1, '配置名称不能为空'),
  providerType: z.enum(imageProviderTypes),
  deliveryMode: z.enum(imageProviderDeliveryModes),
  baseUrl: z.url('请求地址格式不正确').or(z.literal('')),
  generationPath: z.string().optional(),
  editPath: z.string().optional(),
  apiKeyMasked: z.string().optional(),
  // Google 模式模型名在完整 URL 里,故整体可选;OpenAI 模式的必填由 create/update schema 校验
  modelName: z.string().optional(),
  fieldMapping: imageProviderFieldMappingSchema,
  fieldOverrides: imageProviderFieldOverridesSchema,
  pollingConfig: imageProviderPollingConfigSchema,
  httpConfig: imageProviderHttpConfigSchema.optional(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * 生图模型配置的基础字段(不含条件校验)。
 * 单独抽出是为了让 update schema 能安全地 .partial() ——
 * 若直接对挂了 superRefine 的 schema 调用 .partial(),会因它变成 ZodEffects 而丢失 .partial()。
 */
const createImageModelConfigBaseSchema = z.object({
  name: z.string().min(1, '配置名称不能为空'),
  providerType: z.enum(imageProviderTypes),
  deliveryMode: z.enum(imageProviderDeliveryModes),
  baseUrl: z.url('请求地址格式不正确').or(z.literal('')),
  generationPath: z.string().optional(),
  editPath: z.string().optional(),
  apiKey: z.string().min(1, '密钥不能为空'),
  // Google 模式无需填,OpenAI 模式的必填由外层 superRefine 保证
  modelName: z.string().optional(),
  fieldMapping: imageProviderFieldMappingSchema,
  fieldOverrides: imageProviderFieldOverridesSchema,
  pollingConfig: imageProviderPollingConfigSchema,
  httpConfig: imageProviderHttpConfigSchema.optional(),
  enabled: z.boolean(),
});

export const createImageModelConfigSchema =
  createImageModelConfigBaseSchema.superRefine(requireModelNameForOpenAi);

// 从基础 object(非 superRefine 版本)派生,才能正常 .partial()
export const updateImageModelConfigSchema = createImageModelConfigBaseSchema
  .partial()
  .extend({
    apiKey: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    // 更新时 providerType 可能未提交,此时不校验 modelName
    if (value.providerType === undefined) {
      return;
    }
    requireModelNameForOpenAi(
      {
        providerType: value.providerType,
        deliveryMode: value.deliveryMode,
        modelName: value.modelName,
        httpConfig: value.httpConfig,
      },
      ctx,
    );
  });

export const updateImageModelConfigEnabledSchema = z.object({
  enabled: z.boolean(),
});

export const assistantModelConfigSchema = z.object({
  mode: z.enum(assistantProviderModes),
  url: z.url('请求地址格式不正确').or(z.literal('')),
  apiKeyMasked: z.string().optional(),
  modelName: z.string(),
  enabled: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export const updateAssistantModelConfigSchema = z.object({
  mode: z.enum(assistantProviderModes),
  url: z.url('请求地址格式不正确').or(z.literal('')),
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

export const imageRecognitionRequestSchema = z.object({
  imageDataUrl: z
    .string()
    .min(1, '请上传图片')
    .refine((value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value), {
      message: '图片格式不正确',
    }),
  prompt: z.string().min(1, '请输入识图提示词'),
});

export const imageRecognitionResponseSchema = z.object({
  result: z.string(),
});

export const createImageJobSchema = z.object({
  configId: z.string().min(1, '请选择生图模型配置'),
  prompt: z.string().min(1, '提示词不能为空'),
  aspectRatio: z.string().min(1, '请选择尺寸'),
  resolution: z.string().min(1, '请选择分辨率'),
  quantity: z.number().int().min(1).max(16),
  referenceImages: z.array(z.string()).max(16).optional(),
});

export const imageJobSchema = z.object({
  id: z.string(),
  configId: z.string(),
  configName: z.string(),
  providerType: z.enum(imageProviderTypes),
  modelName: z.string(),
  prompt: z.string(),
  aspectRatio: z.string(),
  resolution: z.string(),
  quantity: z.number().int().min(1).max(16),
  status: z.enum(imageJobStatuses),
  imageUrl: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
  tokenUsage: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ImageProviderType = (typeof imageProviderTypes)[number];
export type ImageProviderDeliveryMode =
  (typeof imageProviderDeliveryModes)[number];
export type ImageProviderFieldKey = (typeof imageProviderFieldKeys)[number];
export type AssistantProviderMode = (typeof assistantProviderModes)[number];
export type ImageJobStatus = (typeof imageJobStatuses)[number];
export type AspectRatio = string;
export type ImageResolution = string;
export type ImageQuantity = number;

export type ApiResponse<T> = {
  code: ApiResponseCode;
  message: string;
  data: T;
};

export type ImageModelConfig = z.infer<typeof imageModelConfigSchema>;
export type ImageProviderFieldMapping = z.infer<
  typeof imageProviderFieldMappingSchema
>;
export type ImageProviderFieldOverrides = z.infer<
  typeof imageProviderFieldOverridesSchema
>;
export type ImageProviderPollingConfig = z.infer<
  typeof imageProviderPollingConfigSchema
>;
export type ImageProviderHttpContentType =
  (typeof imageProviderHttpContentTypes)[number];
export type ImageProviderHttpImageValueType =
  (typeof imageProviderHttpImageValueTypes)[number];
export type ImageProviderReferenceImageMode =
  (typeof imageProviderReferenceImageModes)[number];
export type ImageProviderHttpRequest = z.infer<
  typeof imageProviderHttpRequestSchema
>;
export type ImageProviderHttpBodyConfig = z.infer<
  typeof imageProviderHttpBodyConfigSchema
>;
export type ImageProviderHttpBodyField = z.infer<
  typeof imageProviderHttpBodyFieldSchema
>;
export type ImageProviderHttpBodyOption = z.infer<
  typeof imageProviderHttpOptionSchema
>;
export type ImageProviderHttpQuantityField = z.infer<
  typeof imageProviderHttpQuantityFieldSchema
>;
export type ImageProviderHttpExtraBodyParam = z.infer<
  typeof imageProviderHttpExtraBodyParamSchema
>;
export type ImageProviderHttpBinding = z.infer<
  typeof imageProviderHttpBindingSchema
>;
export type ImageProviderHttpBindings = z.infer<
  typeof imageProviderHttpBindingsSchema
>;
export type ImageProviderHttpReferenceImages = z.infer<
  typeof imageProviderHttpReferenceImagesSchema
>;
export type ImageProviderHttpImageResponse = z.infer<
  typeof imageProviderHttpImageResponseSchema
>;
export type ImageProviderHttpResponse = z.infer<
  typeof imageProviderHttpResponseSchema
>;
export type ImageProviderHttpPolling = z.infer<
  typeof imageProviderHttpPollingSchema
>;
export type ImageProviderHttpConfig = z.infer<
  typeof imageProviderHttpConfigSchema
>;
export type CreateImageModelConfigInput = z.infer<
  typeof createImageModelConfigSchema
>;
export type UpdateImageModelConfigInput = z.infer<
  typeof updateImageModelConfigSchema
>;
export type UpdateImageModelConfigEnabledInput = z.infer<
  typeof updateImageModelConfigEnabledSchema
>;
export type AssistantModelConfig = z.infer<typeof assistantModelConfigSchema>;
export type UpdateAssistantModelConfigInput = z.infer<
  typeof updateAssistantModelConfigSchema
>;
export type PromptOptimizeRequest = z.infer<typeof promptOptimizeRequestSchema>;
export type PromptOptimizeResponse = z.infer<
  typeof promptOptimizeResponseSchema
>;
export type ImageRecognitionRequest = z.infer<
  typeof imageRecognitionRequestSchema
>;
export type ImageRecognitionResponse = z.infer<
  typeof imageRecognitionResponseSchema
>;
export type CreateImageJobInput = z.infer<typeof createImageJobSchema>;
export type ImageJob = z.infer<typeof imageJobSchema>;
