// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE CONFIGURATION SOURCE — criterion G1 of design/ground/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS, AND WHAT IT COST
 * ---------------------------------------------------------------------------------------
 *
 * Problem 21 of design/PROBLEM-REGISTER-OWNER-MESSAGE.md:
 *
 *     Server, Vite, session hook and the related clients take their configuration from one source.
 *     No process reads .env while another silently falls back to an old hardcoded port.
 *
 * That is not a hypothetical. When MOLE_OFFICE_PORT moved, `tools/session-hook.mjs` went on
 * resolving 8787, where a scratch copy of the corpus was answering in place of the live office.
 * Every session would have been filed into the wrong database, and the hook is
 * written never to block a session, so nothing would have said so.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS BELOW, AND WHY EACH ONE IS A SEPARATE QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * 1. **Nothing but the declaration reads a setting.** No `process.env.MOLE_OFFICE_…`, no
 *    `process.loadEnvFile`, no Vite `loadEnv`. This is the strongest of the three, because a second
 *    READER is what drifts; a number written into a sentence is only a symptom.
 * 2. **Nothing but the declaration writes a port number or a loopback address into its code.** The
 *    grep the criterion asks for.
 * 3. **The declaration is loadable by the Node the session hook actually gets**, which was measured
 *    at v18.19.1 on this machine. That is why it is JavaScript, and a `.ts` import creeping into
 *    any of its three callers would break session filing quietly.
 *
 * COMMENTS ARE STRIPPED BEFORE ANY OF THIS IS ASKED. Half the value of this repository is in prose
 * that names the ports and the mistakes they caused, and a check that could not tell a sentence
 * from a fallback would either be useless or would delete the history. `withoutComments` from
 * tests/config.test.ts does the stripping, so there is one of those rather than two.
 */

import { apiServerArguments } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { withoutComments } from './config.test.ts'
import {
  ENV_FILE,
  SETTINGS,
  findEnvFile,
  mergedEnvironment,
  readSetting,
  settingNamed,
  settingNames,
  settingWasSet,
  settings,
  settingsFrom,
} from '../src/config/settings.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The one file allowed to know any of this. */
const DECLARATION = 'src/config/settings.mjs'

/** The file names these checks read: code the server, the browser app, the scripts or the tools run. */
const CODE = /\.(ts|tsx|mjs|js)$/

/**
 * THE FILES GIT CARRIES UNDER `pathspecs`, AND THE ONES IT IGNORES, as paths from `root`.
 *
 * `carried` is every tracked file and every new file git does not ignore, which is what a commit
 * of this checkout can hold. `ignored` is every file git ignores there. Until 29 September 2026 the
 * checks below walked the folders with the file system, so a file git ignores counted: three probe
 * scripts somebody had left under tools/ and never committed (tools/.b5-measure.mjs and two more)
 * turned this file red on the live checkout, while a fresh worktree of the same commit was green
 * (problem XgYsvDzwASoX). A file nobody can commit is not part of the code, so it is skipped here,
 * and each check that fails names the ignored files it skipped that would also have failed it.
 *
 * A tracked file that is missing from the working tree is left out: there is nothing on disk to run.
 * If git cannot answer, this throws, because a check that read no files would pass for nothing.
 */
