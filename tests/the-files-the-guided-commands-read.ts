// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { importsIn, withoutComments } from '../src/config/import-graph.mjs'

export const THE_GUIDED_COMMANDS = 'tools/key-setup'

const CODE = new Set(['.mjs', '.js', '.cjs', '.mts', '.ts', '.tsx', '.jsx'])
const TRIED = ['.mjs', '.js', '.cjs', '.mts', '.ts', '.tsx', '.jsx', '.json']

function filesUnder(folder: string, wanted: (name: string) => boolean): string[] {
  const found: string[] = []
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(folder, entry.name)
    if (entry.isDirectory()) found.push(...filesUnder(path, wanted))
    else if (entry.isFile() && wanted(entry.name)) found.push(path)
  }
  return found.sort()
}

function constantsIn(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const match of text.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"\n]*)\2/g)) {
    values.set(match[1] as string, match[3] as string)
  }
  return values
}

function newUrlTargetsIn(text: string): string[] {
  const values = constantsIn(text)
  const found: string[] = []
  for (const match of withoutComments(text).matchAll(/\bnew\s+URL\(\s*(['"`])([\s\S]*?)\1\s*,\s*import\.meta\.url\s*\)/g)) {
    found.push((match[2] as string).replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (whole, name: string) => values.get(name) ?? whole))
  }
  return found
}

function isRelativeTarget(specifier: string): boolean {
  return !specifier.startsWith('/') && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)
}

function fileAt(path: string): string | null {
  const clean = path.split(/[?#]/)[0] as string
  try {
    if (statSync(clean).isFile()) return clean
  } catch {}
  for (const extension of TRIED) {
    try {
      if (statSync(clean + extension).isFile()) return clean + extension
    } catch {}
  }
  return null
}

function isFolderAt(path: string): boolean {
  try {
    return statSync(path.split(/[?#]/)[0] as string).isDirectory()
  } catch {
    return false
  }
}

function specifiersIn(file: string): string[] {
  const extension = extname(file), text = readFileSync(file, 'utf8')
  return [
    ...importsIn(text, extension).filter((one) => one.startsWith('.')),
    ...newUrlTargetsIn(text).filter(isRelativeTarget),
  ]
}

function filesTheGuidedCommandsRead(root: string): string[] {
  const start = join(root, THE_GUIDED_COMMANDS)
  const seen = new Set(filesUnder(start, (name) => name.endsWith('.mjs')))
  const queue = [...seen]
  const missed: string[] = []
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (!CODE.has(extname(file))) continue
    for (const specifier of specifiersIn(file)) {
      const target = resolve(dirname(file), specifier)
      if ((specifier.split(/[?#]/)[0] as string).endsWith('/')) {
        if (!isFolderAt(target)) missed.push(`${relative(root, file)} reads ${specifier}, which is not a folder`)
        continue
      }
      const points = fileAt(target)
      if (points === null) {
        missed.push(`${relative(root, file)} reads ${specifier}, which is not a file`)
        continue
      }
      if (!seen.has(points)) {
        seen.add(points)
        queue.push(points)
      }
    }
  }
  if (missed.length > 0) throw new Error(`the guided commands read files that are not here: ${missed.join('; ')}`)
  return [...seen].map((file) => relative(root, file)).sort()
}

export function theFilesTheGuidedCommandsRead(repo: string): string[] {
  return filesTheGuidedCommandsRead(resolve(repo))
}

export function copyTheFilesTheGuidedCommandsRead(repo: string, into: string): void {
  const root = resolve(repo), destination = resolve(into)
  for (const path of filesTheGuidedCommandsRead(root)) {
    const to = join(destination, path)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(join(root, path), to)
  }
}

