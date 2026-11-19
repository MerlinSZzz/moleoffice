// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EFFORT FACTS ARE READ FROM ONE PLACE EACH, and every copy follows them.
 *
 * Two facts, kept apart. WHAT A RUNTIME PASSES ON of the effort the office chose is `whatItPassesOn` in
 * src/worker/runtimes/what-a-runtime-passes-on.ts, and only opencode passes one on. HOW A RUNTIME'S COMMAND TAKES AN
 * EFFORT at all is one line per runtime: Claude Code's `--effort` and its CLAUDE_CODE_EFFORT_LEVEL variable, Codex's
 * `-c model_reasoning_effort=`, opencode's `--variant`, and none for kimi. Four places wrote these by hand: the
 * runtime page's saying (`variantFrom` in src/server/lib/runtime.ts), the `agent` kind's `variant` sentence
 * (src/shared/kinds.ts), the launcher (`aCommandsStartValues` in src/config/sandbox-start-values.mjs), and the opencode
 * adapter's `--variant`. Each now reads the one table.
 *
 * THE REAL TABLES first: each copy gives the tables' answer for every runtime the office dispatches, and the launcher
 * starts every pinned command exactly as before. Then A MADE-UP TABLE, loaded through `vi.doMock` and a fresh import:
 * codex passes the office's effort on as well, and every line has a made-up option, setting or variable. Every copy
 * must follow it. A copy that writes its own words still gives the real table's answer, and its case goes red.
 *
 * THE LINES ARE WRITTEN OUT HERE ON PURPOSE (`THE_LINES_TODAY`). They are the pin that no command changes, the
 * launcher's owner's condition for moving the launcher onto the table. A change to a line needs that owner's yes, and
 * this pin changes with it.
 *
 * LAST, A REFUSAL that names the runtimes the office passes a model or an effort to still reads as a sentence when
 * that list is empty.
 */
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_RUNTIMES_THE_OFFICE_DISPATCHES } from '../src/shared/participants.ts'
import { whyThisPairIsRefused, type TheOfficesChoice, type TheRuntimesTheWorkerGives } from '../src/shared/run-models.ts'
import { theRuntimesTheWorkerGives, whatItPassesOn, type WhatItPassesOn } from '../src/worker/runtimes/what-a-runtime-passes-on.ts'
import { applyLauncherSelection, THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY, THE_RUNTIMES_FAST_MODE, theOwnersEffort } from '../src/config/model-efforts.mjs'
import runtimeData from '../src/config/runtime-native-providers.json' with { type: 'json' }
import * as theDataFilesReader from '../src/config/runtime-native-providers.mjs'

type ADispatchedRuntime = (typeof THE_RUNTIMES_THE_OFFICE_DISPATCHES)[number]
type Line =
  | { readonly option: string; readonly setting: null; readonly environment: string | null }
  | { readonly option: null; readonly setting: string; readonly environment: string | null }
type Lines = { readonly [R in ADispatchedRuntime]: Line | null }
type Gives = (dispatched: readonly ADispatchedRuntime[]) => TheRuntimesTheWorkerGives
type StartOptions = NonNullable<Parameters<typeof import('../tools/sandbox-common.mjs')['aCommandsStartValues']>[1]>

/** How each runtime's command takes an effort today. The pin, said above. */
const THE_LINES_TODAY: Lines = {
  'claude-code': { option: '--effort', setting: null, environment: 'CLAUDE_CODE_EFFORT_LEVEL' },
  codex: { option: null, setting: 'model_reasoning_effort', environment: null },
  opencode: { option: '--variant', setting: null, environment: null },
  kimi: null,
}

/** The made-up lines. Codex has a variable as well, which no line has today. */
const MADE_UP_LINES: Lines = {
  'claude-code': { option: '--made-up-effort', setting: null, environment: 'MADE_UP_EFFORT_LEVEL' },
  codex: { option: null, setting: 'made_up_reasoning', environment: 'MADE_UP_CODEX_EFFORT' },
  opencode: { option: '--made-up-variant', setting: null, environment: null },
  kimi: null,
}

/** The made-up answer to what a runtime passes on: codex passes the office's effort on, as opencode does. */
const madeUpPassesOn = (runtime: ADispatchedRuntime, chosen: TheOfficesChoice): WhatItPassesOn =>
  runtime === 'codex' ? { model: chosen.model, variant: chosen.model === null ? null : chosen.variant } : whatItPassesOn(runtime, chosen)

