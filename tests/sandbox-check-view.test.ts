// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkViewLedger, writeCheckViewDocker } from './check-view-stand-ins.ts'
import { FAKE_DF, FAKE_FREE } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { runInside } from '../tools/inspector-sandbox.mjs'
import { whyAPathIsTheOfficesDataFolder } from '../tools/the-offices-data-folder.mjs'
import { readCheckView, writeInstance } from '../tools/sandbox-common.mjs'

// Validation matrices call the readers directly; launcher cases observe mounts, environment and controller evidence.
// tools/check-view-proof.mjs supplies the separate real-Docker write-boundary proof.
const TOOL = resolve('tools/sandbox.mjs')
let root: string, instance: string, work: string, home: string, specFile: string, spec: any
let office: Awaited<ReturnType<typeof checkViewLedger>>
const groups = new Set<number>()
const delay = () => new Promise(r => setTimeout(r, 30))
async function until(check: () => boolean) { const end = Date.now() + 15_000; while (!check()) { if (Date.now() > end) throw new Error('Timed out waiting for controller evidence'); await delay() } }
function calls(): any[] { const file = join(root, 'calls.jsonl'); return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) : [] }
function save() { writeFileSync(specFile, JSON.stringify(spec)) }
function readView() {
  save()
  return readCheckView(specFile, { instance: 'inspector', dir: instance, cwd: work })
}
async function launch(command = ['node', '-e', 'console.log("own work"); console.error("own error")'], flags: string[] = [], observe?: (child: ReturnType<typeof spawn>) => void, more: NodeJS.ProcessEnv = {}) {
  save()
  const env = { ...withoutInheritedEffort(), PATH: `${root}/bin:${process.env.PATH}`, CHECK_VIEW_FAKE: root,
    MOLE_OFFICE_API: office.api, MOLE_OFFICE_AGENT: 'synthetic-controller', MOLE_OFFICE_SESSION: 'synthetic-run',
    MOLE_AGENT_KEY: 'synthetic-controller-key', MOLE_OFFICE_WORKSPACE: 'default', ...more }
  const child = spawn(process.execPath, [TOOL, 'exec', 'inspector', '--sandboxes', join(root, 'sandboxes'), '--api', office.api,
    '--as', 'synthetic-controller', '--session', 'synthetic-run', '--check-view', specFile, '--cwd', work, '--json', '--no-office-variables', ...flags, '--', ...command], { env })
  let out = '', err = ''
  child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c)
  observe?.(child)
  const code = await new Promise<number>(done => child.on('close', c => done(c ?? 1)))
  const descriptor = out.trim().startsWith('{') ? JSON.parse(out.trim()) : null
  if (descriptor?.hostPgid) groups.add(descriptor.hostPgid)
  return { code, out, err, descriptor }
}
/** The instance's network as docker would answer it, and anything more the stand-in is to do. */
function onTheNetwork(mode: string, more: Record<string, unknown> = {}) {
  const config = JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8'))
  config.instance.HostConfig.NetworkMode = mode
  writeFileSync(join(root, 'docker.json'), JSON.stringify({ ...config, ...more }))
}
async function completed(start: any) {
  expect(start.code, start.err).toBe(0)
  await until(() => existsSync(start.descriptor.receipt))
  return JSON.parse(readFileSync(start.descriptor.receipt, 'utf8'))
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'mole-office-checkview-test-'))
  instance = join(root, 'sandboxes/inspector')
  work = join(instance, 'check-views/check-a/work')
  home = join(instance, 'check-views/check-a/home')
  for (const folder of [work, home, join(instance, 'check-views/check-a/tmp'), join(root, 'records'), join(root, 'bin')]) mkdirSync(folder, { recursive: true, mode: 0o700 })
  execFileSync('git', ['init', '-q', work])
  writeFileSync(join(work, 'file.txt'), 'original\n')
  writeFileSync(join(root, 'records/input.txt'), 'carried record\n')
  // Both copies of the facts, as up writes them: the launcher reads the host's, the helper the folder's.
  writeInstance(instance, { instance: 'inspector', workspace: 'default', container: { name: 'mole-office-sandbox-inspector' }, office: { secrets: { names: [] } } })
  writeCheckViewDocker(root, instance)
  writeFileSync(join(root, 'bin/df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(root, 'bin/free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(root, 'state.json'), JSON.stringify({ freeBytes: 200_000_000_000, memoryAvailable: 200_000_000_000, calls: [], bugs: {} }))
  // FAKE_DF/FREE share the stand-ins' state; this is a synthetic measurement.
  process.env['FAKE_DOCKER_DIR'] = root
  office = await checkViewLedger(root)
  specFile = join(root, 'spec.json')
  spec = { check: 'check-a', instance: 'inspector', readOnly: [{ host: join(root, 'records'), container: '/inputs/records' }],
    private: [{ host: work, container: '/work' }, { host: home, container: '/check/home' },
      { host: join(instance, 'check-views/check-a/tmp'), container: '/check/tmp' }], outputs: { dir: join(root, 'outputs') } }
})
afterEach(async () => {
  for (const group of groups) { try { process.kill(-group, 'SIGTERM') } catch {} }
  groups.clear()
  await office.close()
  delete process.env['FAKE_DOCKER_DIR']
  rmSync(root, { recursive: true, force: true })
})

