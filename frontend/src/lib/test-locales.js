import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function getLocalePacks(relativeDir = '../locales', importMetaUrl) {
  const dir = path.resolve(fileURLToPath(new URL('.', importMetaUrl)), relativeDir)
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'))
  const packs = {}
  for (const f of files) {
    const key = `${relativeDir}/${f}`
    packs[key] = require(path.join(dir, f)).default || require(path.join(dir, f))
  }
  return packs
}
