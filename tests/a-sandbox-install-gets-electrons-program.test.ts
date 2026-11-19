// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INSTALL THAT FINDS ELECTRON WITHOUT ITS PROGRAM RUNS ELECTRON'S OWN INSTALL SCRIPT.
 *
 * npm ci does not run Electron's install script here, so a fresh lockfile copy has node_modules/electron but no
 * dist/ and no path.txt, and every window test starts without a program. The install step in tools/sandbox.mjs
 * (OWN_PACKAGES_AND_ORIGIN) therefore runs `node node_modules/electron/install.js` in the copy when Electron is
 * there without its program, puts its output in npm's log, and still marks the copy installed when that fails.
 *
 * This test runs the shipped script itself with `sh`, as the launcher runs it in the container, with a stand-in
 * `npm` first on the PATH. The stand-in makes node_modules/electron and a stand-in install.js; install.js writes a
 * mark when it runs, and either makes dist and path.txt or exits with a code the test chooses and makes neither.
 * Nothing is downloaded and the real Electron install is never run. The three cases are:
 *
 *   1. the program is missing after npm ci: install.js runs once, the program is there, and the copy is marked
 *      installed;
 *   2. the program is there after npm ci: install.js does not run, and the copy is marked installed;
 *   3. install.js still leaves the program missing: the copy is still marked installed, the script's exit code is
 *      the same as the successful install's, and one output line names the copy and install.js's exit code.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const THE_SCRIPT = 'const OWN_PACKAGES_AND_ORIGIN = String.raw`'

const NAME = 'a-made-up-checkout'
const VERSION = '1.0.0'
const PACKAGE_JSON = JSON.stringify({ name: NAME, version: VERSION, private: true }, null, 2) + '\n'
const PACKAGE_LOCK = JSON.stringify({ name: NAME, version: VERSION, lockfileVersion: 3, requires: true, packages: { '': { name: NAME, version: VERSION } } }, null, 2) + '\n'

/** What the stand-in npm and the stand-in install.js say when they run; each is looked for in npm's log. */
const NPM_RAN = 'the stand-in npm ran'
const INSTALL_RAN = 'the stand-in install.js ran'
/** The exit code the third case chooses. */
const INSTALL_EXIT = 37

interface Call {
  cwd: string
  home: string | null
}

interface InstallRun {
  repo: string
  dir: string
  copy: string
  log: string
  home: string
  status: number | null
  out: string
  err: string
  npm: Call[]
  installs: Call[]
}

const roots: string[] = []

/** The installer script as tools/sandbox.mjs ships it, so every case runs the shipped script and never a copy. */
function theInstaller(): string {
  const source = readFileSync(TOOL, 'utf8')
  const start = source.indexOf(THE_SCRIPT)
  if (start === -1) throw new Error('tools/sandbox.mjs holds no OWN_PACKAGES_AND_ORIGIN script')
  const open = start + THE_SCRIPT.length
  const close = source.indexOf('`', open)
  if (close === -1) throw new Error('the OWN_PACKAGES_AND_ORIGIN script is not closed')
  return source.slice(open, close)
}

/** A stand-in install.js: it writes its mark, then makes the program or exits with the code in install-fails-with. */
function aStandInInstall(fakes: string): string {
  return String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const fakes = ${JSON.stringify(fakes)}
fs.appendFileSync(path.join(fakes, 'install-runs.jsonl'), JSON.stringify({ cwd: process.cwd(), home: process.env.HOME ?? null }) + '\n')
process.stdout.write(${JSON.stringify(INSTALL_RAN)} + '\n')
const code = path.join(fakes, 'install-fails-with')
if (fs.existsSync(code)) process.exit(Number(fs.readFileSync(code, 'utf8').trim()))
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true })
fs.writeFileSync(path.join(__dirname, 'path.txt'), 'electron\n')
`
}

/** A stand-in npm: it makes node_modules/electron with the stand-in install.js, and the program only when asked. */
function aStandInNpm(fakes: string, install: string): string {
  return String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const fakes = ${JSON.stringify(fakes)}
fs.appendFileSync(path.join(fakes, 'npm-calls.jsonl'), JSON.stringify({ cwd: process.cwd(), home: process.env.HOME ?? null }) + '\n')
fs.mkdirSync(path.join('node_modules', 'electron'), { recursive: true })
fs.writeFileSync(path.join('node_modules', 'electron', 'package.json'), '{"name":"electron","version":"0.0.0"}\n')
fs.writeFileSync(path.join('node_modules', 'electron', 'install.js'), ${JSON.stringify(install)})
if (fs.existsSync(path.join(fakes, 'npm-gives-the-program'))) {
  fs.mkdirSync(path.join('node_modules', 'electron', 'dist'), { recursive: true })
  fs.writeFileSync(path.join('node_modules', 'electron', 'path.txt'), 'electron\n')
}
process.stdout.write(${JSON.stringify(NPM_RAN)} + '\n')
`
}

/** The calls a stand-in wrote down, oldest first; none when it did not run. */
function callsAt(file: string): Call[] {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Call) : []
}