/** Which runtimes are passed a model and an effort, worked out from the made-up answer as the real one is from its own. */
const madeUpGives: Gives = (dispatched) => {
  const handed = 'a-value-handed-to-see-whether-it-is-passed'
  const passed = dispatched.map((word) => ({ word, ...madeUpPassesOn(word, { model: handed, variant: handed }) }))
  return { aModelTo: passed.filter((one) => one.model === handed).map((one) => one.word), aVariantTo: passed.filter((one) => one.variant === handed).map((one) => one.word) }
}

const THE_EFFORT = 'an-effort-the-office-gave'
const ANOTHER_EFFORT = 'another-effort-the-caller-wrote'
const officeEffort = (effort: string) => ({ effort, effortFrom: 'Casting', model: null })
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The modules each copy lives in, imported fresh after the tables are set. */
interface TheCopies {
  whereRunsGo: typeof import('../src/server/lib/runtime.ts')['whereRunsGo']
  kinds: typeof import('../src/shared/kinds.ts')['KIND_SPECS']
  aCommandsStartValues: typeof import('../tools/sandbox-common.mjs')['aCommandsStartValues']
  adapterFor: typeof import('../src/worker/runtimes/index.ts')['adapterFor']
}

async function theCopies(): Promise<TheCopies> {
  return {
    whereRunsGo: (await import('../src/server/lib/runtime.ts')).whereRunsGo,
    kinds: (await import('../src/shared/kinds.ts')).KIND_SPECS,
    aCommandsStartValues: (await import('../tools/sandbox-common.mjs')).aCommandsStartValues,
    adapterFor: (await import('../src/worker/runtimes/index.ts')).adapterFor,
  }
}

/** The environment with no setting for the office's own runs, and the runtime given: the page then draws `variantFrom`. */
function anEnvironmentNamingOnly(runtime: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of Object.keys(env)) if (/^MOLE_OFFICE_(CHORE_|AGENT_MODEL$)/.test(name)) delete env[name]
  return { ...env, MOLE_OFFICE_CHORE_RUNTIME: runtime }
}

/** A. THE RUNTIME PAGE says the effort is passed for a runtime exactly when the worker's answer passes it one. */
function thePageFollows(copies: TheCopies, gives: Gives) {
  const passed: readonly string[] = gives(THE_RUNTIMES_THE_OFFICE_DISPATCHES).aVariantTo
  for (const runtime of THE_RUNTIMES_THE_OFFICE_DISPATCHES) {
    const conversation = copies.whereRunsGo(anEnvironmentNamingOnly(runtime)).places.find((one) => one.placeSaid?.code === 'placeConversation')
    expect(conversation?.runtime.name, runtime).toBe(runtime)
    // No effort is set, so the sentence drawn is the one that says whether this runtime is passed one.
    expect(conversation?.variant.name, runtime).toBeNull()
    const codes = (conversation?.variant.fromSaid ?? []).map((one) => one.code)
    if (passed.includes(runtime)) expect(codes, runtime).not.toContain('effortOpencodeOnly')
    else expect(codes, runtime).toEqual(['effortOpencodeOnly'])
  }
}

/** B. THE `agent` KIND'S `variant` SENTENCE names exactly the runtimes the worker's answer passes an effort to. */
function theKindsSentenceFollows(copies: TheCopies, gives: Gives): string {
  const passed: readonly string[] = gives(THE_RUNTIMES_THE_OFFICE_DISPATCHES).aVariantTo
  const sentence = copies.kinds.agent.fields.find((one) => one.key === 'variant')?.description ?? ''
  for (const runtime of THE_RUNTIMES_THE_OFFICE_DISPATCHES) {
    expect(new RegExp(`(^|[^a-z-])${escaped(runtime)}([^a-z-]|$)`).test(sentence), `${runtime} in: ${sentence}`).toBe(passed.includes(runtime))
  }
  return sentence
}

/** The words a line writes for an effort, and the fast-mode words that come after them. */
const theWordsFor = (runtime: ADispatchedRuntime, line: Line, effort: string) => [
  ...(line.option !== null ? [line.option, effort] : ['-c', `${line.setting}=${effort}`]),
  ...(THE_RUNTIMES_FAST_MODE[runtime as keyof typeof THE_RUNTIMES_FAST_MODE] === true ? ['-c', 'service_tier=fast'] : []),
]

