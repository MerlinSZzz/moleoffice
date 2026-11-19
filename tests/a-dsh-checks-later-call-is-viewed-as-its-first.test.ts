// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DSH CHECK'S LATER CALL IS VIEWED AS ITS FIRST: THE PROFILES DSH MADE IN THE EARLIER CALL ARE REMOVED, NOT FOLLOWED.
 *
 * A dsh check runs several commands in one private home. Its first call starts with an empty .dsh, and DSH writes its own
 * profiles there: profiles/acp/ and profiles/node_modules/, the second holding absolute links into /opt/dsh inside the
 * container. readCheckView walks the private home on the host before every call, so on the second call those links are
 * refused: absent on the host (ENOENT) or escaping their mount. The fix removes profiles, and only profiles, before the
 * view is read, so the second call's view is read as the first call's was; every other name in .dsh, the session the
 * resumed call uses included, stays as it was.
 *
 * WHAT IS REAL AND WHAT IS NOT. runInside is the real one. The launcher is tests/inspector-view-stand-in.ts, a labelled
 * stand-in that writes the receipt a launcher would and enforces no mount. No model runs and no container starts. The
 * profiles, the session and every key here are made up; the dsh command array comes from tests/a-dsh-native-argv.ts.
 *
 * MUTATIONS, each planted in tools/inspector-sandbox.mjs after a control run, and the cases each turns red:
 *   M1  the removal call is taken out: cases 1 and 2.
 *   M2  the removal runs after readCheckView: cases 1 and 2.
 *   M3  the whole .dsh is removed instead of .dsh/profiles: cases 1 and 2, because the session goes.
 *   M4  the .dsh lstat guard is dropped, so it removes through a .dsh link: case 4.
 *   M5  the sentence is said before the emptiness checks: cases 1 and 3, because an empty home says it too.
 *   M6  the removal runs for every runtime: case 6.
 *   M7  the .dsh/profiles guard uses statSync, so a profiles link is taken for a folder: case 5.
 *   M8  .dsh/storages is removed beside .dsh/profiles: case 5, the storages-link half.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { THE_DSH_PROFILES_OF_AN_EARLIER_CALL_WERE_REMOVED, aDshHomeThatCannotBeKept, runInside } from '../tools/inspector-sandbox.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { A_DSH_SESSION, nativeDshArgv } from './a-dsh-native-argv.ts'

type View = ReturnType<typeof inspectorViewStandIn>
let view: View | null = null
afterEach(() => { view?.close(); view = null })

/** A made-up session file, kept under .dsh by the first call, which the resumed call must find byte for byte. */
const SYNTHETIC_SESSION = 'Synthetic session state left by the first call of this check.\n'
const SYNTHETIC_SESSION_FILE = 'a-synthetic-session'

/** Where dsh's own profile puts its link to the ACP SDK, below .dsh. */
const THE_PROFILE_LINK = 'profiles/node_modules/@agentclientprotocol/sdk'

/** A folder below the stand-in's root, outside the check's private home, as an absolute link's target. */
function aFolderOutsideTheHome(v: View, name: string): string {
  const folder = join(v.root, name, 'node_modules', '@agentclientprotocol', 'sdk')
  mkdirSync(folder, { recursive: true })
  return folder
}

/**
 * The private home's .dsh as DSH leaves it after a call: profiles/acp/package.json, an absolute link at
 * profiles/node_modules/@agentclientprotocol/sdk, and a made-up session file elsewhere under .dsh.
 */
function aDshHomeWithItsProfilesAndSession(v: View, target: string): { profiles: string; session: string } {
  const dsh = join(v.sandbox.home, '.dsh'), profiles = join(dsh, 'profiles')
  mkdirSync(join(profiles, 'acp'), { recursive: true })
  writeFileSync(join(profiles, 'acp', 'package.json'), '{"name":"a synthetic dsh profile"}\n')
  mkdirSync(join(profiles, 'node_modules', '@agentclientprotocol'), { recursive: true })
  symlinkSync(target, join(dsh, THE_PROFILE_LINK))
  const session = join(dsh, SYNTHETIC_SESSION_FILE)
  writeFileSync(session, SYNTHETIC_SESSION)
  return { profiles, session }
}

