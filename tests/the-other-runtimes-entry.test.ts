// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CODEX AND OPENCODE GET THE SAME ENTRY CLAUDE CODE DOES: A POINTER, WRITTEN AT USER LEVEL.
 *
 * F15 point 5, "The other runtimes' entry": the skill should be linked into ./claude/skill, and the
 * other agents' skills linked too, because Mole Office should be a global skill.
 * Piece (c) built the press for Claude Code (`tests/the-entry-follows-the-person.test.ts`); this is
 * the same idea for the two runtimes that have no "skill" concept, so what is written is a short
 * pointer block into the global instructions file each one reads on every session, not a copy of
 * the skill.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 * Driven through the product's own app, with `HOME` (and `CODEX_HOME` where a case needs it)
 * pointed at a scratch directory this file makes and removes — the one place this act must never
 * write is the real `~/.codex` or `~/.config/opencode`.
 *
 *   1. A runtime whose own directory is not there is refused, naming the directory, and nothing is
 *      written — the tool has never run on this machine, so nothing here invents its home.
 *   2. A fresh directory: the plan says the file would be created; the press creates it holding
 *      exactly the block.
 *   3. Pressed twice: the second changes nothing and says so.
 *   4. An existing file with the caller's own content and no block: the press appends the block at
 *      the end and leaves the rest byte-identical, backed up first.
 *   5. An existing file that already carries an older block: the press replaces just the block.
 *   6. Codex's `AGENTS.override.md`: both the plan and the press refuse, naming the file, because
 *      writing `AGENTS.md` there would sit unread.
 *   7. `CODEX_HOME` moves where Codex's half is read from and written to.
 *   8. An agent is refused on the write; the plan (a read) is not.
 *   9. Naming both runtimes when one would be refused writes NEITHER — this door's own all-or-
 *      nothing rule, proved by checking the other runtime's file was not created either.
 *  10. A body naming no runtime, or a word that is not one of the two, is a 400 naming the field.
 *  11. Two later presses that each change the file keep their own copies, at `-2` and `-3`, and the first backup stays
 *      byte for byte. The first press's words are what they were; a later press's name its own copy, then say the first
 *      backup was not changed (round W26).
 *  12. A copy that fails for any reason but a taken name refuses the press, and nothing is written.
 *  13. A press refused at the write takes its own copy away. A first press then leaves no backup, and a later one
 *      leaves the first backup byte for byte.
 *  14. A press refused at the write whose copy cannot be taken away says where the copy still is.
 *
 * MUTATIONS (wave 13t, round W26), each after a control run that passed, and each restored; the commit that changes the
 * press names the runs and the logs.
 *   - the copy is made over whatever is at the first name: red, cases 11 and 13;
 *   - the copy stops at `-2`, so a press that finds `-2` taken is refused: red, case 11;
 *   - a copy that failed is not a refusal, and the press goes on to the write: red, case 12;
 *   - a press refused at the write leaves its copy: red, cases 13 and 14;
 *   - a refusal whose copy could not be taken away does not say where it is: red, case 14;
 *   - a later press's words name its own copy and not the first: red, case 11.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aFolderShutAfterTheCopy } from './a-folder-shut-after-the-copy.ts'
import { skippedAsRoot } from './root-may-write-in-any-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
} as const

const AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'an-agent',
} as const

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let home: string
let originalHome: string | undefined
let originalCodexHome: string | undefined

const codexHome = (): string => join(home, '.codex')
const codexAgents = (): string => join(codexHome(), 'AGENTS.md')
const codexOverride = (): string => join(codexHome(), 'AGENTS.override.md')
const opencodeHome = (): string => join(home, '.config', 'opencode')
const opencodeAgents = (): string => join(opencodeHome(), 'AGENTS.md')
const firstBackup = (): string => `${codexAgents()}.mole-office-backup`
/** Where a later press puts its copy when the first backup is there: `-2`, then `-3` and on (round W26). */
const laterBackup = (n: number): string => `${firstBackup()}-${String(n)}`
/** The press's temporary file, AGENTS.md written whole before it is renamed into place. */
const theTemporaryFile = (): string => `${codexAgents()}.mole-office-${String(process.pid)}`

type Applied = { ok: boolean; changed?: boolean; backupPath?: string | null; path: string; says: string }
const codexSaid = (pressed: Awaited<ReturnType<typeof press>>): Applied => (pressed.json() as { codex: Applied }).codex

async function plan() {
  return app.app.inject({ method: 'GET', url: '/api/office/install-the-entry/other-runtimes' })
}