/** One run of the shipped install step in a new instance folder, with the stand-ins first on the PATH. */
function aRun(what: { programAfterNpm?: boolean; installExit?: number } = {}): InstallRun {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-electron-install-'))
  roots.push(root)
  const fakes = join(root, 'fakes')
  const bin = join(fakes, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'npm'), aStandInNpm(fakes, aStandInInstall(fakes)), { mode: 0o755 })
  if (what.programAfterNpm === true) writeFileSync(join(fakes, 'npm-gives-the-program'), '')
  if (what.installExit !== undefined) writeFileSync(join(fakes, 'install-fails-with'), String(what.installExit))

  const repo = join(root, 'repo')
  const dir = join(root, 'instance')
  const home = join(dir, 'home')
  mkdirSync(repo)
  mkdirSync(home, { recursive: true })
  writeFileSync(join(repo, 'package.json'), PACKAGE_JSON)
  writeFileSync(join(repo, 'package-lock.json'), PACKAGE_LOCK)

  const ran = spawnSync('sh', ['-c', theInstaller(), 'sh', repo, dir, join(root, 'checkout'), '-', 'no', 'install'], {
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: home },
    timeout: 60_000,
  })
  const hash = createHash('sha256').update(PACKAGE_LOCK).digest('hex').slice(0, 16)
  const copy = join(dir, 'node-modules', hash)
  const logName = readdirSync(join(dir, 'logs')).find((name) => name.startsWith(`npm-ci-${hash}-`))
  if (logName === undefined) throw new Error(`the install wrote no log for ${hash} in ${join(dir, 'logs')}`)
  return {
    repo,
    dir,
    copy,
    log: join(dir, 'logs', logName),
    home,
    status: ran.status,
    out: ran.stdout ?? '',
    err: ran.stderr ?? '',
    npm: callsAt(join(fakes, 'npm-calls.jsonl')),
    installs: callsAt(join(fakes, 'install-runs.jsonl')),
  }
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe('a sandbox install gives Electron its program', () => {
  it('1: install.js runs once when npm ci left the program out, and the copy is marked installed', () => {
    const ran = aRun()
    expect(ran.status, ran.err).toBe(0)
    expect(ran.installs, `install.js ran ${String(ran.installs.length)} times`).toHaveLength(1)
    expect(ran.npm).toHaveLength(1)
    expect(ran.npm[0]).toMatchObject({ cwd: ran.copy, home: ran.home })
    expect(ran.installs[0]).toMatchObject({ cwd: ran.copy, home: ran.home })
    expect(existsSync(join(ran.copy, 'node_modules', 'electron', 'dist'))).toBe(true)
    expect(existsSync(join(ran.copy, 'node_modules', 'electron', 'path.txt'))).toBe(true)
    expect(existsSync(join(ran.copy, 'installed')), 'the copy is not marked installed').toBe(true)
    const log = readFileSync(ran.log, 'utf8')
    expect(log).toContain(NPM_RAN)
    expect(log).toContain(INSTALL_RAN)
    expect(log.indexOf(INSTALL_RAN), "install.js's output is not after npm's in the log").toBeGreaterThan(log.indexOf(NPM_RAN))
  })

  it('2: install.js does not run when npm ci gave Electron its program, and the copy is marked installed', () => {
    const ran = aRun({ programAfterNpm: true })
    expect(ran.status, ran.err).toBe(0)
    expect(ran.npm).toHaveLength(1)
    expect(ran.installs, 'install.js ran although the program was there').toEqual([])
    expect(existsSync(join(ran.copy, 'node_modules', 'electron', 'dist'))).toBe(true)
    expect(existsSync(join(ran.copy, 'node_modules', 'electron', 'path.txt'))).toBe(true)
    expect(existsSync(join(ran.copy, 'installed')), 'the copy is not marked installed').toBe(true)
    expect(readFileSync(ran.log, 'utf8')).not.toContain(INSTALL_RAN)
  })

  it('3: a failing install.js still marks the copy installed, does not fail the script, and says which copy and code', () => {
    const good = aRun()
    expect(good.status, good.err).toBe(0)
    const ran = aRun({ installExit: INSTALL_EXIT })
    expect(ran.status, ran.err).toBe(good.status)
    expect(ran.installs).toHaveLength(1)
    expect(existsSync(join(ran.copy, 'node_modules', 'electron', 'dist'))).toBe(false)
    expect(existsSync(join(ran.copy, 'node_modules', 'electron', 'path.txt'))).toBe(false)
    expect(existsSync(join(ran.copy, 'installed')), 'a failed install.js stopped the copy being marked installed').toBe(true)
    // THE LINE THAT NAMES THE COPY AND THE CODE, and not the line that says npm ci installed it.
    const lines = `${ran.out}\n${ran.err}`.split('\n')
    const line = lines.find((one) => one.includes(ran.copy) && !one.includes(ran.repo) && one.split(/\D+/).includes(String(INSTALL_EXIT)))
    expect(line, `no output line names ${ran.copy} and install.js's exit code ${String(INSTALL_EXIT)}`).toBeDefined()
    expect(line!, `the line naming ${ran.copy} does not name the log ${ran.log}`).toContain(ran.log)
  })
})
