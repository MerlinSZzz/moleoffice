// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EFFORT COPIES BESIDE A SELECTION READ THE ONE TABLE (wave 13n round CC, item 2ax).
 *
 * HOW A RUNTIME'S OWN PROGRAM TAKES A REASONING EFFORT is one line per runtime in
 * src/config/how-a-command-takes-an-effort.mjs. The launcher's selection check (applyLauncherSelection in
 * src/config/launcher-selection.mjs) used to write its option and setting names, Claude Code's variable and each
 * runtime's flags itself. The inspector wrote Claude Code's `--effort` in its own command, and inspector-sandbox.mjs
 * checked opencode's `--variant` itself. Each now reads the table.
 *
 * THE DSH READERS ARE NOT THE TABLE'S. The `--effort` there belongs to the inspector's own DSH ACP client,
 * tools/inspector-dsh-acp.mjs, which is the inspector's program and not a runtime's. The client says its option once,
 * in THE_DSH_ACP_EFFORT_OPTION, and inspector-sandbox.mjs's check and the inspector's dsh command read it there. The
 * table gets no dsh line, and a dsh command still gets its effort only through SANDBOX_DSH_SELECTION.
 *
 * THE REAL TABLE FIRST: for every runtime with a line and a program, the selection check refuses a caller's other
 * effort written by that line, takes the same one, and adds the line's own option or setting and variable; the
 * inspector's commands carry the line's option or setting; and inspector-sandbox.mjs accepts opencode's option.
 *
 * THEN A MADE-UP TABLE, loaded through `vi.doMock` and a fresh import. It has a made-up option, setting and variable
 * on every line, and a kimi line that no reader names by its runtime today. Every reader must follow it; a reader
 * that still writes its own word gives the real table's answer and its case goes red by assertion.
 *
 * THEN A MADE-UP CLIENT CONSTANT: inspector-sandbox.mjs's dsh check and the inspector's dsh command follow it, and a
 * copy of the client whose exported constant is changed accepts the made-up option, which proves the client reads its
 * own constant. Nothing here starts a model or dsh.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from '../src/config/how-a-command-takes-an-effort.mjs'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY, THE_RUNTIMES_FAST_MODE, withoutTheProvider } from '../src/config/model-efforts.mjs'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { aCommandWithTheHarnessFeaturesOff } from '../tools/harness-features-off.mjs'
import { aCommandsStartValues } from '../tools/sandbox-common.mjs'
import { copyTheDshClient, DSH_CHECK_ENV, OPENCODE_CHECK_ENV, runInside, theDshCheckCommand } from '../tools/inspector-sandbox.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'

type Line = { readonly option: string | null; readonly setting: string | null; readonly environment: string | null }
type Lines = Record<string, Line | null>
type Start = typeof aCommandsStartValues
type Selection = { runtime: string; model: string; native: { model: string; provider: string | null; variant: string | null; effort: string | null }; casting: null }

const REAL_LINES = HOW_EACH_COMMAND_TAKES_AN_EFFORT as unknown as Lines
const THE_EFFORT = 'an-effort-the-selection-names'
const ANOTHER_EFFORT = 'another-effort-the-caller-wrote'
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The word a selection refusal uses for an option: its own name without the dashes. */
const theOptionWord = (option: string) => option.replace(/^-+/, '')
/** The selection path's refusal of a caller's own effort written by an option or a setting. */
const aSelectionRefusalOf = (word: string) => new RegExp(`^The caller sets ${escaped(word)} to a value different from the selected native value\\. Nothing was started\\.$`)
/** The selection path's refusal of the caller's own variable, whose sentence names the source and the row. */
const anEnvironmentRefusalOf = (name: string, value: string) => new RegExp(`^The caller sets ${escaped(name)} to ${escaped(value)}, from a source that was not given, but the selected native effort is ${escaped(THE_EFFORT)} for a selection with no Casting row\\. Nothing was started\\.$`)

/** A listed model for each runtime: the inspector's no-selection path reads the compatibility list. */
function aListedModel(prefix: string): string {
  const model = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((one) => one.startsWith(prefix))
  if (model === undefined) throw new Error(`The compatibility list names no model beginning ${prefix}.`)
  return model
}
const MODELS: Record<string, string> = {
  'claude-code': aListedModel('claude-'),
  codex: aListedModel('gpt-'),
  opencode: aListedModel('opencode-go/'),
}