async function press(runtimes: string[], headers: Record<string, string> = PERSON) {
  return app.app.inject({
    method: 'POST',
    url: '/api/office/install-the-entry/other-runtimes',
    headers,
    payload: { runtimes },
  })
}

beforeEach(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  home = mkdtempSync(join(tmpdir(), 'mole-office-other-runtimes-test-'))
  originalHome = process.env.HOME
  originalCodexHome = process.env.CODEX_HOME
  process.env.HOME = home
  delete process.env.CODEX_HOME
})

afterEach(async () => {
  await app.app.close()
  t.close()
  process.env.HOME = originalHome
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = originalCodexHome
  rmSync(home, { recursive: true, force: true })
})

describe('a runtime that has never run on this machine', () => {
  it('refuses the plan and the press, naming the directory, and creates nothing', async () => {
    const planned = await plan()
    expect(planned.statusCode).toBe(200)
    const body = planned.json() as { codex: { ok: boolean; path?: string; says?: string } }
    expect(body.codex.ok).toBe(false)
    expect(body.codex.says).toContain(codexHome())
    expect(body.codex.says).toContain('never')

    const pressed = await press(['codex'])
    expect(pressed.statusCode).toBe(409)
    expect(pressed.body).toContain(codexHome())
    expect(existsSync(codexHome())).toBe(false)
  })
})

describe('a fresh install, for each runtime', () => {
  it('creates AGENTS.md holding exactly the block, for Codex', async () => {
    mkdirSync(codexHome(), { recursive: true })
    const planned = (await plan()).json() as { codex: { ok: boolean; changed: boolean } }
    expect(planned.codex).toMatchObject({ ok: true, changed: true })

    const pressed = await press(['codex'])
    expect(pressed.statusCode, pressed.body).toBe(200)
    const written = readFileSync(codexAgents(), 'utf8')
    expect(written).toContain('<!-- mole-office:start -->')
    expect(written).toContain('<!-- mole-office:end -->')
    expect(written).toContain('Mole Office')
    expect(written).toContain('GET /api/onboarding')
  })

  it('creates AGENTS.md holding exactly the block, for OpenCode', async () => {
    mkdirSync(opencodeHome(), { recursive: true })
    const pressed = await press(['opencode'])
    expect(pressed.statusCode, pressed.body).toBe(200)
    const written = readFileSync(opencodeAgents(), 'utf8')
    expect(written).toContain('<!-- mole-office:start -->')
    expect(written).toContain('Mole Office')
  })
})

describe('pressed twice', () => {
  it('the second press changes nothing and says so', async () => {
    mkdirSync(codexHome(), { recursive: true })
    await press(['codex'])
    const before = readFileSync(codexAgents(), 'utf8')

    const second = await press(['codex'])
    expect(second.statusCode, second.body).toBe(200)
    const body = second.json() as { codex: { changed: boolean; says: string } }
    expect(body.codex.changed).toBe(false)
    expect(body.codex.says).toContain('write nothing')
    expect(readFileSync(codexAgents(), 'utf8')).toBe(before)
  })
})

describe('an existing file the person already has', () => {
  it('appends the block at the end, backs the file up, and leaves the rest byte-identical', async () => {
    mkdirSync(codexHome(), { recursive: true })
    const original = '# My own notes\n\nAlways run tests before committing.\n'
    writeFileSync(codexAgents(), original, 'utf8')

    const pressed = await press(['codex'])
    expect(pressed.statusCode, pressed.body).toBe(200)
    const written = readFileSync(codexAgents(), 'utf8')
    expect(written).toContain(original.trim())
    expect(written).toContain('<!-- mole-office:start -->')
    expect(written.indexOf(original.trim())).toBeLessThan(written.indexOf('<!-- mole-office:start -->'))
    expect(readFileSync(`${codexAgents()}.mole-office-backup`, 'utf8')).toBe(original)
  })

  it('replaces just the block when an older one is already there', async () => {
    mkdirSync(codexHome(), { recursive: true })
    const stale = '# Notes\n\n<!-- mole-office:start -->\nold text from a previous version\n<!-- mole-office:end -->\n'
    writeFileSync(codexAgents(), stale, 'utf8')

    const pressed = await press(['codex'])
    expect(pressed.statusCode, pressed.body).toBe(200)
    const written = readFileSync(codexAgents(), 'utf8')
    expect(written).toContain('# Notes')
    expect(written).not.toContain('old text from a previous version')
    expect(written).toContain('GET /api/onboarding')
  })
})

