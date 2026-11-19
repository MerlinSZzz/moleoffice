// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ENTRY FOLLOWS THE PERSON: ONE PRESS WRITES THE SKILL LINK AND THE THREE HOOK LINES.
 *
 * F15 point 1; problem pHFu8nivPZ_O; the plan `a_2fXQXQUt1o`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 * The press is `POST /api/office/install-the-entry`. The cases about who may press and about a test
 * world drive that door through the product's own app. The cases about the write itself drive
 * `installTheEntry`, the one implementation the door calls. The door's own checkout is whatever
 * shape this suite runs in, so the linked-worktree case below asserts the shape it actually has:
 * a worktree is refused before it reaches the write, and an ordinary checkout links. The write is
 * proved with a synthetic ordinary checkout whose `.git` is a directory, exactly as the office
 * checkout's is, and the refusal is proved with a synthetic `.git` file. Every case runs with
 * `HOME` pointed at a scratch directory this file makes and removes, because the one place this act
 * must never write is the real `~/.claude`.
 *
 *   1. It appends exactly one `SessionStart` entry, one `Stop` entry and one `SessionEnd` entry, leaves the
 *      pixel-agents entry byte-identical, and keeps every other key in the file.
 *   2. Pressed twice, the second press writes nothing and says so.
 *   3. A settings file that does not parse: nothing is written, and the refusal names the file.
 *   4. No backup possible: nothing is written, the link is put back, and the refusal says the file could not be backed
 *      up. Since round W24 the press makes its copy only where nothing is, so something at the backup's path no longer
 *      stops it. A folder it may not write in does.
 *   5. The skill entry is a symlink to the checkout, never a copy.
 *   6. An agent is refused, and the refusal names who may.
 *   7. Something at the skill path that is not a link is refused rather than deleted.
 *   8. A linked git worktree is refused the way a test world is, by the door and by the shared
 *      check, and the refusal names the worktree and says where to press instead.
 *   9. Two later presses that each change the file keep their own copies, at `-2` and `-3`, and the first backup stays
 *      byte for byte. Each press's words name the copy it made, and a later press's name the first as well (round W24).
 *  10. A press that changes only the skill link leaves the settings file and its backup as they were and makes no
 *      copy, and says so. A press after it, which changes nothing, makes no copy either.
 *  11. A press refused after it made its copy takes the copy away. A first press then leaves no backup, and a later
 *      one leaves the first backup byte for byte.
 *  12. A press refused at the write whose copy cannot be taken away says where the copy still is, and puts the link
 *      back (round W26).
 *
 * The other half of the machine rule — a caller from another computer is refused before any handler
 * runs — is not driven here. This route declares `reach: 'local'` with `reserved-to-the-owner`, and
 * `tests/local-only-routes.test.ts` drives the product's own second listener against every local
 * route, this one included, so a second copy of that machinery here would prove a door this file
 * built rather than the product's.
 *
 * MUTATIONS (wave 13t, round W24), run from 05:16 to 05:22 on 3 November 2026 (UTC), each after a control run that
 * passed, and each restored, with the press's change in the worktree and not yet committed.
 *   - the copy is made over whatever is at the first name: red, cases 9 and 11;
 *   - the copy stops at `-2`, so a press that finds `-2` taken is refused: red, case 9;
 *   - the first copy goes to `-2`: red, cases 1, 2, 9, 10 and 11;
 *   - a refusal at the backup leaves the link the press made: red, case 4;
 *   - a copy that failed is not a refusal, and the press goes on to the write: red, case 4, on its line that the
 *     refusal says the file could not be backed up;
 *   - outside an AppImage, a press with no line to add writes the file and a backup again: red, case 10;
 *   - a press refused at the write leaves its copy: red, case 11;
 *   - a later press's words name its own copy and not the first: red, case 9;
 *   - the press that changes only the link does not say that the settings file was not changed: red, case 10.
 *
 * MUTATION (wave 13t, round W26), after a control run that passed, and restored; the commit that changes the press names
 * the run and the log.
 *   - a refusal whose copy could not be taken away does not say where it is: red, case 12.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aFolderShutAfterTheCopy } from './a-folder-shut-after-the-copy.ts'