/** What the launcher saw of <check home>/.dsh at the moment it was called. */
type AtTheLauncher = { profiles: boolean; session: string | null }

/** What <check home>/.dsh holds now: whether profiles is there, and the session file's bytes. */
function whatTheLauncherSees(v: View): AtTheLauncher {
  const dsh = join(v.sandbox.home, '.dsh')
  const session = join(dsh, SYNTHETIC_SESSION_FILE)
  return { profiles: existsSync(join(dsh, 'profiles')), session: existsSync(session) ? readFileSync(session, 'utf8') : null }
}

const runDsh = (v: View, argv: string[], launcher: View['launcher'] = v.launcher) =>
  runInside(v.sandbox, { label: 'dsh', runtime: 'dsh', cwd: v.work, argv, limitMs: 1000, launcher })

describe('1. two calls, the second resumed', () => {
  const targets: [string, (v: View) => string][] = [
    ['a target the host does not have', v => join(v.root, 'a-target-the-host-does-not-have', 'node_modules', '@agentclientprotocol', 'sdk')],
    ['a target the host has outside the home', v => aFolderOutsideTheHome(v, 'a-target-outside-the-home')],
  ]

  it.each(targets)('starts both calls with %s', async (_what, targetOf) => {
    view = inspectorViewStandIn()
    const v = view
    const said: string[] = []; v.sandbox.asked.say = sentence => { said.push(sentence) }
    const target = targetOf(v)
    const at: AtTheLauncher[] = []
    const launcher = async (...args: Parameters<View['launcher']>) => {
      at.push(whatTheLauncherSees(v))
      const answer = await v.launcher(...args)
      if (at.length === 1) aDshHomeWithItsProfilesAndSession(v, target)
      return answer
    }
    const first = await runDsh(v, nativeDshArgv(), launcher)
    expect(first.code, first.why ?? '').toBe(0)
    expect(said).not.toContain(THE_DSH_PROFILES_OF_AN_EARLIER_CALL_WERE_REMOVED)
    const second = await runDsh(v, nativeDshArgv({ resume: A_DSH_SESSION }), launcher)
    expect(second.code, second.why ?? '').toBe(0)
    expect(v.calls).toHaveLength(2)
    expect(at).toEqual([{ profiles: false, session: null }, { profiles: false, session: SYNTHETIC_SESSION }])
    expect(said).toContain(THE_DSH_PROFILES_OF_AN_EARLIER_CALL_WERE_REMOVED)
  })
})

describe('2. a profile already there before the first call', () => {
  it('removes it before the first view is read and keeps the session byte for byte', async () => {
    view = inspectorViewStandIn()
    const v = view
    const said: string[] = []; v.sandbox.asked.say = sentence => { said.push(sentence) }
    const target = join(v.root, 'a-target-the-host-does-not-have', 'node_modules', '@agentclientprotocol', 'sdk')
    const { session } = aDshHomeWithItsProfilesAndSession(v, target)
    const at: AtTheLauncher[] = []
    const launcher = async (...args: Parameters<View['launcher']>) => {
      at.push(whatTheLauncherSees(v))
      return v.launcher(...args)
    }
    const ran = await runDsh(v, nativeDshArgv(), launcher)
    expect(ran.code, ran.why ?? '').toBe(0)
    expect(v.calls).toHaveLength(1)
    expect(at).toEqual([{ profiles: false, session: SYNTHETIC_SESSION }])
    expect(readFileSync(session, 'utf8')).toBe(SYNTHETIC_SESSION)
    expect(said).toContain(THE_DSH_PROFILES_OF_AN_EARLIER_CALL_WERE_REMOVED)
  })
})

