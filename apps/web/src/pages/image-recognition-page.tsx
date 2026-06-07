import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import type { AssistantModelConfig } from "@ai-image-codexu/shared"
import {
  Bot,
  Boxes,
  Check,
  ClipboardType,
  Copy,
  FileText,
  ImagePlus,
  ListChecks,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tags,
  UploadCloud,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

const maxRecognitionImageBytes = 20 * 1024 * 1024

const recognitionPrompts = [
  {
    id: "objects",
    label: "万物识别",
    icon: Search,
    prompt: `请详细识别并分析图片中的所有物品、场景和元素。对于识别到的主要物体，请提供以下信息：

1. 物品名称和类别
2. 主要特征和细节描述
3. 相关的百科知识（历史、用途、特点等）
4. 场景背景和环境分析

请用清晰的结构化方式呈现分析结果。`,
  },
  {
    id: "title",
    label: "商品标题",
    icon: Tags,
    prompt: `请作为专业的电商文案，分析这张商品图片并生成3-5个优质的商品标题。要求：

1. 标题长度控制在20-30字
2. 突出商品的核心卖点和特征
3. 包含适当的修饰词（如：新款、高品质、爆款等）
4. 符合电商平台的标题规范
5. 吸引点击，提升转化

请直接输出标题列表，每个标题单独一行。`,
  },
  {
    id: "bullets",
    label: "五点描述",
    icon: ListChecks,
    prompt: `请作为亚马逊资深运营，根据这张商品图片生成专业的五点描述（Bullet Points）。要求：

1. 每条控制在150-200个字符
2. 第一点：核心功能或主要用途
3. 第二点：材质、规格或技术参数
4. 第三点：独特卖点或竞争优势
5. 第四点：使用场景或适用人群
6. 第五点：售后保障或品质承诺

格式要求：
• 每点用 "✓" 或 "【】" 开头
• 语言精炼，突出重点
• 符合亚马逊平台规范`,
  },
  {
    id: "attributes",
    label: "属性分析",
    icon: SlidersHorizontal,
    prompt: `请作为商品数据分析师，对图片中的商品进行详细的属性分析。请按以下维度输出结构化信息：

【基础属性】
- 商品品类：
- 颜色：
- 尺寸/规格：
- 材质：
- 品牌（如可识别）：

【视觉特征】
- 设计风格：
- 主要元素：
- 色调分析：

【目标市场】
- 适用人群：
- 价格档位预估：
- 销售场景：

【优化建议】
- 产品优势：
- 改进空间：
- 营销建议：`,
  },
  {
    id: "ocr",
    label: "OCR提取",
    icon: ClipboardType,
    prompt: `请提取图片中的所有文字内容，包括：

1. 主标题和副标题
2. 正文内容
3. 标签、按钮、菜单等UI文字
4. 水印、版权信息
5. 其他任何可见文字

请按照图片中文字出现的位置顺序，逐行列出所有文字。如果有多列内容，请按从左到右、从上到下的顺序提取。`,
  },
  {
    id: "elements",
    label: "元素提取",
    icon: Sparkles,
    prompt: `请作为专业的生图提示词分析师，提取这张图片中可复用于生成相似图片的视觉元素，并整理成复制后可直接用于生图的提示词。

请按以下结构输出：

【核心元素】
- 主体对象：
- 主体动作/姿态：
- 场景与背景：
- 构图与视角：
- 色彩与光影：
- 材质与纹理：
- 风格与氛围：
- 关键细节：

【可直接复制的生图提示词】
请用一段完整、连贯、可执行的中文提示词描述画面，尽量保留原图的主体、构图、比例、光线、色彩、材质、风格和氛围，适合直接粘贴到文生图模型中生成相似图片。

【负面提示词】
请列出应避免的问题，例如：低清晰度、变形、比例错误、多余物体、文字乱码、画面脏污、过曝、欠曝等。

要求：
1. 只基于图片中可见信息提取，不臆造品牌、人物身份、地点或不存在的元素
2. 保持原图核心视觉意图，但不要要求完全复制原图
3. 输出重点放在可复现画面的视觉描述，减少无关解释
4. “可直接复制的生图提示词”必须是最终可用版本，不要写成分析说明`,
  },
] as const

type RecognitionImage = {
  dataUrl: string
  name: string
  size: number
}

type RecognitionPromptId = (typeof recognitionPrompts)[number]["id"] | "custom"

export function ImageRecognitionPage({
  assistantConfig,
}: {
  assistantConfig: AssistantModelConfig | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activePromptId, setActivePromptId] = useState<RecognitionPromptId>(
    recognitionPrompts[0].id,
  )
  const [analyzing, setAnalyzing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [image, setImage] = useState<RecognitionImage | null>(null)
  const [prompt, setPrompt] = useState<string>(recognitionPrompts[0].prompt)
  const [result, setResult] = useState("")
  const assistantReady = Boolean(
    assistantConfig?.enabled &&
      assistantConfig.modelName.trim() &&
      assistantConfig.url.trim(),
  )
  const selectedPrompt = useMemo(
    () => recognitionPrompts.find((item) => item.id === activePromptId),
    [activePromptId],
  )

  function applyPrompt(nextPrompt: (typeof recognitionPrompts)[number]) {
    setActivePromptId(nextPrompt.id)
    setPrompt(nextPrompt.prompt)
  }

  function handlePromptChange(value: string) {
    setPrompt(value)
    setActivePromptId(
      recognitionPrompts.find((item) => item.prompt === value)?.id ?? "custom",
    )
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }
    if (!file.type.startsWith("image/")) {
      toast.warning("只支持上传图片文件")
      return
    }
    if (file.size > maxRecognitionImageBytes) {
      toast.warning("单张图片最大 20MB")
      return
    }

    try {
      const dataUrl = await readImageDataUrl(file)
      setImage({
        dataUrl,
        name: file.name,
        size: file.size,
      })
      setResult("")
    } catch {
      toast.error("图片读取失败")
    }
  }

  async function handleAnalyze() {
    if (!assistantReady) {
      toast.warning("请先在配置页启用辅助模型并填写请求地址、模型名和密钥")
      return
    }
    if (!image) {
      toast.warning("请先上传图片")
      return
    }
    if (!prompt.trim()) {
      toast.warning("请输入识图提示词")
      return
    }

    setAnalyzing(true)
    setCopied(false)

    try {
      const response = await api.recognizeImage({
        imageDataUrl: image.dataUrl,
        prompt,
      })

      setResult(response.result)
      toast.success("识图分析完成")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "识图分析失败")
    } finally {
      setAnalyzing(false)
    }
  }

  async function copyResult() {
    if (!result) {
      return
    }

    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
      toast.success("分析结果已复制")
    } catch {
      toast.error("复制失败")
    }
  }

  return (
    <div className="motion-stagger grid min-w-0 gap-4 lg:min-h-0 lg:flex-1 xl:grid-cols-[minmax(340px,3.5fr)_minmax(0,6.5fr)]">
      <Card className="motion-panel surface-panel w-full min-w-0 rounded-lg lg:min-h-0">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImagePlus className="size-5 text-cyan-200" />
            识图
          </CardTitle>
        </CardHeader>
        <CardContent className="recognition-control-scroll motion-stagger grid gap-4 pt-1 lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden">
          <section className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel id="recognition-image">上传图片进行理解</FieldLabel>
              <span className="text-xs text-muted-foreground">单图最大 20MB</span>
            </div>
            <button
              type="button"
              className={cn(
                "group/upload relative flex min-h-44 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border/80 bg-background/35 text-left transition-colors hover:border-cyan-300/45 hover:bg-cyan-300/10 focus-visible:ring-3 focus-visible:ring-ring/50",
                image && "border-cyan-300/35 bg-cyan-300/8",
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              {image ? (
                <>
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-black/65 px-3 py-2 text-xs text-white backdrop-blur">
                    <span className="min-w-0 truncate">{image.name}</span>
                    <span className="shrink-0 font-mono">
                      {formatFileSize(image.size)}
                    </span>
                  </span>
                </>
              ) : (
                <span className="grid justify-items-center gap-3 text-center text-muted-foreground">
                  <UploadCloud className="size-9 text-cyan-100" />
                  <span className="text-sm font-medium text-foreground">
                    点击上传图片
                  </span>
                  <span className="text-xs">支持 JPG、PNG、WebP</span>
                </span>
              )}
            </button>
            {image ? (
              <Button
                className="h-9 justify-self-start border-border/70"
                size="sm"
                variant="outline"
                onClick={() => {
                  setImage(null)
                  setResult("")
                }}
              >
                <X data-icon="inline-start" />
                移除图片
              </Button>
            ) : null}
            <input
              ref={fileInputRef}
              id="recognition-image"
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
            />
          </section>

          <section className="grid gap-2">
            <FieldLabel id="recognition-prompts">快捷提示词</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {recognitionPrompts.map((item) => {
                const Icon = item.icon
                const active = activePromptId === item.id

                return (
                  <Button
                    key={item.id}
                    className={cn(
                      "h-9 rounded-full border-border/70 bg-background/35 px-3",
                      active &&
                        "border-cyan-300/50 bg-cyan-300/14 text-cyan-50",
                    )}
                    size="sm"
                    variant="outline"
                    onClick={() => applyPrompt(item)}
                  >
                    <Icon data-icon="inline-start" />
                    {item.label}
                  </Button>
                )
              })}
            </div>
          </section>

          <section className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel id="recognition-prompt">
                提问{selectedPrompt ? `（${selectedPrompt.label}）` : ""}
              </FieldLabel>
              <span className="text-xs text-muted-foreground">
                {activePromptId === "custom" ? "自定义" : "可编辑"}
              </span>
            </div>
            <Textarea
              id="recognition-prompt"
              className="min-h-32 resize-y rounded-lg border-border/80 bg-background/55 px-4 py-3 text-sm leading-6 shadow-inner shadow-black/20 placeholder:text-muted-foreground/70"
              placeholder="例如：这张图片里有什么？描述图片中的场景。"
              value={prompt}
              onChange={(event) => handlePromptChange(event.target.value)}
            />
          </section>

          <section className="grid gap-2">
            <FieldLabel id="recognition-model">辅助模型</FieldLabel>
            <div
              id="recognition-model"
              className={cn(
                "flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/45 px-3 text-sm",
                assistantReady
                  ? "border-emerald-300/30 bg-emerald-300/8"
                  : "border-amber-300/30 bg-amber-300/8",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Bot className="size-4 shrink-0 text-cyan-100" />
                <span className="min-w-0 truncate">
                  {assistantConfig?.modelName || "未配置辅助模型"}
                </span>
              </span>
              <span className="shrink-0 rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground">
                {assistantReady ? "可用" : "不可用"}
              </span>
            </div>
          </section>

          <Button
            className="h-11 bg-primary text-primary-foreground shadow-[0_0_24px_rgba(52,211,153,0.18)] hover:bg-primary/90 disabled:border disabled:border-border/70 disabled:bg-muted/35 disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100 disabled:hover:bg-muted/35"
            disabled={analyzing || !assistantReady || !image || !prompt.trim()}
            onClick={handleAnalyze}
          >
            {analyzing ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Boxes data-icon="inline-start" />
            )}
            开始分析
          </Button>
        </CardContent>
      </Card>

      <Card className="motion-panel surface-panel w-full min-w-0 rounded-lg lg:min-h-0">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle className="flex items-center justify-between gap-3 text-lg">
            <span className="flex min-w-0 items-center gap-2">
              <FileText className="size-5 text-amber-200" />
              分析结果
            </span>
            {result ? (
              <Button
                className="h-9 border-border/70"
                size="sm"
                variant="outline"
                onClick={copyResult}
              >
                {copied ? (
                  <Check data-icon="inline-start" />
                ) : (
                  <Copy data-icon="inline-start" />
                )}
                复制
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1 lg:min-h-0 lg:flex-1">
          <div className="motion-pop flex min-h-[420px] rounded-lg border border-border/70 bg-background/35 lg:h-full lg:min-h-0">
            {analyzing ? (
              <div className="m-auto grid justify-items-center gap-3 text-center text-muted-foreground">
                <Loader2 className="size-9 animate-spin text-cyan-100" />
                <p className="text-sm">正在分析图片</p>
              </div>
            ) : result ? (
              <MarkdownResult content={result} />
            ) : (
              <div className="m-auto grid max-w-sm justify-items-center gap-3 px-5 text-center text-muted-foreground">
                <FileText className="size-10 text-muted-foreground/80" />
                <p className="text-sm">上传图片后点击开始分析查看结果</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MarkdownResult({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content])

  return (
    <div className="recognition-markdown h-full w-full overflow-auto p-5 text-sm leading-7 text-foreground">
      {blocks}
    </div>
  )
}

function parseMarkdownBlocks(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.trimStart().startsWith("```")) {
      const language = line.trim().slice(3).trim()
      const codeLines: string[] = []
      index += 1

      while (
        index < lines.length &&
        !lines[index].trimStart().startsWith("```")
      ) {
        codeLines.push(lines[index])
        index += 1
      }

      blocks.push(
        <pre key={`code-${blocks.length}`}>
          <code data-language={language || undefined}>{codeLines.join("\n")}</code>
        </pre>,
      )
      index += index < lines.length ? 1 : 0
      continue
    }

    if (isTableStart(lines, index)) {
      const tableLines = [lines[index], lines[index + 1]]
      index += 2

      while (index < lines.length && lines[index].includes("|")) {
        tableLines.push(lines[index])
        index += 1
      }

      blocks.push(renderTable(tableLines, blocks.length))
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push(renderHeading(heading[1].length, heading[2], blocks.length))
      index += 1
      continue
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${blocks.length}`} />)
      index += 1
      continue
    }

    if (line.trimStart().startsWith(">")) {
      const quoteLines: string[] = []

      while (
        index < lines.length &&
        lines[index].trimStart().startsWith(">")
      ) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""))
        index += 1
      }

      blocks.push(
        <blockquote key={`quote-${blocks.length}`}>
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={`quote-line-${quoteIndex}`}>
              {renderInlineMarkdown(quoteLine)}
            </p>
          ))}
        </blockquote>,
      )
      continue
    }

    const listItem = parseListItem(line)
    if (listItem) {
      const items: string[] = []
      const listType = listItem.type

      while (index < lines.length) {
        const nextItem = parseListItem(lines[index])
        if (!nextItem || nextItem.type !== listType) {
          break
        }

        items.push(nextItem.content)
        index += 1
      }

      const ListTag = listType === "ol" ? "ol" : "ul"
      blocks.push(
        <ListTag key={`list-${blocks.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`list-item-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>,
      )
      continue
    }

    const paragraphLines = [line.trim()]
    index += 1

    while (
      index < lines.length &&
      lines[index].trim() &&
      !isMarkdownBlockStart(lines, index)
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }

    blocks.push(
      <p key={`paragraph-${blocks.length}`}>
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>,
    )
  }

  return blocks
}

function renderHeading(level: number, content: string, key: number) {
  const children = renderInlineMarkdown(content)

  if (level === 1) {
    return <h2 key={`heading-${key}`}>{children}</h2>
  }
  if (level === 2) {
    return <h3 key={`heading-${key}`}>{children}</h3>
  }

  return <h4 key={`heading-${key}`}>{children}</h4>
}

function renderTable(tableLines: string[], key: number) {
  const [headerLine, , ...bodyLines] = tableLines
  const headers = splitTableRow(headerLine)

  return (
    <div className="recognition-markdown-table" key={`table-${key}`}>
      <table>
        <thead>
          <tr>
            {headers.map((header, headerIndex) => (
              <th key={`header-${headerIndex}`}>
                {renderInlineMarkdown(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyLines.map((bodyLine, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {splitTableRow(bodyLine).map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`}>
                  {renderInlineMarkdown(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderInlineMarkdown(text: string) {
  const nodes: ReactNode[] = []
  const tokenPattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }

    const token = match[0]
    const key = `inline-${nodes.length}-${match.index}`

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
      if (link) {
        nodes.push(
          <a
            href={link[2]}
            key={key}
            rel="noreferrer"
            target="_blank"
          >
            {link[1]}
          </a>,
        )
      }
    }

    cursor = match.index + token.length
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

function isMarkdownBlockStart(lines: string[], index: number) {
  const line = lines[index]

  return Boolean(
    line.trimStart().startsWith("```") ||
      line.trimStart().startsWith(">") ||
      line.match(/^(#{1,4})\s+(.+)$/) ||
      /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
      parseListItem(line) ||
      isTableStart(lines, index),
  )
}

function isTableStart(lines: string[], index: number) {
  return Boolean(
    lines[index]?.includes("|") &&
      lines[index + 1] &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
        lines[index + 1],
      ),
  )
}

function parseListItem(line: string) {
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
  if (ordered) {
    return { type: "ol" as const, content: ordered[1] }
  }

  const unordered = line.match(/^\s*(?:[-*+]\s+|[•✓]\s*)(.+)$/)
  if (unordered) {
    return { type: "ul" as const, content: unordered[1] }
  }

  return null
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function FieldLabel({
  children,
  id,
}: {
  children: ReactNode
  id: string
}) {
  return (
    <Label htmlFor={id} className="text-sm text-foreground">
      {children}
    </Label>
  )
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`
  }

  return `${Math.max(1, Math.round(size / 1024))}KB`
}

function readImageDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => resolve(String(reader.result)))
    reader.addEventListener("error", reject)
    reader.readAsDataURL(file)
  })
}