import { skippedAsRoot } from './root-may-write-in-any-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { installTheEntry, theOwnersHome } from '../src/config/install-the-entry.mjs'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** The real checkout this suite runs in. In a worktree its `.git` is a file, which is refused. */
const WORKTREE = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

/**
 * WHETHER THIS SUITE'S OWN CHECKOUT IS A LINKED WORKTREE.
 *
 * The door always installs into `REPO_ROOT`, the checkout the server was started from, and a
 * request cannot point it elsewhere. So the door's linked-worktree refusal can only be driven when
 * this suite itself runs in a linked worktree; on an ordinary checkout the door links, which is
 * what it is for. The refusal itself is proved for a `.git` file whichever shape this checkout is,
 * by the shared check below, which makes one of its own.
 */
const SUITE_IS_A_LINKED_WORKTREE = (() => {
  try {
    return lstatSync(join(WORKTREE, '.git')).isFile()
  } catch {
    return false
  }
})()

/** The person, as every other person-only door's test sends them: a human header through inject. */
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
} as const

/** An agent, which this act is refused to. */
const AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'an-agent',
} as const

/**
 * THE PIXEL-AGENTS ENTRY THE OWNER ALREADY HAS, as the measurement of 14 September 2026 found it, with the
 * owner's home folder written as the fixture root. The install has to keep it byte for byte, whatever its path.
 */
const PIXEL_AGENTS = {
  matcher: '',
  hooks: [{ type: 'command', command: `node "${THE_TEST_FIXTURE_ROOT}/.pixel-agents/hooks/claude-hook.js"`, timeout: 5 }],
}

const START_SETTINGS = {
  hooks: { SessionStart: [PIXEL_AGENTS], SessionEnd: [PIXEL_AGENTS] },
  permissions: { allow: ['Bash(node:*)'] },
  model: 'opus',
}

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let home: string
let checkout: string
let originalHome: string | undefined

const settingsPath = (): string => join(home, '.claude', 'settings.json')
const backupPath = (): string => join(home, '.claude', 'settings.json.mole-office-backup')
/** Where a later press puts its copy when the first backup is there: `-2`, then `-3` and on (round W24). */
const laterBackupPath = (n: number): string => `${backupPath()}-${String(n)}`
/** The press's temporary file, the settings file written whole before it is renamed into place. */
const theTemporaryFile = (): string => `${settingsPath()}.mole-office-${String(process.pid)}`
const skillLink = (): string => join(home, '.claude', 'skills', 'mole-office')
const skillSource = (): string => join(checkout, '.claude', 'skills', 'mole-office')

/** Put a fresh settings file in the scratch home, and return the exact text that was written. */
function seed(settings: unknown): string {
  mkdirSync(join(home, '.claude'), { recursive: true })
  const text = `${JSON.stringify(settings, null, 2)}\n`
  writeFileSync(settingsPath(), text, 'utf8')
  return text
}

/** The person's press through the product's own door, for the cases about who may press or a world. */
async function press(headers: Record<string, string> = PERSON) {
  return app.app.inject({ method: 'POST', url: '/api/office/install-the-entry', headers })
}

/**
 * THE WRITE CASES DRIVE THE ONE IMPLEMENTATION THE DOOR CALLS, with a synthetic ordinary checkout.
 *
 * This suite runs in a linked worktree, and the door's own checkout is that worktree, so the door
 * refuses before it reaches the write (see the linked-worktree case below). The write itself is
 * `installTheEntry`; the door and the terminal tool both call it, so driving it here proves the
 * merge with a checkout whose `.git` is a directory, exactly as the office checkout's is.
 *
 * The shape matches a Fastify reply closely enough for the cases below: `statusCode`, `body` and
 * `json()`.
 */
