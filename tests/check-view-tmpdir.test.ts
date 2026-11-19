// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real controller and private-folder lifecycle with synthetic Docker; no mount enforcement. */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { leaveTheSandbox, runInside, THE_LOGIN_FILES_IN_A_CHECK_VIEW } from '../tools/inspector-sandbox.mjs'
import { thisProcess, writeInstance } from '../tools/sandbox-common.mjs'
import { checkViewLedger, writeCheckViewDocker } from './check-view-stand-ins.ts'
import { FAKE_DF, FAKE_FREE } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

let root: string, folder: string, privateRoot: string, work: string, sandbox: any
let office: Awaited<ReturnType<typeof checkViewLedger>>

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'mole-office-view-tmpdir-'))
  folder = join(root, 'sandboxes/inspector')
  privateRoot = join(folder, 'check-views/check-a')
  work = join(privateRoot, 'work')
  const hostOnly = join(root, 'controller')
  for (const dir of [work, hostOnly, join(root, 'bin')]) mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q', work])
  // Both copies of the facts, as up writes them: the launcher reads the host's, the helper the folder's.
  writeInstance(folder, { instance: 'inspector', workspace: 'default',
    container: { name: 'mole-office-sandbox-inspector' }, office: { secrets: { names: [] } } })
  writeCheckViewDocker(root, folder)
  writeFileSync(join(root, 'bin/df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(root, 'bin/free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(root, 'state.json'), JSON.stringify({ freeBytes: 200_000_000_000, memoryAvailable: 200_000_000_000, calls: [], bugs: {} }))
  office = await checkViewLedger(root)
  sandbox = { folder, instance: 'inspector', home: join(privateRoot, 'home'), sharedHome: join(folder, 'home'),
    checkDir: join(folder, 'checks/check-a'), hostOnly, marker: join(hostOnly, 'check-a.json'),
    asked: { check: 'check-a' }, running: null, keepPrivate: false }
})

afterEach(async () => {
  await office.close()
  rmSync(root, { recursive: true, force: true })
})

async function inside(argv: string[]) {
  return runInside(sandbox, { label: 'build', cwd: work, argv, limitMs: 10_000,
    launcher: async (_asked: unknown, words: string[], command: any = null) => {
      const child = spawn(process.execPath, [resolve('tools/sandbox.mjs'), ...words,
        '--sandboxes', join(root, 'sandboxes'), '--api', office.api, '--workspace', 'default',
        '--as', 'synthetic-controller', '--session', 'synthetic-run', '--', ...command], {
        env: { ...withoutInheritedEffort(), PATH: `${root}/bin:${process.env.PATH}`,
          CHECK_VIEW_FAKE: root, FAKE_DOCKER_DIR: root },
      })
      let stdout = '', stderr = ''
      child.stdout.on('data', chunk => stdout += chunk)
      child.stderr.on('data', chunk => stderr += chunk)
      const code = await new Promise<number>(done => child.once('close', code => done(code ?? 1)))
      return { code, stdout, stderr }
    } })
}

it('mounts a mode-0700 host TMPDIR outside HOME and makes a writable Node temporary folder there', async () => {
  const ran = await inside(['node', '-e', `
    const fs = require('fs'), os = require('os'), path = require('path')
    const made = fs.mkdtempSync(path.join(os.tmpdir(), 'node-test-'))
    fs.writeFileSync(path.join(made, 'file'), 'temporary write')
    console.log(JSON.stringify({ home:process.env.HOME, tmpdir:os.tmpdir(), made,
      bytes:fs.readFileSync(path.join(made, 'file'), 'utf8'), uid:process.getuid() }))
  `])
  expect(ran.code, ran.why ?? ran.err).toBe(0)
  const observed = JSON.parse(ran.out)
  const temporary = join(privateRoot, 'tmp')
  expect(observed.tmpdir).toBe(temporary)
  expect(observed.tmpdir).not.toBe(observed.home)
  expect(observed.tmpdir.startsWith(observed.home + '/')).toBe(false)
  expect(dirname(observed.made)).toBe(temporary)
  expect(observed.bytes).toBe('temporary write')
  expect(statSync(temporary).mode & 0o777).toBe(0o700)
  expect(statSync(temporary).uid).toBe(observed.uid)
  const spec = JSON.parse(readFileSync(join(sandbox.checkDir, 'check-view.json'), 'utf8'))
  expect(spec.private).toContainEqual({ host: temporary, container: '/check/tmp' })
  const launch = JSON.parse(readFileSync(join(root, 'calls.jsonl'), 'utf8').trim())
  expect(launch.mounts).toContain(`type=bind,source=${temporary},target=/check/tmp`)
  expect(launch.argv).not.toContain('--tmpfs')
})

