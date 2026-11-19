// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DSH CHECK VIEW GETS ONLY ITS OWN KEY, NEVER THE CLAUDE TOKEN, AND KEEPS DSH_HOME INSIDE THE CHECK'S PRIVATE HOME.
 *
 * The secretary gave wave 13n a DSH check on dsh's ACP driver (message uVlfyTGEjhbq; 1S-Comh3Shf-: "Start part A now"). This is
 * part A: how tools/inspector-sandbox.mjs starts a check view for a dsh model. The secretary's words: "Keys: DEEPSEEK_API_KEY
 * only, by --secret as every run gets its key, never the Claude token for dsh (line 707 must not hand it to a dsh
 * check), and DSH_HOME inside the check's private home." The inspector itself still refuses every dsh check; another
 * piece wires it.
 *
 * WHAT IS PROVED HERE, EACH BY DRIVING THE REAL runInside OR aLoginForTheModel
 *
 *   1. A dsh command asks the launcher for one secret, DEEPSEEK_API_KEY, and never CLAUDE_CODE_OAUTH_TOKEN.
 *   2. Its wrapper carries DSH_HOME=/check/home/.dsh and DSH_PERMISSION_MODE=danger-full-access, and
 *      <check home>/.dsh is a folder of mode 700 before the launcher is called.
 *   3. Each wrong native array is refused before the launcher is called.
 *   4. A dsh label with another runtime, and a dsh runtime with another label, are refused.
 *   5. A provider with no key mapped is refused, and the refusal names the provider.
 *   6. A runtime with no secrets of its own is refused, and is given no --secret at all.
 *   7. <check home>/.dsh as a link, or as a file, is refused.
 *   8. aLoginForTheModel for dsh needs DEEPSEEK_API_KEY declared for dsh in a file of mode 600, seeds no login file,
 *      and never names the Claude token or prints the key's value.
 *
 * WHAT IS REAL AND WHAT IS NOT. runInside and aLoginForTheModel are the real ones. The launcher is
 * tests/inspector-view-stand-in.ts, a labelled stand-in that writes the receipt a launcher would and enforces no mount.
 * No model runs and no container starts. Every key here is a made-up string; none is a real key.
 *
 * MUTATIONS, each planted in tools/inspector-sandbox.mjs, and the cases each turns red:
 *   M1  the dsh line of the secrets falls through to [THE_TOKEN] again: case 1.
 *   M2  DSH_CHECK_ENV's DSH_HOME becomes /work/.dsh: cases 1, 2, 3, 5, 7 and 8, because every array below names
 *       /check/home/.dsh and is then refused, /work/.dsh is then taken, and the login's sentence names /work/.dsh.
 *   M3  the .dsh folder is not made: case 2.
 *   M4  theCheckedDshRoute accepts any extra env name: case 3, its extra-name array.
 *   M5  the label and runtime agreement check is removed: case 4.
 *   M6  the unknown-runtime refusal hands it [THE_TOKEN]: case 6.
 *   M7  aLoginForTheModel's dsh branch is removed: cases 1 and 8, because case 1 signs in first as the inspector does.
 */
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aLoginForTheModel, runInside } from '../tools/inspector-sandbox.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { A_DSH_SESSION, nativeDshArgv } from './a-dsh-native-argv.ts'

type View = ReturnType<typeof inspectorViewStandIn>
let view: View | null = null
afterEach(() => { view?.close(); view = null })

const ROUTE_REFUSED = "The DSH native command array must carry the shared full permissions, DSH_HOME inside the check's private home, and the ACP client's arguments; no model was started."

/** The words the launcher was given after each --secret. */
const secretsAsked = (words: string[]) => words.filter((_, i) => words[i - 1] === '--secret')

/**
 * A labelled stand-in template whose secrets file of mode 600 sets three synthetic keys: DEEPSEEK_API_KEY read by dsh
 * (unless `deepSeekReadBy` says otherwise), the Claude token read by claude and OPENCODE_API_KEY read by opencode.
 */
