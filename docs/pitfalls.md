# Pitfalls

## 2026-07-01 Google 模式的 baseUrl 是完整端点，与 OpenAI 语义相反

- 问题：Google(Gemini)兼容协议的模型名嵌在 URL 路径里（形如 `.../models/gemini-3.1-flash-image-preview:generateContent`），不是请求体参数。此前后端用 `baseUrl + {modelName}:generateContent` 强行拼接，导致同一个「请求地址」字段在两种协议下语义相反：OpenAI-compatible 下它是域名（后端再拼 `/v1/images/generations`），Google-compatible 下它必须是完整端点。若前端只用一个统一的 label/placeholder，用户配 Google 时会照着域名示例只填一半，直接 404。
- 处理：Google 分支后端直接用 `request.baseUrl` 作完整请求 URL，不再拼 `modelName`；`modelName` 改为「OpenAI 必填、Google 可空」的条件必填（在 shared schema 用 superRefine 按 `providerType` 校验，字段本身设为 optional，但不能从系统删除——OpenAI 仍要当请求体参数、`image_job` 也要存快照）。前端设置页在 Google 模式隐藏「模型名称」输入框、切协议到 Google 时清空默认模型名，并让「请求地址」的 label/placeholder 随 `providerType` 切换为完整端点形态。存量 Google 配置的 `base_url` 若只存了域名，改动后会失效，需手动补成完整端点。

## 2026-07-01 Zod superRefine 会破坏 .partial() 派生

- 问题：`updateImageModelConfigSchema` 通过 `createImageModelConfigSchema.partial()` 派生。若为了做「OpenAI 模式 modelName 必填」的跨字段校验，直接在 create schema 上挂 `.superRefine()`，该 schema 会变成 `ZodEffects`，而 `ZodEffects` 没有 `.partial()` 方法，update schema 直接编译报错。
- 处理：把纯字段定义抽成独立的基础 object（`createImageModelConfigBaseSchema`），`createImageModelConfigSchema` = 基础 object + `.superRefine(...)`；`updateImageModelConfigSchema` 从**基础 object**（而非 refine 后的版本）派生 `.partial().extend(...).superRefine(...)`。update 侧的 refine 要先判断 `providerType === undefined`（部分更新时可能未提交）再校验，避免误报。

## 2026-06-25 轮询型中转商不能只靠字段名映射解决

- 问题：有些中转商请求体接近 OpenAI Images 协议，但响应不是同步返回图片，而是先返回任务 ID，再通过独立接口轮询结果。如果只做参数名映射，会把“请求协议”和“结果交付方式”混在一起，最终又退回每个厂商写一套 provider 特例。
- 处理：生图配置需要同时表达 `providerType` 协议类型和 `deliveryMode` 交付模式。`openai-compatible` / `google-compatible` 只负责请求结构、鉴权头、图片上传方式和响应图片解析；`sync` / `polling` 负责结果交付。AiCodeWith 这类正常生图和低配生图应拆成两条模型配置，通过不同 `modelName` 与字段启用规则表达差异，通过 `pollingConfig` 表达任务 ID、状态和结果 URL 的读取路径。

## 2026-06-25 中转商配置化后请求地址需要回到模型配置

- 问题：此前为了避免前端暴露 provider 细节，生图配置不维护运营商请求地址。但当目标变为“只保留 OpenAI-compatible / Google-compatible 两个协议 provider，并通过配置接入第三方中转商”时，请求地址、路径和交付模式本身就是模型配置的一部分。
- 处理：新的生图模型配置允许维护 `baseUrl`、OpenAI-compatible 的文生图/图生图路径、字段映射、字段启用规则和轮询配置。配置页仍不展示原始 API key，只展示掩码；业务代码仍不得硬编码图片存储路径或把第三方返回图片 URL 直接交给前端，生成结果必须先落到 `IMAGE_STORAGE_PATH` 再通过 `/api/images/*` 访问。

## 2026-06-16 前端 API 地址不等于 Vite 服务端口

- 问题：把前端请求地址改成 `VITE_API_BASE_URL` 或修改 API 代理目标，只会影响浏览器请求后端的 base URL，不会改变 Vite dev server 自己监听的端口。Vite 未配置 `server.port` 时仍会默认使用 5173。
- 处理：本地 Web 端口必须在 `apps/web/vite.config.ts` 的 `server.port` 中配置；为了避免端口被占用时静默切到其它端口，配合 `strictPort: true`。后端端口和 Vite `/api` 代理目标需要同步维护。