async function driveTheEntry(): Promise<{ statusCode: number; body: string; json: () => unknown }> {
  const result = await installTheEntry({ home: theOwnersHome(), checkout })
  return { statusCode: result.ok ? 200 : 409, body: result.says, json: () => result }
}

/** The hooks block of the settings file as it is on disk now. */
function hooksOnDisk(): { SessionStart: unknown[]; SessionEnd: unknown[]; [key: string]: unknown } {
  return JSON.parse(readFileSync(settingsPath(), 'utf8')).hooks as {
    SessionStart: unknown[]
    SessionEnd: unknown[]
  }
}

beforeAll(async () => {
  originalHome = process.env.HOME
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
}, 60_000)

/**
 * A FRESH SCRATCH HOME AND A FRESH ORDINARY CHECKOUT FOR EVERY CASE. `installTheEntry` reads the
 * home directory from this process's environment through `theOwnersHome()`, and this is what points
 * it there. One home per case means no case can pass because of what another one left behind, and
 * the owner's own ~/.claude is never written by any case here. The checkout's `.git` is a directory,
 * which is the shape the office's own checkout has and the shape the door's worktree refusal is not.
 */
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-entry-test-'))
  process.env.HOME = home
  checkout = mkdtempSync(join(tmpdir(), 'mole-office-entry-checkout-'))
  mkdirSync(join(checkout, '.git'))
  mkdirSync(join(checkout, '.claude', 'skills', 'mole-office'), { recursive: true })
  writeFileSync(join(checkout, '.claude', 'skills', 'mole-office', 'SKILL.md'), '# a skill\n', 'utf8')
  mkdirSync(join(checkout, 'tools'), { recursive: true })
  writeFileSync(join(checkout, 'tools', 'session-hook.mjs'), '// the hook\n', 'utf8')
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(checkout, { recursive: true, force: true })
})

afterAll(async () => {
  await app.app.close()
  t.close()
  process.env.HOME = originalHome
})