function aSyntheticTemplate(root: string, { deepSeekReadBy = ['dsh'], mode = 0o600, setsDeepSeek = true } = {}) {
  const templateDir = join(root, 'template'), secretFile = join(root, 'synthetic-secrets')
  mkdirSync(templateDir, { recursive: true })
  writeFileSync(secretFile, `${setsDeepSeek ? 'DEEPSEEK_API_KEY=synthetic-only-deepseek\n' : ''}CLAUDE_CODE_OAUTH_TOKEN=synthetic-only-claude\nOPENCODE_API_KEY=synthetic-only-opencode\n`, { mode })
  chmodSync(secretFile, mode)
  writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: { hostFile: secretFile, names: [
    { name: 'DEEPSEEK_API_KEY', readBy: deepSeekReadBy }, { name: 'CLAUDE_CODE_OAUTH_TOKEN', readBy: ['claude'] },
    { name: 'OPENCODE_API_KEY', readBy: ['opencode'] },
  ] } }))
  return { templateDir, secretFile }
}

/** runInside with the stand-in launcher, noting what <check home>/.dsh was when the launcher was called. */
async function runDsh(v: View, { label = 'dsh', runtime = 'dsh', argv = nativeDshArgv() } = {}) {
  let atTheLauncher: { folder: boolean; mode: number } | null = null
  const launcher = async (...args: Parameters<View['launcher']>) => {
    const held = lstatSync(join(v.sandbox.home, '.dsh'), { throwIfNoEntry: false })
    atTheLauncher = held === undefined ? null : { folder: held.isDirectory(), mode: held.mode & 0o777 }
    return v.launcher(...args)
  }
  const ran = await runInside(v.sandbox, { label, runtime, cwd: v.work, argv, limitMs: 1000, launcher })
  return { ran, atTheLauncher: atTheLauncher as { folder: boolean; mode: number } | null }
}

describe('1. a dsh check asks for its one key', () => {
  it('asks the launcher for exactly DEEPSEEK_API_KEY, and never the Claude token or another runtime\'s key', async () => {
    view = inspectorViewStandIn()
    const { templateDir } = aSyntheticTemplate(view.root)
    Object.assign(view.sandbox, { templateDir })
    aLoginForTheModel(view.sandbox, { runtime: 'dsh', minutes: 1, home: view.root })
    const { ran } = await runDsh(view)
    expect(ran.code, ran.why ?? '').toBe(0)
    expect(view.calls).toHaveLength(1)
    const words = view.calls[0]!.words
    expect(secretsAsked(words)).toEqual(['DEEPSEEK_API_KEY'])
    expect(words).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
    expect(words).not.toContain('OPENCODE_API_KEY')
    expect(view.calls[0]!.spec.loginSeeds ?? []).toEqual([])
  })
})

describe('2. a dsh check keeps its state in its private home', () => {
  it('writes DSH_HOME and the shared full permissions into the wrapper, and makes <check home>/.dsh at mode 700 first', async () => {
    view = inspectorViewStandIn()
    const said: string[] = []; view.sandbox.asked.say = (sentence: string) => { said.push(sentence) }
    expect(existsSync(join(view.sandbox.home, '.dsh'))).toBe(false)
    const { ran, atTheLauncher } = await runDsh(view)
    expect(ran.code, ran.why ?? '').toBe(0)
    const wrapper = readFileSync(join(view.sandbox.checkDir, 'commands', 'dsh.sh'), 'utf8')
    expect(wrapper).toContain("'DSH_HOME=/check/home/.dsh'")
    expect(wrapper).toContain("'DSH_PERMISSION_MODE=danger-full-access'")
    expect(atTheLauncher).toEqual({ folder: true, mode: 0o700 })
    expect(said.join(' ')).toContain('DSH native command array was checked')
  })

  it('makes an existing <check home>/.dsh of mode 755 private again before the launcher is called', async () => {
    view = inspectorViewStandIn()
    mkdirSync(join(view.sandbox.home, '.dsh'), { mode: 0o755 }); chmodSync(join(view.sandbox.home, '.dsh'), 0o755)
    const { ran, atTheLauncher } = await runDsh(view)
    expect(ran.code, ran.why ?? '').toBe(0)
    expect(atTheLauncher).toEqual({ folder: true, mode: 0o700 })
  })
})

