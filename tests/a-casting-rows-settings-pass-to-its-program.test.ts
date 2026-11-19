// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASTING ROW'S OWN PROGRAM SETTINGS REACH ITS PROGRAM (wave 13n round CS). The launcher reads them from the row's
 * selection, checks them again against src/config/the-launchers-own-settings.mjs, and passes them on:
 *
 *   1. Codex takes each as `-c <its parts without quotes>=<TOML>`, before `resume` and before `--`, and a caller's -c naming
 *      the same setting with another value is refused. Codex 0.159.2 splits a -c name at every dot, keeps a quote as part
 *      of a key and trims the name's two ends, so a part with a dot or an equals sign, a first part that begins with a
 *      space and a last part that ends with one are refused at start.
 *   2. Claude Code takes them in one --settings, joined into the --settings the command already gives.
 *   3. OpenCode takes them in OPENCODE_CONFIG_CONTENT, joined into the content the environment already gives.
 *   4. dsh takes `<entry id>.<config path>` as that entry's config in the run's patch file, starting from the office
 *      profile's config, and an entry with none is refused in words beginning "DSH ".
 *   5. Fast mode is the row's where it names the program's fast setting, and the program's switch decides where it does
 *      not; the start words say which. They also say which compaction window a Claude Code start uses and which bash
 *      timeout a dsh start uses, and who set each.
 *   6. A name the launcher keeps is refused at start, and readLauncherSelection reads a selection with or without settings.
 *   7. The names the new file writes again agree with the files that set them.
 *
 * Synthetic native programs only: no model is called.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aCommandsStartValues } from '../tools/sandbox-common.mjs'
import { prepareDshSettings } from '../tools/dsh-hooks/run-settings.mjs'
import { readLauncherSelection } from '../src/config/launcher-selection.mjs'
import { THE_RUNTIMES_FAST_MODE } from '../src/config/model-efforts.mjs'
import { THE_LAUNCHERS_OWN_SETTINGS, THE_OFFICE_PROFILES_OWN_CONFIG, theSettingTheLauncherKeeps } from '../src/config/the-launchers-own-settings.mjs'
import { CLAUDE_CODE_LOGINS } from '../src/config/claude-code-login.mjs'
import { FULL_PERMISSIONS, OFFICE_MCP_ENV_VARS, OFFICE_TOOL_CONFIGURATION } from '../src/config/run-permissions.mjs'
import { THE_GUARD_COMMAND } from '../src/config/main-world-guard.mjs'
import { OPENCODE_OUTPUT_CAP } from '../tools/opencode-output-cap.mjs'
import { THE_OPENCODE_DATABASE_VARIABLE } from '../tools/sandbox-common.mjs'
import { syntheticDshReader } from './dsh-native-stand-in.ts'

const programs = { codex: ['codex', 'exec'], 'claude-code': ['claude', '-p'], opencode: ['opencode', 'run'], dsh: ['dsh', '--profile', 'office'] } as const
type Runtime = keyof typeof programs
type Setting = { name: string; value: unknown }
const ROW = 'Casting row 41'
function selection(runtime: Runtime, settings?: Setting[]) {
  return { runtime, model: `test-office-${runtime}`, native: {
    model: `test-native-${runtime}`, provider: runtime === 'opencode' || runtime === 'dsh' ? 'test-provider' : null, variant: null, effort: null,
    ...(settings === undefined ? {} : { settings }) }, casting: { id: 41, revision: 'test-revision' } }
}
const options = (chosen: ReturnType<typeof selection>, env: Record<string, string> = {}) => ({ runtime: chosen.runtime, model: chosen.model, selection: chosen, env })
const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

/** Each `-c` value of a command that sets a test setting, read as one line of TOML by Python's own reader. */
function theCodexSettings(command: string[]) {
  const values = command.flatMap((word, at) => command[at - 1] === '-c' && word.startsWith('test_') ? [word] : [])
  const ran = spawnSync('python3', ['-c', 'import json,sys,tomllib\nprint(json.dumps([tomllib.loads(line) for line in sys.argv[1:]]))', ...values], { encoding: 'utf8', timeout: 10_000 })
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as Record<string, unknown>[]
}