describe('the press writes the entry and leaves everything else alone', () => {
  it('appends exactly one entry to each hook array, in the shape the hook itself documents', async () => {
    const before = seed(START_SETTINGS)
    const res = await driveTheEntry()
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json() as { ok: boolean; changed: boolean; addedSessionStart: boolean; addedStop: boolean; addedSessionEnd: boolean; says: string }
    expect(body.ok).toBe(true)
    expect(body.changed).toBe(true)
    expect(body.addedSessionStart).toBe(true)
    expect(body.addedStop).toBe(true)
    expect(body.addedSessionEnd).toBe(true)

    const hooks = hooksOnDisk()
    expect(hooks.SessionStart.length, 'four presses would file four records per session start').toBe(2)
    expect(hooks.SessionEnd.length).toBe(2)
    // THE ENTRY THAT WAS ALREADY THERE IS BYTE-IDENTICAL. A merge that rewrote it would silently
    // change what runs at the start of every session on this machine.
    expect(hooks.SessionStart[0]).toEqual(PIXEL_AGENTS)
    expect(hooks.SessionEnd[0]).toEqual(PIXEL_AGENTS)

    const start = hooks.SessionStart[1] as { matcher: string; hooks: { type: string; command: string; timeout: number }[] }
    const end = hooks.SessionEnd[1] as { matcher: string; hooks: { type: string; command: string; timeout: number }[] }
    expect(start.hooks[0]?.command).toContain(join(checkout, 'tools', 'session-hook.mjs'))
    expect(start.hooks[0]?.command).toContain(' start')
    expect(end.hooks[0]?.command).toContain(' end')
    // STOP TOO, the third hook the owner's machine has (the reading of 28 September 2026; wave 13n round 19,
    // check jHe5i92fKxYk). The press puts back the whole block tools/session-hook.mjs holds, so Stop is not left
    // for a hand to paste. MUTATION: the installer's line that appends to hooks.Stop taken out; this goes red.
    const stop = (hooksOnDisk()['Stop'] ?? []) as { matcher: string; hooks: { type: string; command: string; timeout: number }[] }[]
    expect(stop.length, 'the press left Stop unwired').toBe(1)
    expect(stop[0]?.hooks[0]?.command).toContain(join(checkout, 'tools', 'session-hook.mjs'))
    expect(stop[0]?.hooks[0]?.command).toContain(' stop')
    expect(start.hooks[0]?.timeout).toBeGreaterThan(0)

    // EVERY OTHER KEY SURVIVES. A merge that rebuilt the file from the hooks would drop these.
    const whole = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Record<string, unknown>
    expect(whole['permissions']).toEqual({ allow: ['Bash(node:*)'] })
    expect(whole['model']).toBe('opus')

    // THE BACKUP IS THE FILE AS IT WAS, and the reply names it.
    expect(readFileSync(backupPath(), 'utf8')).toBe(before)
    expect(body.says).toContain(backupPath())

    // THE SKILL ENTRY IS A LINK INTO THE CHECKOUT, never a copy. A copy would drift from the skill
    // the server actually serves.
    expect(lstatSync(skillLink()).isSymbolicLink(), 'the entry is not a link; a copy would drift').toBe(true)
    expect(readlinkSync(skillLink())).toBe(skillSource())
    expect(existsSync(join(skillLink(), 'SKILL.md')), 'the link does not resolve to a readable skill').toBe(true)
  })

  it('changes nothing on the second press, and says so', async () => {
    seed(START_SETTINGS)
    await driveTheEntry()
    const afterFirst = readFileSync(settingsPath(), 'utf8')
    const backupAfterFirst = readFileSync(backupPath(), 'utf8')
    const res = await driveTheEntry()
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json() as { changed: boolean; backupPath: string | null; says: string }
    expect(body.changed).toBe(false)
    expect(body.backupPath).toBeNull()
    expect(body.says.toLowerCase()).toContain('nothing was written')
    expect(readFileSync(settingsPath(), 'utf8')).toBe(afterFirst)
    expect(readFileSync(backupPath(), 'utf8')).toBe(backupAfterFirst)
  })
})

describe('the press refuses to write when it cannot do so safely', () => {
  it('refuses a settings file that does not parse, and names it', async () => {
    mkdirSync(join(home, '.claude'), { recursive: true })
    const broken = '{ "hooks": '
    writeFileSync(settingsPath(), broken, 'utf8')
    const res = await driveTheEntry()
    expect(res.statusCode, res.body).toBe(409)
    expect(res.body).toContain(settingsPath())
    expect(res.body.toLowerCase()).toContain('does not parse')
    expect(readFileSync(settingsPath(), 'utf8'), 'a refused press changed the broken file').toBe(broken)
  })

  it('writes nothing when the backup cannot be made, and puts the link back', async (context) => {
    // A FOLDER THE PRESS MAY NOT WRITE IN, WHERE THE BACKUP GOES. Since round W24 the press makes its copy only where
    // nothing is and takes the next name when one is taken, so a directory at the backup's path no longer stops it.
    // The skills folder is made first and can still be written in, so the link is made and has to be put back. Root
    // may write in any folder, so run as root this case proves nothing.
    if (skippedAsRoot(context)) return
    const before = seed(START_SETTINGS)
    mkdirSync(join(home, '.claude', 'skills'))
    chmodSync(join(home, '.claude'), 0o500)
    let res: Awaited<ReturnType<typeof driveTheEntry>>
    try {
      res = await driveTheEntry()
    } finally {
      chmodSync(join(home, '.claude'), 0o700)
    }
    expect(res.statusCode, res.body).toBe(409)
    expect(res.body).toContain(backupPath())
    // THE REFUSAL IS THE BACKUP'S OWN. A press that went on past a failed copy would be refused at the write, in the
    // same folder, with words that could name the backup's path too.
    expect(res.body).toContain('could not be backed up')
    expect(readFileSync(settingsPath(), 'utf8'), 'the settings file changed although the backup failed').toBe(before)
    expect((hooksOnDisk().SessionStart as unknown[]).length).toBe(1)
    expect(existsSync(skillLink()), 'a refused press left a skill link behind').toBe(false)
  })

  it('refuses something at the skill path that is not a link, rather than deleting it', async () => {
    const before = seed(START_SETTINGS)
    mkdirSync(skillLink(), { recursive: true })
    writeFileSync(join(skillLink(), 'SKILL.md'), '# a copy somebody made by hand\n', 'utf8')
    const res = await driveTheEntry()
    expect(res.statusCode, res.body).toBe(409)
    expect(res.body).toContain(skillLink())
    expect(readFileSync(settingsPath(), 'utf8')).toBe(before)
    expect(readFileSync(join(skillLink(), 'SKILL.md'), 'utf8'), 'the press deleted a copy it did not make').toBe(
      '# a copy somebody made by hand\n',
    )
  })
})