describe('3. the first call of an empty home', () => {
  it('says nothing about profiles, because none were removed', async () => {
    view = inspectorViewStandIn()
    const v = view
    const said: string[] = []; v.sandbox.asked.say = sentence => { said.push(sentence) }
    const ran = await runDsh(v, nativeDshArgv())
    expect(ran.code, ran.why ?? '').toBe(0)
    expect(v.calls).toHaveLength(1)
    expect(said).not.toContain(THE_DSH_PROFILES_OF_AN_EARLIER_CALL_WERE_REMOVED)
  })
})

describe('4. nothing is removed through a link', () => {
  it('refuses a .dsh link to a folder inside the home and leaves the target profiles there', async () => {
    view = inspectorViewStandIn()
    const v = view
    const elsewhere = join(v.sandbox.home, 'somewhere-else'), kept = join(elsewhere, 'profiles', 'a-kept-file')
    mkdirSync(join(elsewhere, 'profiles'), { recursive: true })
    writeFileSync(kept, 'Synthetic, kept.\n')
    const dshHome = join(v.sandbox.home, '.dsh')
    symlinkSync('somewhere-else', dshHome)
    const ran = await runDsh(v, nativeDshArgv())
    expect(ran.code).toBeNull()
    expect(ran.why).toBe(aDshHomeThatCannotBeKept(dshHome, true))
    expect(v.calls).toHaveLength(0)
    expect(lstatSync(join(elsewhere, 'profiles')).isDirectory()).toBe(true)
    expect(readFileSync(kept, 'utf8')).toBe('Synthetic, kept.\n')
  })
})

describe('5. other links are judged as today', () => {
  const forms: [string, (v: View) => { link: string; target: string }][] = [
    ['profiles as an absolute link out of the home', v => {
      const target = aFolderOutsideTheHome(v, 'a-profiled-target-outside-the-home')
      mkdirSync(join(v.sandbox.home, '.dsh'), { recursive: true })
      const link = join(v.sandbox.home, '.dsh', 'profiles')
      symlinkSync(target, link)
      return { link, target }
    }],
    ['a link out of the home at .dsh/storages/x', v => {
      const target = aFolderOutsideTheHome(v, 'a-stored-target-outside-the-home')
      mkdirSync(join(v.sandbox.home, '.dsh', 'storages'), { recursive: true })
      const link = join(v.sandbox.home, '.dsh', 'storages', 'x')
      symlinkSync(target, link)
      return { link, target }
    }],
  ]

  it.each(forms)('refuses %s by the view check and removes nothing', async (_what, formOf) => {
    view = inspectorViewStandIn()
    const v = view
    const { link, target } = formOf(v)
    const ran = await runDsh(v, nativeDshArgv())
    expect(ran.code).toBeNull()
    expect(ran.why).toContain(link)
    expect(v.calls).toHaveLength(0)
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(lstatSync(target).isDirectory()).toBe(true)
  })
})

describe('6. another runtime is not touched', () => {
  it('refuses a Claude Code call by the view check and leaves the profiles folder there', async () => {
    view = inspectorViewStandIn()
    const v = view
    const target = join(v.root, 'a-target-the-host-does-not-have', 'node_modules', '@agentclientprotocol', 'sdk')
    const { profiles } = aDshHomeWithItsProfilesAndSession(v, target)
    const ran = await runInside(v.sandbox, { runtime: 'claude-code', label: 'claude-code', cwd: v.work,
      argv: ['synthetic-model'], limitMs: 1000, launcher: v.launcher })
    expect(ran.code).toBeNull()
    expect(ran.why).toContain(join(profiles, 'node_modules', '@agentclientprotocol', 'sdk'))
    expect(v.calls).toHaveLength(0)
    expect(lstatSync(profiles).isDirectory()).toBe(true)
    expect(lstatSync(join(profiles, 'node_modules', '@agentclientprotocol', 'sdk')).isSymbolicLink()).toBe(true)
  })
})