describe('Codex takes each setting as -c', () => {
  it('passes each JSON type as TOML, before resume and before --', () => {
    const settings = [
      { name: 'test_string', value: 'test "quoted" value\u00e9' },
      { name: 'test_number', value: 2.5 },
      { name: 'test_boolean', value: true },
      { name: 'test_list', value: [1, 'two', [false]] },
      { name: 'test_section."test_quoted".inner', value: { k: 1, 'a key': 'v', deep: { x: [] } } },
    ]
    const given = aCommandsStartValues(['codex', 'exec', 'resume', 'test-thread', '--', '-'], options(selection('codex', settings)))
    const read = theCodexSettings(given.command)
    expect(read).toEqual([
      { test_string: 'test "quoted" value\u00e9' },
      { test_number: 2.5 },
      { test_boolean: true },
      { test_list: [1, 'two', [false]] },
      { test_section: { test_quoted: { inner: { k: 1, 'a key': 'v', deep: { x: [] } } } } },
    ])
    const last = given.command.lastIndexOf('-c')
    expect(last).toBeLessThan(given.command.indexOf('resume'))
    expect(given.command.indexOf('resume')).toBeLessThan(given.command.indexOf('--'))
    expect(given.command).toContain('test_section.test_quoted.inner={ k = 1, "a key" = "v", deep = { x = [] } }')
  })

  it.each([
    ['test_section."test.dotted"', 'test.dotted'],
    ["test_section.'test=equals'", 'test=equals'],
    ['" test_section".test_key', ' test_section'],
    ['test_section."test_key "', 'test_key '],
  ])('refuses %j, a part Codex\'s -c cannot name', (name, part) => {
    expect(() => aCommandsStartValues(['codex', 'exec', '--', '-'], options(selection('codex', [{ name, value: 1 }]))))
      .toThrow(`${ROW} sets ${name} for codex, and Codex's -c cannot name its part "${part}". Codex splits a -c name at every dot and at its first equals sign, and trims the spaces at its two ends. Nothing was started.`)
  })

  it('takes a part with a space inside the name, which Codex keeps', () => {
    const given = aCommandsStartValues(['codex', 'exec', '--', '-'], options(selection('codex', [{ name: 'test_section." test inner ".test_key', value: 1 }])))
    expect(given.command).toContain('test_section. test inner .test_key=1')
  })

  it('refuses a caller\'s -c with the same name and another value, and adds no second -c for the same value', () => {
    const chosen = selection('codex', [{ name: 'test_option', value: 'row-value' }])
    expect(() => aCommandsStartValues(['codex', 'exec', '-c', 'test_option="caller-value"', '--', '-'], options(chosen)))
      .toThrow(`The caller sets test_option to a value different from ${ROW}'s setting. Nothing was started.`)
    const same = aCommandsStartValues(['codex', 'exec', '-c', 'test_option="row-value"', '--', '-'], options(chosen))
    expect(same.command.filter((word: string) => word.startsWith('test_option='))).toEqual(['test_option="row-value"'])
  })

  it('reads a caller\'s -c as Codex does, so a quoted name is another key and the row\'s -c is still added', () => {
    const given = aCommandsStartValues(['codex', 'exec', '-c', '"test_option"="caller-value"', '--', '-'], options(selection('codex', [{ name: 'test_option', value: 'row-value' }])))
    expect(given.command.filter((word: string, at: number) => given.command[at - 1] === '-c' && word.includes('test_option'))).toEqual(['"test_option"="caller-value"', 'test_option="row-value"'])
  })
})

