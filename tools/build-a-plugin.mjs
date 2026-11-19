// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * BUILD A PLUGIN'S PAGES INTO plugins/<id>/dist, KEEPING THE LAST GOOD BUILD IF THIS ONE FAILS. Wave 13x round 17, step 4
 * of the plugin pipeline udGnc-Bsr15R (block 1Asl25_3DvQM).
 *
 *     node tools/build-a-plugin.mjs <id> [--root <folder>] [--json]
 *
 * `dist/` is not kept in git, so a plugin that lands has no page until something builds it. The merge tool runs this
 * command in the entry's sandbox, in the integrated clone, before main moves, and copies the built pages into the main
 * checkout after the move (tools/merge-tool/land.mjs), so a landed plugin gets its page with no hand step.
 * tools/check-a-plugin.mjs builds with `buildThePluginsPages` below, so the check and the landing build a plugin the
 * same way.
 *
 * WHY A STAGING FOLDER. Vite empties its output folder when it starts to write. A build that fails while reading the
 * plugin, as a syntax error does, has not reached that, but one that fails or is stopped while writing would leave
 * plugins/<id>/dist empty or half written. So the build is written into dist/plugin-pages-next/<id> under the
 * checkout's root, which git leaves out as it leaves out every dist/, and only a build that finished is moved into
 * place. That is what makes "Nothing in plugins/<id>/dist was changed" true of every failure, at whatever stage.
 * tools/build-the-page.mjs does the same for the office's own page.
 *
 * It exits 0 when the pages were built and 1 when they were not. With --json it ends its output with the answer on one
 * line: { plugin, folder, built, says }.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where a plugin's build is written before it is moved over the last good one, from the checkout's root. */
export const THE_PLUGIN_STAGING_FOLDER = 'dist/plugin-pages-next'

