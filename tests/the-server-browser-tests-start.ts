// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ---------------------------------------------------------------------------------------
 * THE API SERVER EVERY BROWSER TEST STARTS, BUILT ONCE AND NEVER OLDER THAN ITS SOURCES
 * ---------------------------------------------------------------------------------------
 *
 * WHAT THIS REPLACED, AND WHAT IT COST. Until wave 13t's round 32 every `liveApp` started the API
 * server through tsx, which compiles every one of the server's 649 source files again in each test
 * file's own server. Measured on 11 October 2026, the API answering /api/health took a median of
 * 2.18 s through tsx and 1.48 s from this build, of a start of about 2.4 s; about 630 browser files
 * start one each. What is left of the 1.48 s is the server's own start-up, which is not a cost of
 * compiling: its walk of its own sources for the freshness door (about 0.35 s), writing itself into
 * its ledger (about 0.28 s), Node finding the packages it imports (about 0.3 s), the default chapters
 * and the migrations.
 *
 * THE SAME SERVER CODE, READING THE SAME FILES. The build is esbuild's bundle of src/server/index.ts,
 * the same transform tsx makes of each file, with three things kept as they are under tsx:
 *   - every module's `import.meta.url` is that module's own source file, not the bundle's. The
 *     server finds the checkout, the migrations, the regulations and the built page from it
 *     (src/config/settings.mjs, THE INSTALL AND ITS DATA), and a module asks whether it is the
 *     program run by it. With the bundle's address instead, settings.mjs would look for the checkout
 *     two folders above dist/server-for-tests and every migration script would think it was run.
 *   - `process.argv[1]` is src/server/index.ts, which is what it is under tsx, so the server is the
 *     program run (isTheProgramRun in src/config/settings.mjs reads that and nothing else reads it).
 *     The operating system still shows the real command, `node dist/server-for-tests/server.mjs`.
 *   - packages are not bundled. Node loads each from node_modules, as it does under tsx.
 *
 * A STACK TRACE FROM THIS SERVER names lines of the build. The map beside it puts them back on the
 * source lines, and Node reads it only when NODE_OPTIONS holds --enable-source-maps: reading it on
 * every start cost 0.27 s of the 0.7 s this saves, measured the same day.
 *
 * NEVER OLDER THAN THE CHECKOUT. The first line of the build says what it was built from: every file
 * esbuild read, with its size and modification time taken before the file was read, and the files
 * that decide how it was read (tsconfig.json, package.json and this file). Every start compares each
 * with the file on disk. Any difference, or a file gone, and the build is made again before the
 * server starts; a build that is still not current after three builds is refused with the file that
 * differs, and the test does not start. So a test is served the code of the checkout it runs in, as
 * it was under tsx. What this cannot see: a NEW file that changes how an unchanged import resolves
 * (an index.ts added beside a file of the same name), because no file it read has changed.
 *
 * ONE BUILD FOR A RUN. The worker that makes the lock directory builds and the others wait for a
 * current build. A build left from an earlier run that is still current is used without building.
 * The build is written beside its final name and renamed into place, so a server starting while
 * another worker builds reads one whole build or the other, never half of one.
 */

import { closeSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepTheSetupWait } from './a-start-keeps-its-waits.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** The server's entry, as tsx was given it. */
export const THE_SERVER_ENTRY_FILE = join(REPO, 'src', 'server', 'index.ts')

/** The build every `liveApp` starts. Under dist/, which git ignores, and read by nothing else. */
export const THE_SERVER_BROWSER_TESTS_START = join(REPO, 'dist', 'server-for-tests', 'server.mjs')

/** The directory one worker makes while it builds, so that the others wait instead of building too. */
const WHILE_THE_SERVER_IS_BEING_BUILT = join(REPO, 'dist', 'server-for-tests-lock')

/** How the first line of a build begins. What follows it on the line is the JSON of `BuiltFrom`. */
const THE_NOTE = '// Built for the browser tests from: '

/** Every file the build depends on, each as [absolute path, size in bytes, modification time in ms]. */
interface BuiltFrom {
  entry: string
  files: [string, number, number][]
}

