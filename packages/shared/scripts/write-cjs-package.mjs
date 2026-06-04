import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const target = resolve(root, "../dist/cjs/package.json")

await mkdir(dirname(target), { recursive: true })
await writeFile(target, '{\n  "type": "commonjs"\n}\n')