/** A selection whose effort is THE_EFFORT and whose variant is unset, so every line's word is the effort. */
function aSelection(runtime: string): Selection {
  return { runtime, model: `office-${runtime}`, native: { model: `native-${runtime}`, provider: null, variant: null, effort: THE_EFFORT }, casting: null }
}

/** The model flag the launcher writes for a runtime, and the model it names. */
const theModelFlag = (runtime: string, selection: Selection): string[] =>
  runtime === 'claude-code' ? ['--model', selection.native.model] : ['-m', selection.native.model]

/** The effort words a line adds, and fast mode only where the line is a setting (the one-table test pins that). */
function theLinesWords(runtime: string, line: Line): string[] {
  const effort = line.option !== null ? [line.option, THE_EFFORT] : ['-c', `${line.setting}=${JSON.stringify(THE_EFFORT)}`]
  const fast = line.option === null && THE_RUNTIMES_FAST_MODE[runtime as keyof typeof THE_RUNTIMES_FAST_MODE] === true ? ['-c', 'service_tier=fast'] : []
  return [...effort, ...fast]
}

/** A. The selection check writes each runtime's effort by its own line, and sets that line's variable. */
function theSelectionWritesTheLine(lines: Lines, start: Start) {
  for (const [runtime, program] of Object.entries(THE_PROGRAM_A_RUNTIME_RUNS)) {
    const line = lines[runtime] ?? null
    // dsh has a program and no line: the launcher returns it as a DSH selection before any of this. kimi has a line
    // and no program: readLauncherSelection refuses a selection for a runtime with no program.
    if (line === null) continue
    const selection = aSelection(runtime)
    const given = start([program, 'a prompt'], { selection })
    expect(given.command, runtime).toEqual([program, 'a prompt', ...theModelFlag(runtime, selection), ...theLinesWords(runtime, line)])
    expect(given.env, runtime).toEqual(line.environment === null ? {} : { [line.environment]: THE_EFFORT })
  }
}

/** B. The selection check refuses a caller's other effort written by the line, and takes the same one. */
function theSelectionCheckFollows(lines: Lines, start: Start) {
  for (const [runtime, program] of Object.entries(THE_PROGRAM_A_RUNTIME_RUNS)) {
    const line = lines[runtime] ?? null
    if (line === null) continue
    const selection = aSelection(runtime)
    const model = theModelFlag(runtime, selection)
    if (line.option !== null) {
      const option = line.option
      expect(() => start([program, option, ANOTHER_EFFORT, 'a prompt'], { selection }), `${runtime} ${option}`)
        .toThrow(aSelectionRefusalOf(theOptionWord(option)))
      const same = start([program, option, THE_EFFORT, 'a prompt'], { selection })
      expect(same.command, `${runtime} ${option}`).toEqual([program, option, THE_EFFORT, 'a prompt', ...model])
    } else {
      const setting = line.setting!
      expect(() => start([program, '-c', `${setting}=${ANOTHER_EFFORT}`, 'a prompt'], { selection }), `${runtime} ${setting}`)
        .toThrow(aSelectionRefusalOf(setting))
      const same = start([program, '-c', `${setting}="${THE_EFFORT}"`, 'a prompt'], { selection })
      const fast = THE_RUNTIMES_FAST_MODE[runtime as keyof typeof THE_RUNTIMES_FAST_MODE] === true ? ['-c', 'service_tier=fast'] : []
      expect(same.command, `${runtime} ${setting}`).toEqual([program, '-c', `${setting}="${THE_EFFORT}"`, 'a prompt', ...model, ...fast])
    }
    if (line.environment !== null) {
      const variable = line.environment
      expect(() => start([program, 'a prompt'], { selection, env: { [variable]: ANOTHER_EFFORT } }), `${runtime} ${variable}`)
        .toThrow(anEnvironmentRefusalOf(variable, ANOTHER_EFFORT))
      expect(start([program, 'a prompt'], { selection, env: { [variable]: THE_EFFORT } }).env, `${runtime} ${variable}`)
        .toEqual({ [variable]: THE_EFFORT })
    }
  }
}