export function filesGitCarries(root: string, pathspecs: string[]): { carried: string[]; ignored: string[] } {
  const list = (...flags: string[]): string[] =>
    execFileSync('git', ['ls-files', '-z', ...flags, '--', ...pathspecs], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter((path) => CODE.test(path))
  const carried = [...new Set(list('--cached', '--others', '--exclude-standard'))].filter((path) =>
    existsSync(join(root, path)),
  )
  const ignored = list('--others', '--ignored', '--exclude-standard')
  return { carried: carried.sort(), ignored: ignored.sort() }
}

/**
 * Every file of ours that runs: the server, the browser app, the scripts, the tools and the build
 * configurations at the top of the checkout. Not `tests/`, with one exception below — see
 * `THE TEST HELPERS` there. Only what git carries: see `filesGitCarries`.
 */
function filesThatRun(): { files: string[]; skipped: string[] } {
  const { carried, ignored } = filesGitCarries(ROOT, ['src', 'scripts', 'tools', 'for-agents', ':(glob)*.config.ts'])
  // THE TEST HELPERS. `tests/helpers.ts` starts real servers and points a real browser at them, so
  // it is a client of the settings exactly as the tools are. The rest of `tests/` is left out on
  // purpose: a test SETS a variable to drive the code, and setting one is using the environment,
  // which is the declaration's own first layer.
  return { files: [...carried, 'tests/helpers.ts'].sort(), skipped: ignored }
}

const { files: FILES, skipped: SKIPPED } = filesThatRun()

/** The code of a file with its comments removed. */
function codeOf(path: string, root = ROOT): string {
  return withoutComments(readFileSync(join(root, path), 'utf8'))
}

/** The API's and the browser app's default ports, as src/config/settings.mjs declares them. */
const THE_DEFAULT_API_PORT = String(settingNamed('MOLE_OFFICE_PORT').fallback)
const THE_DEFAULT_WEB_PORT = String(settingNamed('MOLE_OFFICE_WEB_PORT').fallback)

/** Whether code, comments already removed, writes a Mole Office address: host and a default port together. */
function writesAnAddress(code: string): boolean {
  return new RegExp(`(127\\.0\\.0\\.1|localhost|0\\.0\\.0\\.0):(${THE_DEFAULT_API_PORT}|${THE_DEFAULT_WEB_PORT})\\b`).test(code)
}

describe('one module declares every setting, and nothing else reads one', () => {
  it('finds the files it is about, so an empty result cannot pass as a clean one', () => {
    // A walk that silently found nothing would make every assertion below vacuously true, which is
    // the way a grep test dies without anybody noticing.
    expect(FILES.length).toBeGreaterThan(100)
    expect(FILES).toContain(DECLARATION)
    expect(FILES).toContain('src/server/index.ts')
    expect(FILES).toContain('vite.config.ts')
    expect(FILES).toContain('tools/session-hook.mjs')
    expect(FILES).toContain('for-agents/session-hook.mjs')
    expect(FILES).toContain('tests/helpers.ts')
  })

  it('reads what git carries and skips what git ignores, so a leftover probe cannot turn it red', () => {
    // A checkout of this test's own, in a temporary folder, with a probe script git ignores and a
    // tool git tracks, both writing an address into their code. Only the tracked one is read.
    const own = aTestDatabaseFolder('one-configuration-source')
    try {
      const git = (...args: string[]): void => {
        execFileSync('git', args, { cwd: own, stdio: 'ignore' })
      }
      git('init', '-q')
      mkdirSync(join(own, 'tools'))
      writeFileSync(join(own, '.gitignore'), 'tools/.*\n')
      writeFileSync(join(own, 'tools', 'tracked.mjs'), `fetch('http://127.0.0.1:${THE_DEFAULT_API_PORT}/api')\n`)
      writeFileSync(join(own, 'tools', 'new.mjs'), "fetch('http://localhost:5173/')\n")
      writeFileSync(join(own, 'tools', '.b5-probe.mjs'), `fetch('http://127.0.0.1:${THE_DEFAULT_API_PORT}/api')\n`)
      git('add', '.gitignore', 'tools/tracked.mjs')

      const { carried, ignored } = filesGitCarries(own, ['tools'])
      expect(carried, 'a tracked file and a new file git does not ignore are both read').toEqual([
        'tools/new.mjs',
        'tools/tracked.mjs',
      ])
      expect(ignored, 'the probe git ignores is named as skipped').toEqual(['tools/.b5-probe.mjs'])
      expect(
        carried.filter((path) => writesAnAddress(codeOf(path, own))),
        'the address check still finds the files git carries',
      ).toEqual(['tools/new.mjs', 'tools/tracked.mjs'])
    } finally {
      rmSync(own, { recursive: true, force: true })
    }
  })

})

describe('the declaration says what every setting is and where its value came from', () => {
  it('declares the seven values criterion G1 names', () => {
    const declared = settingNames()
    for (const name of [
      'MOLE_OFFICE_PORT',
      'MOLE_OFFICE_WEB_PORT',
      'MOLE_OFFICE_API',
      'MOLE_OFFICE_DB',
      'MOLE_OFFICE_VITE_CACHE',
      'MOLE_OFFICE_WORKSPACE',
    ]) {
      expect(declared, `${name} is not declared`).toContain(name)
    }
    const resolved = settingsFrom({})
    expect(resolved.apiPort).toBe(8787)
    expect(resolved.webPort).toBe(5173)
    expect(resolved.apiAddress).toBe('http://127.0.0.1:8787')
    expect(resolved.webAddress).toBe('http://127.0.0.1:5173')
    // `default`, the project every office has, since 30 September 2026, by FLO-02 of a
    // decision.
    expect(resolved.workspace).toBe('default')
    expect(resolved.viteCacheDir).toBe(join(ROOT, '.cache/vite'))
  })

  it('gives every setting a sentence and a stated meaning for absence', () => {
    for (const s of SETTINGS) {
      expect(s.what, `${s.name} has no description`).toBeTruthy()
      // Exactly one of the two: a default, or a statement of what absence means. Both, or neither,
      // would leave a reader guessing what an unset variable does.
      const hasDefault = s.fallback !== null
      const hasAbsence = s.absentMeans !== null
      expect(hasDefault !== hasAbsence, `${s.name} must state a default OR what absent means`).toBe(true)
    }
  })

  it('derives the API address from the port, which is the fault of 28 August 2026', () => {
    // `.env.example` used to say "IF YOU MOVE THE API OFF 8787, SET THIS TOO. Nothing derives one
    // from the other." Nothing did, the port moved, and the hook filed nowhere.
    expect(settingsFrom({ MOLE_OFFICE_PORT: '39017' }).apiAddress).toBe('http://127.0.0.1:39017')
    // An address somebody wrote down still wins over the derived one.
    expect(
      settingsFrom({ MOLE_OFFICE_PORT: '39017', MOLE_OFFICE_API: 'http://127.0.0.1:9/' }).apiAddress,
    ).toBe('http://127.0.0.1:9')
  })

  it('refuses a name it has never heard of rather than answering undefined', () => {
    expect(() => readSetting('MOLE_OFFICE_MIRROR', {})).toThrow('not a Mole Office setting')
    // The refusal lists what there is, because the commonest cause is a typo.
    expect(() => readSetting('MOLE_OFFICE_PROT', {})).toThrow('MOLE_OFFICE_PORT')
  })

  it('refuses a set-but-empty value, except the two lists where empty is an instruction', () => {
    expect(() => readSetting('MOLE_OFFICE_PORT', { MOLE_OFFICE_PORT: '' })).toThrow('empty value')
    expect(() => readSetting('MOLE_OFFICE_DB', { MOLE_OFFICE_DB: '  ' })).toThrow('empty value')
    // Watch nothing, and preview nothing, are things a person may mean.
    expect(readSetting('MOLE_OFFICE_LOCK_PATHS', { MOLE_OFFICE_LOCK_PATHS: '' }).value).toBe('')
    expect(readSetting('MOLE_OFFICE_PREVIEW_ROOTS', { MOLE_OFFICE_PREVIEW_ROOTS: '' }).value).toBe('')
  })

  it('says which of the three places a value came from', () => {
    expect(readSetting('MOLE_OFFICE_PORT', {}).source).toBe('the built-in default')
    expect(readSetting('MOLE_OFFICE_PORT', { MOLE_OFFICE_PORT: '1' }).source).toBe('the environment')
    expect(readSetting('MOLE_OFFICE_REMOTE_PORT', {}).source).toBe('nothing set it')
    // Against a real `.env` on disk, the two layers are told apart rather than merged. A file with
    // one line in it is enough, and it must not be this checkout's own.
    const elsewhere = join(ROOT, '.env.example')
    expect(settings({}, elsewhere).sources['MOLE_OFFICE_PORT']).toBe('.env')
    expect(settings({ MOLE_OFFICE_PORT: '4242' }, elsewhere).sources['MOLE_OFFICE_PORT']).toBe('the environment')
    expect(settings({ MOLE_OFFICE_PORT: '4242' }, elsewhere).apiPort).toBe(4242)
  })

  it('reads nothing from a .env that is not there, and does not call that an error', () => {
    const missing = join(ROOT, '.env.this-file-does-not-exist')
    expect(mergedEnvironment({}, missing)).toEqual({})
    expect(settings({}, missing).envFile).toEqual({ path: missing, found: false })
    expect(settingWasSet('MOLE_OFFICE_PORT', {}, missing)).toBe(false)
  })

  it('finds .env for this checkout, never beside whoever ran the command', () => {
    // AN ORDINARY CHECKOUT READS ITS OWN FILE. A WORKTREE HAS NONE — `.env` is gitignored — so it
    // reads the main checkout the worktree was made from, found through git rather than through the
    // working directory. The worktree rule is proved in
    // tests/the-resolver-reads-the-main-checkouts-env-from-a-worktree.test.ts; this line is only
    // about the declaration answering for this checkout and not for wherever the command ran.
    const local = join(ROOT, '.env')
    expect(ENV_FILE).toBe(findEnvFile(ROOT).path)
    if (existsSync(local)) expect(ENV_FILE).toBe(local)
    else if (findEnvFile(ROOT).found) expect(ENV_FILE).not.toBe(local)
  })
})


/**
 * A RELATIVE DATABASE PATH MEANS ONE FILE, WHOEVER IS ASKING AND WHEREVER THEY RAN THE COMMAND.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `wbosGYxUfsZz`. `databasePathFrom` resolved a relative `MOLE_OFFICE_DB` against
 * `process.cwd()` and `canonicalDatabasePath` resolved it against the checkout, so the same setting
 * had two meanings in one file and which one you got depended on where somebody typed the command.
 * The declared default, `./data/panelx.db`, is checkout intent written as a relative path.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE READERS, ASKED FOR REAL
 * ---------------------------------------------------------------------------------------
 *
 * A real server with a relative path; the session hook, run from a directory that is NOT the
 * checkout; and `tools/listeners.mjs`, run from there too. All three have to name one absolute
 * file, and the hook is the one that shows it: it compares the database the declaration names with
 * the one the answering server says it has, and refuses to file a session when they differ. So its
 * own sentence is the proof.
 *
 * THE PATH IS A SCRATCH NAME UNDER `data/`, never the declared default: a test that let the default
 * through would open the operator's own corpus with permission to write to it.
 *
 * THE SERVER RUNS FROM THE CHECKOUT, and that is not a weakening. `tsx` finds the `@shared` path
 * alias by looking for `tsconfig.json` from the working directory up, so a server started outside
 * the checkout does not load at all — measured here, ERR_MODULE_NOT_FOUND on `@shared/kinds.ts`.
 * What this fixes is readers disagreeing about one setting, and the hook and the tool are readers.
 */
describe('a relative database path means the same file to every reader', () => {
  /**
   * THE FILES ARE NOT IN THE CHECKOUT, ONLY THE NAME IS (problem nd7jOk5LCU4s). This server used to
   * open `data/<name>.db` in the checkout itself and leave its `keys.json` there: when the checkout
   * was a worktree, the session hook read that file as its office's key. A worktree's own data
   * folder is now refused before anything is written, so the name runs through a link in `data/`
   * to a temporary folder. The path every reader is asked about is still relative and still the
   * checkout's; what is written lands in the temporary folder.
   */
  const folder = `mole-office-relative-${String(process.pid)}`
  const link = join(ROOT, 'data', folder)
  const name = 'mole-office.db'
  const expected = join(link, name)
  const relative = `data/${folder}/${name}`
  let server: ChildProcess | null = null
  let elsewhere = ''
  let outside = ''

  beforeAll(async () => {
    const { mkdirSync, mkdtempSync, symlinkSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    outside = aTestDatabaseFolder('relative')
    mkdirSync(join(ROOT, 'data'), { recursive: true })
    symlinkSync(outside, link, 'dir')
  })

  afterAll(async () => {
    if (server?.pid !== undefined && server.pid !== null) {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    await new Promise((r) => setTimeout(r, 300))
    rmSync(link, { force: true })
    if (outside !== '') rmSync(outside, { recursive: true, force: true })
    if (elsewhere !== '') rmSync(elsewhere, { recursive: true, force: true })
  })

  function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = createServer()
      probe.on('error', reject)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        if (address === null || typeof address === 'string') {
          probe.close(() => { reject(new Error('the probe socket reported no port')) })
          return
        }
        const { port } = address
        probe.close(() => { resolve(port) })
      })
    })
  }

  /**
   * Run a command from a given directory and hand back what it said, the two streams apart.
   *
   * Apart, because `tools/where-is-the-api.mjs` prints a line to stderr saying which address it
   * resolved, and `--json` promises that STDOUT is JSON. Merging them made this test try to parse
   * that line.
   */
  function say(args: string[], cwd: string, env: NodeJS.ProcessEnv, stdin?: string): Promise<{ out: string; all: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('node', args, { cwd, env })
      let out = ''
      let all = ''
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString('utf8')
        all += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => { all += chunk.toString('utf8') })
      child.on('error', reject)
      child.on('close', () => { resolve({ out, all }) })
      child.stdin.end(stdin ?? '')
    })
  }

  it('is one absolute path in the settings, whatever directory the reader is in', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    elsewhere = aTestDatabaseFolder('not-the-checkout')
    // THE RULE ITSELF, ASKED FROM SOMEWHERE ELSE. Reading it in this process would prove nothing:
    // the test runner's working directory IS the checkout, so the two rules agree here.
    const said = await say(
      ['-e', `import('${join(ROOT, 'src/config/settings.mjs')}').then((m) => { console.log(m.settings().databasePath) })`],
      elsewhere,
      { ...process.env, MOLE_OFFICE_DB: relative },
    )
    expect(said.out.trim(), said.all).toBe(expected)
    // And an absolute value is left exactly as it was, which is what every test helper sends.
    expect(settingsFrom({ ...mergedEnvironment(), MOLE_OFFICE_DB: '/tmp/somewhere/else.db' }).databasePath).toBe(
      '/tmp/somewhere/else.db',
    )
  }, 30_000)

  it('is the same file on GET /api/runtime, in the session hook and in tools/listeners.mjs', async () => {
    const port = await freePort()
    const api = `http://127.0.0.1:${String(port)}`
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MOLE_OFFICE_PORT: String(port),
      MOLE_HOOK_DETAILS_FOLDER: join(outside, 'hook-details'),
      // RELATIVE, which is the whole point, and a name nothing else uses.
      MOLE_OFFICE_DB: relative,
      MOLE_OFFICE_API: api,
      // The project this scratch database holds. A fresh database has only `default`, and the hook
      // and the tool both name a project on every request.
      MOLE_OFFICE_WORKSPACE: 'default',
      LOG_LEVEL: 'warn',
    }
    delete env['VITEST']
    delete env['VITEST_WORKER_ID']

    server = spawn(join(ROOT, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: ROOT,
      env,
      detached: true,
      stdio: 'ignore',
    })
    let runtime: { database: { path: string; canonicalPath: string } } | null = null
    for (let tries = 0; tries < 180; tries += 1) {
      try {
        const answered = await fetch(`${api}/api/runtime`, { headers: { 'x-mole-office-workspace': 'default' } })
        if (answered.ok) {
          runtime = (await answered.json()) as { database: { path: string; canonicalPath: string } }
          break
        }
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    expect(runtime, `the server never answered ${api}/api/runtime`).not.toBeNull()

    // READER ONE: the server, which opened the file.
    expect(runtime?.database.path).toBe(expected)

    /**
     * AND THE CANONICAL DATABASE, WHICH IS A DIFFERENT QUESTION AND THE SAME RULE.
     *
     * `database.canonicalPath` is what THIS CHECKOUT would open with nothing set in a shell:
     * `canonicalDatabasePath` reads `.env` and ignores the environment. So the thing to check is the
     * RULE — a relative value in that declaration resolves against the checkout, never against the
     * directory somebody happened to run a command in — and not the name of the file this checkout's
     * own `.env` happens to hold.
     *
     * IT USED TO ASSERT `join(ROOT, 'data', 'panelx.db')`, and problem `b30w8o8Y1CQ0` is what that
     * cost: every worktree running a scratch stack must name its own database in its own `.env`, and
     * CLAUDE.md tells every builder and every verifier to work in a worktree. The suite was red there
     * for a reason that had nothing to do with the code, and a real failure of the other 67
     * assertions would have arrived inside a run that was already red.
     *
     * BOTH READINGS BELOW ARE MADE FROM A DIRECTORY THAT IS NOT THE CHECKOUT, which is what makes
     * them a test of the rule. A reader that resolved against the working directory would answer
     * something under `elsewhere` and disagree with the server, whose working directory is the
     * checkout.
     */
    const declared = await say(
      ['-e', `import('${join(ROOT, 'src/config/settings.mjs')}').then((m) => { console.log(m.canonicalDatabasePath()) })`],
      elsewhere,
      env,
    )
    expect(declared.out.trim(), declared.all).not.toBe('')
    expect(runtime?.database.canonicalPath, declared.all).toBe(declared.out.trim())

    /**
     * AND THE RULE ITSELF, AGAINST A DECLARATION THIS TEST WROTE. Whatever the checkout's own `.env`
     * says — or whether it has one at all — a declaration naming a relative database means one file,
     * and it is under the checkout.
     */
    const aDeclarationNamingARelativeDatabase = join(elsewhere, 'declares-a-relative-database')
    writeFileSync(aDeclarationNamingARelativeDatabase, `MOLE_OFFICE_DB=${relative}\n`)
    const fromThatDeclaration = await say(
      [
        '-e',
        `import('${join(ROOT, 'src/config/settings.mjs')}').then((m) => { ` +
          `console.log(m.canonicalDatabasePath(${JSON.stringify(aDeclarationNamingARelativeDatabase)})) })`,
      ],
      elsewhere,
      env,
    )
    expect(fromThatDeclaration.out.trim(), fromThatDeclaration.all).toBe(expected)

    // READER TWO: the session hook, run from a directory that is not the checkout.
    const hook = await say(
      [join(ROOT, 'tools', 'session-hook.mjs'), 'start'],
      elsewhere,
      env,
      JSON.stringify({ session_id: 'a-relative-database-test' }),
    )
    expect(hook.all).toContain('is filed in the world this checkout declares')

    // READER THREE: tools/listeners.mjs, which asks the server rather than reading the machine.
    const listed = await say([join(ROOT, 'tools', 'listeners.mjs'), '--api', api, '--json'], elsewhere, env)
    expect(listed.out.startsWith('{'), `tools/listeners.mjs said: ${listed.all}`).toBe(true)
    const report = JSON.parse(listed.out) as { answeredBy: { database: string } }
    expect(report.answeredBy.database).toBe(expected)
  }, 180_000)
})