/** C. THE LAUNCHER writes the effort by the runtime's own line alone, and sets the line's variable and no other. */
function theLaunchersFlagsFollow(copies: TheCopies, lines: Lines) {
  const programs: Record<string, string> = THE_PROGRAM_A_RUNTIME_RUNS
  for (const runtime of THE_RUNTIMES_THE_OFFICE_DISPATCHES) {
    const line = lines[runtime]
    const program = programs[runtime]
    if (program === undefined) {
      // A runtime the launcher starts no program for is handed back as it came, and its table line says none.
      expect(line, runtime).toBeNull()
      const given = copies.aCommandsStartValues([runtime, 'a prompt'], { runtime, effortAnswer: officeEffort(THE_EFFORT) })
      expect(given, runtime).toEqual({ command: [runtime, 'a prompt'], env: {}, start: null })
      continue
    }
    expect(line, runtime).not.toBeNull()
    const variable = line!.environment === null ? {} : { [line!.environment]: THE_EFFORT }
    const given = copies.aCommandsStartValues([program, 'a prompt'], { effortAnswer: officeEffort(THE_EFFORT) })
    expect(given.command, runtime).toEqual([program, 'a prompt', ...theWordsFor(runtime, line!, THE_EFFORT)])
    expect(given.env, runtime).toEqual(variable)
    // A shell-wrapped command is given the effort through the line's variable alone, and its words are left alone.
    const wrapped = copies.aCommandsStartValues(['sh', '-c', `${program} a-prompt`], { runtime, effortAnswer: officeEffort(THE_EFFORT) })
    expect(wrapped.command, runtime).toEqual(['sh', '-c', `${program} a-prompt`])
    expect(wrapped.env, runtime).toEqual(variable)
  }
}

/** The launcher's refusal of a caller's own effort, by the name it was written under. */
const aRefusalOf = (name: string) => new RegExp(`^The caller sets ${escaped(name)} to ${escaped(ANOTHER_EFFORT)}, but the office answers ${escaped(THE_EFFORT)} `)

/**
 * D. THE LAUNCHER'S CHECK refuses a caller's own effort written by any line's option or setting, for every program it
 * starts, and by the runtime's own line's variable. The same effort written the same way is taken.
 */
function theLaunchersCheckFollows(copies: TheCopies, lines: Lines) {
  const programs: Record<string, string> = THE_PROGRAM_A_RUNTIME_RUNS
  const every = Object.values(lines).filter((one): one is Line => one !== null)
  for (const runtime of THE_RUNTIMES_THE_OFFICE_DISPATCHES) {
    const program = programs[runtime]
    if (program === undefined) continue
    const start = (command: string[], env: Record<string, string> = {}) => () => copies.aCommandsStartValues(command, { env, effortAnswer: officeEffort(THE_EFFORT) })
    for (const one of every) {
      if (one.option !== null) {
        expect(start([program, one.option, ANOTHER_EFFORT, 'a prompt']), `${runtime} ${one.option}`).toThrow(aRefusalOf(one.option))
        expect(start([program, one.option, THE_EFFORT, 'a prompt']), `${runtime} ${one.option}`).not.toThrow()
      } else {
        expect(start([program, '-c', `${one.setting}=${ANOTHER_EFFORT}`, 'a prompt']), `${runtime} ${one.setting}`).toThrow(aRefusalOf(one.setting))
        expect(start([program, '-c', `${one.setting}="${THE_EFFORT}"`, 'a prompt']), `${runtime} ${one.setting}`).not.toThrow()
      }
    }
    for (const one of every) {
      if (one.environment === null) continue
      if (one === lines[runtime]) {
        expect(start([program, 'a prompt'], { [one.environment]: ANOTHER_EFFORT }), `${runtime} ${one.environment}`).toThrow(aRefusalOf(one.environment))
      } else {
        // Another runtime's variable is that program's own business, and this one is not refused for it.
        expect(start([program, 'a prompt'], { [one.environment]: ANOTHER_EFFORT }), `${runtime} ${one.environment}`).not.toThrow()
      }
    }
  }
}

/**
 * E. THE ADAPTERS write the office's effort on their command exactly when the worker's answer passes it on (`passed`,
 * or every adapter that writes one when null), and by the runtime's own line.
 */