## 2026-06-08 生图失败任务不要保留历史记录

- 问题：生图任务创建时需要先写入 `queued` 记录供前端轮询，但如果 provider 或图片保存失败后继续把记录更新为 `failed`，历史页会出现失败任务。用户期望失败任务不保存数据库记录，也不出现在历史列表。
- 处理：后台生图失败时硬删除该任务记录；前端轮询到 404 时释放生成锁、移除本地任务状态并提示“生图失败，未保存历史记录”。`failed` 状态只作为旧数据兼容，不作为新失败任务的持久化结果。

## 2026-06-08 历史删除不能只删数据库记录

- 问题：生图历史记录的图片文件已经落在 `IMAGE_STORAGE_PATH` 下。如果历史页删除只删除 `image_job` 记录，会留下孤儿图片文件；如果直接信任前端传入文件路径删除，又可能误删存储根目录外文件。另一个风险是用户删除运行中任务后，后台异步任务完成时再次保存已删除记录。
- 处理：历史删除必须由后端根据任务记录中的 `/api/images/*` 公开 URL 安全还原存储根目录内相对路径，删除对应本地文件后硬删除数据库记录；文件不存在不阻塞删除。任务状态更新前需要重新确认记录仍存在，避免已删除任务被后台流程重新写回。

## 2026-06-07 工具面板内部滚动条不要在入场首帧抢视觉

- 问题：识图左侧操作面板使用 `overflow-y-auto` 时，刷新或切换页面的首帧里，字体加载、按钮换行和 flex 高度计算尚未完全稳定，浏览器可能短暂判定内容可滚动并绘制原生滚动条，下一帧布局稳定后滚动条又消失，造成明显闪烁。
- 处理：这类工具面板需要保留滚动能力，但滚动条默认透明并用 `scrollbar-gutter: stable` 稳定占位，仅在 hover 或 focus-within 时显示滚动条颜色，避免首帧闪烁和宽度抖动。

## 2026-06-07 识图结果不要用原始 pre 文本展示

- 问题：辅助模型经常返回 Markdown，如果前端用 `<pre>` 直接显示，标题、列表、表格、代码块等结构都无法渲染，右侧结果面板会像接口调试输出而不是可读分析报告；按钮禁用态如果只靠通用透明度，也容易让用户误判“开始分析”仍可点击。
- 处理：识图结果需要通过安全的 React Markdown 渲染路径展示，至少覆盖标题、列表、表格、引用和代码块；分析按钮在缺少图片、缺少模型配置、提示词为空或分析中时，必须有明确的弱化背景、边框、文字颜色和禁用鼠标状态。

## 2026-06-07 识图功能不要复用生图历史或落库

- 问题：识图和生图都处理图片，但识图是即时分析工具。如果把识图结果写入 `image_job` 或新增历史表，会让历史页混入非生成记录，也会把用户上传的原图 data URL 长期保存，增加隐私和表膨胀风险。
- 处理：识图只复用辅助模型配置和第三方请求能力，接口保持无状态：请求体传 `imageDataUrl` 与 `prompt`，响应返回 `{ result }`；后端不保存图片文件、不写数据库、不产生历史记录。

## 2026-06-07 生图加载态不要堆叠冗余状态标签

- 问题：任务预览加载态如果同时展示旋转图标、“生成中”状态标签、“SYNCING”同步标签、“正在生成画面”标题和四段式进度条，会让信息层级显得杂乱，分段进度条也容易被误解为多个并行任务。
- 处理：生图加载态只保留更大的旋转核心、任务摘要和已等待时间，不额外展示进度条。生成状态放在预览底部统一状态区；提示词优化期间必须禁用创建生图和失败重试入口，避免优化完成前提交旧提示词。

## 2026-06-07 提示词优化不能为了丰富画面而偏离用户原意

- 问题：系统提示词如果只要求“补充主体、构图、光线、材质、风格”，辅助模型可能会主动加入用户没表达的品牌、人物、地点、剧情或风格倾向，导致优化后的提示词偏离用户真实意图。
- 处理：提示词优化的系统提示词必须明确“用户原意为最高优先级”，保留主体、动作、场景、风格、数量、视角和限制；只能在不改变原意的前提下补充可视化细节，并禁止主动扩写无暗示的具体品牌、人物、地点或复杂剧情。