/** Every file under `at`, in order, or none when it is not there. */
function filesUnder(/** @type {string} */ at) {
  if (!existsSync(at)) return /** @type {string[]} */ ([])
  /** @type {string[]} */
  const out = []
  for (const name of readdirSync(at).sort()) {
    const path = join(at, name)
    if (statSync(path).isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out
}

/**
 * BUILD ONE PLUGIN'S PAGES, and say what was built, in English. `slugs` are the pages its manifest names, `pageFile`
 * names a page's HTML file and `builtFolder` is the folder inside the plugin's folder the office serves from: the
 * callers pass them from src/shared/plugins.ts, which this module does not import, so it stays importable by plain node.
 * Nothing in plugins/<id>/dist changes unless the build finished.
 *
 * @param {{ root: string, folder: string, slugs: string[], pageFile: (slug: string) => string, builtFolder: string }} plugin
 * @returns {Promise<{ built: true, files: string[], says: string } | { built: false, says: string }>}
 */
export async function buildThePluginsPages({ root, folder, slugs, pageFile, builtFolder }) {
  const shown = (/** @type {string} */ path) => relative(root, path).split(sep).join('/')
  const missing = slugs.filter((slug) => !existsSync(join(folder, pageFile(slug))))
  if (missing.length > 0) {
    return { built: false, says: `The manifest names ${missing.map((slug) => `the page ${slug}, and ${shown(join(folder, pageFile(slug)))} is not there`).join('; ')}.` }
  }
  const staging = join(root, THE_PLUGIN_STAGING_FOLDER, basename(folder))
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  const { build } = await import('vite')
  // A PRODUCTION BUILD, WHATEVER NODE_ENV THE CALLER HAS. Vite reads NODE_ENV when it starts and again as it
  // transforms each file, so it is set for the whole build. Under anything but `production` React is built in
  // development mode, with the absolute path of every source file. tools/check-a-plugin.mjs runs the plugin's
  // tests first in its own process, and the test runner sets NODE_ENV to `test`, so without this its build step
  // would build, and measure, a development page. tools/build-the-page.mjs builds the office's own page the same way.
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({
      root: folder,
      base: './',
      configFile: false,
      envDir: false,
      logLevel: 'warn',
      build: {
        outDir: staging,
        emptyOutDir: true,
        rolldownOptions: { input: Object.fromEntries(slugs.map((slug) => [slug, join(folder, pageFile(slug))])) },
      },
    })
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    return { built: false, says: `Vite could not build it: ${String(error instanceof Error ? error.message : error).split('\n')[0]}` }
  } finally {
    if (callers === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = callers
  }
  // THE MOVE. The last good build is removed and the finished one put in its place, as tools/build-the-page.mjs does.
  const built = join(folder, builtFolder)
  rmSync(built, { recursive: true, force: true })
  renameSync(staging, built)
  const files = filesUnder(built)
  const names = files.slice(0, 8).map((path) => relative(built, path).split(sep).join('/'))
  return { built: true, files, says: `Built ${String(files.length)} ${files.length === 1 ? 'file' : 'files'} into ${shown(built)}: ${names.join(', ')}${files.length > 8 ? ' and more' : ''}.` }
}

// ============================================================================ the command

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const THIS_CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  // src/shared/plugins.ts reaches files that import each other through the office's alias @shared, which plain node
  // cannot resolve. tsx resolves it from the office's tsconfig, as in tools/check-a-plugin.mjs.
  const { register } = await import('tsx/esm/api')
  register({ tsconfig: join(THIS_CHECKOUT, 'tsconfig.json') })
  const { PLUGIN_BUILT_FOLDER, PLUGIN_ID, PLUGIN_MANIFEST_FILE, PLUGINS_FOLDER, aManifestFrom, pluginPageFile } = await import('../src/shared/plugins.ts')

  const usage = (/** @type {string} */ said) => {
    process.stderr.write(`build-a-plugin: ${said}\nUsage: node tools/build-a-plugin.mjs <id> [--root <folder>] [--json]\n`)
    process.exit(2)
  }
  const args = process.argv.slice(2)
  /** @type {string | null} */
  let id = null
  let root = THIS_CHECKOUT
  let json = false
  for (let index = 0; index < args.length; index += 1) {
    const one = args[index] ?? ''
    if (one === '--json') json = true
    else if (one === '--root') {
      const value = args[index + 1]
      if (value === undefined) usage('--root names a folder.')
      else root = resolve(value)
      index += 1
    } else if (one.startsWith('-')) usage(`${one} is not an option this command takes.`)
    else if (id === null) id = one
    else usage(`It builds one plugin, and was given ${id} and ${one}.`)
  }
  if (id === null) usage('Name the plugin to build, by its id.')
  const plugin = String(id)
  if (!PLUGIN_ID.test(plugin)) usage(`"${plugin}" is not a plugin id: ${PLUGIN_ID.source}.`)

  const folder = join(root, PLUGINS_FOLDER, plugin)
  const answer = (/** @type {boolean} */ built, /** @type {string} */ says) => {
    process.stdout.write(`build-a-plugin ${plugin}, in ${folder}: ${says}\n`)
    if (json) process.stdout.write(`${JSON.stringify({ plugin, folder, built, says })}\n`)
    process.exit(built ? 0 : 1)
  }
  const manifestFile = join(folder, PLUGIN_MANIFEST_FILE)
  if (!existsSync(manifestFile)) answer(false, `There is no ${PLUGINS_FOLDER}/${plugin}/${PLUGIN_MANIFEST_FILE} under ${root}, so nothing says which pages to build.`)
  const read = aManifestFrom(plugin, readFileSync(manifestFile, 'utf8'))
  if (!('manifest' in read)) answer(false, `The office does not accept ${PLUGINS_FOLDER}/${plugin}/${PLUGIN_MANIFEST_FILE}, so nothing says which pages to build: ${read.refusal}`)
  else {
    const result = await buildThePluginsPages({ root, folder, slugs: read.manifest.pages.map((page) => page.slug), pageFile: pluginPageFile, builtFolder: PLUGIN_BUILT_FOLDER })
    answer(result.built, result.built ? result.says : `${result.says} Nothing in ${PLUGINS_FOLDER}/${plugin}/${PLUGIN_BUILT_FOLDER} was changed.`)
  }
}