it.each([false, true])('cleans TMPDIR with the other private folders only after delivery: delivered %s', async delivered => {
  const ran = await inside(['node', '-e', 'require("fs").writeFileSync(require("path").join(require("os").tmpdir(), "temporary-database"), "synthetic database bytes")'])
  expect(ran.code, ran.why ?? ran.err).toBe(0)
  const temporary = join(privateRoot, 'tmp')
  expect(readFileSync(join(temporary, 'temporary-database'), 'utf8')).toBe('synthetic database bytes')
  // There is no shared instance container in this stand-in. Its command rows have been released.
  for (const facts of [join(root, 'sandboxes/.run/inspector/instance.json'), join(folder, 'instance.json')]) rmSync(facts)
  const left = leaveTheSandbox(sandbox, { delivered })
  expect(left.ok, left.says).toBe(true)
  for (const path of [temporary, join(temporary, 'temporary-database'), sandbox.home, work, sandbox.checkDir]) {
    expect(existsSync(path), path).toBe(!delivered)
  }
})

/** One made-up view: both login files, a file that is not a login, a work file, and the shared Codex seed. */
function layOutAView() {
  const login = {
    claude: join(sandbox.home, THE_LOGIN_FILES_IN_A_CHECK_VIEW.claude),
    codex: join(sandbox.home, THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex),
  }
  for (const file of Object.values(login)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `made-up login at ${file}, not a real one`)
  }
  const settings = join(sandbox.home, '.claude', 'settings.json')
  writeFileSync(settings, '{"madeUp":true}')
  const workFile = join(work, 'the-work.txt')
  writeFileSync(workFile, 'made-up work')
  const seed = join(sandbox.sharedHome, THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex)
  mkdirSync(dirname(seed), { recursive: true })
  writeFileSync(seed, 'made-up Codex seed, not a real login')
  mkdirSync(sandbox.checkDir, { recursive: true })
  writeFileSync(join(sandbox.checkDir, 'prompt.txt'), 'made-up prompt')
  return { login, settings, workFile, seed, seedBytes: readFileSync(seed) }
}

/** Leave the way the delivery case does: no shared instance container is in this stand-in. */
function leaveWithNoInstance(delivered: boolean) {
  for (const facts of [join(root, 'sandboxes/.run/inspector/instance.json'), join(folder, 'instance.json')]) rmSync(facts)
  return leaveTheSandbox(sandbox, { delivered })
}

function expectAKeptViewWithoutItsLogins(view: ReturnType<typeof layOutAView>, left: { ok: boolean; says: string }) {
  expect(left.ok, left.says).toBe(true)
  for (const file of Object.values(view.login)) expect(existsSync(file), file).toBe(false)
  expect(existsSync(view.settings), view.settings).toBe(true)
  expect(existsSync(view.workFile), view.workFile).toBe(true)
  expect(existsSync(sandbox.checkDir), sandbox.checkDir).toBe(true)
  expect(existsSync(view.seed), view.seed).toBe(true)
  expect(readFileSync(view.seed)).toEqual(view.seedBytes)
  for (const file of Object.values(THE_LOGIN_FILES_IN_A_CHECK_VIEW)) expect(left.says).toContain(file)
  const sentence = left.says.slice(left.says.indexOf('The login'), left.says.indexOf('.', left.says.indexOf('private home')) + 1)
  expect(sentence).not.toContain(root)
}

it('a check that ends without a verdict leaves no login file in its kept view', () => {
  const view = layOutAView()
  const left = leaveWithNoInstance(false)
  expectAKeptViewWithoutItsLogins(view, left)
})

it('a check whose private clean-up was refused leaves no login file in its kept view', () => {
  const view = layOutAView()
  sandbox.keepPrivate = true
  const left = leaveWithNoInstance(true)
  expectAKeptViewWithoutItsLogins(view, left)
})

it('a check that leaves while another check uses the sandbox leaves no login file in its kept view', () => {
  const view = layOutAView()
  mkdirSync(join(sandbox.hostOnly, 'checks'), { recursive: true })
  writeFileSync(join(sandbox.hostOnly, 'checks', 'check-b.json'), JSON.stringify(thisProcess()))
  const left = leaveWithNoInstance(false)
  expect(left.says).toContain('is left up on purpose')
  expectAKeptViewWithoutItsLogins(view, left)
})
