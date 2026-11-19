// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The page bundles lazy components; the server has not loaded an uncalled route's dynamic imports. */
import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { forgetTheWalks, theFilesBuiltFrom } from '../src/config/import-graph.mjs'
import { newestSourceBuiltFrom, THE_PAGES_ENTRY, THE_SERVER_ENTRY } from '../src/config/newest-source.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const CANVAS = 'src/web/components/graph/Canvas.tsx'
const BEFORE = new Date('2026-01-01T00:00:00Z')
const AFTER = new Date('2026-01-01T00:00:01Z')
const temporaryTrees: string[] = []

function treeWith(files: Record<string, string>): string {
  const scratch = join(REPO, '.logs')
  mkdirSync(scratch, { recursive: true })
  const root = mkdtempSync(join(scratch, 'lazy-imports-'))
  temporaryTrees.push(root)
  for (const [file, text] of Object.entries(files)) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    utimesSync(path, BEFORE, BEFORE)
  }
  return root
}

afterEach(() => {
  forgetTheWalks()
  for (const root of temporaryTrees.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('counts the real Canvas.tsx among the files the page is built from', () => {
  const walked = theFilesBuiltFrom(THE_PAGES_ENTRY, REPO)
  expect(walked.files).toContain(CANVAS)
  expect(walked.files).not.toContain('src/server/lib/price-table.ts')
  expect(walked.unresolved).toEqual([])
  expect(walked.couldNotRead).toEqual([])
  expect(newestSourceBuiltFrom(THE_PAGES_ENTRY, REPO)?.files).toBe(walked.files.length)
})

it('moves the page freshness reading when a lazy component or its imports change', () => {
  const files = {
    [THE_PAGES_ENTRY]: '<script type="module" src="./main.tsx"></script>',
    'src/web/main.tsx': "import './components/StructureView.tsx'",
    'src/web/components/StructureView.tsx': "const Canvas = lazy(() => import('./graph/Canvas.tsx'))",
    [CANVAS]: "export { shape } from './shape.ts'; export const load = () => import('./draw.mjs')",
    'src/web/components/graph/shape.ts': 'export const shape = 1',
    'src/web/components/graph/draw.mjs': "export const load = () => import('./paint.ts')",
    'src/web/components/graph/paint.ts': 'export const paint = 1',
  }
  const root = treeWith(files)
  const walked = theFilesBuiltFrom(THE_PAGES_ENTRY, root)
  expect(walked.files).toEqual(Object.keys(files).sort())
  expect(walked.unresolved).toEqual([])
  expect(walked.couldNotRead).toEqual([])

  // Read once before changing a time, so each edit also checks the held walk.
  expect(newestSourceBuiltFrom(THE_PAGES_ENTRY, root)?.at).toEqual(BEFORE)
  for (const [index, file] of [CANVAS, 'src/web/components/graph/shape.ts', 'src/web/components/graph/paint.ts'].entries()) {
    const at = new Date(AFTER.getTime() + index * 1000)
    utimesSync(join(root, file), at, at)
    expect(newestSourceBuiltFrom(THE_PAGES_ENTRY, root)).toEqual({ at, file, files: Object.keys(files).length })
  }
})

it('keeps dynamic imports in a non-entry server file out of the server freshness reading', () => {
  const deferred = 'src/server/only-when-called.ts'
  const root = treeWith({
    [THE_SERVER_ENTRY]: "await import('./route.ts')",
    'src/server/route.ts': "export const route = () => import('./only-when-called.ts')",
    [deferred]: "import './dependency.ts'",
    'src/server/dependency.ts': 'export const value = 1',
  })
  const walked = theFilesBuiltFrom(THE_SERVER_ENTRY, root)
  expect(walked.files).toEqual([THE_SERVER_ENTRY, 'src/server/route.ts'])
  expect(walked.unresolved).toEqual([])
  expect(walked.couldNotRead).toEqual([])
  const before = newestSourceBuiltFrom(THE_SERVER_ENTRY, root)
  expect(before).toEqual({ at: BEFORE, file: THE_SERVER_ENTRY, files: 2 })
  utimesSync(join(root, deferred), AFTER, AFTER)
  expect(newestSourceBuiltFrom(THE_SERVER_ENTRY, root)).toEqual(before)
})

it('leaves inline import types out of the page while following a chained runtime import', () => {
  const root = treeWith({
    [THE_PAGES_ENTRY]: '<script type="module" src="./main.tsx"></script>',
    'src/web/main.tsx': [
      "import './api.ts'",
      "export const load = () => import('./Canvas.tsx').then(module => module.default)",
    ].join('\n'),
    'src/web/api.ts': [
      "export const read = () => request<import('../server/price-table.ts').Reply>('/api/price-table')",
      "export const send = (value: import('../server/price-table.ts').Reply) => request('/api/price-table', value)",
      "type Module = typeof import('../server/price-table.ts')",
    ].join('\n'),
    'src/web/Canvas.tsx': 'export default () => <div />',
    'src/server/price-table.ts': 'export interface Reply { value: number }',
  })
  const walked = theFilesBuiltFrom(THE_PAGES_ENTRY, root)
  expect(walked.files).toEqual([
    'src/web/Canvas.tsx',
    'src/web/api.ts',
    THE_PAGES_ENTRY,
    'src/web/main.tsx',
  ])
  expect(walked.unresolved).toEqual([])
  expect(walked.couldNotRead).toEqual([])
  const before = newestSourceBuiltFrom(THE_PAGES_ENTRY, root)
  utimesSync(join(root, 'src/server/price-table.ts'), AFTER, AFTER)
  expect(newestSourceBuiltFrom(THE_PAGES_ENTRY, root)).toEqual(before)
})

it('leaves no helper process running after reading the page imports', () => {
  const root = treeWith({
    [THE_PAGES_ENTRY]: '<script type="module" src="./main.tsx"></script>',
    'src/web/main.tsx': [
      "type Reply = import('../server/types.ts').Reply",
      "const Canvas = lazy(() => import('./Canvas.tsx'))",
    ].join('\n'),
    'src/web/Canvas.tsx': 'export default () => <div />',
    'src/server/types.ts': 'export interface Reply { value: number }',
  })
  const reader = new URL('../src/config/import-graph.mjs', import.meta.url).href
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { execFileSync } from 'node:child_process'
    import { walkFrom } from ${JSON.stringify(reader)}
    walkFrom(${JSON.stringify(THE_PAGES_ENTRY)}, ${JSON.stringify(root)})
    const children = execFileSync('ps', ['--ppid', String(process.pid), '--no-headers', '-o', 'pid'], { encoding: 'utf8' })
      .trim().split(/\\s+/).filter(Boolean).map(Number)
    const stillRunning = children.filter(pid => {
      try { process.kill(pid, 0); return true } catch { return false }
    })
    process.stdout.write(JSON.stringify(stillRunning))
  `], { encoding: 'utf8' })
  expect(JSON.parse(output)).toEqual([])
})
