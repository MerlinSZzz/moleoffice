// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GUARD PROTECTS THE PAIRED OFFICE'S OWN DATABASE, KEYS FILE AND BACKUPS.
 *
 * A paired office serves from a stable checkout, and the development checkout's `.env` names its
 * database. The worker runs the stable checkout's code with the pairing, and it mounts the stable
 * checkout's hook on each agent run. The hook runs in the agent's environment, and `envFor` lets no
 * MOLE_OFFICE_ name into it, so the hook cannot see the pairing. If it worked the office's paths out
 * from its own checkout's settings, it would protect the stable checkout's default database, which
 * nobody uses. So the worker works the three paths out and writes them on the hook's command line.
 *
 * A stable-like checkout and a development-like one are made here, under the temporary directory.
 * The office's database is in a folder that is not called `data`. So neither the keys file nor the
 * backups folder is caught by the policy's rule for any `data/keys.json` and `data/backups`. Each of
 * the three is protected only when the hook was told where it is.
 *
 * WHAT IS PROVED, one case each:
 *   - the worker's side: `guardArgv`, run in the stable-like checkout with the pairing, names the
 *     development checkout's database, keys file and backups folder;
 *   - the hook's side: that command line, run in an environment with no MOLE_ name, stops a delete
 *     of each of the three with the policy's sentence, and lets a delete beside them through;
 *   - in an office sandbox (SANDBOX_DIR set), the same command line still stands down;
 *   - a command line that names only some of the three is the guard failing: a delete is stopped.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, each restored after
 * ---------------------------------------------------------------------------------------
 *
 *   the hook ignores the command line and works the paths out from its own settings
 *                               → the three-deletes case and the some-of-the-three case are red.
 *   `guardArgv` writes no paths → the worker's case, the three-deletes case and the
 *                                 some-of-the-three case are red.
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const source = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
let root = '', dev = '', stable = '', office = '', database = '', keys = '', backups = '', work = ''

/** The test's own environment without any MOLE_ name, which is what `envFor` gives a run. */
function environment(pair = false): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  if (pair) env['MOLE_OFFICE_DEVELOPMENT_CHECKOUT'] = dev
  return env
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'guard-paired-paths-')))
  dev = join(root, 'development'); stable = join(root, 'stable'); work = join(root, 'work')
  office = join(dev, 'office'); database = join(office, 'the-office.sqlite')
  keys = join(office, 'keys.json'); backups = join(office, 'backups')
  // Settings asks of a development checkout only that it has a .git entry and a .env naming the stable one.
  for (const dir of [join(dev, '.git'), backups, stable, work]) mkdirSync(dir, { recursive: true })
  writeFileSync(database, ''); writeFileSync(keys, '{}\n'); writeFileSync(join(office, 'notes.txt'), 'made up for this test\n')
  writeFileSync(join(dev, '.env'), `MOLE_OFFICE_DB=${database}\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
  // The pictures under tools/review are not code, and they are most of the folder's size.
  const notPictures = (from: string) => !from.startsWith(join(source, 'tools', 'review'))
  for (const name of ['src', 'tools', 'for-agents', 'package.json', 'tsconfig.json']) {
    cpSync(join(source, name), join(stable, name), { recursive: true, filter: notPictures })
  }
  symlinkSync(join(source, 'node_modules'), join(stable, 'node_modules'))
}, 60_000)

afterAll(() => { if (root !== '') rmSync(root, { recursive: true, force: true }) })

/** The hook's command line for one agent run, as the worker of the paired office writes it. */
function theWorkersCommandLine(): string[] {
  const module = pathToFileURL(join(stable, 'src', 'config', 'main-world-guard.mjs')).href
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', `const g = await import(${JSON.stringify(module)}); process.stdout.write(JSON.stringify(g.guardArgv('builder-x')))`], {
    cwd: stable, env: environment(true), encoding: 'utf8', timeout: 30_000,
  })
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as string[]
}

/**
 * Start the hook from its command line with one Bash call, in an agent's environment.
 * `~` is the shell's `$HOME`, and the policy knows the home from the password database, so the two
 * are set equal, as on a plain machine. SANDBOX_DIR says an office sandbox started the process.
 */
async function hook(argv: string[], command: string, sandbox: string | null = null): Promise<{ status: number | null; stderr: string }> {
  const env = environment()
  env['HOME'] = userInfo().homedir
  if (sandbox === null) delete env['SANDBOX_DIR']
  else env['SANDBOX_DIR'] = sandbox
  const [node, ...rest] = argv
  const child = spawn(node ?? process.execPath, rest, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
  child.stdin.end(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: work }))
  const status = await new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  return { status, stderr }
}

describe('the hook of a paired office is told the office’s paths', () => {
  it('is given the development checkout’s database, keys file and backups by the worker', () => {
    expect(theWorkersCommandLine()).toEqual([
      process.execPath, join(stable, 'tools', 'guard', 'main-world-guard.mjs'), '--agent', 'builder-x',
      '--database', database, '--keys', keys, '--backups', backups,
    ])
  })

  it('stops a delete of each of the three, and lets a delete beside them through', async () => {
    const argv = theWorkersCommandLine()
    const db = await hook(argv, `rm ${database}`)
    expect(db.status, db.stderr).toBe(2)
    expect(db.stderr).toContain(`would delete the office's live database (${database})`)
    const file = await hook(argv, `rm -f ${keys}`)
    expect(file.status, file.stderr).toBe(2)
    expect(file.stderr).toContain(`would delete the office's keys file (${keys})`)
    const folder = await hook(argv, `rm -rf ${backups}`)
    expect(folder.status, folder.stderr).toBe(2)
    expect(folder.stderr).toContain(`would delete the office's backups (${backups})`)
    const beside = await hook(argv, `rm ${join(office, 'notes.txt')}`)
    expect(beside.status, beside.stderr).toBe(0)
  })

  it('still stands down in an office sandbox', async () => {
    const got = await hook(theWorkersCommandLine(), `rm ${database}`, join(root, 'a-sandbox'))
    expect(got.status, got.stderr).toBe(0)
    expect(got.stderr).toBe('')
  })

  it('stops a delete when the command line names only some of the three paths', async () => {
    const argv = theWorkersCommandLine()
    const got = await hook(argv.slice(0, argv.indexOf('--keys')), `rm ${join(office, 'notes.txt')}`)
    expect(got.status, got.stderr).toBe(2)
    expect(got.stderr).toContain('The guard itself failed')
    expect(got.stderr).toContain('--database, --keys and --backups')
  })
})