describe('3. a wrong dsh array is refused before the launcher is called', () => {
  const faults: [string, (argv: string[]) => string[]][] = [
    ['DSH_HOME missing', argv => argv.filter(word => !word.startsWith('DSH_HOME='))],
    ['DSH_HOME=/work/.dsh', argv => argv.map(word => word.startsWith('DSH_HOME=') ? 'DSH_HOME=/work/.dsh' : word)],
    ['an extra env name', argv => [argv[0]!, 'SYNTHETIC_EXTRA=value', ...argv.slice(1)]],
    ['DSH_PERMISSION_MODE=workspace-write', argv => argv.map(word => word.startsWith('DSH_PERMISSION_MODE=') ? 'DSH_PERMISSION_MODE=workspace-write' : word)],
    ['another ACP client path', argv => argv.map(word => word === '/inputs/commands/inspector-dsh-acp.mjs' ? '/work/inspector-dsh-acp.mjs' : word)],
    ['an empty --effort', () => nativeDshArgv({ effort: '' })],
    ['--resume with an id that is not a dsh session id', () => nativeDshArgv({ resume: 'ses_Synthetic' })],
    ['a word after --resume <id>', () => [...nativeDshArgv({ resume: A_DSH_SESSION }), 'unverified']],
    ['--model before --provider', argv => {
      const at = argv.indexOf('--provider')
      return [...argv.slice(0, at), '--model', 'deepseek-flash', '--provider', 'deepseek-official', ...argv.slice(at + 4)]
    }],
  ]
  it.each(faults)('refuses %s', async (_fault, change) => {
    view = inspectorViewStandIn()
    const { ran } = await runDsh(view, { argv: change(nativeDshArgv()) })
    expect(ran.code).toBeNull()
    expect(ran.why).toBe(ROUTE_REFUSED)
    expect(view.calls).toHaveLength(0)
    expect(existsSync(join(view.sandbox.checkDir, 'commands', 'dsh.sh'))).toBe(false)
  })

  it('takes the same array with no effort, and with a dsh session id to resume, as the control for the refusals above', async () => {
    view = inspectorViewStandIn()
    for (const argv of [nativeDshArgv({ effort: null }), nativeDshArgv({ resume: A_DSH_SESSION })]) {
      const { ran } = await runDsh(view, { argv })
      expect(ran.code, ran.why ?? '').toBe(0)
    }
    expect(view.calls).toHaveLength(2)
  })
})

describe('4. the label and the runtime must both say dsh', () => {
  it.each([['dsh', 'claude-code'], ['claude-code', 'dsh']])('refuses label %s with runtime %s', async (label, runtime) => {
    view = inspectorViewStandIn()
    const { ran } = await runDsh(view, { label, runtime })
    expect(ran.code).toBeNull()
    expect(ran.why).toBe('The DSH model label and runtime do not agree; no model was started.')
    expect(view.calls).toHaveLength(0)
  })
})

describe('5. a provider with no key', () => {
  it('is refused, naming the provider, before the launcher is called', async () => {
    view = inspectorViewStandIn()
    const { ran } = await runDsh(view, { argv: nativeDshArgv({ provider: 'synthetic-provider' }) })
    expect(ran.code).toBeNull()
    expect(ran.why).toBe('No key is mapped for provider synthetic-provider in a DSH check.')
    expect(view.calls).toHaveLength(0)
  })
})

describe('6. a runtime with no secrets of its own', () => {
  it('is refused before the launcher is called, and no --secret is asked', async () => {
    view = inspectorViewStandIn()
    const ran = await runInside(view.sandbox, { label: 'gemini', runtime: 'gemini', cwd: view.work, argv: ['synthetic-model'], limitMs: 1000, launcher: view.launcher })
    expect(ran.code).toBeNull()
    expect(ran.why).toBe('Inspector harness gemini has no secrets of its own here, so none is passed and nothing was started.')
    expect(view.calls).toHaveLength(0)
    expect(view.calls.flatMap(call => secretsAsked(call.words))).toEqual([])
  })
})

describe('7. <check home>/.dsh must be a folder of its own', () => {
  // A LINK THAT STAYS INSIDE THE HOME passes the view's own check of its mounts, so only this check stands in its way.
  it.each([['link to a folder inside the home', 'a link'], ['file', 'not a folder']])('refuses it as a %s before the launcher is called', async (kind, is) => {
    view = inspectorViewStandIn()
    const dshHome = join(view.sandbox.home, '.dsh'), elsewhere = join(view.sandbox.home, 'somewhere-else')
    mkdirSync(elsewhere); chmodSync(elsewhere, 0o755)
    if (kind === 'file') writeFileSync(dshHome, 'Synthetic, not a folder')
    else symlinkSync('somewhere-else', dshHome)
    const { ran } = await runDsh(view)
    expect(ran.code).toBeNull()
    expect(ran.why).toBe(`${dshHome} is ${is}, so DSH's native state cannot be kept in this check's private home; no model was started.`)
    expect(view.calls).toHaveLength(0)
    expect(lstatSync(elsewhere).mode & 0o777).toBe(0o755)
    if (kind === 'file') expect(readFileSync(dshHome, 'utf8')).toBe('Synthetic, not a folder')
  })

  it('refuses it as a link out of the home, which the view\'s check of its mounts refuses first', async () => {
    view = inspectorViewStandIn()
    const elsewhere = join(view.root, 'out-of-the-home')
    mkdirSync(elsewhere); chmodSync(elsewhere, 0o755)
    symlinkSync(elsewhere, join(view.sandbox.home, '.dsh'))
    const { ran } = await runDsh(view)
    expect(ran.code).toBeNull()
    expect(ran.why).toContain(join(view.sandbox.home, '.dsh'))
    expect(view.calls).toHaveLength(0)
    expect(lstatSync(elsewhere).mode & 0o777).toBe(0o755)
  })
})