describe("Codex's AGENTS.override.md", () => {
  it('refuses the plan and the press, naming the override file, because AGENTS.md would sit unread', async () => {
    mkdirSync(codexHome(), { recursive: true })
    writeFileSync(codexOverride(), '# whatever I want for now\n', 'utf8')

    const planned = (await plan()).json() as { codex: { ok: boolean; says: string } }
    expect(planned.codex.ok).toBe(false)
    expect(planned.codex.says).toContain('AGENTS.override.md')

    const pressed = await press(['codex'])
    expect(pressed.statusCode).toBe(409)
    expect(pressed.body).toContain('AGENTS.override.md')
    expect(existsSync(codexAgents())).toBe(false)
  })
})

describe('CODEX_HOME moves where the Codex half is read from and written to', () => {
  it('reads and writes the directory CODEX_HOME names, not ~/.codex', async () => {
    const moved = mkdtempSync(join(tmpdir(), 'mole-office-codex-home-'))
    process.env.CODEX_HOME = moved
    try {
      const pressed = await press(['codex'])
      expect(pressed.statusCode, pressed.body).toBe(200)
      expect(existsSync(join(moved, 'AGENTS.md'))).toBe(true)
      expect(existsSync(codexAgents())).toBe(false)
    } finally {
      rmSync(moved, { recursive: true, force: true })
    }
  })
})

describe('who may press it', () => {
  it('refuses an agent on the write, naming who may', async () => {
    mkdirSync(codexHome(), { recursive: true })
    const pressed = await press(['codex'], AGENT)
    expect(pressed.statusCode).toBe(403)
    expect(existsSync(codexAgents())).toBe(false)
  })

  it('does not refuse an agent reading the plan, which writes nothing', async () => {
    mkdirSync(codexHome(), { recursive: true })
    const planned = await app.app.inject({
      method: 'GET',
      url: '/api/office/install-the-entry/other-runtimes',
      headers: AGENT,
    })
    expect(planned.statusCode).toBe(200)
  })
})

describe('naming both runtimes when one would be refused', () => {
  it('writes neither: the door is all or nothing', async () => {
    // codex's directory does not exist; opencode's does. Naming both must refuse the whole
    // request rather than writing opencode and refusing codex.
    mkdirSync(opencodeHome(), { recursive: true })
    const pressed = await press(['codex', 'opencode'])
    expect(pressed.statusCode).toBe(409)
    expect(existsSync(opencodeAgents()), 'opencode was written even though codex was refused').toBe(false)
  })
})

describe('a body that does not say which runtimes, or says one that is not real', () => {
  it('is a 400 naming the field, for an empty list', async () => {
    const pressed = await press([])
    expect(pressed.statusCode).toBe(400)
  })

  it('is a 400 naming the field, for a word that is not codex or opencode', async () => {
    const pressed = await press(['claude-code'])
    expect(pressed.statusCode).toBe(400)
  })
})

/**
 * THE PERSON'S FIRST BACKUP IS NEVER WRITTEN OVER (round W26). Until this round every press that changed AGENTS.md
 * copied it to the one backup path, so a second change wrote over the person's first copy.
 */
describe('a later press keeps its own copy, and the first backup stays as it was', () => {
  it('11: keeps the first backup byte for byte through two later presses that each change the file, and names each copy', async () => {
    mkdirSync(codexHome(), { recursive: true })
    const first = '# My own notes\n'
    writeFileSync(codexAgents(), first, 'utf8')
    const res1 = await press(['codex'])
    expect(res1.statusCode, res1.body).toBe(200)
    expect(codexSaid(res1)).toMatchObject({ ok: true, backupPath: firstBackup() })
    expect(codexSaid(res1).says).toBe(`Wrote the Mole Office block into ${codexAgents()}. The file it replaced is backed up at ${firstBackup()}.`)

    // THE FILE IS WRITTEN AGAIN AND THE BLOCK IS GONE, as a hand or another tool can make it go. So each later
    // press adds the block again, and copies the file first.
    const second = '# My own notes, written again\n'
    writeFileSync(codexAgents(), second, 'utf8')
    const res2 = await press(['codex'])
    expect(res2.statusCode, res2.body).toBe(200)
    const third = '# My own notes, written a third time\n'
    writeFileSync(codexAgents(), third, 'utf8')
    const res3 = await press(['codex'])
    expect(res3.statusCode, res3.body).toBe(200)

    expect(readFileSync(firstBackup(), 'utf8'), 'a later press wrote over the first backup').toBe(first)
    expect(readFileSync(laterBackup(2), 'utf8')).toBe(second)
    expect(readFileSync(laterBackup(3), 'utf8')).toBe(third)
    for (const [res, n] of [[res2, 2], [res3, 3]] as const) {
      expect(codexSaid(res)).toMatchObject({ ok: true, changed: true, backupPath: laterBackup(n) })
      expect(codexSaid(res).says).toBe(
        `Wrote the Mole Office block into ${codexAgents()}. The file it replaced is backed up at ${laterBackup(n)}. ` +
          `The first backup, at ${firstBackup()}, was not changed.`,
      )
    }
  })
})