/** C. The check reads every line's option or setting whichever runtime it belongs to, on one runtime's command. */
function theSelectionCheckReadsEveryLine(lines: Lines, start: Start) {
  const program = THE_PROGRAM_A_RUNTIME_RUNS['claude-code']!
  const selection = aSelection('claude-code')
  const every = Object.values(lines).filter((one): one is Line => one !== null && one !== undefined)
  for (const line of every) {
    if (line.option !== null) {
      const option = line.option
      expect(() => start([program, option, ANOTHER_EFFORT, 'a prompt'], { selection }), option)
        .toThrow(aSelectionRefusalOf(theOptionWord(option)))
      expect(() => start([program, option, THE_EFFORT, 'a prompt'], { selection }), option).not.toThrow()
    } else {
      const setting = line.setting!
      expect(() => start([program, '-c', `${setting}=${ANOTHER_EFFORT}`, 'a prompt'], { selection }), setting)
        .toThrow(aSelectionRefusalOf(setting))
      expect(() => start([program, '-c', `${setting}="${THE_EFFORT}"`, 'a prompt'], { selection }), setting).not.toThrow()
    }
    if (line.environment !== null) {
      const variable = line.environment
      const call = () => start([program, 'a prompt'], { selection, env: { [variable]: ANOTHER_EFFORT } })
      if (line === lines['claude-code']) expect(call, variable).toThrow(anEnvironmentRefusalOf(variable, ANOTHER_EFFORT))
      else expect(call, variable).not.toThrow()
    }
  }
}

const THE_INSPECTOR = 'tools/the-inspector.mjs'
const theInspectorSource = readFileSync(join(process.cwd(), THE_INSPECTOR), 'utf8')
/** The inspector's own command builder, read from source because the tool's top level starts work. */
function theInspectorsCommand({ runtime, effort, selection = null, lines, dshCommand = theDshCheckCommand }: { runtime: string; effort: string | null; selection?: Selection | null; lines: Lines; dshCommand?: typeof theDshCheckCommand }, start: Start): { command: string[]; env: Record<string, string> } {
  const at = theInspectorSource.indexOf('function theChecksCommand(')
  if (at < 0) throw new Error('The inspector holds no theChecksCommand.')
  const end = theInspectorSource.indexOf('\n}\n', at) + 3
  const context = {
    RUNTIME: runtime, MODEL: MODELS[runtime] ?? 'an-office-model', SELECTION: selection, EFFORT: { effort },
    // The provider row the check's Casting row names: null, as whatTheOfficeGivesTheCheck gives when the office names none.
    GIVEN: { effortFrom: 'Casting', provider: null }, NATIVE_ROUTE: MODELS.opencode,
    DSH: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' },
    THE_MODEL_SESSION: 'the-check-session', SANDBOX: null, MADE_A_WORKTREE: null, WHERE: '/synthetic/work',
    // The key a dsh check's Casting provider row names, which the dsh command carries: null, as it is outside a sandbox.
    PROVIDER_KEY: null,
    FULL_PERMISSIONS, aCommandsStartValues: start, withoutTheProvider, OPENCODE_CHECK_ENV, DSH_CHECK_ENV,
    aCommandWithTheHarnessFeaturesOff, theRecordsFolder: () => '/synthetic/records',
    HOW_EACH_COMMAND_TAKES_AN_EFFORT: lines,
    // The inspector builds a dsh check's command with inspector-sandbox.mjs's builder, which reads the client's option;
    // a case that loaded that module with a made-up client passes the builder it loaded.
    theDshCheckCommand: dshCommand,
  }
  const read = runInNewContext(`${theInspectorSource.slice(at, end)}\n;({theChecksCommand})`, context) as { theChecksCommand: (resume: string | null) => { command: string[]; env: Record<string, string> } }
  return read.theChecksCommand(null)
}

/** D. The inspector's no-selection command carries the line's own option or setting for each runtime. */
function theInspectorsCommandsFollow(lines: Lines, start: Start, realLines: Lines) {
  for (const runtime of ['claude-code', 'codex', 'opencode']) {
    const line = lines[runtime] ?? null
    if (line === null) throw new Error(`The table has no line for ${runtime}, so this case cannot say what the inspector should write.`)
    const given = theInspectorsCommand({ runtime, effort: 'xhigh', lines }, start)
    const word = line.option ?? line.setting!
    const at = line.option !== null ? given.command.indexOf(line.option) : given.command.findIndex((one) => one.startsWith(`${line.setting}=`))
    const placed = at < 0 ? [] : line.option !== null ? given.command.slice(at + 1, at + 2) : [given.command[at]]
    expect(placed, `${runtime} ${word}`).toEqual(line.option !== null ? ['xhigh'] : [`${line.setting}=xhigh`])
    if (lines !== realLines) {
      const real = realLines[runtime]
      const realWord = real?.option ?? real?.setting ?? null
      if (realWord !== null && realWord !== word) expect(given.command.join(' '), `${runtime} kept its own word ${realWord}`).not.toContain(realWord)
    }
  }
}

