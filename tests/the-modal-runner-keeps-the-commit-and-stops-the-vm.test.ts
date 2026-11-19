// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The runner and real Python driver are exercised without Modal or a network.
 * Every credential, commit, program output and Modal response here is synthetic.
 * Mutation controls and restored runs passed all 12 cases. Each mutation below made the file red.
 * In tools/modal-tests-driver.py: runtime vm to gvisor; block_network True to False;
 * write no hosts line; remove terminate; install the checkout under /tmp instead of /home.
 * In tools/modal-tests.mjs: remove env -i; remove unshare and its flags; keep the reflog;
 * accept mode 0644; pass the caller's environment; remove the URL mask; use CPU 0.00001314
 * and memory 0.00000222 rates; return 0 for red; keep the whole Dockerfile; ignore plan-only;
 * accept a forbidden tree; accept an untracked file; accept a Python directory; ignore token ownership.
 * The filesystem and report controls also passed all 12 cases. Calling sandbox.open,
 * removing the oversized-file fallback, echoing the result JSON, and resetting the result
 * on a progress line each made the file red; each restored run passed all 12 cases.
 * Putting the snapshot under /tmp again and dropping the final /tmp mode check each
 * made the file red; both restored runs passed all 12 cases.
 * Keeping only the check or only chmod in the final image step each made the file red;
 * both restored runs passed all 12 cases.
 * The real driver is checked with synthetic Modal responses. No live check is claimed here.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { settingNamed } from '../src/config/settings.mjs'
import { appendReceipt, commandList, cutDockerfile, driverEnvironment, estimateUSD, maskLine, readMonthReceipts, receiptsFile, reportExit, snapshot, validateToken, VM_CHECKOUT, VM_DEFAULTS, VM_REPORT, VM_SANDBOX_GRACE_SECONDS, VM_SANDBOX_RATES } from '../tools/modal-tests.mjs'

const tool = resolve('tools/modal-tests.mjs')
const driver = resolve('tools/modal-tests-driver.py')
let root: string
let repo: string
let sha: string
let token: string
let planFolders: string[] = []
const files = ['tests/synthetic.test.ts']
function git(args: string[], cwd = repo) {
  const answer = spawnSync('git', args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } })
  expect(answer.status, answer.stderr).toBe(0)
  return answer.stdout.trim()
}
beforeEach(() => {
  planFolders = []
  root = mkdtempSync(join(tmpdir(), 'mole-office-modal-proof-')); repo = join(root, 'repo'); mkdirSync(repo)
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Synthetic author']); git(['config', 'user.email', 'synthetic@example.invalid'])
  mkdirSync(join(repo, 'tests')); writeFileSync(join(repo, files[0]!), 'synthetic first tree')
  git(['add', '.']); git(['commit', '-m', 'Synthetic first commit'])
  writeFileSync(join(repo, files[0]!), 'synthetic second tree'); git(['add', '.']); git(['commit', '-m', 'Synthetic second commit'])
  sha = git(['rev-parse', 'HEAD']); token = join(root, 'synthetic-modal.toml'); writeFileSync(token, 'SYNTHETIC-TOKEN-DO-NOT-PRINT', { mode: 0o600 })
})
afterEach(() => { for (const folder of planFolders) rmSync(folder, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }) })
function launch(extra: string[] = [], program?: string, env: Record<string, string> = {}) {
  const answer = spawnSync(process.execPath, [tool, '--repo', repo, '--commit', sha, '--out', join(root, 'report.json'), ...extra, '--', ...files], {
    encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, MOLE_OFFICE_MODAL_TOKEN_FILE: token, MOLE_OFFICE_MODAL_PYTHON: program ?? process.execPath, ...env },
  })
  if (extra.includes('--plan-only')) { try { const plan = JSON.parse(answer.stdout); if (plan.contextPath) planFolders.push(resolve(plan.contextPath, '..')) } catch { /* A refused plan has no paths to keep. */ } }
  return answer
}
function report(status = 'passed') { return { success: status === 'passed', testResults: [{ name: `${VM_CHECKOUT}/${files[0]}`, status, assertionResults: [] }] } }