## 2026-06-07 辅助模型请求地址不能当 base URL 自动拼路径

- 问题：辅助模型配置面向官方和第三方兼容接口，如果后端把页面填写的地址当作 `baseUrl` 再根据模式追加 `/chat/completions` 或 `/v1/messages`，第三方 API 很容易被请求到错误路由；空地址也不应静默回退到官方默认地址。
- 处理：辅助模型对外字段命名为 `url`，表示完整请求 endpoint。OpenAI/Claude 模式只决定请求体、鉴权头和响应解析；实际请求地址必须直接使用配置的 `url`，缺失时返回明确错误。

## 2026-06-06 配置页开关不能只改本地表单状态

- 问题：辅助模型表单新增“启用辅助模型” Switch 后，如果开关只更新前端临时表单，用户会以为已经启用；但未保存或保存后未用后端返回值完整回填时，左侧状态仍可能显示“关闭”，实际 `assistant_model_config.enabled` 也可能仍是 `false`。
- 处理：配置页中影响全局能力开关的控件必须明确落库。辅助模型启用 Switch 采用切换即保存，保存成功后用 `PUT /api/assistant-config` 返回值同时回填 `assistantConfig` 和 `assistantForm`；失败时回滚开关和侧栏状态。

## 2026-06-06 生图任务进入真实流程后不能继续只存在内存中

- 问题：真实生图任务如果只保存在服务内存，刷新页面、进入历史页或服务重启后都无法稳定查询任务；即使图片文件已经写入本地目录，任务状态和结果 URL 也会丢失。开发环境中后端返回 `/api/images/*path` 相对路径时，如果 Vite 没有代理，浏览器还会请求到前端服务而不是后端图片接口。
- 处理：生图任务记录必须持久化到 `image_job` 表，任务创建、运行、成功和失败状态都写库；历史页通过后端列表接口加载。图片 URL 保持同源 `/api/images/*path`，开发环境用 Vite `/api` 代理到后端，不在前端手动拼接运营商或后端绝对地址。

## 2026-06-06 第三方生图模型自动选择不能照搬同一套请求体

- 问题：`gpt-image-2-beta` 与 `gpt-image-2` 虽然属于同一来源能力，但支持参数不同；beta 场景如果继续发送 `quality`、多图 `n` 或正式模型专用参数，容易触发第三方参数错误。另一个常见错误是把前端本地 base64 参考图直接塞给要求公网 `image_urls` 的第三方接口。
- 处理：模型分支由后端根据任务参数决定，并让任务历史记录真实模型名；`gpt-image-2-beta` 只发送该模型支持的固定参数。第三方要求公网图片 URL 时，不能把本地 data URL 当作 URL 发送，应先明确拒绝或等后续接入可公网访问的图片托管。

## 2026-06-06 provider 错误日志不要把 JSON 响应体包成字符串

- 问题：第三方返回 JSON 字符串时，如果直接把它塞进 `response` 字段再整体 `JSON.stringify`，日志会变成一行并带大量转义，例如 `response:"{\"error\":...}"`，排查错误消息很不方便。
- 处理：provider 错误日志应先尝试解析字符串形式的 JSON 响应体，再用 `JSON.stringify(payload, null, 2)` 输出多行缩进格式；继续保留 API key、图片 base64、上传图片内容等敏感字段脱敏。

## 2026-06-05 生图 provider 不应过度抽象为兼容协议中间层

- 问题：为了减少重复，把 OpenAI 和 OneTopAI 这类相似接口合并到 `callOpenAiImagesCompatible` 会让 URL、path、headers、请求体差异藏在参数里。来源越多时，阅读者需要在分发方法、兼容方法和参数之间来回跳，文件反而更复杂。
- 处理：每个来源在 `image-generation.providers.ts` 中保留独立完整的请求方法。允许重复写 URL、文生图/图生图分支、headers 和请求体；只保留纯工具 helper，例如错误转换、data URL 解析、URL 拼接和响应图片提取。

## 2026-06-05 生图 provider 配置不要拆散到顶部常量和裸字符串 case