describe('a press that cannot back the file up, or cannot write it', () => {
  it('12: refuses when the copy fails for any reason but a taken name, and writes nothing', async (context) => {
    // A FOLDER THE PRESS MAY NOT WRITE IN. The press makes its copy only where nothing is and takes the next name when
    // one is taken, so only another failure stops it. Root may write in any folder, so run as root this proves nothing.
    if (skippedAsRoot(context)) return
    mkdirSync(codexHome(), { recursive: true })
    const original = '# My own notes\n'
    writeFileSync(codexAgents(), original, 'utf8')
    chmodSync(codexHome(), 0o500)
    let pressed: Awaited<ReturnType<typeof press>>
    try {
      pressed = await press(['codex'])
    } finally {
      chmodSync(codexHome(), 0o700)
    }
    expect(codexSaid(pressed)).toMatchObject({ ok: false, path: firstBackup() })
    // THE REFUSAL IS THE BACKUP'S OWN. A press that went on past a failed copy would be refused at the write, in the
    // same folder, with words that could name the backup's path too.
    expect(codexSaid(pressed).says).toContain(`${codexAgents()} could not be backed up, so nothing was written to it`)
    expect(readFileSync(codexAgents(), 'utf8'), 'AGENTS.md changed although the backup failed').toBe(original)
    expect(existsSync(firstBackup())).toBe(false)
  })

  it('13: takes its own copy away when AGENTS.md cannot be written, and leaves the first backup as it was', async () => {
    // A FOLDER WHERE THE PRESS'S TEMPORARY FILE GOES, so AGENTS.md cannot be written once the copy is made.
    mkdirSync(codexHome(), { recursive: true })
    const first = '# My own notes\n'
    writeFileSync(codexAgents(), first, 'utf8')
    mkdirSync(theTemporaryFile())
    const refusedFirst = codexSaid(await press(['codex']))
    expect(refusedFirst).toMatchObject({ ok: false, path: codexAgents() })
    expect(refusedFirst.says).toContain('could not be written')
    expect(refusedFirst.says).not.toContain('could not be removed')
    expect(readFileSync(codexAgents(), 'utf8')).toBe(first)
    expect(existsSync(firstBackup()), 'a refused first press left a backup').toBe(false)

    rmSync(theTemporaryFile(), { recursive: true })
    expect(codexSaid(await press(['codex'])).ok).toBe(true)
    const changed = '# My own notes, written again\n'
    writeFileSync(codexAgents(), changed, 'utf8')
    mkdirSync(theTemporaryFile())
    const refusedLater = codexSaid(await press(['codex']))
    expect(refusedLater).toMatchObject({ ok: false, path: codexAgents() })
    expect(readFileSync(codexAgents(), 'utf8')).toBe(changed)
    expect(readFileSync(firstBackup(), 'utf8'), 'a refused press wrote over the first backup').toBe(first)
    expect(existsSync(laterBackup(2)), 'a refused press left its copy').toBe(false)
  })

  it('14: says where its copy still is when AGENTS.md cannot be written and the copy cannot be taken away', async (context) => {
    if (skippedAsRoot(context)) return
    mkdirSync(codexHome(), { recursive: true })
    const original = '# My own notes\n'
    writeFileSync(codexAgents(), original, 'utf8')
    const refused = codexSaid(
      await aFolderShutAfterTheCopy({ folder: codexHome(), copy: firstBackup(), temporary: theTemporaryFile() }, () => press(['codex'])),
    )
    expect(refused).toMatchObject({ ok: false, path: codexAgents() })
    expect(refused.says).toContain(`${codexAgents()} could not be written, so nothing changed: `)
    expect(refused.says).toContain(` The copy of it this press made could not be removed, and is still at ${firstBackup()} (`)
    expect(readFileSync(codexAgents(), 'utf8')).toBe(original)
    expect(readFileSync(firstBackup(), 'utf8'), 'the copy the refusal names is not the file as it was').toBe(original)
  })
})