describe('a private container view per check', () => {
  it('B18 launcher receipt calls a wrapper controller input without inventing model verification', async () => {
    const commands = join(root, 'commands'); mkdirSync(commands)
    writeFileSync(join(commands, 'codex.sh'), '# Synthetic controller input; no model.\nexit 0\n')
    spec.readOnly.push({ host: commands, container: '/inputs/commands' })
    const started = await launch(['sh', '/inputs/commands/codex.sh'])
    const receipt = await completed(started)
    expect(receipt.permissions).toBe('The command is a controller input; the launcher did not verify its model argv.')
    expect(JSON.stringify(receipt)).not.toContain('checked by the inspector')
    expect(JSON.stringify(receipt)).not.toContain('Codex container argv checked')
  })
  it('B18 direct check-view command receipt makes no controller-input claim', async () => {
    const started = await launch(['node', '-e', 'console.log("synthetic direct probe")'])
    const receipt = await completed(started)
    expect(JSON.stringify(receipt)).not.toContain('The command is a controller input')
    expect(JSON.stringify(receipt)).not.toContain('model argv was checked')
  })
  it.each([false, true])('writes all evidence at 0600 under umask 0002 and passes the inspector validator; stale files %s', async stale => {
    const previous = process.umask(0o002)
    try {
      // A SYNTHETIC TEMPLATE THAT DECLARES THE CLAUDE TOKEN AND SETS NONE, which runInside reads to mask what the view answers.
      const templateDir = join(root, 'synthetic-template')
      mkdirSync(templateDir)
      writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: { names: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN', readBy: ['claude'] }] } }))
      const sandbox = { folder: instance, instance: 'inspector', checkDir: join(instance, 'checks/check-a'),
        home, templateDir, asked: { check: 'check-a' }, running: null }
      const ran = await runInside(sandbox, { label: 'evidence', cwd: work,
        argv: ['node', '-e', 'console.log("private evidence")'], limitMs: 5000,
        launcher: async (_asked: unknown, words: string[], command: any = null) => {
          specFile = words[words.indexOf('--check-view') + 1]!
          spec = JSON.parse(readFileSync(specFile, 'utf8'))
          if (stale) {
            const config = JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8'))
            config.delay = 500
            writeFileSync(join(root, 'docker.json'), JSON.stringify(config))
          }
          const pending = launch(command)
          if (stale) {
            await until(() => calls().some(c => c.argv[0] === 'run'))
            const output = join(spec.outputs.dir, readdirSync(spec.outputs.dir)[0]!)
            for (const name of ['start.json.writing', 'receipt.json.writing', 'exit']) {
              const file = join(output, name)
              writeFileSync(file, 'Synthetic stale controller file\n', { mode: 0o664 })
              chmodSync(file, 0o664)
            }
          }
          const started = await pending
          return { code: started.code, stdout: started.out, stderr: started.err }
        } })
      expect(ran.code, ran.why ?? '').toBe(0)
      expect(ran.out).toBe('private evidence\n')
      const start = ran.started!
      for (const file of [join(spec.outputs.dir, readdirSync(spec.outputs.dir)[0]!, 'start.json'),
        start.receipt, start.out, start.err, start.exit, start.details]) {
        expect(statSync(file).mode & 0o777, file).toBe(0o600)
      }
    } finally { process.umask(previous) }
  })

  it.each(['-check', '_check'])('keeps the check identity when its id is %s', async check => {
    renameSync(join(instance, 'check-views/check-a'), join(instance, 'check-views', check))
    work = join(instance, 'check-views', check, 'work'); home = join(instance, 'check-views', check, 'home')
    spec.check = check; spec.private[0].host = work; spec.private[1].host = home
    spec.private[2].host = join(instance, 'check-views', check, 'tmp')
    const started = await launch()
    const receipt = await completed(started)
    expect(receipt.check).toBe(check)
    expect(started.descriptor.view.container.startsWith(`mole-office-checkview-${check}-`)).toBe(true)
  })

  it('uses exactly the spec mounts, the instance image and network, and returns identity and digest', async () => {
    const started = await launch()
    await completed(started)
    const ran = calls().find(c => c.argv[0] === 'run')
    expect(ran.mounts.sort()).toEqual([
      `type=bind,source=${root}/records,target=/inputs/records,readonly`,
      `type=bind,source=${work},target=/work`, `type=bind,source=${home},target=/check/home`,
      `type=bind,source=${instance}/check-views/check-a/tmp,target=/check/tmp`,
    ].sort())
    expect(ran.image).toBe('synthetic-inspector-image')
    expect(ran.argv).toContain('none')
    expect(ran.argv.slice(ran.argv.indexOf('--cap-drop'), ran.argv.indexOf('--cap-drop') + 2)).toEqual(['--cap-drop', 'ALL'])
    expect(ran.argv.slice(ran.argv.indexOf('--security-opt'), ran.argv.indexOf('--security-opt') + 2)).toEqual(['--security-opt', 'no-new-privileges'])
    expect(started.descriptor).toMatchObject({ run: null, hostPid: expect.any(Number), hostPgid: expect.any(Number), processRow: expect.any(String),
      view: { container: expect.stringMatching(/^mole-office-checkview-check-a-/), sha256: createHash('sha256').update(readFileSync(specFile)).digest('hex') } })
    expect(readFileSync(started.descriptor.out, 'utf8')).toBe('own work\n')
    expect(readFileSync(started.descriptor.err, 'utf8')).toBe('own error\n')
    expect(office.requests.filter(r => r.path === '/api/records')).toHaveLength(0)
  })

  it.each([['a short check id', 'check-a'], ['a check id too long for a host name', `Long_${'x'.repeat(70)}`]])("gives its container its own host name on the host's network, which resolves to this machine, for %s", async (_what, check) => {
    // ON THE HOST'S NETWORK docker would give the view the host's own name, and a test office in it would stamp its
    // pictures and messages with that name. The name it is given is one DNS label, so a long check id is shortened.
    if (check !== 'check-a') {
      renameSync(join(instance, 'check-views/check-a'), join(instance, 'check-views', check))
      work = join(instance, 'check-views', check, 'work'); home = join(instance, 'check-views', check, 'home')
      spec.check = check; spec.private[0].host = work; spec.private[1].host = home
      spec.private[2].host = join(instance, 'check-views', check, 'tmp')
    }
    onTheNetwork('host')
    const started = await launch()
    await completed(started)
    const container: string = started.descriptor.view.container
    const ran = calls().find(c => c.argv[0] === 'run')
    expect(ran.argv.slice(ran.argv.indexOf('--network'), ran.argv.indexOf('--network') + 2)).toEqual(['--network', 'host'])
    const given = ran.argv.find((a: string) => a.startsWith('--hostname='))?.slice('--hostname='.length)
    expect(given, ran.argv.join(' ')).toMatch(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/)
    if (container.length <= 63) expect(given).toBe(container)
    else expect(given.slice(0, 56)).toBe(container.replaceAll('_', '-').slice(0, 56))
    expect(ran.argv.filter((a: string) => /^--(hostname|add-host)/.test(a))).toEqual([`--hostname=${given}`, `--add-host=${given}:127.0.1.1`])
    expect(readFileSync(started.descriptor.out, 'utf8')).toBe('own work\n')
  })

  // None and bridge take the same branches, so bridge is not run here; default is, because docker is handed bridge for it.
  it.each([['none', 'none'], ['default', 'bridge']])("passes no host name off the host's network, on %s, as before", async (mode, passed) => {
    onTheNetwork(mode)
    const started = await launch()
    await completed(started)
    const ran = calls().find(c => c.argv[0] === 'run')
    expect(ran.argv.slice(ran.argv.indexOf('--network'), ran.argv.indexOf('--network') + 2)).toEqual(['--network', passed])
    expect(ran.argv.filter((a: string) => /^--(hostname|add-host)/.test(a))).toEqual([])
  })

  it("refuses a container that carries the host's own name before its command runs, in words that name neither name", async () => {
    // DOCKER IGNORING THE NAME IT WAS GIVEN, as the stand-in can: on the host's network the view then carries the host's
    // own name. The host's name is compared here and never printed.
    onTheNetwork('host', { hostNameIgnored: true })
    const ran = await launch(['node', '-e', 'require("fs").writeFileSync("should-not-run", "ran")'])
    expect(ran.code, ran.err).not.toBe(0)
    const output = join(spec.outputs.dir, readdirSync(spec.outputs.dir)[0]!)
    const receipt = JSON.parse(readFileSync(join(output, 'receipt.json'), 'utf8'))
    expect(receipt).toMatchObject({ started: false, code: 1 })
    expect(/not what was asked for: (.*); its command was not started$/.exec(receipt.why)?.[1], receipt.why).toBe("its host name is the host's own")
    expect(ran.err).toContain("its host name is the host's own")
    expect(existsSync(join(work, 'should-not-run'))).toBe(false)
    expect(office.rows).toHaveLength(1); expect(office.rows.every(r => r.releasedAt !== null)).toBe(true)
    const details = /Details: (\S+)/.exec(ran.err)?.[1]
    expect(details, 'the refusal names no details file').toBeDefined()
    const said = [ran.out, ran.err, readFileSync(details!, 'utf8'),
      ...readdirSync(output).map(file => join(output, file)).filter(file => statSync(file).isFile()).map(file => readFileSync(file, 'utf8'))]
    expect(said.some(words => words.includes(hostname())), "the refusal or its evidence holds the host's name").toBe(false)
  })

  it.each(['host overlap', 'container overlap', 'container alias', 'container trailing slash', 'duplicate host', 'whole instance', 'output overlap', 'output file', 'sibling output', 'sibling spec', 'duplicate login target', 'unknown key', 'wrong instance'])('refuses %s before docker run', async kind => {
    if (kind === 'host overlap') spec.readOnly[0].host = join(work, '.git')
    if (kind === 'container overlap') spec.readOnly[0].container = '/work/records'
    if (kind === 'container alias') spec.readOnly[0].container = '/var/run/records'
    if (kind === 'container trailing slash') { spec.private[0].container = '/work/'; spec.readOnly[0].container = '/work/records' }
    if (kind === 'duplicate host') spec.readOnly.push({ host: spec.readOnly[0].host, container: '/alias' })
    if (kind === 'whole instance') spec.private[0].host = instance
    if (kind === 'output overlap') spec.outputs.dir = join(work, 'evidence')
    if (kind === 'output file') { spec.outputs.dir = join(root, 'output-file'); writeFileSync(spec.outputs.dir, 'synthetic file') }
    if (kind === 'sibling output' || kind === 'sibling spec') {
      const sibling = join(root, 'sandboxes/other-inspector/check-views/check-b/home')
      mkdirSync(sibling, { recursive: true })
      if (kind === 'sibling output') spec.outputs.dir = join(sibling, 'evidence')
      else specFile = join(sibling, 'spec.json')
    }
    if (kind === 'duplicate login target') {
      for (const name of ['first', 'second']) writeFileSync(join(root, name), 'synthetic login')
      spec.loginSeeds = ['first', 'second'].map(name => ({ host: join(root, name), container: '/login/' + name, target: '.codex/auth.json' }))
    }
    if (kind === 'unknown key') spec.surprise = true
    if (kind === 'wrong instance') spec.instance = 'some-other-instance'
    expect(() => readView()).toThrow(/check.view/i)
    expect(calls()).toHaveLength(0)
    expect(office.rows).toHaveLength(0)
  })

  it.each([
    ['a read-only mount that is it', 'readOnly', '', 'is the stable checkout'],
    ['a read-only mount inside it', 'readOnly', 'data', 'is inside the stable checkout'],
    ['a read-only mount that holds it', 'readOnly', '..', 'holds the stable checkout'],
    ['an input inside it', 'inputs', 'data', 'is inside the stable checkout'],
    ['a login seed inside it', 'loginSeeds', 'data/keys.json', 'is inside the stable checkout'],
  ])('refuses %s, before docker run, and takes a folder beside it', async (_what, kind, under, said) => {
    // A HOME OF THE TEST'S OWN, so the stable checkout the launcher protects is a synthetic folder in the scratch.
    const synthetic = join(root, 'synthetic-home')
    const stable = theStableCheckoutFolder(synthetic)
    mkdirSync(join(stable, 'data'), { recursive: true })
    writeFileSync(join(stable, 'data', 'keys.json'), '{"synthetic":"not a key"}\n')
    const host = resolve(stable, under)
    if (kind === 'loginSeeds') spec.loginSeeds = [{ host, container: '/login/seed', target: '.codex/auth.json' }]
    else (spec[kind] ??= []).push({ host, container: '/inputs/stable' })
    vi.stubEnv('HOME', synthetic)
    try {
      expect(() => readView()).toThrow(`${host} ${said}, ${stable}`)
      expect(calls()).toHaveLength(0)
      expect(office.rows).toHaveLength(0)
      // A folder beside it is not refused for that: the refusal is not of everything under the home.
      const beside = join(dirname(stable), 'beside-the-stable-checkout')
      mkdirSync(beside)
      spec.loginSeeds = []
      spec.inputs = []
      spec.readOnly = [spec.readOnly[0], { host: beside, container: '/inputs/beside' }]
      expect(readView().mounts.some(mount => mount.host === beside)).toBe(true)
    } finally { vi.unstubAllEnvs() }
  })

  it.each([
    ['a read-only mount that is it', 'readOnly', '', "is the office's data folder"],
    ['a read-only mount inside it', 'readOnly', 'report-files', "is inside the office's data folder"],
    ['a read-only mount that holds it', 'readOnly', '..', "holds the office's data folder"],
    ['an input inside it', 'inputs', 'report-files', "is inside the office's data folder"],
    ['a login seed inside it', 'loginSeeds', 'keys.json', "is inside the office's data folder"],
  ])("refuses %s of the office's data folder, before docker run, and takes a folder beside it", async (_what, kind, under, said) => {
    // A synthetic data folder outside every checkout, named by the test's own stable settings.
    const synthetic = join(root, 'synthetic-home-data-folder')
    const data = join(synthetic, '.local', 'share', 'mole-office')
    mkdirSync(join(data, 'report-files'), { recursive: true })
    writeFileSync(join(data, 'keys.json'), '{"synthetic":"not a key"}\n')
    writeFileSync(join(data, 'panelx.db'), '')
    const stable = theStableCheckoutFolder(synthetic)
    mkdirSync(stable, { recursive: true })
    writeFileSync(join(stable, '.env'), `MOLE_OFFICE_DB=${join(data, 'panelx.db')}\n`)
    const host = resolve(data, under)
    if (kind === 'loginSeeds') spec.loginSeeds = [{ host, container: '/login/seed', target: '.codex/auth.json' }]
    else (spec[kind] ??= []).push({ host, container: '/inputs/data' })
    vi.stubEnv('HOME', synthetic)
    try {
      if (_what === 'a read-only mount that is it') {
        const ran = await launch()
        expect(ran.code, ran.out).not.toBe(0)
        expect(ran.err).toContain(`${host} ${said}, ${data},`)
      } else {
        expect(whyAPathIsTheOfficesDataFolder(host)).toContain(`${host} ${said}, ${data},`)
      }
      expect(calls()).toHaveLength(0)
      expect(office.rows).toHaveLength(0)
      // A folder beside it is not refused for that: the refusal is not of everything under the home.
      const beside = join(dirname(data), 'beside-the-data-folder')
      mkdirSync(beside)
      spec.loginSeeds = []
      spec.inputs = []
      spec.readOnly = [spec.readOnly[0], { host: beside, container: '/inputs/beside' }]
      if (_what === 'a read-only mount that is it') await completed(await launch())
      else expect(whyAPathIsTheOfficesDataFolder(beside)).toBeNull()
    } finally { vi.unstubAllEnvs() }
  })

  it.each(['mount source', 'nested entry'])('refuses a symlink in the %s', async kind => {
    if (kind === 'mount source') { symlinkSync(join(root, 'records'), join(root, 'alias')); spec.readOnly[0].host = join(root, 'alias') }
    else symlinkSync(root, join(root, 'records/alias'))
    expect(() => readView()).toThrow(/symlink/i); expect(calls()).toHaveLength(0)
  })

  it('accepts an npm-style symlink contained in the private mount', async () => {
    mkdirSync(join(work, 'node_modules/.bin'), { recursive: true })
    mkdirSync(join(work, 'node_modules/example/bin'), { recursive: true })
    writeFileSync(join(work, 'node_modules/example/bin/tool'), '#!/bin/sh\necho internal-link\n', { mode: 0o755 })
    symlinkSync('../example/bin/tool', join(work, 'node_modules/.bin/tool'))
    expect(readView().work.host).toBe(work)
    expect(readFileSync(join(work, 'node_modules/.bin/tool'), 'utf8')).toBe('#!/bin/sh\necho internal-link\n')
  })

  it('refuses a host-contained symlink that escapes its mapped container mount', async () => {
    symlinkSync('../records/input.txt', join(root, 'records/alias'))
    spec.readOnly[0].container = '/inputs/protected'
    spec.private[0].container = '/inputs/records'
    expect(() => readView()).toThrow(/symlink|alias/i); expect(calls()).toHaveLength(0)
  })

  it.each(['dangling', 'cyclic'])('refuses a %s descendant symlink', async kind => {
    symlinkSync(kind === 'dangling' ? 'missing' : 'bad-link', join(work, 'bad-link'))
    expect(() => readView()).toThrow(/symlink|dangling|cyclic/i); expect(calls()).toHaveLength(0)
  })

  it('refuses linked worktree administration', async () => {
    rmSync(join(work, '.git'), { recursive: true }); writeFileSync(join(work, '.git'), 'gitdir: /shared/repo/.git/worktrees/check-a\n')
    expect(() => readView()).toThrow(/\.git|linked worktree/i); expect(calls()).toHaveLength(0)
  })

  it('refuses a writable hard-link alias of a carried record', async () => {
    linkSync(join(root, 'records/input.txt'), join(work, 'record-alias'))
    expect(() => readView()).toThrow(/hard.link|alias/i); expect(calls()).toHaveLength(0)
  })

  it('keeps office variables and all office keys out of the view environment', async () => {
    const started = await launch(['node', '-e', 'console.log(JSON.stringify(Object.keys(process.env).filter(k => /MOLE_OFFICE|MOLE_AGENT_KEY|SANDBOX_RUN_KEY/.test(k))))'])
    await completed(started)
    expect(JSON.parse(readFileSync(started.descriptor.out, 'utf8'))).toEqual([])
    expect(calls()[0].envNames).not.toEqual(expect.arrayContaining(['MOLE_AGENT_KEY']))
  })

  it('retains the image build environment while removing its office variables', async () => {
    const config = JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8'))
    config.instance.Config.Env.push('PLAYWRIGHT_BROWSERS_PATH=/image/browsers', 'npm_config_nodedir=/usr/local')
    writeFileSync(join(root, 'docker.json'), JSON.stringify(config))
    const started = await launch(['node', '-e', 'console.log(JSON.stringify({browsers:process.env.PLAYWRIGHT_BROWSERS_PATH, headers:process.env.npm_config_nodedir, office:Object.keys(process.env).filter(k=>/MOLE_OFFICE|MOLE_AGENT_KEY/.test(k))}))'])
    await completed(started)
    expect(JSON.parse(readFileSync(started.descriptor.out, 'utf8'))).toEqual({ browsers: '/image/browsers', headers: '/usr/local', office: [] })
  })

  it.each(Object.entries(FULL_PERMISSIONS))('keeps full native permissions for %s without adding an office tool', async (_runtime, form) => {
    const program = join(work, form.program)
    writeFileSync(program, '#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2), env:process.env}))\n', { mode: 0o755 })
    const started = await launch([`/work/${form.program}`, 'exec', 'synthetic prompt'])
    await completed(started)
    const observed = JSON.parse(readFileSync(started.descriptor.out, 'utf8'))
    expect(observed.args).toEqual([...form.args, 'exec', 'synthetic prompt'])
    expect(observed.env).toMatchObject(form.env)
    expect(observed.args.join(' ')).not.toMatch(/mcp|office/)
  })

  it.each(['timeout'])('captures evidence outside mounts and releases both ledger rows on %s', async ending => {
    const started = await launch(ending === 'exit' ? ['node', '-e', 'console.log("before exit")'] : ['node', '-e', 'console.log("before stop"); setInterval(()=>{},1000)'], ending === 'timeout' ? ['--timeout', '0.3'] : [])
    expect(started.code, started.err).toBe(0)
    if (ending === 'release') await fetch(`${office.api}/api/resources/${started.descriptor.processRow}/release`, { method: 'POST', body: '{}' })
    const receipt = await completed(started)
    for (const name of ['out', 'err', 'exit', 'receipt']) expect(started.descriptor[name].startsWith(spec.outputs.dir + '/')).toBe(true)
    expect(readFileSync(started.descriptor.exit, 'utf8').trim()).toBe(ending === 'exit' ? '0' : ending === 'timeout' ? '124' : '143')
    expect(receipt).toMatchObject({ check: 'check-a', view: started.descriptor.view, code: ending === 'exit' ? 0 : ending === 'timeout' ? 124 : 143 })
    expect(office.rows).toHaveLength(2)
    expect(office.rows.every(row => row.releasedAt !== null)).toBe(true)
  })

  it('reuses the same check home and seeds login once, while another check has a different home', async () => {
    const seed = join(root, 'auth.json'); writeFileSync(seed, 'synthetic-login')
    spec.loginSeeds = [{ host: seed, container: '/login/auth.json', target: '.codex/auth.json' }]
    const first = await launch(['node', '-e', 'const f=require("fs"),p=process.env.HOME+"/.codex/auth.json"; console.log(f.readFileSync(p,"utf8")); f.writeFileSync(p,"refreshed-private-login"); f.symlinkSync("auth.json",process.env.HOME+"/.codex/last-auth")'])
    await completed(first)
    const second = await launch(['node', '-e', 'console.log(require("fs").readFileSync(process.env.HOME+"/.codex/auth.json","utf8"))'])
    await completed(second)
    expect(readFileSync(second.descriptor.out, 'utf8')).toBe('refreshed-private-login\n')
    expect(readFileSync(seed, 'utf8')).toBe('synthetic-login')
    spec.check = 'check-b'
    const other = join(instance, 'check-views/check-b')
    mkdirSync(join(other, 'home'), { recursive: true }); mkdirSync(join(other, 'work'))
    mkdirSync(join(other, 'tmp'), { mode: 0o700 })
    execFileSync('git', ['init', '-q', join(other, 'work')])
    work = join(other, 'work'); spec.private = [{ host: work, container: '/work' }, { host: join(other, 'home'), container: '/check/home' }, { host: join(other, 'tmp'), container: '/check/tmp' }]
    const third = await launch(['node', '-e', 'console.log(require("fs").readFileSync(process.env.HOME+"/.codex/auth.json","utf8"))'])
    await completed(third)
    expect(readFileSync(third.descriptor.out, 'utf8')).toBe('synthetic-login\n')
    expect(calls()[0].mounts).toContain(`type=bind,source=${seed},target=/login/auth.json,readonly`)
  })

  it('fails startup explicitly without fallback and releases the container and process rows', async () => {
    writeCheckViewDocker(root, instance, true)
    const ran = await launch()
    expect(ran.code).not.toBe(0); expect(ran.err).toMatch(/could not start|startup|could not make/i)
    expect(calls().map(c => c.argv[0])).toEqual(['run'])
    expect(office.rows).toHaveLength(1); expect(office.rows.every(r => r.releasedAt !== null)).toBe(true)
    const files = readdirSync(spec.outputs.dir).map(folder => JSON.parse(readFileSync(join(spec.outputs.dir, folder, 'receipt.json'), 'utf8')))
    expect(files).toHaveLength(1); expect(files[0].started).toBe(false)
  })

  it('cancels an interrupted startup before running the command and writes its receipt', async () => {
    const config = JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8')); config.delay = 800
    writeFileSync(join(root, 'docker.json'), JSON.stringify(config))
    const ran = await launch(['node', '-e', 'require("fs").writeFileSync("should-not-run", "ran")'], [], child => {
      const timer = setInterval(() => { if (calls().some(c => c.argv[0] === 'run')) { clearInterval(timer); child.kill('SIGTERM') } }, 10)
      child.once('close', () => clearInterval(timer))
    })
    expect(ran.code).not.toBe(0)
    const receipt = join(spec.outputs.dir, readdirSync(spec.outputs.dir)[0]!, 'receipt.json')
    await until(() => existsSync(receipt))
    expect(JSON.parse(readFileSync(receipt, 'utf8'))).toMatchObject({ started: false, code: 143 })
    expect(existsSync(join(work, 'should-not-run'))).toBe(false)
    expect(office.rows.every(row => row.releasedAt !== null)).toBe(true)
  })

  it('writes failure evidence if controller revalidation refuses a changed spec', async () => {
    const config = JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8')); config.breakSpec = specFile
    writeFileSync(join(root, 'docker.json'), JSON.stringify(config))
    const ran = await launch()
    expect(ran.code).not.toBe(0)
    const output = join(spec.outputs.dir, readdirSync(spec.outputs.dir)[0]!)
    const receipt = JSON.parse(readFileSync(join(output, 'receipt.json'), 'utf8'))
    expect(receipt).toMatchObject({ started: false, code: 1 })
    for (const file of ['stdout', 'stderr', 'exit']) expect(existsSync(join(output, file))).toBe(true)
    expect(office.rows).toHaveLength(0); expect(calls()).toHaveLength(0)
  })

  it('runs two checks concurrently without sharing names, homes or evidence', async () => {
    const first = await launch(['node', '-e', 'setTimeout(()=>console.log("a"),500)'])
    const other = join(instance, 'check-views/check-b')
    mkdirSync(join(other, 'home'), { recursive: true }); mkdirSync(join(other, 'work'))
    mkdirSync(join(other, 'tmp'), { mode: 0o700 })
    execFileSync('git', ['init', '-q', join(other, 'work')])
    spec.check = 'check-b'; work = join(other, 'work'); spec.private = [{ host: work, container: '/work' }, { host: join(other, 'home'), container: '/check/home' }, { host: join(other, 'tmp'), container: '/check/tmp' }]
    const second = await launch(['node', '-e', 'console.log("b")'])
    await completed(first); await completed(second)
    expect(first.descriptor.view.container).not.toBe(second.descriptor.view.container)
    expect(first.descriptor.out).not.toBe(second.descriptor.out)
    expect(office.rows.every(row => row.releasedAt !== null)).toBe(true)
  })
})
