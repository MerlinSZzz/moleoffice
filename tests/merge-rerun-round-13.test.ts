// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic sleeping commands through the stand-in sandbox. Short limits are injected, never real minutes. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
function fixture(mode: 'silent' | 'steady' | 'slow-to-stop' | 'suite', label: string) {
  const folder = mkdtempSync(join(tmpdir(), 'merge-rerun-round-13-'))
  try {
    const sandboxes = join(folder, 'sandboxes')
    const cwd = join(sandboxes, 'synthetic-rerun', 'work')
    const logs = join(folder, 'logs')
    mkdirSync(cwd, { recursive: true }); mkdirSync(logs)
    writeFileSync(join(sandboxes, 'synthetic-rerun', 'instance.json'), JSON.stringify({ running: true, template: 'synthetic', from: folder }))
    writeFileSync(join(cwd, 'tests.test.ts'), '// Synthetic test name.\n')
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node fake.cjs' } }))
    // Write a green report BEFORE hanging: a stopped re-run must ignore even this partial result.
    writeFileSync(join(cwd, 'fake.cjs'), `const fs=require('node:fs');fs.writeFileSync('pid.txt',String(process.pid));
const report=process.argv.find(a=>a.startsWith('--outputFile.json='));
if(report)fs.writeFileSync(report.split('=')[1],JSON.stringify({testResults:[{name:require('node:path').resolve('tests.test.ts'),status:'passed'}]}));
const interval=${mode === 'steady' ? "setInterval(()=>process.stderr.write('still running\\n'),100)" : 'setInterval(()=>{},100)'};
setTimeout(()=>{clearInterval(interval)},4000);
${mode === 'slow-to-stop' ? "process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync('stopped.txt','');process.exit(0)},1500));" : ''}
`)
    const driver = join(folder, 'driver.mjs')
    writeFileSync(driver, `import {runAlone} from ${JSON.stringify(join(REPO, 'tools/merge-tool/red-files.mjs'))};
import {keepTheReport,runInSandbox} from ${JSON.stringify(join(REPO, 'tools/merge-tool/office-keeper.mjs'))};
import {RERUN_LIMITS,SUITE_TIMEOUT_MS} from ${JSON.stringify(join(REPO, 'tools/merge-tool/arguments.mjs'))};
const cwd=${JSON.stringify(cwd)}, reports=${JSON.stringify(cwd)};
const limits={timeoutMs:2500,idleTimeoutMs:700};
const result=${mode === 'suite' ? "await runInSandbox({name:'synthetic-rerun'},'suite',process.execPath,['fake.cjs'],{cwd,timeoutMs:SUITE_TIMEOUT_MS,rerunLimits:limits})" : `await runAlone({name:'synthetic-rerun'},cwd,'tests.test.ts',${JSON.stringify(label)},reports,{noResult:'answer',rerunLimits:limits,runInSandbox,keepTheReport})`};
console.log('RESULT '+JSON.stringify({result,defaults:RERUN_LIMITS,suiteLimit:SUITE_TIMEOUT_MS}));
`)
    const output = execFileSync(process.execPath, [driver, '--entry', 'synthetic-entry', '--session', 'synthetic-session', '--workdir', logs, '--sandboxes', sandboxes, '--sandbox-tool', join(REPO, 'tests/stand-in-sandbox-tool.mjs'), '--api', 'http://127.0.0.1:1'], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, MOLE_OFFICE_API: '', MOLE_AGENT_KEY: '' } })
    const data = JSON.parse(output.split('\n').find(line => line.startsWith('RESULT '))!.slice(7))
    const calls = readFileSync(join(sandboxes, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const pid = Number(readFileSync(join(cwd, 'pid.txt'), 'utf8'))
    let running = false
    try { running = !/^\d+ \(.*\) Z /.test(readFileSync(`/proc/${pid}/stat`, 'utf8')) } catch (err: any) { if (err.code !== 'ENOENT') throw err }
    return { ...data, calls, output, running, stopped: existsSync(join(cwd, 'stopped.txt')), log: readFileSync(join(logs, 'the-merger.log'), 'utf8') }
  } finally { rmSync(folder, { recursive: true, force: true }) }
}

it('stops silent single-file re-runs by group, says why, and never accepts their partial green report', () => {
  for (const label of ['rerun-1', 'main-rerun-1', 'pair-entry-1']) {
    const f = fixture('silent', label)
    expect(f.defaults).toEqual({ timeoutMs: 900_000, idleTimeoutMs: 600_000 })
    expect(f.result.red).toBeNull(); expect(f.result.noResult).toContain('stopped before its end')
    expect(f.log).toContain('stopped: tests.test.ts printed nothing for 700 milliseconds')
    expect(f.running).toBe(false); expect(f.calls[0].timeout).toBe('3')
  }
}, 60_000)

it('steady output resets the watchdog but the single-file total limit still stops the group', () => {
  const f = fixture('steady', 'pair-entry-2')
  expect(f.result.red).toBeNull(); expect(f.result.noResult).toContain('stopped before its end')
  expect(f.log).toContain('stopped: tests.test.ts reached its limit of 2500 milliseconds')
  expect(f.log).not.toContain('printed nothing'); expect(f.running).toBe(false)
}, 30_000)

// npm ends at once on SIGTERM and does not wait for the test it started, which may take time to stop.
it('answers a stopped re-run only once its whole group has ended, though npm in front of the test ends at once', () => {
  const f = fixture('slow-to-stop', 'rerun-2')
  expect(f.result.red).toBeNull(); expect(f.result.noResult).toContain('stopped before its end')
  expect(f.log).toContain('stopped: tests.test.ts printed nothing for 700 milliseconds')
  expect(f.running).toBe(false); expect(f.stopped).toBe(true)
}, 30_000)

it('the full-suite run keeps its own limit and has no single-file watchdog', () => {
  const f = fixture('suite', 'suite')
  expect(f.result.code).toBe(0); expect(f.result.timedOut).toBe(false)
  expect(f.suiteLimit).toBe(10_800_000); expect(f.calls[0].timeout).toBe('10800')
  expect(f.log).not.toContain('stopped:'); expect(f.running).toBe(false)
}, 30_000)