it('uses the measured command, with a clean environment and a process namespace', () => {
  const command = commandList({ workers: 7, files, zone: 'Etc/UTC' })
  expect(command.slice(0, 6)).toEqual(['unshare', '--pid', '--fork', '--mount-proc', 'tini', '--'])
  expect(command.slice(6, 12)).toEqual(['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups', 'env', '-i'])
  expect(command.slice(12, command.indexOf('npm')).map((value: string) => value.split('=')[0])).toEqual(['PATH', 'HOME', 'HOSTNAME', 'TZ', 'DEBIAN_FRONTEND', 'DISABLE_AUTOUPDATER', 'NPM_CONFIG_UPDATE_NOTIFIER', 'npm_config_nodedir', 'PLAYWRIGHT_BROWSERS_PATH'])
  expect(command.slice(command.indexOf('npm'))).toEqual(['npm', 'test', '--', '--maxWorkers=7', '--reporter=default', '--reporter=json', `--outputFile.json=${VM_REPORT}`, `${VM_CHECKOUT}/${files[0]}`])
})
it('sends one commit without history, a reflog, a fetch head, a remote or an identity', () => {
  const folder = join(root, 'snapshot'); snapshot(repo, sha, folder)
  expect(git(['rev-list', '--count', 'HEAD'], folder)).toBe('1')
  expect(existsSync(join(folder, '.git/logs'))).toBe(false)
  expect(existsSync(join(folder, '.git/FETCH_HEAD'))).toBe(false)
  expect(git(['remote'], folder)).toBe('')
  expect(readFileSync(join(folder, '.git/config'), 'utf8')).not.toMatch(/user|remote/u)
  expect(readFileSync(join(folder, files[0]!), 'utf8')).toBe('synthetic second tree')
})
it('refuses a tracked environment file and database files before making a snapshot', () => {
  for (const name of ['.env', 'synthetic.db', 'synthetic.sqlite', 'synthetic.db-wal']) {
    writeFileSync(join(repo, name), 'synthetic private data'); git(['add', name]); git(['commit', '-m', 'Synthetic forbidden file'])
    expect(() => snapshot(repo, git(['rev-parse', 'HEAD']), join(root, 'refused'))).toThrow('cannot be sent')
    git(['rm', name]); git(['commit', '-m', 'Remove synthetic forbidden file'])
  }
})
it('refuses unsafe token files, without reading their contents', () => {
  chmodSync(token, 0o644); expect(launch(['--plan-only']).status).toBe(2)
  chmodSync(token, 0o600)
  const preload = join(root, 'synthetic-owner.mjs')
  writeFileSync(preload, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const original=fs.lstatSync; fs.lstatSync=(path,...args)=>{const stat=original(path,...args);if(String(path)===${JSON.stringify(token)})stat.uid+=1;return stat};syncBuiltinESMExports();`)
  const otherOwner = spawnSync(process.execPath, ['--import', preload, tool, '--repo', repo, '--commit', sha, '--out', join(root, 'out.json'), '--plan-only', '--', ...files], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, MOLE_OFFICE_MODAL_TOKEN_FILE: token, MOLE_OFFICE_MODAL_PYTHON: '/usr/bin/python3' } })
  expect(otherOwner.status).toBe(2); expect(otherOwner.stderr).toContain('owned by this user')
  expect(() => validateToken(token, process.getuid!() + 1)).toThrow('owned by this user')
  const link = join(root, 'link'); symlinkSync(token, link)
  for (const name of [link, join(root, 'missing')]) expect(launch(['--plan-only'], undefined, { MOLE_OFFICE_MODAL_TOKEN_FILE: name }).status).toBe(2)
  expect(launch(['--plan-only'], undefined, { MOLE_OFFICE_MODAL_TOKEN_FILE: '' }).status).toBe(2)
})
it('refuses an absent commit, an untracked test, and an unavailable Python', () => {
  expect(launch(['--commit', '0'.repeat(40)]).status).toBe(2)
  git(['rm', files[0]!]); git(['commit', '-m', 'Remove synthetic test']); sha = git(['rev-parse', 'HEAD'])
  expect(launch().status).toBe(2)
  sha = git(['rev-parse', 'HEAD~1']); expect(launch([], join(root, 'missing-python')).status).toBe(2)
  expect(launch([], root).status).toBe(2)
  const directoryLink = join(root, 'python-directory'); symlinkSync(root, directoryLink); expect(launch([], directoryLink).status).toBe(2)
})
it('cuts the image before the extra packages and refuses a changed stage boundary', () => {
  const source = readFileSync('sandboxes/mole-office-dev/Dockerfile', 'utf8')
  expect(cutDockerfile(source)).toBe(source.slice(0, source.indexOf('FROM mole-office-dev AS with-extra-packages')))
  expect(() => cutDockerfile('FROM synthetic')).toThrow('expected extra-packages')
})
it('prints a plan, sends no token contents, and starts no driver in plan-only mode', () => {
  const program = join(root, 'stand-in'); const marker = join(root, 'called')
  writeFileSync(program, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 })
  const answer = launch(['--plan-only', '--cpu', '3', '--memory-mib', '8192', '--workers', '7'], program)
  expect(answer.status, answer.stderr).toBe(0); expect(existsSync(marker)).toBe(false)
  const plan = JSON.parse(answer.stdout); expect(plan.cpu).toBe(3); expect(plan.memoryMiB).toBe(8192)
  expect(JSON.stringify(plan) + answer.stderr).not.toContain('SYNTHETIC-TOKEN-DO-NOT-PRINT')
  expect(readFileSync(plan.dockerfilePath, 'utf8')).not.toContain('FROM mole-office-dev AS with-extra-packages')
  expect(existsSync(join(plan.contextPath, 'dsh/package-lock.json'))).toBe(true)
  rmSync(resolve(plan.contextPath, '..'), { recursive: true, force: true })
  writeFileSync(join(repo, 'tests/another-synthetic.test.ts'), 'synthetic additional file'); git(['add', '.']); git(['commit', '-m', 'Synthetic additional test']); sha = git(['rev-parse', 'HEAD'])
  const all = spawnSync(process.execPath, [tool, '--repo', repo, '--commit', sha, '--out', join(root, 'report.json'), '--all', '--plan-only'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, MOLE_OFFICE_MODAL_TOKEN_FILE: token, MOLE_OFFICE_MODAL_PYTHON: program } })
  expect(all.status, all.stderr).toBe(0)
  const allPlan = JSON.parse(all.stdout)
  expect(allPlan).toMatchObject({ files: ['tests/another-synthetic.test.ts', ...files], cpu: 10, memoryMiB: 32768, limitSeconds: 3600, workers: Number(settingNamed('MOLE_OFFICE_MERGE_WORKERS').fallback) })
  expect(existsSync(marker)).toBe(false)
  rmSync(resolve(allPlan.contextPath, '..'), { recursive: true, force: true })

})
it('gives the driver only PATH, HOME and the token path', () => {
  const old = process.env.MOLE_OFFICE_SYNTHETIC; process.env.MOLE_OFFICE_SYNTHETIC = 'synthetic secret'
  try { expect(Object.keys(driverEnvironment(token)).sort()).toEqual(['HOME', 'MODAL_CONFIG_PATH', 'PATH']); expect(JSON.stringify(driverEnvironment(token))).not.toContain('synthetic secret') } finally { if (old === undefined) delete process.env.MOLE_OFFICE_SYNTHETIC; else process.env.MOLE_OFFICE_SYNTHETIC = old }
})
// THE MERGE QUEUE'S BUDGET READS THESE THREE (wave 13v round 21): the size and limit a run gets
// unless named, how long past the limit the driver lets a sandbox live, and where the receipts
// are.
it('says the size, the sandbox grace and the receipts path the merge queue budgets from, as the run itself uses them', () => {
  const plan = JSON.parse(launch(['--plan-only']).stdout)
  expect({ cpu: plan.cpu, memoryMiB: plan.memoryMiB, limitSeconds: plan.limitSeconds }).toEqual(VM_DEFAULTS)
  expect(readFileSync(driver, 'utf8')).toContain(`timeout=plan["limitSeconds"] + ${String(VM_SANDBOX_GRACE_SECONDS)})`)
  const old = process.env.HOME; process.env.HOME = root
  try { expect(receiptsFile()).toBe(join(root, '.cache/mole-office/modal/receipts.jsonl')) } finally { if (old === undefined) delete process.env.HOME; else process.env.HOME = old }
})
it('masks the workspace in a Modal application URL', () => {
  expect(maskLine('https://modal.com/apps/synthetic-private/ap-123')).toBe('https://modal.com/apps/<workspace>/ap-123')
})
it('writes a private receipt and sums only the named calendar month at VM rates', () => {
  const file = join(root, 'receipts/receipts.jsonl')
  expect(VM_SANDBOX_RATES.at).toBe('2026-10-11')
  expect(estimateUSD(100, 10, 32768)).toBeCloseTo(100 * (10 * 0.00003942 + 32 * 0.00000667), 10)
  for (const [at, seconds] of [['2026-10-01 00:00:00', 100], ['2026-10-31 23:59:59', 200], ['2026-11-01 00:00:00', 300]] as const) appendReceipt(file, { at, commit: sha, files: 1, runtime: 'vm', cpu: 10, memoryMiB: 32768, sandboxSeconds: seconds, estimatedUSD: estimateUSD(seconds, 10, 32768), outcome: 'passed', sandboxId: 'synthetic-sandbox' })
  expect(statSync(file).mode & 0o777).toBe(0o600); expect(statSync(join(root, 'receipts')).mode & 0o777).toBe(0o700)
  expect(readMonthReceipts(file, '2026-10')).toBeCloseTo(estimateUSD(300, 10, 32768), 10)
  expect(Object.keys(JSON.parse(readFileSync(file, 'utf8').split('\n')[0]!)).sort()).toEqual(['at', 'commit', 'cpu', 'estimatedUSD', 'files', 'memoryMiB', 'outcome', 'runtime', 'sandboxId', 'sandboxSeconds'])
})
it('returns passed, red, no result and refused input from a synthetic driver', () => {
  const program = join(root, 'synthetic-driver')
  for (const [value, code] of [[report(), 0], [report('failed'), 1], [null, 75]] as const) {
    writeFileSync(program, `#!${process.execPath}\nconst fs=require('node:fs');const plan=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));const value=${JSON.stringify(value)};if(value!==null)fs.writeFileSync(plan.reportFile,JSON.stringify(value));process.stdout.write('https://modal.com/apps/synthetic-private/ap-123\\n');\nprocess.stdout.write(JSON.stringify({kind:'modal-tests-result', reportFile:value===null?null:plan.reportFile, sandboxSeconds:12, sandboxId:'synthetic-sandbox'})+'\\n');process.stdout.write('synthetic later progress\\n');\nrequire('node:fs').writeFileSync(${JSON.stringify(join(root, 'environment.json'))}, JSON.stringify({env:process.env,args:process.argv}));\n`, { mode: 0o700 })
    const answer = launch([], program, { MOLE_OFFICE_SYNTHETIC: 'synthetic office key', MOLE_AGENT_KEY: 'synthetic office key' })
    expect(answer.status, answer.stderr).toBe(code); expect(answer.stdout).toContain('modal.com/apps/<workspace>/'); expect(answer.stdout).not.toContain('synthetic-private')
    const recorded = readFileSync(join(root, 'environment.json'), 'utf8'); expect(recorded).not.toContain('synthetic office key'); expect(Object.keys(JSON.parse(recorded).env).filter(name => name.startsWith('MOLE_OFFICE_'))).toEqual([]); expect(recorded).not.toContain('SYNTHETIC-TOKEN-DO-NOT-PRINT')
    expect(JSON.parse(readFileSync(join(root, 'report.json'), 'utf8'))).toEqual(value)
  }
  writeFileSync(program, `#!${process.execPath}\nprocess.exitCode=1;\n`, { mode: 0o700 })
  expect(launch([], program).status).toBe(75)
  const unreported = JSON.parse(readFileSync(join(root, '.cache/mole-office/modal/receipts.jsonl'), 'utf8').trim().split('\n').at(-1)!)
  expect(unreported).toMatchObject({ sandboxSeconds: null, estimatedUSD: null, outcome: 'no result', sandboxId: null })
  expect(() => readMonthReceipts(join(root, '.cache/mole-office/modal/receipts.jsonl'), unreported.at.slice(0, 7))).toThrow('no valid estimate')
  chmodSync(token, 0o644); expect(launch([], program).status).toBe(2)
  expect(reportExit({ success: true, testResults: [] }, files)).toBe(75)
})