describe('Claude Code takes the settings in one --settings', () => {
  it('gives a --settings of its own when the command has none', () => {
    const given = aCommandsStartValues(['claude', '-p'], options(selection('claude-code', [{ name: 'env.TEST_FLAG', value: '1' }, { name: 'test_group.inner', value: [1] }])))
    const at = given.command.indexOf('--settings')
    expect(given.command.filter((word: string) => word === '--settings' || word.startsWith('--settings='))).toHaveLength(1)
    expect(JSON.parse(given.command[at + 1]!)).toEqual({ env: { TEST_FLAG: '1' }, test_group: { inner: [1] } })
  })

  it('joins the command\'s own --settings, keeping its hook, and refuses a value the command sets otherwise', () => {
    const hook = { hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'test-guard' }] }] }, test_group: { kept: true } }
    const chosen = selection('claude-code', [{ name: 'test_group.added', value: 'x' }])
    for (const command of [['claude', '--settings', JSON.stringify(hook), '-p'], ['claude', `--settings=${JSON.stringify(hook)}`, '-p']]) {
      const given = aCommandsStartValues(command, options(chosen))
      const all = given.command.filter((word: string) => word === '--settings' || word.startsWith('--settings='))
      expect(all).toHaveLength(1)
      const text = all[0] === '--settings' ? given.command[given.command.indexOf('--settings') + 1]! : all[0]!.slice('--settings='.length)
      expect(JSON.parse(text)).toEqual({ ...hook, test_group: { kept: true, added: 'x' } })
    }
    expect(() => aCommandsStartValues(['claude', '--settings', JSON.stringify(hook), '-p'], options(selection('claude-code', [{ name: 'test_group.kept', value: false }]))))
      .toThrow(`The command's --settings sets test_group.kept to a value different from ${ROW}'s setting. Nothing was started.`)
  })
})

describe('OpenCode takes the settings in OPENCODE_CONFIG_CONTENT', () => {
  it('joins the content the environment gives, keeping its plugin list', () => {
    const given = aCommandsStartValues(['opencode', 'run'], options(selection('opencode', [{ name: 'share', value: 'disabled' }, { name: 'test_group.inner', value: 3 }]),
      { OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: ['test-plugin'] }) }))
    expect(JSON.parse(given.env.OPENCODE_CONFIG_CONTENT!)).toEqual({ plugin: ['test-plugin'], share: 'disabled', test_group: { inner: 3 } })
    const alone = aCommandsStartValues(['opencode', 'run'], options(selection('opencode', [{ name: 'share', value: 'disabled' }])))
    expect(JSON.parse(alone.env.OPENCODE_CONFIG_CONTENT!)).toEqual({ share: 'disabled' })
  })

  it('gives no content of its own to a row with no settings', () => {
    const given = aCommandsStartValues(['opencode', 'run'], options(selection('opencode')))
    expect(Object.hasOwn(given.env, 'OPENCODE_CONFIG_CONTENT')).toBe(false)
  })
})

describe('dsh takes a setting as its entry\'s config in the run\'s patch file', () => {
  async function thePatch(settings: Setting[]) {
    const folder = mkdtempSync(join(tmpdir(), 'test-row-settings-dsh-')); folders.push(folder)
    const dshDir = join(folder, 'dsh'); mkdirSync(join(dshDir, 'home'), { recursive: true })
    const chosen = selection('dsh', settings)
    const patch = await prepareDshSettings({ model: chosen.model, effort: null, selection: chosen, dshDir, scratch: folder,
      env: { PATH: process.env.PATH, SANDBOX_DSH_NATIVE_READER: syntheticDshReader(folder) }, notice: () => true })
    return JSON.parse(readFileSync(patch, 'utf8')) as { id: string; config: Record<string, unknown> }[]
  }

  it('starts each entry from the office profile\'s config and sets the path under it', async () => {
    const parts = await thePatch([{ name: 'bash-sandbox.test_group.inner', value: ['x'] }])
    expect(parts.map(one => one.id)).toEqual(['settings', 'agent-default-model', 'bash-sandbox'])
    expect(parts[2]!.config).toEqual({ ...THE_OFFICE_PROFILES_OWN_CONFIG['bash-sandbox'], test_group: { inner: ['x'] } })
    const timeout = await thePatch([{ name: 'bash-sandbox.timeoutMs', value: 600000 }])
    expect(timeout[2]).toEqual({ id: 'bash-sandbox', config: { timeoutMs: 600000 } })
  })

  it('refuses an entry the office profile gives no config, and a name the launcher keeps, in words beginning DSH', async () => {
    await expect(thePatch([{ name: 'test-entry.inner', value: 1 }])).rejects.toThrow(
      `DSH refused the selection: ${ROW} sets test-entry.inner, and the office profile gives entry test-entry no config of its own to start from. Nothing was started.`)
    await expect(thePatch([{ name: 'hooks-claude-code.configPath', value: 'x' }])).rejects.toThrow(
      `DSH refused the selection: ${ROW} sets hooks-claude-code.configPath for dsh, which the launcher sets itself (the main-world guard's hook). A row may not set it. Nothing was started.`)
  })
})