- 问题：即使每个来源有独立方法，如果把各厂家的 base URL 放在文件顶部常量区，或者在 `generate` 中继续写裸字符串 `case`，来源配置仍然被拆散，新增来源时也容易漏改 shared 的来源定义。
- 处理：每个厂家的固定 base URL 直接写在对应 provider 方法内部；来源类型统一由 shared 的 `ImageProviderTypeEnum` 维护，后端分发和关键默认值都引用枚举成员。

## 2026-06-05 测试 provider 错误日志不要打印过多任务上下文

- 问题：为了调试真实生图请求，失败日志一开始同时打印了 job/config/provider/model/尺寸等上下文，信息过多，干扰测试时查看第三方接口实际返回内容。
- 处理：provider 请求失败日志只保留外部接口返回信息摘要，例如 HTTP 状态和响应体摘要；任务上下文、prompt、密钥、图片内容不进入日志。

## 2026-06-05 生图配置不应同时维护来源类型和模型类型

- 问题：真实请求已经按 `providerType` 分发到 OpenAI、Google、OneTopAI 等独立方法后，继续保留 `modelType` 会形成重复维度，让配置页和数据库字段变复杂，也容易让“来源”和“模型能力”相互冲突。
- 处理：生图模型配置只维护 `providerType`、密钥和可选 `model_name_override`，运营商请求地址固定在后端 provider 方法内。实际请求模型名由 override 或来源类型默认值决定；任务历史只记录最终使用的 `providerType` 与 `modelName`。

## 2026-06-05 生图配置页不应暴露运营商请求地址

- 问题：来源类型已经决定后端 provider 方法时，仍在配置页填写 OpenAI、Google 或第三方平台 URL，会把后端 adapter 内部细节暴露给前端，也让用户误以为可以通过前端自由切换协议。
- 处理：生图配置页不保存后端路由或运营商 URL。新增来源时同步修改 shared 来源枚举、前端来源标签和后端 provider 方法；具体 URL、path、header、请求体和响应解析都由后端方法维护。

## 2026-06-05 Toast 动画只写入场类但删除太快

- 问题：Toast 只挂了 `animate-in` 类，自动消失或手动关闭时直接从数组删除节点，退出动画没有播放机会；入场动画也缺少明确时长和项目内 keyframes，视觉上像没有动效。
- 处理：Toast 必须使用显式生命周期状态。关闭时先标记 `leaving` 播放 `toast-exit`，延迟后再移除；入场/退出 keyframes 集中维护在 `index.css`，并尊重 `prefers-reduced-motion`。

## 2026-06-05 前端页面状态只放在内存

- 问题：主页面使用 `useState("generate")` 保存当前视图，刷新历史页或配置页时 React 状态重建，页面会回到生图页。
- 处理：主页面切换必须同步到 URL。当前约定使用 hash 路由 `#/generate`、`#/history`、`#/settings`，刷新和浏览器前进/后退都应从 URL 恢复页面。

## 2026-06-04 前端控制台过度解释

- 问题：页面级大标题、常驻右侧详情区、折叠式配置表单和带背景的空状态让工具型界面显得松散，和用户期望的紧凑创作工作台不一致。
- 处理：后续调整前端控制台时，优先减少页面 chrome；详情和临时表单用居中 Dialog；空状态保持透明、只保留必要标题；避免为每个区域增加说明性文案。

## 2026-06-04 配置页表单控件与测试数据残留

- 问题：启用配置虽然显示成开关样式，但布局压缩在窄容器里，点击和视觉状态都不稳定；后端默认种子配置会让配置页误显示测试数据。
- 处理：配置页新增/编辑表单中的启用项必须使用项目 `Switch` 组件并与输入项等宽；后端配置列表不得自动注入测试配置，空库应返回空列表。

## 2026-06-04 Radix Switch 状态选择器与 API Key 存储

- 问题：Radix Switch 使用 `data-state="checked|unchecked"`，使用 `data-checked` / `data-unchecked` 样式不会命中，导致开关显示成不可识别的小黑点；数据库只保存 `apiKeyMasked` 也无法支撑后续真实请求。
- 处理：Switch 样式必须基于 `data-[state=checked]` / `data-[state=unchecked]`；API key 入库必须保存可解密密文和展示掩码，接口只返回掩码。