/** E. The inspector refuses a Claude Code effort when the table gives its line no option. */
function theInspectorRefusesAMissingClaudeOption(lines: Lines, start: Start) {
  expect(() => theInspectorsCommand({ runtime: 'claude-code', effort: 'xhigh', lines }, start))
    .toThrow('The effort table gives Claude Code no option for its effort. Nothing was started.')
}

/** The opencode shape check's argv, with the table's option name and a model whose provider the check maps. */
function anOpenCodeArgv(option: string | null, env: Record<string, string>): string[] {
  return ['env', ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
    'opencode', 'run', '--format', 'json', '--dir', '/work', '-m', 'deepseek/deepseek-flash', '--pure',
    ...(option === null ? [] : [option, 'high']), '--']
}

/** The dsh shape check's argv, with the client's option name. */
function aDshArgv(option: string, env: Record<string, string>): string[] {
  return ['env', ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
    'node', '/inputs/commands/inspector-dsh-acp.mjs', '--provider', 'deepseek-official', '--model', 'deepseek-flash', option, 'high']
}

describe('with the real table, every reader gives its answer', () => {
  it("the launcher's selection check writes each runtime's effort by its line, and sets its variable", () => {
    theSelectionWritesTheLine(REAL_LINES, aCommandsStartValues)
  })

  it("the launcher's selection check refuses a caller's other effort written by the line, and takes the same one", () => {
    theSelectionCheckFollows(REAL_LINES, aCommandsStartValues)
  })

  it("the launcher's selection check reads every line's option or setting, whichever runtime it belongs to", () => {
    theSelectionCheckReadsEveryLine(REAL_LINES, aCommandsStartValues)
  })

  it("the inspector's commands give each runtime's line its option or setting", () => {
    theInspectorsCommandsFollow(REAL_LINES, aCommandsStartValues, REAL_LINES)
  })

  it("inspector-sandbox's opencode shape check takes the table's opencode option", async () => {
    const option = REAL_LINES['opencode']!.option!
    const view = inspectorViewStandIn()
    try {
      const ran = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv: anOpenCodeArgv(option, OPENCODE_CHECK_ENV), limitMs: 1000, launcher: view.launcher })
      expect(ran.code, ran.why ?? '').toBe(0)
    } finally {
      view.close()
    }
  })
})

describe('with a made-up table, every reader follows it', () => {
  const MADE_UP_LINES: Lines = {
    'claude-code': { option: '--made-up-effort', setting: null, environment: 'MADE_UP_EFFORT_LEVEL' },
    codex: { option: null, setting: 'made_up_reasoning', environment: 'MADE_UP_CODEX_EFFORT' },
    opencode: { option: '--made-up-variant', setting: null, environment: null },
    kimi: { option: '--made-up-kimi-effort', setting: null, environment: 'MADE_UP_KIMI_EFFORT' },
  }
  let start: Start
  let sandbox: typeof import('../tools/inspector-sandbox.mjs')
  beforeAll(async () => {
    vi.doMock('../src/config/how-a-command-takes-an-effort.mjs', () => ({ HOW_EACH_COMMAND_TAKES_AN_EFFORT: MADE_UP_LINES }))
    vi.resetModules()
    start = (await import('../tools/sandbox-common.mjs')).aCommandsStartValues
    sandbox = await import('../tools/inspector-sandbox.mjs')
  }, 60_000)
  afterAll(() => {
    vi.doUnmock('../src/config/how-a-command-takes-an-effort.mjs')
    vi.resetModules()
  })

  it("the launcher's selection check writes each made-up line's effort and variable", () => {
    theSelectionWritesTheLine(MADE_UP_LINES, start)
  })

  it("the launcher's selection check refuses a caller's other effort written by each made-up line", () => {
    theSelectionCheckFollows(MADE_UP_LINES, start)
  })

  it("the launcher's selection check reads the made-up kimi line, which no reader names by its runtime", () => {
    theSelectionCheckReadsEveryLine(MADE_UP_LINES, start)
  })

  it("the inspector's commands give each made-up line its option or setting", () => {
    theInspectorsCommandsFollow(MADE_UP_LINES, start, REAL_LINES)
  })

  it('the inspector refuses a Claude Code effort when the made-up line gives it no option', () => {
    theInspectorRefusesAMissingClaudeOption({ ...MADE_UP_LINES, 'claude-code': { option: null, setting: 'made_up_claude_reasoning', environment: null } }, start)
  })

  it("inspector-sandbox's opencode shape check follows the made-up opencode option", async () => {
    const option = MADE_UP_LINES['opencode']!.option!
    const view = inspectorViewStandIn()
    try {
      const took = await sandbox.runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv: anOpenCodeArgv(option, sandbox.OPENCODE_CHECK_ENV), limitMs: 1000, launcher: view.launcher })
      expect(took.code, took.why ?? '').toBe(0)
      const refused = await sandbox.runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv: anOpenCodeArgv(REAL_LINES['opencode']!.option!, sandbox.OPENCODE_CHECK_ENV), limitMs: 1000, launcher: view.launcher })
      expect(refused.code, 'the real option is not the made-up table\'s').toBeNull()
    } finally {
      view.close()
    }
  })
})