describe('fast mode from the row or from the program\'s switch', () => {
  it('takes the row\'s service_tier, adds none of its own, and says so with the settings', () => {
    const fast = aCommandsStartValues(['codex', 'exec', '--', '-'], options(selection('codex', [{ name: 'service_tier', value: 'fast' }, { name: 'test_option', value: true }])))
    expect(fast.start?.fast).toBe(true)
    expect(fast.command.filter((word: string) => word.startsWith('service_tier='))).toEqual(['service_tier="fast"'])
    expect(fast.start?.words).toContain(`; fast mode set by ${ROW} (service_tier "fast"); settings from ${ROW}: service_tier = "fast", test_option = true`)
    const flex = aCommandsStartValues(['codex', 'exec', '--', '-'], options(selection('codex', [{ name: 'service_tier', value: 'flex' }])))
    expect(flex.start?.fast).toBe(false)
    expect(flex.start?.words).toContain(`; fast mode set by ${ROW} (service_tier "flex")`)
    expect(() => aCommandsStartValues(['codex', 'exec', '-c', 'service_tier=fast', '--', '-'], options(selection('codex', [{ name: 'service_tier', value: 'flex' }]))))
      .toThrow(`The caller sets service_tier to a value different from ${ROW}'s setting. Nothing was started.`)
  })

  it('takes Claude Code\'s fastMode from the row', () => {
    const given = aCommandsStartValues(['claude', '-p'], options(selection('claude-code', [{ name: 'fastMode', value: true }])))
    expect(given.start?.fast).toBe(true)
    expect(given.start?.words).toContain(`; fast mode set by ${ROW} (fastMode true)`)
  })

  it.each(['codex', 'claude-code', 'opencode', 'dsh'] as const)('%s: a row naming no fast setting goes by the program\'s switch', runtime => {
    const given = aCommandsStartValues([...programs[runtime]], options(selection(runtime)))
    const on = THE_RUNTIMES_FAST_MODE[runtime] === true
    expect(given.start?.fast).toBe(on)
    expect(given.start?.words).toContain(`; fast mode ${on ? 'on' : 'off'}, from the program's switch`)
    expect(given.start?.words).not.toContain('; settings from')
  })
})

describe('the start words name the compaction window and the bash timeout', () => {
  const words = (runtime: Runtime, settings?: Setting[], env: Record<string, string> = {}) =>
    aCommandsStartValues([...programs[runtime]], options(selection(runtime, settings), env)).start?.words ?? ''

  it('says which compaction window a Claude Code start uses, and who set it', () => {
    const rowsVariable = { name: 'env.CLAUDE_CODE_AUTO_COMPACT_WINDOW', value: '200000' }
    const rowsSetting = { name: 'autoCompactWindow', value: 100000 }
    const given = { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '300000' }
    // The row's variable is copied over the environment's, so it is the row's even where the environment gives one.
    expect(words('claude-code', [rowsVariable, rowsSetting], given)).toContain(`; compaction window "200000", set by ${ROW};`)
    expect(words('claude-code', [rowsSetting], given)).toContain(
      `; compaction window 300000, from the command's environment, which Claude Code reads before ${ROW}'s autoCompactWindow;`)
    expect(words('claude-code', [{ name: 'test_option', value: 1 }], given)).toContain("; compaction window 300000, from the command's environment;")
    expect(words('claude-code', [rowsSetting])).toContain(`; compaction window 100000, set by ${ROW};`)
    expect(words('claude-code').endsWith("; compaction window Claude Code's own")).toBe(true)
    for (const runtime of ['codex', 'opencode', 'dsh'] as const) expect(words(runtime, undefined, given)).not.toContain('compaction window')
  })

  it('says which bash timeout a dsh start uses, and who set it', () => {
    expect(words('dsh').endsWith(`; bash timeout ${String(THE_OFFICE_PROFILES_OWN_CONFIG['bash-sandbox'].timeoutMs)} ms, the office profile's`)).toBe(true)
    expect(words('dsh', [{ name: 'bash-sandbox.timeoutMs', value: 600000 }])).toContain(`; bash timeout 600000 ms, set by ${ROW};`)
    for (const runtime of ['codex', 'claude-code', 'opencode'] as const) expect(words(runtime)).not.toContain('bash timeout')
  })
})

