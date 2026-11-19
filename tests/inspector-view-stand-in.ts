// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A labelled launcher protocol stand-in. It enforces no OS mount permissions. */
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The names a check's runtime may be handed, and the program each is read by, as a template's secrets.names gives them. */
const DECLARED: [string, string[]][] = [['CLAUDE_CODE_OAUTH_TOKEN', ['claude']], ['OPENAI_API_KEY', ['codex']], ['CODEX_API_KEY', ['codex']],
  ['OPENCODE_API_KEY', ['opencode']], ['DEEPSEEK_API_KEY', ['opencode', 'dsh']]]

/**
 * `secrets` are made-up values for the stand-in template's secrets file. The template is labelled synthetic and declares
 * every name a check's runtime may be handed; runInside reads it to mask what the view answers (problem DNSRdZtWGTjS).
 * With no `secrets`, every name is declared and none is set.
 */
export function inspectorViewStandIn({ secrets = {} }: { secrets?: Record<string, string> } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'inspector-view-contract-'))
  const folder = join(root, 'inspector-one')
  const checkDir = join(folder, 'checks', 'a-check')
  const work = join(folder, 'check-views', 'a-check', 'work')
  const home = join(folder, 'check-views', 'a-check', 'home')
  const templateDir = join(root, 'stand-in-template'), secretFile = join(root, 'stand-in-secrets')
  for (const dir of [checkDir, home, join(work, '.git'), templateDir]) mkdirSync(dir, { recursive: true })
  writeFileSync(secretFile, Object.entries(secrets).map(([name, value]) => `${name}=${value}\n`).join(''), { mode: 0o600 })
  chmodSync(secretFile, 0o600)
  writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'A synthetic stand-in template', secrets: { hostFile: secretFile,
    names: DECLARED.map(([name, readBy]) => ({ name, readBy })) } }))
  const sandbox = { folder, checkDir, home, templateDir, instance: 'inspector-one', running: null, login: null,
    asked: { handle: 'inspector-one', check: 'a-check', run: 'a-run', api: 'http://127.0.0.1:1',
      workspace: 'default', sandboxes: root, from: null, say: (_sentence: string) => {} } }
  const calls: { words: string[]; command: string[]; spec: any; asked: any }[] = []
  let alterStart = (_start: any) => {}
  let alterReceipt = (_receipt: any) => {}
  let exitCode = 0
  const launcher = async (asked: any, words: string[], command: any = null) => {
    if (!words.includes('--check-view')) throw new Error('Synthetic launcher refuses legacy exec')
    const file = words[words.indexOf('--check-view') + 1]!
    const bytes = readFileSync(file)
    const spec = JSON.parse(bytes.toString())
    calls.push({ words, command, spec, asked })
    const output = join(spec.outputs.dir, `command-${calls.length}`)
    mkdirSync(output, { recursive: true })
    const start: any = { instance: sandbox.instance, run: null, innerPid: 2147483600, hostPid: 2147483600,
      hostPgid: 2147483600, processRow: 'fixture-process', cwd: '/work', command,
      view: { container: 'fixture-view', containerRow: 'fixture-container', sha256: createHash('sha256').update(bytes).digest('hex') },
      ...Object.fromEntries(['out', 'err', 'exit', 'receipt', 'details'].map(name => [name, join(output, name)])) }
    const receipt: any = { check: sandbox.asked.check, instance: sandbox.instance, started: true,
      code: exitCode, why: exitCode === 124 ? 'Synthetic timeout reason' : null,
      view: { ...start.view }, processRow: start.processRow, innerPid: start.innerPid,
      out: start.out, err: start.err, exit: start.exit, released: ['fixture-container', 'fixture-process'] }
    writeFileSync(start.out, 'Synthetic command output')
    writeFileSync(start.err, '')
    writeFileSync(start.exit, String(exitCode))
    alterReceipt(receipt)
    writeFileSync(start.receipt, JSON.stringify(receipt))
    alterStart(start)
    return { code: 0, stdout: JSON.stringify(start), stderr: '' }
  }
  return { root, sandbox, work, calls, launcher,
    changeStart: (change: typeof alterStart) => { alterStart = change },
    changeReceipt: (change: typeof alterReceipt) => { alterReceipt = change },
    exit: (code: number) => { exitCode = code },
    close: () => rmSync(root, { recursive: true, force: true }) }
}