function theAdaptersFollow(copies: TheCopies, lines: Lines, passesOn: typeof whatItPassesOn | null) {
  const chosen = { model: 'a-model-the-office-chose', variant: THE_EFFORT }
  const run = { session: 's', agent: 'a', prompt: 'a prompt', cwd: '/tmp', api: 'http://127.0.0.1:1', workspace: 'default', outputPath: '/tmp/the-effort-fact.out' }
  let written = 0
  for (const runtime of THE_RUNTIMES_THE_OFFICE_DISPATCHES) {
    const args = copies.adapterFor(runtime, {}, chosen)!.commandFor(run).args
    const at = args.findIndex((one) => one === THE_EFFORT || one.endsWith(`=${THE_EFFORT}`))
    if (passesOn !== null) expect(at !== -1, `${runtime}: ${args.join(' ')}`).toBe(passesOn(runtime, chosen).variant !== null)
    if (at === -1) continue
    written++
    const line = lines[runtime]
    expect(line, runtime).not.toBeNull()
    expect(args.slice(at - 1, at + 1), runtime).toEqual(line!.option !== null ? [line!.option, THE_EFFORT] : ['-c', `${line!.setting}=${THE_EFFORT}`])
  }
  expect(written).toBeGreaterThan(0)
}

describe('with the real tables, each copy gives their answer', () => {
  let db: TestDb
  let copies: TheCopies
  beforeAll(async () => {
    db = await freshDb()
    copies = await theCopies()
  }, 60_000)
  afterAll(() => db?.close())

  it('the runtime page says which runtimes are passed an effort, as the worker answers', () => {
    thePageFollows(copies, theRuntimesTheWorkerGives)
  })

  it("the agent kind's variant sentence names the runtimes passed an effort, in the words it has today", () => {
    expect(theKindsSentenceFollows(copies, theRuntimesTheWorkerGives)).toBe(
      "THE REASONING EFFORT THIS AGENT'S RUNS GET, beside `model`. Only opencode is passed one, so it is refused for any other runtime. Absent means none is set.",
    )
  })

  it("the launcher writes each runtime's effort by its line, and sets its variable", () => {
    theLaunchersFlagsFollow(copies, THE_LINES_TODAY)
  })

  it("the launcher refuses a caller's other effort written by any line, and takes the same one", () => {
    theLaunchersCheckFollows(copies, THE_LINES_TODAY)
  })

  it("the adapters write the office's effort only where it is passed on, by the runtime's line", () => {
    theAdaptersFollow(copies, THE_LINES_TODAY, whatItPassesOn)
  })

  it('fast mode is on only for a runtime whose effort is a setting, the form fast mode is written in', () => {
    // A fast runtime whose effort is an option would be given `-c service_tier=fast`, which its program does not take.
    for (const [runtime, entry] of Object.entries(runtimeData)) {
      expect(typeof entry.fastMode, runtime).toBe('boolean')
      if (entry.fastMode !== true) continue
      expect(Object.hasOwn(THE_LINES_TODAY, runtime), runtime).toBe(true)
      expect(THE_LINES_TODAY[runtime as ADispatchedRuntime]?.setting ?? null, runtime).not.toBeNull()
    }
  })

  it("the program and fast mode of each runtime are the data file's, given by its one reader", () => {
    const entries = Object.entries(runtimeData)
    expect(Object.keys(theDataFilesReader.THE_RUNTIMES_FAST_MODE ?? {})).toEqual(entries.map(([runtime]) => runtime))
    expect(Object.keys(theDataFilesReader.THE_PROGRAM_A_RUNTIME_RUNS ?? {})).toEqual(entries.map(([runtime]) => runtime))
    expect(theDataFilesReader.THE_RUNTIMES_FAST_MODE).toEqual(Object.fromEntries(entries.map(([runtime, entry]) => [runtime, entry.fastMode])))
    expect(theDataFilesReader.THE_PROGRAM_A_RUNTIME_RUNS).toEqual(Object.fromEntries(entries.map(([runtime, entry]) => [runtime, entry.program])))
    expect(THE_RUNTIMES_FAST_MODE).toBe(theDataFilesReader.THE_RUNTIMES_FAST_MODE)
    expect(THE_PROGRAM_A_RUNTIME_RUNS).toBe(theDataFilesReader.THE_PROGRAM_A_RUNTIME_RUNS)
  })

  it("a Codex start carries fast mode only when the data file turns it on, and checks a caller's service tier against it", () => {
    const isFast = runtimeData.codex!.fastMode
    const gpt = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((one) => one.startsWith('gpt-'))!
    const selection = { runtime: 'codex', model: 'office-codex', native: { model: 'native-codex', provider: null, variant: null, effort: THE_EFFORT }, casting: null }
    const throughTheStartValues = (command: string[]) => copies.aCommandsStartValues(command, { runtime: 'codex', model: gpt, effortAnswer: officeEffort(THE_EFFORT) })
    const throughTheSelection = (command: string[]) => applyLauncherSelection(command, { runtime: 'codex', model: selection.model, selection })
    for (const given of [throughTheStartValues(['codex', 'exec', 'hi']), throughTheSelection(['codex', 'exec', 'hi'])]) {
      expect(given.command.includes('service_tier=fast')).toBe(isFast)
      expect(given.start?.fast).toBe(isFast)
      expect(given.start?.words).toContain(`fast mode ${isFast ? 'on' : 'off'}`)
    }
    const theCallersOwn = [
      () => throughTheStartValues(['codex', 'exec', '-c', 'service_tier=fast', 'hi']),
      () => throughTheSelection(['codex', 'exec', '-c', 'service_tier=fast', 'hi']),
    ]
    if (isFast) for (const start of theCallersOwn) expect(start().command).toContain('service_tier=fast')
    else {
      expect(theCallersOwn[0]).toThrow(/^The caller sets service_tier to fast, /)
      expect(theCallersOwn[1]).toThrow(/^The caller sets service_tier to a value different from the selected native value\. Nothing was started\.$/)
    }
  })
})

