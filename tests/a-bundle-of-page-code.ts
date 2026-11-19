// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST'S PAGE CODE IS BUNDLED HERE, SO THAT A STYLESHEET A PAGE MODULE IMPORTS IS READ AS EMPTY IN ONE PLACE.
 *
 * On 14 November 2026 the maths drawing in src/web began to import KaTeX's stylesheet. esbuild, asked
 * for a bundle with no output folder, refuses a stylesheet imported from JavaScript, and refuses the
 * font files that stylesheet names. Six tests that bundle page code had no loader for it, and the
 * main line was red for over four hours. A test's page is drawn without the app's stylesheets, so
 * the right reading of an imported stylesheet in a test bundle is an empty one.
 *
 * `bundlePageCode` takes esbuild's options and adds that one loader, keeping every loader the test
 * names for another kind of file. The bundle is otherwise what esbuild's `build` returns for the
 * same options.
 *
 * A PAGE MODULE THAT STARTS A WORKER IS BUNDLED WITH THAT WORKER (round 231). The lanes drawing routes its lines in a
 * module worker, started as `new Worker(new URL("./routing-worker.ts", import.meta.url), { type: "module" })`, which
 * Vite builds as a file of its own. esbuild leaves that address as it is written, so a test's page would ask for a file
 * that nobody serves. Here each such address is replaced by a blob: address that holds the worker's own bundle, built
 * with the same options.
 */
import { build, type BuildOptions, type BuildResult, type Plugin } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const A_WORKER_ADDRESS = /new Worker\(\s*new URL\(\s*(["'])(\.{1,2}\/[^"']+)\1\s*,\s*import\.meta\.url\s*\)/g

function eachWorkerBundled(options: BuildOptions): Plugin {
  return {
    name: 'a-page-modules-worker-at-a-blob-address',
    setup(bundler) {
      bundler.onLoad({ filter: /[\\/]src[\\/]web[\\/].*\.tsx?$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const starts = [...source.matchAll(A_WORKER_ADDRESS)]
        if (starts.length === 0) return undefined
        let contents = source
        for (const [start, , address] of starts) {
          const entry = resolve(dirname(args.path), address!)
          const worker = await build({ ...options, stdin: undefined, entryPoints: [entry], outfile: undefined, outdir: undefined, metafile: false, bundle: true, write: false, format: 'esm' })
          const code = worker.outputFiles[0]!.text
          contents = contents.replace(start, () => `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(code)}], { type: "text/javascript" }))`)
        }
        return { contents, loader: args.path.endsWith('x') ? 'tsx' : 'ts' }
      })
    },
  }
}

// The result is typed by the options the test passed, so that `write: false` still says there are output files.
export function bundlePageCode<T extends BuildOptions>(options: T): Promise<BuildResult<T>> {
  const withTheLoader: BuildOptions = { ...options, loader: { ...options.loader, '.css': 'empty' } }
  return build({ ...withTheLoader, plugins: [eachWorkerBundled(withTheLoader), ...(options.plugins ?? [])] }) as Promise<BuildResult<T>>
}