/** The size and modification time of a file, or null when it is not there. */
function sizeAndTime(file: string): [number, number] | null {
  try {
    const stat = statSync(file)
    return [stat.size, stat.mtimeMs]
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** The files outside the module graph that decide how the build reads it, this file among them. */
function howTheBuildReadsIt(): string[] {
  return [join(REPO, 'tsconfig.json'), join(REPO, 'package.json'), fileURLToPath(import.meta.url)]
}

/**
 * Build `entry` into `file`, with the note of what it was built from on its first line.
 *
 * Exported with `entry` and `file` as arguments because the test of the freshness rule builds a
 * small program of its own into a folder of its own; `liveApp` builds the server into
 * THE_SERVER_BROWSER_TESTS_START.
 */
export async function buildTheServer(entry: string, file: string): Promise<void> {
  const { build } = await import('esbuild')
  const seen = new Map<string, [number, number]>()
  const note = (path: string): void => {
    const now = sizeAndTime(path)
    if (now === null) throw new Error(`The server could not be built for the browser tests: ${path} is not there.`)
    seen.set(path, now)
  }
  for (const path of howTheBuildReadsIt()) note(path)
  const loaders: Record<string, 'ts' | 'tsx' | 'js' | 'json'> = { '.ts': 'ts', '.mts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.json': 'json' }
  const made = await build({
    entryPoints: [entry],
    outfile: file,
    write: false,
    metafile: true,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    tsconfig: join(REPO, 'tsconfig.json'),
    absWorkingDir: REPO,
    packages: 'external',
    sourcemap: 'linked',
    logLevel: 'silent',
    banner: { js: `process.argv[1] = ${JSON.stringify(entry)};` },
    plugins: [
      {
        name: 'each module keeps its own address',
        setup(on) {
          on.onLoad({ filter: /.*/ }, (args) => {
            const loader = loaders[extname(args.path)]
            if (loader === undefined) throw new Error(`The server build has no loader for ${args.path}.`)
            // The size and time BEFORE the read: a write after it moves the time, and the build is
            // then older than the file, which is what the next start sees.
            note(args.path)
            const text = readFileSync(args.path, 'utf8')
            const url = JSON.stringify(pathToFileURL(args.path).href)
            return { contents: loader === 'json' ? text : text.replace(/\bimport\.meta\.url\b/g, url), loader }
          })
        },
      },
    ],
  })
  for (const input of Object.keys(made.metafile.inputs)) {
    if (!seen.has(join(REPO, input))) {
      throw new Error(`The server build read ${input} without noting its time, so nothing could tell when it is stale.`)
    }
  }
  const code = made.outputFiles.find((output) => output.path === file)
  const map = made.outputFiles.find((output) => output.path === `${file}.map`)
  if (code === undefined || map === undefined) throw new Error(`esbuild did not make ${file} and its map.`)
  const builtFrom: BuiltFrom = { entry, files: [...seen].map(([path, [size, at]]) => [path, size, at]) }
  mkdirSync(dirname(file), { recursive: true })
  const partial = `.${String(process.pid)}.partial`
  // The note is one line more above the code, so the map starts one line later: one more `;` at the
  // start of its mappings is one more line with nothing on it.
  writeFileSync(`${file}.map${partial}`, map.text.replace('"mappings": "', '"mappings": ";'))
  writeFileSync(`${file}${partial}`, `${THE_NOTE}${JSON.stringify(builtFrom)}\n${code.text}`)
  renameSync(`${file}.map${partial}`, `${file}.map`)
  renameSync(`${file}${partial}`, file)
}

/** The first line of a file, read without reading the rest of it. Null when there is no file. */
function firstLineOf(file: string): string | null {
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    const chunks: Buffer[] = []
    for (;;) {
      const chunk = Buffer.alloc(256 * 1024)
      const read = readSync(fd, chunk, 0, chunk.length, null)
      const end = chunk.subarray(0, read).indexOf(10)
      if (end !== -1) return Buffer.concat([...chunks, chunk.subarray(0, end)]).toString('utf8')
      if (read === 0) return Buffer.concat(chunks).toString('utf8')
      chunks.push(chunk.subarray(0, read))
    }
  } finally {
    closeSync(fd)
  }
}

/**
 * WHY THE BUILD AT `file` IS NOT THE BUILD OF THE FILES ON DISK, or null when it is.
 *
 * The answer names the first file that differs, so a refusal can say which.
 */
export function whyTheServerBuildIsNotCurrent(file: string, entry = THE_SERVER_ENTRY_FILE): string | null {
  const line = firstLineOf(file)
  if (line === null) return `there is no build at ${file}`
  if (!line.startsWith(THE_NOTE)) return `${file} does not begin with the note of what it was built from`
  let said: BuiltFrom
  try {
    said = JSON.parse(line.slice(THE_NOTE.length)) as BuiltFrom
  } catch {
    return `the note at the top of ${file} cannot be read`
  }
  if (said.entry !== entry) return `${file} was built from ${said.entry}, not ${entry}`
  for (const [path, size, at] of said.files) {
    const now = sizeAndTime(path)
    if (now === null) return `${path}, which it was built from, is gone`
    if (now[0] !== size || now[1] !== at) return `${path} has changed since the build`
  }
  return null
}

/** Is that process still there? `signal 0` asks without sending anything; EPERM is still there. */
function thatProcessIsStillThere(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/**
 * THE BUILD TO START, CURRENT, OR A REFUSAL.
 *
 * `build` is an argument so that the test of the refusal can hand in a build that leaves the file
 * stale; every `liveApp` takes the default.
 */
export async function theServerBrowserTestsStart(
  file = THE_SERVER_BROWSER_TESTS_START,
  entry = THE_SERVER_ENTRY_FILE,
  build: (entry: string, file: string) => Promise<void> = buildTheServer,
  lock = WHILE_THE_SERVER_IS_BEING_BUILT,
): Promise<string> {
  let builds = 0
  const deadline = Date.now() + 300_000
  // Who took the lock, let it go, waited for it and removed it goes in the test file's startup
  // journal, because the note inside the lock is gone by the time anybody reads a red run.
  const me = `process ${String(process.pid)}`
  const named = relative(REPO, lock)
  let waitedFor: number | null = null
  for (;;) {
    const why = whyTheServerBuildIsNotCurrent(file, entry)
    if (why === null) return file
    if (builds >= 3 || Date.now() >= deadline) {
      throw new Error(
        `liveApp will not start the API server from ${file}: it is not the build of this checkout's sources ` +
          `(${why}), after ${String(builds)} builds by this process. A stale build would be a test passing ` +
          'against code that is no longer there, so nothing is started.',
      )
    }
    mkdirSync(dirname(lock), { recursive: true })
    let mine = false
    try {
      mkdirSync(lock)
      mine = true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    if (mine) {
      try {
        writeFileSync(join(lock, 'who.txt'), `process ${String(process.pid)}\n`)
        keepTheSetupWait(me, `took ${named}`)
        builds += 1
        await build(entry, file)
      } finally {
        rmSync(lock, { recursive: true, force: true })
        keepTheSetupWait(me, `let go of ${named}`)
      }
      continue
    }
    // A LOCK NOBODY HOLDS IS TAKEN OVER, as the page's is: a worker killed while building never
    // removes it. Null is the instant between making the lock and writing the name, and is waited.
    let holder: number | null = null
    try {
      const found = /^process (\d+)$/m.exec(readFileSync(join(lock, 'who.txt'), 'utf8'))
      holder = found === null ? null : Number(found[1])
    } catch (err) {
      // Gone between the look and the read: the builder finished, and the next turn sees its build.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    if (holder !== null && !thatProcessIsStillThere(holder)) {
      rmSync(lock, { recursive: true, force: true })
      keepTheSetupWait(me, `removed ${named}, which process ${String(holder)} held and has ended`)
      continue
    }
    if (holder !== null && holder !== waitedFor) {
      waitedFor = holder
      keepTheSetupWait(me, `waits for ${named}, which process ${String(holder)} holds`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
