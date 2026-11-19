// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN'S PAGES ARE BUILT BY ONE COMMAND, AND A BUILD THAT FAILS LEAVES THE LAST GOOD ONE. Wave 13x round 17, step 4
 * of the plugin pipeline udGnc-Bsr15R (block 1Asl25_3DvQM). The command is `node tools/build-a-plugin.mjs <id>`. The
 * merge tool runs it in the entry's sandbox when a landing changes a plugin, and tools/check-a-plugin.mjs builds through
 * the same function, so a landed plugin has its page with no hand step.
 *
 * Every plugin here is made up, in a temporary tree of this file's own: plugins/<id>/, a copy of the published read
 * types at src/shared/plugin-read.ts, and a link to this checkout's node_modules. The command is pointed at it with
 * --root, and ends its output with its answer as one JSON line with --json.
 *
 * WHAT THIS FILE PROVES:
 * 1. A plugin's pages are built into plugins/<id>/dist, the answer says so, and the staging folder is gone after.
 * 2. A build that fails says Vite's reason, and plugins/<id>/dist keeps the last good build, file for file.
 * 3. A page the manifest names and the folder does not have is refused before anything is built.
 * 4. A plugin with no manifest, or a manifest the office refuses, is not built, and says why.
 * 5. The build is a production build whatever NODE_ENV its caller has: a React page built while
 *    NODE_ENV is test carries no React development code and no path of the tree, and the caller's
 *    NODE_ENV is as it was afterwards.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { buildThePluginsPages } from '../tools/build-a-plugin.mjs'
import { PLUGIN_BUILT_FOLDER, pluginPageFile } from '../src/shared/plugins.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const ROOT = join(import.meta.dirname, '..')
const scratch = aTestDatabaseFolder('a-plugin-is-built')
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

interface TheAnswer {
  plugin: string
  folder: string
  built: boolean
  says: string
}

/** A manifest this office accepts, for the made-up plugin `id`, with `more` laid over it. */
function aManifest(id: string, more: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id,
    name: { en: 'A made-up plugin' },
    version: '1.0.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 50 },
    ...more,
  })
}

/** The files of a made-up plugin that builds, by path inside its folder. */
function aPlugin(id: string): Record<string, string> {
  return {
    'plugin.json': aManifest(id),
    'main.html': '<!doctype html><html><body><p id="said"></p><script type="module" src="./main.ts"></script></body></html>\n',
    'main.ts': "document.getElementById('said')!.textContent = 'SYNTHETIC: a made-up plugin'\n",
  }
}

/** A tree of this file's own holding `files` in the folder of the plugin `id`. */
function aTree(id: string, files: Record<string, string>): string {
  const tree = mkdtempSync(join(scratch, 'tree-'))
  mkdirSync(join(tree, 'src', 'shared'), { recursive: true })
  copyFileSync(join(ROOT, 'src', 'shared', 'plugin-read.ts'), join(tree, 'src', 'shared', 'plugin-read.ts'))
  symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'))
  mkdirSync(join(tree, 'plugins'))
  write(tree, id, files)
  return tree
}

function write(tree: string, id: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const file = join(tree, 'plugins', id, path)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }
}

/** The command's exit and its answer, built in `tree`. */
function build(tree: string, id: string): { code: number | null; said: TheAnswer; out: string } {
  // Run as the merge tool runs it, without this test runner's own variables.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST') && name !== 'NODE_ENV'))
  const ran = spawnSync(process.execPath, [join(ROOT, 'tools', 'build-a-plugin.mjs'), id, '--root', tree, '--json'], { cwd: ROOT, env, encoding: 'utf8', timeout: 120_000 })
  const out = `${ran.stdout}\n${ran.stderr}`
  const line = ran.stdout.trim().split('\n').at(-1) ?? ''
  try {
    return { code: ran.status, said: JSON.parse(line) as TheAnswer, out }
  } catch {
    throw new Error(`The command did not end with one JSON line. It said:\n${out.slice(-3000)}`)
  }
}

/** Every file under `folder`, by its path inside it, with what it holds. */
function filesIn(folder: string, inside = ''): Record<string, string> {
  if (!existsSync(folder)) return {}
  return Object.fromEntries(
    readdirSync(join(folder, inside), { withFileTypes: true }).flatMap((one) =>
      one.isDirectory() ? Object.entries(filesIn(folder, join(inside, one.name))) : [[join(inside, one.name), readFileSync(join(folder, inside, one.name), 'utf8')]],
    ),
  )
}