/**
 * THE PERSON'S FIRST BACKUP IS NEVER WRITTEN OVER (round W24). Until this round every press that changed the file
 * copied it to the one backup path, so a second press wrote over the person's first copy.
 */
describe('a later press keeps its own copy, and the first backup stays as it was', () => {
  it('keeps the first backup byte for byte through two later presses that each change the file, and names each copy', async () => {
    const first = seed(START_SETTINGS)
    const res1 = await driveTheEntry()
    expect(res1.statusCode, res1.body).toBe(200)
    expect(res1.body).toContain(`The file it replaced is backed up at ${backupPath()}. Every other line in that file was left as it was.`)

    // THE PERSON CHANGES THE FILE AND THE THREE LINES ARE GONE, as a hand or another tool can make them go. So each
    // later press adds the lines again, and copies the file first.
    const second = seed({ ...START_SETTINGS, model: 'sonnet' })
    const res2 = await driveTheEntry()
    expect(res2.statusCode, res2.body).toBe(200)
    const third = seed({ ...START_SETTINGS, model: 'haiku' })
    const res3 = await driveTheEntry()
    expect(res3.statusCode, res3.body).toBe(200)

    expect(readFileSync(backupPath(), 'utf8'), 'a later press wrote over the first backup').toBe(first)
    expect(readFileSync(laterBackupPath(2), 'utf8')).toBe(second)
    expect(readFileSync(laterBackupPath(3), 'utf8')).toBe(third)
    expect((res2.json() as { backupPath: string | null }).backupPath).toBe(laterBackupPath(2))
    expect((res3.json() as { backupPath: string | null }).backupPath).toBe(laterBackupPath(3))
    for (const [res, n] of [[res2, 2], [res3, 3]] as const) {
      expect(res.body).toContain(
        `The file it replaced is backed up at ${laterBackupPath(n)}. The first backup, at ${backupPath()}, was not changed. ` +
          'Every other line in that file was left as it was.',
      )
    }
  })

  it('leaves the settings file and its backup as they were when a press changes only the skill link, and says so', async () => {
    seed(START_SETTINGS)
    expect((await driveTheEntry()).statusCode).toBe(200)
    const settingsAfterFirst = readFileSync(settingsPath(), 'utf8')
    const backupAfterFirst = readFileSync(backupPath(), 'utf8')

    // THE LINK IS POINTED SOMEWHERE ELSE, as another office's press or a hand can point it. The three lines are still
    // in the file, so this press changes the link and has nothing to add to the file.
    const elsewhere = mkdtempSync(join(tmpdir(), 'mole-office-entry-elsewhere-'))
    try {
      unlinkSync(skillLink())
      symlinkSync(elsewhere, skillLink())
      const res = await driveTheEntry()
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ changed: true, replacedSkillLink: true, addedSessionStart: false, backupPath: null })
      expect(readlinkSync(skillLink())).toBe(skillSource())
      expect(res.body).toBe(
        `Wrote the skill link ${skillLink()}, which pointed somewhere else, linking it to ${skillSource()}. The three ` +
          `hook lines in ${settingsPath()} already run ${join(checkout, 'tools', 'session-hook.mjs')}, so that file was not changed.`,
      )
      expect(readFileSync(settingsPath(), 'utf8'), 'a press with no line to add wrote the settings file').toBe(settingsAfterFirst)
      expect(readFileSync(backupPath(), 'utf8'), 'a press with no line to add wrote over the first backup').toBe(backupAfterFirst)
      expect(existsSync(laterBackupPath(2)), 'a press with no line to add made a copy').toBe(false)

      // AND A PRESS THAT CHANGES NOTHING MAKES NO COPY.
      const again = await driveTheEntry()
      expect(again.json()).toMatchObject({ ok: true, changed: false, backupPath: null })
      expect(existsSync(laterBackupPath(2)), 'a press that changed nothing made a copy').toBe(false)
      expect(readFileSync(backupPath(), 'utf8')).toBe(backupAfterFirst)
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it('takes its own copy away when the settings file cannot be written, and leaves the first backup as it was', async () => {
    // A FOLDER WHERE THE PRESS'S TEMPORARY FILE GOES, so the settings file cannot be written once the copy is made.
    const first = seed(START_SETTINGS)
    mkdirSync(theTemporaryFile())
    const refusedFirst = await driveTheEntry()
    expect(refusedFirst.statusCode, refusedFirst.body).toBe(409)
    expect(refusedFirst.body).toContain('could not be written')
    expect(readFileSync(settingsPath(), 'utf8')).toBe(first)
    expect(existsSync(backupPath()), 'a refused first press left a backup').toBe(false)

    rmSync(theTemporaryFile(), { recursive: true })
    expect((await driveTheEntry()).statusCode).toBe(200)
    const changed = seed({ ...START_SETTINGS, model: 'sonnet' })
    mkdirSync(theTemporaryFile())
    const refusedLater = await driveTheEntry()
    expect(refusedLater.statusCode, refusedLater.body).toBe(409)
    expect(readFileSync(settingsPath(), 'utf8')).toBe(changed)
    expect(readFileSync(backupPath(), 'utf8'), 'a refused press wrote over the first backup').toBe(first)
    expect(existsSync(laterBackupPath(2)), 'a refused press left its copy').toBe(false)
  })

  it('says where its copy still is when the settings file cannot be written and the copy cannot be taken away', async (context) => {
    if (skippedAsRoot(context)) return
    const before = seed(START_SETTINGS)
    const res = await aFolderShutAfterTheCopy(
      { folder: join(home, '.claude'), copy: backupPath(), temporary: theTemporaryFile() },
      () => driveTheEntry(),
    )
    expect(res.statusCode, res.body).toBe(409)
    expect(res.body).toContain(`The settings file could not be written, so nothing was changed in it: ${settingsPath()} (`)
    expect(res.body).toContain(` The copy of it this press made could not be removed, and is still at ${backupPath()} (`)
    expect(readFileSync(settingsPath(), 'utf8')).toBe(before)
    expect(readFileSync(backupPath(), 'utf8'), 'the copy the refusal names is not the file as it was').toBe(before)
    expect(existsSync(skillLink()), 'a refused press left a skill link behind').toBe(false)
  })
})

/**
 * FOUND AT REVIEW OF THIS PIECE, BY READING RATHER THAN BY A TEST.
 *
 * Every other guard here asks WHO is pressing. This one asks WHICH OFFICE is answering. A world is
 * a copy of the office serving from a worktree, the owner presses things in one because that is what a
 * world is for, and a world runs with the owner's real home directory. So the press in a
 * world would repoint the real ~/.claude/skills/mole-office at a worktree that is deleted when the
 * world is torn down, and every session on this machine would then start with no skill and no way
 * to tell that it has none.
 *
 * The case sets the world's own environment variable, which is what tools/isolated-mole-office.mjs
 * sets, and `forgetTheWorldsOwnAuthority` is how the reader is made to look again — it holds its
 * answer for the life of the process on purpose.
 */
describe('a test world may not write the real home directory', () => {
  let world: Awaited<ReturnType<typeof apiApp>> | null = null

  afterEach(async () => {
    await world?.app.close()
    world = null
    delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    forgetTheWorldsOwnAuthority()
    vi.resetModules()
  })

  /**
   * A SECOND APP, BUILT AFTER THE WORLD'S VARIABLE IS SET. The world reading is held for the life
   * of the process on purpose, and it is taken during the app's own build, so an app built before
   * the variable was set answers "not a world" however often the reader is told to forget. This is
   * the same shape tests/a-worlds-copy-carries-no-key-hashes.test.ts uses for the same reason.
   */
  async function aWorldApp(): Promise<Awaited<ReturnType<typeof apiApp>>> {
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'so'
    vi.resetModules()
    forgetTheWorldsOwnAuthority()
    const built = await apiApp()
    await built.app.ready()
    return built
  }

  it('refuses the owner’s own press inside a world, and writes nothing', async () => {
    const before = seed(START_SETTINGS)
    world = await aWorldApp()
    const res = await world.app.inject({ method: 'POST', url: '/api/office/install-the-entry', headers: PERSON })
    expect(res.statusCode, res.body).toBe(409)
    expect(res.body).toContain('test world')
    expect(res.body).toContain('no longer exists')
    expect(readFileSync(settingsPath(), 'utf8'), "a world's press changed the settings file").toBe(before)
    expect(existsSync(skillLink()), "a world's press made the skill link").toBe(false)
  })
})

describe('a linked git worktree is refused the way a world is', () => {
  it('refuses the press through the door on a linked worktree, and links on an ordinary checkout', async () => {
    const before = seed(START_SETTINGS)
    const res = await press()
    if (SUITE_IS_A_LINKED_WORKTREE) {
      expect(res.statusCode, res.body).toBe(409)
      expect(res.body).toContain('linked git worktree')
      expect(res.body, 'the refusal does not name the worktree it is about').toContain(WORKTREE)
      expect(res.body).toContain('Nothing was written')
      expect(res.body).toContain("office's own checkout")
      expect(readFileSync(settingsPath(), 'utf8'), 'a worktree press changed the settings file').toBe(before)
      expect(existsSync(skillLink()), 'a worktree press made the skill link').toBe(false)
      return
    }
    // AN ORDINARY CHECKOUT IS WHAT THE DOOR IS FOR. It links into the scratch home this case made,
    // and the linked-worktree refusal is proved by the shared check below, which makes its own
    // `.git` file whatever shape this suite's checkout has.
    expect(res.statusCode, res.body).toBe(200)
    expect(lstatSync(skillLink()).isSymbolicLink()).toBe(true)
  })

  it('refuses the shared check itself for a `.git` that is a file, and writes nothing', async () => {
    const linked = mkdtempSync(join(tmpdir(), 'mole-office-entry-worktree-'))
    try {
      writeFileSync(join(linked, '.git'), 'gitdir: /somewhere/.git/worktrees/a-test\n', 'utf8')
      mkdirSync(join(linked, '.claude', 'skills', 'mole-office'), { recursive: true })
      writeFileSync(join(linked, '.claude', 'skills', 'mole-office', 'SKILL.md'), '# a skill\n', 'utf8')
      const result = await installTheEntry({ home, checkout: linked })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.says).toContain('linked git worktree')
      expect(result.says, 'the refusal does not name the worktree it is about').toContain(linked)
      expect(result.says).toContain('Nothing was written')
      expect(result.says).toContain("office's own checkout")
      expect(existsSync(settingsPath()), 'the shared check wrote the settings file').toBe(false)
      expect(existsSync(skillLink()), 'the shared check made the skill link').toBe(false)
    } finally {
      rmSync(linked, { recursive: true, force: true })
    }
  })

  it('allows the shared check for a `.git` that is a directory, so the refusal is about the shape', async () => {
    const result = await installTheEntry({ home, checkout })
    expect(result.ok).toBe(true)
    expect(existsSync(settingsPath()), 'the ordinary checkout did not get the settings file').toBe(true)
    expect(lstatSync(skillLink()).isSymbolicLink()).toBe(true)
  })
})