describe('8. signing a dsh model in', () => {
  const SIGNED_IN = "DSH signs in with its declared DEEPSEEK_API_KEY, passed by the launcher; its native state is kept in this check's private home at /check/home/.dsh."

  /** What aLoginForTheModel answers or throws, as one sentence. */
  function signIn(v: View, template: ReturnType<typeof aSyntheticTemplate>) {
    Object.assign(v.sandbox, { templateDir: template.templateDir, loginSeeds: [{ host: 'stale', container: '/login/stale.json', target: '.stale' }] })
    try {
      return { said: aLoginForTheModel(v.sandbox, { runtime: 'dsh', model: 'deepseek-v4.1-flash', minutes: 1, home: v.root }), threw: false }
    } catch (why) {
      return { said: (why as Error).message, threw: true }
    }
  }

  it('refuses when DEEPSEEK_API_KEY is declared only for opencode', () => {
    view = inspectorViewStandIn()
    const answer = signIn(view, aSyntheticTemplate(view.root, { deepSeekReadBy: ['opencode'] }))
    expect(answer).toEqual({ said: 'The inspector sandbox has no declared DEEPSEEK_API_KEY for DSH. No model was started.', threw: true })
  })

  it('refuses when the secrets file sets no DEEPSEEK_API_KEY', () => {
    view = inspectorViewStandIn()
    const answer = signIn(view, aSyntheticTemplate(view.root, { setsDeepSeek: false }))
    expect(answer).toEqual({ said: 'The inspector sandbox has no declared DEEPSEEK_API_KEY for DSH. No model was started.', threw: true })
  })

  it('refuses a secrets file others can read', () => {
    view = inspectorViewStandIn()
    const template = aSyntheticTemplate(view.root, { mode: 0o644 })
    const answer = signIn(view, template)
    expect(answer).toEqual({ said: `${template.secretFile} can be read by others (mode 644); make it 600 (chmod 600 ${template.secretFile}). No DSH model was started.`, threw: true })
  })

  it('refuses a template that cannot be read', () => {
    view = inspectorViewStandIn()
    const answer = signIn(view, { templateDir: join(view.root, 'no-template-here'), secretFile: '' })
    expect(answer).toEqual({ said: 'The sandbox template cannot be read, so no DSH model was started.', threw: true })
  })

  it('signs in with the declared DEEPSEEK_API_KEY, seeds no login file, and never names the Claude token or a value', () => {
    view = inspectorViewStandIn()
    const answer = signIn(view, aSyntheticTemplate(view.root))
    expect(answer).toEqual({ said: SIGNED_IN, threw: false })
    expect(view.sandbox).toMatchObject({ loginSeeds: [], login: null })
    expect(existsSync(join(view.sandbox.home, '.claude'))).toBe(false)
    expect(existsSync(join(view.sandbox.checkDir, 'login-seeds'))).toBe(false)
  })

  it('names neither the Claude token nor any synthetic value in any of its answers', () => {
    view = inspectorViewStandIn()
    const answers = [
      signIn(view, aSyntheticTemplate(join(view.root, 'a'))),
      signIn(view, aSyntheticTemplate(join(view.root, 'b'), { deepSeekReadBy: ['opencode'] })),
      signIn(view, aSyntheticTemplate(join(view.root, 'c'), { mode: 0o644 })),
    ].map(answer => answer.said)
    expect(answers[0]).toBe(SIGNED_IN)
    for (const said of answers) {
      expect(said).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
      expect(said).not.toContain('synthetic-only')
    }
  })
})