describe("a plugin's pages are built by one command", () => {
  it('1. builds the pages into plugins/<id>/dist, says so, and leaves no staging folder', () => {
    const tree = aTree('made-up', aPlugin('made-up'))
    const { code, said, out } = build(tree, 'made-up')
    expect(code, out.slice(-3000)).toBe(0)
    expect(said).toMatchObject({ plugin: 'made-up', folder: join(tree, 'plugins', 'made-up'), built: true })
    expect(said.says).toMatch(/^Built \d+ files? into plugins\/made-up\/dist: /u)
    expect(readFileSync(join(tree, 'plugins', 'made-up', 'dist', 'main.html'), 'utf8')).toContain('<script')
    expect(existsSync(join(tree, 'dist', 'plugin-pages-next', 'made-up')), 'the staging folder is moved into place').toBe(false)
  }, 150_000)

  it('2. says why a build failed, and keeps the last good build file for file', () => {
    const tree = aTree('made-up', aPlugin('made-up'))
    const first = build(tree, 'made-up')
    expect(first.code, first.out.slice(-3000)).toBe(0)
    const dist = join(tree, 'plugins', 'made-up', 'dist')
    const good = filesIn(dist)
    expect(Object.keys(good)).toContain('main.html')
    write(tree, 'made-up', { 'main.ts': 'export const = ;\n' })
    const { code, said, out } = build(tree, 'made-up')
    expect(code, out.slice(-3000)).toBe(1)
    expect(said.built).toBe(false)
    expect(said.says).toMatch(/^Vite could not build it: /u)
    expect(said.says).toMatch(/Nothing in plugins\/made-up\/dist was changed\.$/u)
    expect(filesIn(dist), 'the last good build is still there').toEqual(good)
    expect(existsSync(join(tree, 'dist', 'plugin-pages-next', 'made-up')), 'a failed build leaves nothing staged').toBe(false)
  }, 150_000)

  it('3. refuses a page the manifest names and the folder does not have, before building anything', () => {
    const { 'main.html': _page, ...rest } = aPlugin('made-up')
    const tree = aTree('made-up', rest)
    const { code, said } = build(tree, 'made-up')
    expect(code).toBe(1)
    expect(said.built).toBe(false)
    expect(said.says).toBe('The manifest names the page main, and plugins/made-up/main.html is not there. Nothing in plugins/made-up/dist was changed.')
    expect(existsSync(join(tree, 'plugins', 'made-up', 'dist'))).toBe(false)
  }, 60_000)

  it('4. does not build a plugin with no manifest, or one the office refuses, and says why', () => {
    const none = aTree('made-up', { 'main.html': aPlugin('made-up')['main.html']! })
    const missing = build(none, 'made-up')
    expect(missing.code).toBe(1)
    expect(missing.said.says).toBe(`There is no plugins/made-up/plugin.json under ${none}, so nothing says which pages to build.`)
    expect(existsSync(join(none, 'plugins', 'made-up', 'dist'))).toBe(false)

    const refused = aTree('made-up', { ...aPlugin('made-up'), 'plugin.json': aManifest('made-up', { store: 'a table' }) })
    const answer = build(refused, 'made-up')
    expect(answer.code).toBe(1)
    expect(answer.said.says).toMatch(/^The office does not accept plugins\/made-up\/plugin\.json, so nothing says which pages to build: plugin\.json is not a manifest this office accepts\./u)
    expect(existsSync(join(refused, 'plugins', 'made-up', 'dist'))).toBe(false)
  }, 60_000)

  it('5. builds a production page whatever NODE_ENV its caller has, and gives its caller NODE_ENV back', async () => {
    expect(process.env.NODE_ENV, `this case needs the test runner's NODE_ENV=test, and this process says ${String(process.env.NODE_ENV)}`).toBe('test')
    const tree = aTree('made-up', {
      ...aPlugin('made-up'),
      'main.html': '<!doctype html><html><body><main id="app"></main><script type="module" src="./main.tsx"></script></body></html>\n',
      'main.tsx': "import { createRoot } from 'react-dom/client'\nfunction Page() { return <p>SYNTHETIC: a made-up plugin page.</p> }\ncreateRoot(document.getElementById('app')!).render(<Page />)\n",
    })
    const folder = join(tree, 'plugins', 'made-up')
    const built = await buildThePluginsPages({ root: tree, folder, slugs: ['main'], pageFile: pluginPageFile, builtFolder: PLUGIN_BUILT_FOLDER })
    expect(built.built, built.says).toBe(true)
    if (!built.built) throw new Error(built.says)
    const files = filesIn(join(folder, PLUGIN_BUILT_FOLDER))
    expect(Object.keys(files).length, `the build wrote no file into plugins/made-up/${PLUGIN_BUILT_FOLDER}`).toBeGreaterThan(0)
    const development = Object.entries(files).filter(([, text]) => text.includes('jsxDEV')).map(([path]) => path)
    expect(development, `these files carry React's development code: ${development.join(', ')}`).toEqual([])
    const naming = Object.entries(files).filter(([, text]) => text.includes(tree)).map(([path]) => path)
    expect(naming, `these files name the tree ${tree}: ${naming.join(', ')}`).toEqual([])
    expect(process.env.NODE_ENV, `the build did not put the caller's NODE_ENV back: ${String(process.env.NODE_ENV)}`).toBe('test')
  }, 150_000)
})