describe('the launcher checks the settings again at start', () => {
  it.each([
    ['codex', 'model', "the row's own native model, which the row's model fields set", ''],
    ['claude-code', 'env.TEST_API_KEY', "the run's keys and logins", ''],
    ['opencode', 'env.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX', 'the output cap the launcher gives every OpenCode run', ''],
    ['dsh', 'hooks-claude-code', "the main-world guard's hook", 'DSH refused the selection: '],
  ] as const)('%s refuses %s in the door\'s words, ending "Nothing was started."', (runtime, name, guards, prefix) => {
    expect(() => aCommandsStartValues([...programs[runtime]], options(selection(runtime, [{ name, value: 'x' }]))))
      .toThrow(`${prefix}${ROW} sets ${name} for ${runtime}, which the launcher sets itself (${guards}). A row may not set it. Nothing was started.`)
  })
})

describe('readLauncherSelection', () => {
  it('reads a selection with no settings as one with no key, and one with settings as a copy', () => {
    expect(Object.hasOwn(readLauncherSelection(selection('codex')).native, 'settings')).toBe(false)
    const settings = [{ name: 'test_option', value: { inner: [1] } }]
    const read = readLauncherSelection(selection('codex', settings))
    expect(read.native.settings).toEqual(settings)
    expect(read.native.settings![0]!.value).not.toBe(settings[0]!.value)
  })

  it('refuses an empty list, a malformed setting and a null value', () => {
    expect(() => readLauncherSelection(selection('codex', []))).toThrow("The launcher selection's settings cannot be read: The settings are an empty list. Nothing was started.")
    expect(() => readLauncherSelection(selection('codex', [{ name: 'test_option', value: 1, extra: 1 } as Setting]))).toThrow('Setting 1 is not one name and one value.')
    expect(() => readLauncherSelection(selection('codex', [{ name: 'test_option', value: null }]))).toThrow('Setting test_option has no value a program can take')
  })
})

describe('the names the list writes again agree with the files that set them', () => {
  const environment = (program: Runtime) => THE_LAUNCHERS_OWN_SETTINGS[program].flatMap((one: { environment?: string }) => one.environment === undefined ? [] : [one.environment])
  it('holds every variable the launcher sets itself', () => {
    const guards = (program: Runtime, name: string) => theSettingTheLauncherKeeps(program, [{ name: `env.${name}`, value: 'x' }])?.guards
    for (const program of ['codex', 'claude-code', 'opencode', 'dsh'] as const) {
      // The office's own variables are held by name, with their own words, and not only by the MOLE_ prefix.
      for (const name of OFFICE_MCP_ENV_VARS) expect(guards(program, name), `${program} ${name}`).toBe("the run's identity and its own key, which the office reads")
      for (const name of Object.keys(FULL_PERMISSIONS[program]!.env)) expect(guards(program, name), `${program} ${name}`).toBe("the run's permissions")
    }
    for (const name of CLAUDE_CODE_LOGINS) expect(environment('claude-code'), name).toContain(name)
    expect(environment('claude-code')).toContain(OFFICE_TOOL_CONFIGURATION)
    expect(environment('opencode')).toEqual(expect.arrayContaining([THE_GUARD_COMMAND, THE_OPENCODE_DATABASE_VARIABLE, ...Object.keys(OPENCODE_OUTPUT_CAP),
      ...Object.keys(FULL_PERMISSIONS.opencode!.env)]))
    expect(environment('dsh')).toEqual(expect.arrayContaining(Object.keys(FULL_PERMISSIONS.dsh!.env)))
  })
})