describe('the launcher starts every pinned command as before', () => {
  const aliases = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases)
  const aModelWithAnEffort = (prefix: string) => {
    const model = aliases.find((one) => one.startsWith(prefix) && theOwnersEffort(one) !== null)
    if (model === undefined) throw new Error(`The owner's table names no model beginning ${prefix} with an effort, so this pin has nothing to start.`)
    return model
  }
  const claude = aModelWithAnEffort('claude-')
  const gpt = aModelWithAnEffort('gpt-')
  const go = aModelWithAnEffort('opencode-go/')
  const dsh = String(LAUNCHER_MODEL_COMPATIBILITY.dsh.models[0])
  const ownersEffort = (model: string) => theOwnersEffort(model)!
  const runner = fileURLToPath(new URL('../tools/dsh-hooks/run-agent.sh', import.meta.url))
  const none = { effort: null, effortFrom: 'none', model: null }
  const fast = THE_RUNTIMES_FAST_MODE.codex ? ['-c', 'service_tier=fast'] : []
  type Given = { command: string[]; env: Record<string, string> } | { refused: string } | { dsh: { model: string | null; effort: string | null } | null; command: string[] }
  const started = (command: string[], env: Record<string, string> = {}): Given => ({ command, env })
  const refused = (name: string, value: string): Given => ({ refused: `The caller sets ${name} to ${value}, ` })

  const cases: [string, string[], StartOptions, Given][] = [
    ['claude, the owner effort', ['claude', '-p', 'hi'], { model: claude }, started(['claude', '-p', 'hi', '--model', claude, '--effort', ownersEffort(claude)], { CLAUDE_CODE_EFFORT_LEVEL: ownersEffort(claude) })],
    ['claude, the office effort', ['claude', '-p', 'hi'], { model: claude, effortAnswer: officeEffort('low') }, started(['claude', '-p', 'hi', '--model', claude, '--effort', 'low'], { CLAUDE_CODE_EFFORT_LEVEL: 'low' })],
    ['claude, no model and no effort', ['claude', '-p', 'hi'], { effortAnswer: none }, started(['claude', '-p', 'hi'])],
    ['claude, the caller wrote --effort the same', ['claude', '--effort', 'low', '-p', 'hi'], { model: claude, effortAnswer: officeEffort('low') }, started(['claude', '--effort', 'low', '-p', 'hi', '--model', claude], { CLAUDE_CODE_EFFORT_LEVEL: 'low' })],
    ['claude, the caller wrote --effort= the same', ['claude', '--effort=low', '-p', 'hi'], { model: claude, effortAnswer: officeEffort('low') }, started(['claude', '--effort=low', '-p', 'hi', '--model', claude], { CLAUDE_CODE_EFFORT_LEVEL: 'low' })],
    ['claude, the caller wrote another --effort', ['claude', '--effort', 'high', '-p', 'hi'], { model: claude, effortAnswer: officeEffort('low') }, refused('--effort', 'high')],
    ['claude, the variable is the same', ['claude', '-p', 'hi'], { model: claude, effortAnswer: officeEffort('low'), env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } }, started(['claude', '-p', 'hi', '--model', claude, '--effort', 'low'], { CLAUDE_CODE_EFFORT_LEVEL: 'low' })],
    ['claude, the variable is another', ['claude', '-p', 'hi'], { model: claude, effortAnswer: officeEffort('low'), env: { CLAUDE_CODE_EFFORT_LEVEL: 'high' } }, refused('CLAUDE_CODE_EFFORT_LEVEL', 'high')],
    ['claude, wrapped in env', ['env', 'A=1', 'claude', '-p', 'hi'], { model: claude, effortAnswer: officeEffort('low') }, started(['env', 'A=1', 'claude', '-p', 'hi', '--model', claude, '--effort', 'low'], { CLAUDE_CODE_EFFORT_LEVEL: 'low' })],
    ['claude, wrapped in a shell', ['bash', '-c', 'claude -p hi'], { runtime: 'claude-code', model: claude, effortAnswer: officeEffort('low') }, started(['bash', '-c', 'claude -p hi'], { CLAUDE_CODE_EFFORT_LEVEL: 'low' })],
    ['claude, an input after --', ['claude', '-p', '--', '--effort', 'x'], { model: claude, effortAnswer: officeEffort('low') }, started(['claude', '-p', '--model', claude, '--effort', 'low', '--', '--effort', 'x'], { CLAUDE_CODE_EFFORT_LEVEL: 'low' })],
    ['opencode, the office effort', ['opencode', 'run', 'hi'], { model: go, effortAnswer: officeEffort('high') }, started(['opencode', 'run', 'hi', '-m', go, '--variant', 'high'])],
    ['opencode, the owner effort', ['opencode', 'run', 'hi'], { model: go }, started(['opencode', 'run', 'hi', '-m', go, '--variant', ownersEffort(go)])],
    ['opencode, no model and no effort', ['opencode', 'run', 'hi'], { effortAnswer: none }, started(['opencode', 'run', 'hi'])],
    ['opencode, the caller wrote --variant the same', ['opencode', 'run', '--variant', 'high', 'hi'], { model: go, effortAnswer: officeEffort('high') }, started(['opencode', 'run', '--variant', 'high', 'hi', '-m', go])],
    ['opencode, the caller wrote another --variant', ['opencode', 'run', '--variant', 'low', 'hi'], { model: go, effortAnswer: officeEffort('high') }, refused('--variant', 'low')],
    ['opencode, the caller wrote another --effort', ['opencode', 'run', '--effort', 'low', 'hi'], { model: go, effortAnswer: officeEffort('high') }, refused('--effort', 'low')],
    ["opencode, Claude Code's variable is set", ['opencode', 'run', 'hi'], { model: go, effortAnswer: officeEffort('high'), env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } }, started(['opencode', 'run', 'hi', '-m', go, '--variant', 'high'])],
    ['opencode, wrapped in a shell', ['sh', '-c', 'opencode run hi'], { runtime: 'opencode', model: go, effortAnswer: officeEffort('high') }, started(['sh', '-c', 'opencode run hi'])],
    ['codex, the office effort', ['codex', 'exec', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, started(['codex', 'exec', 'hi', '-m', gpt, '-c', 'model_reasoning_effort=medium', ...fast])],
    ['codex, the owner effort', ['codex', 'exec', 'hi'], { model: gpt }, started(['codex', 'exec', 'hi', '-m', gpt, '-c', `model_reasoning_effort=${ownersEffort(gpt)}`, ...fast])],
    ['codex, no model and no effort', ['codex', 'exec', 'hi'], { effortAnswer: none }, started(['codex', 'exec', 'hi'])],
    ['codex, the caller wrote -c the same', ['codex', 'exec', '-c', 'model_reasoning_effort=medium', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, started(['codex', 'exec', '-c', 'model_reasoning_effort=medium', 'hi', '-m', gpt, ...fast])],
    ['codex, the caller wrote -c the same in TOML quotes', ['codex', 'exec', '-c', 'model_reasoning_effort="medium"', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, started(['codex', 'exec', '-c', 'model_reasoning_effort="medium"', 'hi', '-m', gpt, ...fast])],
    // A setting spaced around its = is the caller's own, and the launcher adds no second one beside it.
    ['codex, the caller wrote --config spaced the same', ['codex', 'exec', '--config', "model_reasoning_effort = 'medium'", 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, started(['codex', 'exec', '--config', "model_reasoning_effort = 'medium'", 'hi', '-m', gpt, ...fast])],
    ['codex, the caller wrote another --config=', ['codex', 'exec', '--config=model_reasoning_effort=low', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, refused('model_reasoning_effort', 'low')],
    ['codex, the caller wrote another -c joined', ['codex', 'exec', '-cmodel_reasoning_effort=low', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, refused('model_reasoning_effort', 'low')],
    ['codex, the caller wrote fast mode', ['codex', 'exec', '-c', 'service_tier=fast', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, THE_RUNTIMES_FAST_MODE.codex ? started(['codex', 'exec', '-c', 'service_tier=fast', 'hi', '-m', gpt, '-c', 'model_reasoning_effort=medium']) : refused('service_tier', 'fast')],
    ['codex, the caller wrote fast mode spaced', ['codex', 'exec', '-c', "service_tier = 'fast'", 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, THE_RUNTIMES_FAST_MODE.codex ? started(['codex', 'exec', '-c', "service_tier = 'fast'", 'hi', '-m', gpt, '-c', 'model_reasoning_effort=medium']) : refused('service_tier', 'fast')],
    ['codex, the caller wrote another service tier', ['codex', 'exec', '-c', 'service_tier="flex"', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, refused('service_tier', 'flex')],
    ['codex, the caller wrote another setting', ['codex', 'exec', '-c', 'model_reasoning_summary=auto', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, started(['codex', 'exec', '-c', 'model_reasoning_summary=auto', 'hi', '-m', gpt, '-c', 'model_reasoning_effort=medium', ...fast])],
    ['codex, the caller wrote another --effort', ['codex', 'exec', '--effort', 'low', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, refused('--effort', 'low')],
    ['codex, the caller wrote another --variant', ['codex', 'exec', '--variant', 'low', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, refused('--variant', 'low')],
    ["codex, Claude Code's variable is set", ['codex', 'exec', 'hi'], { model: gpt, effortAnswer: officeEffort('medium'), env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } }, started(['codex', 'exec', 'hi', '-m', gpt, '-c', 'model_reasoning_effort=medium', ...fast])],
    ['codex, a resumed thread takes the values before resume', ['codex', 'exec', 'resume', 'abc', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, started(['codex', 'exec', '-c', 'model_reasoning_effort=medium', ...fast, 'resume', 'abc', 'hi', '-m', gpt])],
    ['codex, a resumed last thread takes the values before resume', ['codex', 'exec', '--json', 'resume', '--last', 'hi'], { model: gpt, effortAnswer: officeEffort('medium') }, started(['codex', 'exec', '--json', '-c', 'model_reasoning_effort=medium', ...fast, 'resume', '--last', 'hi', '-m', gpt])],
    ['codex, wrapped in a shell', ['bash', '-lc', 'codex exec hi'], { runtime: 'codex', model: gpt, effortAnswer: officeEffort('medium') }, started(['bash', '-lc', 'codex exec hi'])],
    ['dsh, a start', ['dsh'], { runtime: 'dsh', model: dsh }, { command: ['dsh'], dsh: { model: dsh, effort: theOwnersEffort(dsh) } }],
    ["dsh, the helper's runner", ['bash', runner], { runtime: 'dsh', model: dsh }, { command: ['bash', runner], dsh: { model: dsh, effort: theOwnersEffort(dsh) } }],
    ['dsh, another program', ['dsh-other'], { runtime: 'dsh', model: dsh }, { command: ['dsh-other'], dsh: null }],
    ['dsh, no model and no effort', ['dsh'], { runtime: 'dsh', effortAnswer: none }, { command: ['dsh'], dsh: { model: null, effort: null } }],
    ['kimi, its own command', ['kimi', '--print', 'hi'], { runtime: 'kimi', effortAnswer: officeEffort('low') }, started(['kimi', '--print', 'hi'])],
  ]

  it.each(cases)('%s', async (_name, command, options, expected) => {
    const { aCommandsStartValues } = await import('../tools/sandbox-common.mjs')
    const start = () => aCommandsStartValues(command, options)
    if ('refused' in expected) {
      expect(start).toThrow(new RegExp(`^${escaped(expected.refused)}`))
      return
    }
    const given = start()
    expect(given.command).toEqual(expected.command)
    if ('dsh' in expected) {
      // A DSH start keeps its command and is handed its selection in one variable, or in none.
      if (expected.dsh === null) {
        expect(given.env).toEqual({})
        return
      }
      expect(Object.keys(given.env)).toEqual(['SANDBOX_DSH_SELECTION'])
      expect(JSON.parse(String(given.env['SANDBOX_DSH_SELECTION']))).toMatchObject({ runtime: 'dsh', ...expected.dsh })
      return
    }
    expect(given.env).toEqual(expected.env)
  })
})

describe('with a made-up table, each copy follows it', () => {
  let db: TestDb
  let copies: TheCopies
  beforeAll(async () => {
    vi.doMock('../src/worker/runtimes/what-a-runtime-passes-on.ts', async (importOriginal) => ({
      ...await importOriginal<typeof import('../src/worker/runtimes/what-a-runtime-passes-on.ts')>(),
      whatItPassesOn: madeUpPassesOn,
      theRuntimesTheWorkerGives: madeUpGives,
      HOW_EACH_COMMAND_TAKES_AN_EFFORT: MADE_UP_LINES,
    }))
    // A file in src/shared may not import a worker file, so src/shared/kinds.ts reads the table from
    // src/shared/what-a-runtime-passes-on.ts. The same made-up table goes there too.
    vi.doMock('../src/shared/what-a-runtime-passes-on.ts', async (importOriginal) => ({
      ...await importOriginal<Record<string, unknown>>(),
      whatItPassesOn: madeUpPassesOn,
      theRuntimesTheWorkerGives: madeUpGives,
    }))
    // The launcher's file reads the plain table itself, so it is made up too, with the same lines.
    vi.doMock('../src/config/how-a-command-takes-an-effort.mjs', () => ({ HOW_EACH_COMMAND_TAKES_AN_EFFORT: MADE_UP_LINES }))
    // A fresh database resets the modules, so every copy below is imported again with the made-up tables.
    db = await freshDb()
    copies = await theCopies()
  }, 60_000)
  afterAll(() => {
    vi.doUnmock('../src/worker/runtimes/what-a-runtime-passes-on.ts')
    vi.doUnmock('../src/shared/what-a-runtime-passes-on.ts')
    vi.doUnmock('../src/config/how-a-command-takes-an-effort.mjs')
    db?.close()
  })

  it('the runtime page says codex is passed an effort too', () => {
    expect(madeUpGives(THE_RUNTIMES_THE_OFFICE_DISPATCHES).aVariantTo).toEqual(['codex', 'opencode'])
    thePageFollows(copies, madeUpGives)
  })

  it("the agent kind's variant sentence names codex too", () => {
    theKindsSentenceFollows(copies, madeUpGives)
  })

  it("the launcher writes each runtime's effort by its made-up line, and sets its made-up variable", () => {
    theLaunchersFlagsFollow(copies, MADE_UP_LINES)
  })

  it("the launcher refuses a caller's other effort written by any made-up line", () => {
    theLaunchersCheckFollows(copies, MADE_UP_LINES)
  })

  it("the opencode adapter writes the office's effort by its made-up line", () => {
    theAdaptersFollow(copies, MADE_UP_LINES, null)
  })
})

describe('a refusal names the runtimes the office passes a model or an effort to, and says so when there are none', () => {
  // A refusal that joins an empty list into its sentence leaves a gap where the names go: "to  only." or "to .".
  const anEmptySlot = /\s{2}|\s\./
  const slot = { in: 'places', name: 'conversation' } as const

  it.each([
    ['no runtime is passed an effort', { runtime: 'opencode', model: 'm', variant: 'high' }, { aModelTo: ['opencode'], aVariantTo: [] }],
    ['no runtime is passed a model', { runtime: 'opencode', model: 'm' }, { aModelTo: [], aVariantTo: [] }],
    ['another runtime is passed the effort', { runtime: 'opencode', model: 'm', variant: 'high' }, { aModelTo: ['opencode'], aVariantTo: ['codex'] }],
  ] as const)('%s', (_name, pair, gives) => {
    const said = whyThisPairIsRefused(slot, pair, gives)
    expect(said).toContain('opencode')
    expect(said).not.toMatch(anEmptySlot)
  })
})
