# Pitfalls

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