const syntheticModal = `
import io,json,os
from pathlib import Path
ROOT=Path(__file__).parent.parent
LOG=ROOT/'calls.jsonl'
def record(name,*args,**kwargs):
    with LOG.open('a') as f: f.write(json.dumps([name,args,kwargs],default=str)+'\\n')
class Image:
    @classmethod
    def from_dockerfile(cls,*args,**kwargs): record('image',*args,**kwargs); return cls()
    def run_commands(self,*args): record('run_commands',*args); return self
    def add_local_file(self,*args,**kwargs): record('add_local_file',*args,**kwargs); return self
class App:
    @classmethod
    def lookup(cls,*args,**kwargs): record('app',*args,**kwargs); return cls()
class Process:
    def __init__(self,text='',code=0,delayed=False): self.delayed=delayed; self.stdout=io.StringIO(text); self.stderr=io.StringIO('synthetic stderr\\n'); self.returncode=code
    def wait(self):
        if self.delayed and (ROOT/'limit').exists():
            import time
            time.sleep(2)
        return self.returncode
from modal.exception import SandboxFilesystemNotFoundError, SandboxFilesystemFileTooLargeError
class Filesystem:
    def read_text(self,path): record('read_text',path); return '127.0.0.1 localhost\\n'
    def write_text(self,data,path): record('write_text',data,path)
    def copy_to_local(self,remote,local):
        record('copy_to_local',remote,local)
        if (ROOT/'missing').exists(): raise SandboxFilesystemNotFoundError(remote)
        if (ROOT/'large').exists(): raise SandboxFilesystemFileTooLargeError(remote)
        Path(local).write_text(report_text())
def report_text():
    return json.dumps({'success':True,'testResults':[{'name':'${VM_CHECKOUT}/tests/synthetic.test.ts','status':'passed'}],'syntheticPadding':'x'*9_000_000 if (ROOT/'large').exists() else ''})
class Sandbox:
    object_id='synthetic-sandbox'
    filesystem=Filesystem()
    @classmethod
    def create(cls,*args,**kwargs): record('create',*args,**kwargs); return cls()
    def exec(self,*args,**kwargs):
        record('exec',*args,**kwargs)
        if (ROOT/'broken-host').exists(): raise RuntimeError('SYNTHETIC-TOKEN-DO-NOT-PRINT')
        if args[0]=='cat': return Process(report_text())
        if args==('hostname',): return Process('synthetic-host\\n')
        return Process('synthetic stdout\\n',delayed=args[0]!='ps')
    def terminate(self): record('terminate')
`
it('runs the real driver against synthetic Modal, configures the VM, sets hosts before tests, and terminates', (context) => {
  const python = spawnSync('python3', ['--version'])
  if ((python.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') { console.warn('python3 is missing; the real-driver test is skipped.'); context.skip(); return }
  expect(python.status).toBe(0)
  mkdirSync(join(root, 'modal')); writeFileSync(join(root, 'modal/__init__.py'), syntheticModal)
  writeFileSync(join(root, 'modal/exception.py'), 'class SandboxFilesystemError(Exception): pass\nclass SandboxFilesystemNotFoundError(SandboxFilesystemError): pass\nclass SandboxFilesystemFileTooLargeError(SandboxFilesystemError): pass\n')
  const plan = { dockerfilePath: 'synthetic-Dockerfile', contextPath: root, tarPath: 'synthetic.tar', commit: sha, files, workers: 7, limitSeconds: 60, cpu: 3, memoryMiB: 8192, command: commandList({ workers: 7, files, zone: 'Etc/UTC' }), buildCommand: ['synthetic-build'], checkout: VM_CHECKOUT, reportPath: VM_REPORT, reportFile: join(root, 'download.json') }
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan))
  const answer = spawnSync('python3', [driver, join(root, 'plan.json')], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, PYTHONPATH: root } })
  expect(answer.status, answer.stderr).toBe(0)
  const result = JSON.parse(answer.stdout.trim().split('\n').at(-1)!)
  expect(result.reportFile, answer.stdout).toBe(plan.reportFile)
  const downloaded = JSON.parse(readFileSync(result.reportFile, 'utf8'))
  expect(downloaded).toMatchObject({ success: true, testResults: [{ name: `${VM_CHECKOUT}/${files[0]}`, status: 'passed' }] })
  expect(result).not.toHaveProperty('report')
  expect(callsFromDisk().some(row => row[0] === 'copy_to_local' && row[1][0] === VM_REPORT && row[1][1] === plan.reportFile)).toBe(true)
  function callsFromDisk(): any[] { return readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
  const calls = callsFromDisk()
  const create = calls.find(row => row[0] === 'create')[2]
  expect(create).toMatchObject({ runtime: 'vm', block_network: true, cpu: 3, memory: 8192, timeout: 660 })
  const hosts = calls.findIndex(row => row[0] === 'write_text'); expect(hosts).toBeGreaterThan(-1); expect(calls[hosts][1][0]).toBe('127.0.0.1 localhost\n\n127.0.1.1 synthetic-host\n')
  expect(hosts).toBeLessThan(calls.findIndex(row => row[0] === 'exec' && row[1][0] === 'unshare'))
  expect(calls.at(-1)[0]).toBe('terminate')
  expect(calls.find(row => row[0] === 'image')[2]).toEqual({ context_dir: root, add_python: '3.12' })
  expect(calls.find(row => row[0] === 'add_local_file').slice(1)).toEqual([['synthetic.tar', '/opt/mole-office-snapshot.tar'], { copy: true }])
  const imageCommands = calls.filter(row => row[0] === 'run_commands').flatMap(row => row[1])
  expect(imageCommands).toEqual([
    'apt-get update', 'apt-get install -y --no-install-recommends tini',
    'mkdir -p /srv/sandbox/work /srv/sandbox/home',
    'tar -xf /opt/mole-office-snapshot.tar -C /srv/sandbox/work', 'rm /opt/mole-office-snapshot.tar',
    'chown -R 1000:1000 /srv/sandbox',
    `cd ${VM_CHECKOUT} && setpriv --reuid=1000 --regid=1000 --clear-groups env HOME=/srv/sandbox/home npm ci --no-audit --no-fund`,
    'chmod 1777 /tmp && test "$(stat -c %a /tmp)" = 1777',
  ])
  const launcher = join(root, 'synthetic-python')
  writeFileSync(launcher, `#!/usr/bin/env python3\nimport sys,runpy\nsys.path.insert(0,${JSON.stringify(root)})\nsys.argv=sys.argv[1:]\nrunpy.run_path(sys.argv[0],run_name='__main__')\n`, { mode: 0o700 })
  const integrated = launch(['--cpu', '3', '--memory-mib', '8192', '--workers', '7'], launcher)
  expect(integrated.status, integrated.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(root, 'report.json'), 'utf8'))).toEqual(downloaded)
  const receipt = JSON.parse(readFileSync(join(root, '.cache/mole-office/modal/receipts.jsonl'), 'utf8').trim())
  expect(receipt).toMatchObject({ commit: sha, files: 1, runtime: 'vm', cpu: 3, memoryMiB: 8192, outcome: 'passed', sandboxId: 'synthetic-sandbox' })
  expect(receipt.estimatedUSD).toBeCloseTo(estimateUSD(receipt.sandboxSeconds, 3, 8192), 10)
  expect(integrated.stdout + integrated.stderr).not.toContain('SYNTHETIC-TOKEN-DO-NOT-PRINT')
  writeFileSync(join(root, 'large'), 'synthetic oversized report')
  const large = launch([], launcher)
  expect(large.status, large.stderr).toBe(0)
  expect(readFileSync(join(root, 'report.json'), 'utf8').length).toBeGreaterThan(9_000_000)
  expect(large.stdout.length).toBeLessThan(2000)
  expect(large.stdout).not.toContain('modal-tests-result')
  expect(large.stdout).toContain('Modal sandbox synthetic-sandbox:')
  expect(callsFromDisk().some(row => row[0] === 'exec' && row[1].join(' ') === `cat ${VM_REPORT}`)).toBe(true)
  rmSync(join(root, 'large'))
  writeFileSync(join(root, 'missing'), 'synthetic missing report')
  expect(launch([], launcher).status).toBe(75)
  writeFileSync(join(root, 'limit'), 'synthetic delayed build')
  writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...plan, limitSeconds: 1 }))
  const limited = spawnSync('python3', [driver, join(root, 'plan.json')], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, PYTHONPATH: root } })
  expect(limited.status, limited.stderr).toBe(0)
  const limitedResult = JSON.parse(limited.stdout.trim().split('\n').at(-1)!)
  expect(limitedResult).toMatchObject({ stoppedAtLimit: true, reportFile: null, sandboxId: 'synthetic-sandbox' })
  expect(limitedResult.ps).toBe('synthetic stdout\n')
  const laterCalls = readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(laterCalls.at(-1)[0]).toBe('terminate')
  expect(laterCalls.some(row => row[0] === 'exec' && row[1].join(' ') === 'ps -eo pid,ppid,etimes,pcpu,rss,args')).toBe(true)

  rmSync(join(root, 'limit')); writeFileSync(join(root, 'broken-host'), 'synthetic broken hostname')
  const broken = spawnSync('python3', [driver, join(root, 'plan.json')], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, PYTHONPATH: root } })
  expect(broken.status).toBe(0)
  expect(broken.stdout).toContain('Modal tests driver failed while reading the sandbox hostname (RuntimeError).')
  expect(broken.stdout + broken.stderr).not.toContain('SYNTHETIC-TOKEN-DO-NOT-PRINT')
  expect(JSON.parse(broken.stdout.trim().split('\n').at(-1)!)).toMatchObject({ reportFile: null, stoppedAtLimit: false })
  expect(JSON.parse(readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').at(-1)!)[0]).toBe('terminate')

})