describe("the DSH client's option is read from the client", () => {
  const MADE_UP_DSH_OPTION = '--made-up-dsh-effort'
  let sandbox: typeof import('../tools/inspector-sandbox.mjs')
  beforeAll(async () => {
    vi.doMock('../tools/inspector-dsh-acp.mjs', () => ({ THE_DSH_ACP_EFFORT_OPTION: MADE_UP_DSH_OPTION }))
    vi.resetModules()
    sandbox = await import('../tools/inspector-sandbox.mjs')
  }, 60_000)
  afterAll(() => {
    vi.doUnmock('../tools/inspector-dsh-acp.mjs')
    vi.resetModules()
  })

  it("inspector-sandbox's dsh shape check follows the client's made-up option and refuses the real one", async () => {
    const view = inspectorViewStandIn()
    try {
      const took = await sandbox.runInside(view.sandbox, { runtime: 'dsh', label: 'dsh', cwd: view.work, argv: aDshArgv(MADE_UP_DSH_OPTION, sandbox.DSH_CHECK_ENV), limitMs: 1000, launcher: view.launcher })
      expect(took.code, took.why ?? '').toBe(0)
      const refused = await sandbox.runInside(view.sandbox, { runtime: 'dsh', label: 'dsh', cwd: view.work, argv: aDshArgv('--effort', sandbox.DSH_CHECK_ENV), limitMs: 1000, launcher: view.launcher })
      expect(refused.code, 'the client no longer names --effort').toBeNull()
    } finally {
      view.close()
    }
  })

  it("the inspector's dsh command follows the client's made-up option", () => {
    const given = theInspectorsCommand({ runtime: 'dsh', effort: 'high', lines: REAL_LINES, dshCommand: sandbox.theDshCheckCommand }, aCommandsStartValues)
    expect(given.command.slice(given.command.indexOf(MADE_UP_DSH_OPTION), given.command.indexOf(MADE_UP_DSH_OPTION) + 2)).toEqual([MADE_UP_DSH_OPTION, 'high'])
    expect(given.command, 'the inspector no longer writes its own --effort').not.toContain('--effort')
  })

  it('a copied client whose exported constant is made up takes the made-up option', () => {
    const folder = mkdtempSync(join(tmpdir(), 'the-effort-copies-selection-'))
    try {
      const commands = join(folder, 'commands')
      mkdirSync(commands)
      copyTheDshClient(commands)
      const file = join(commands, 'inspector-dsh-acp.mjs')
      chmodSync(file, 0o644)
      const source = readFileSync(file, 'utf8')
      const changed = source.replace(/(export const THE_DSH_ACP_EFFORT_OPTION = )'[^']*'/, `$1'${MADE_UP_DSH_OPTION}'`)
      expect(changed, 'the client exports its effort option').not.toBe(source)
      writeFileSync(file, changed)
      const ran = spawnSync(process.execPath, [file, '--provider', 'deepseek-official', '--model', 'deepseek-flash', MADE_UP_DSH_OPTION, 'high'], { cwd: folder, input: '', encoding: 'utf8', timeout: 20_000 })
      const envelope = JSON.parse(ran.stdout.trim().split('\n').pop() ?? 'null') as { type?: string; error?: string } | null
      expect(envelope?.type).toBe('dsh-acp-result')
      expect(envelope?.error).toBe('The prompt on stdin is empty or holds only white space. dsh was not started.')
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