/**
 * A FOLDER GIT DOES NOT KEEP IS REFUSED THE WAY A WORKTREE IS — problem `hlNgNPM9hGTh`.
 *
 * On 23 and 24 September 2026 measurement agents unpacked HEAD with `git archive` into throwaway
 * folders and ran this checkout's tools inside them, with the real `HOME`. An unpacked copy carries
 * no `.git` at all, so the worktree refusal said nothing about it, and three pairs of hook lines
 * went into the owner's own `~/.claude/settings.json`, each running a session hook in a folder that
 * was about to be deleted.
 *
 * The two cases make the two shapes by hand — a folder with no `.git`, and a checkout missing the
 * hook the three lines would run — so neither depends on what shape the suite's own checkout has.
 */
describe('a folder git does not keep as a checkout is refused', () => {
  it('refuses a copy with no `.git` at all, names it, and writes nothing', async () => {
    const copy = mkdtempSync(join(tmpdir(), 'mole-office-entry-copy-'))
    try {
      // Everything an unpacked `git archive` of HEAD carries, which is everything but `.git`.
      mkdirSync(join(copy, '.claude', 'skills', 'mole-office'), { recursive: true })
      writeFileSync(join(copy, '.claude', 'skills', 'mole-office', 'SKILL.md'), '# a skill\n', 'utf8')
      mkdirSync(join(copy, 'tools'), { recursive: true })
      writeFileSync(join(copy, 'tools', 'session-hook.mjs'), '// the hook\n', 'utf8')

      const result = await installTheEntry({ home, checkout: copy })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.says).toContain('not a checkout git keeps')
      expect(result.says, 'the refusal does not name the folder it is about').toContain(copy)
      expect(result.says).toContain('Nothing was written')
      expect(existsSync(settingsPath()), 'the copy got the settings file written').toBe(false)
      expect(existsSync(skillLink()), 'the copy got the skill link made').toBe(false)
    } finally {
      rmSync(copy, { recursive: true, force: true })
    }
  })

  it('refuses a checkout with no session hook to run, and writes nothing', async () => {
    // `checkout` is the ordinary scratch checkout every case here gets; take its hook away.
    rmSync(join(checkout, 'tools', 'session-hook.mjs'))
    const result = await installTheEntry({ home, checkout })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.says).toContain('The hook these three lines would run is not in this checkout')
    expect(result.says).toContain(join(checkout, 'tools', 'session-hook.mjs'))
    expect(result.says).toContain('Nothing was written')
    expect(existsSync(settingsPath()), 'a checkout with no hook got the settings file').toBe(false)
    expect(existsSync(skillLink()), 'a checkout with no hook got the skill link').toBe(false)
  })
})

describe('the press is the person\'s own act', () => {
  it('refuses an agent and names who may', async () => {
    const before = seed(START_SETTINGS)
    const res = await press(AGENT)
    expect(res.statusCode, res.body).toBe(403)
    expect(res.body).toContain('owner')
    expect(res.body.toLowerCase()).toContain('settings page')
    expect(readFileSync(settingsPath(), 'utf8'), 'an agent\'s refused press changed the settings file').toBe(before)
    expect(existsSync(skillLink())).toBe(false)
  })
})
