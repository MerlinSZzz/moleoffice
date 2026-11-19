// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK TOOL HANDS ITS MODEL THE LINKS A RECORDS SEAL PINNED (round BM, item 2aq; problem SAiQqT0kMD_Z).
 *
 * The tool wrote each record for its model as the `record` of the office's reply, and no link, so a check of a records
 * seal had no link evidence to read. Now, when the office's reading names the links the seal pinned, the tool writes
 * that reading into a file beside the records, says so in one line, and names the file to the prompt door and to the
 * stored assembly. An office whose reading names no such links is said to in one line, and nothing is guessed.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --dry against tests/inspector-tool-fixture.ts, a labelled
 * stand-in office whose reading this file sets. Every seal and link here is synthetic. No model runs and no live office
 * is reached.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, each after a control run:
 *   - the tool writes no file of links: the first case;
 *   - the tool guesses links for a reading that names none: the second case;
 *   - the tool says an old seal's check reads link evidence: the third case.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const THE_FILE = 'links.pinned-by-the-seal.json'
const A_SEAL = 'synthSealAAA'
const A_REPORT = 'synthReportA'

/** The office's reading of two pinned links, one held as sealed and one the office no longer holds. Synthetic. */
const THE_PINNED_LINKS = {
  links: [
    {
      id: 'synthLinkAAA',
      standing: 'as sealed',
      inferredAtTheSeal: false,
      now: { type: 'about', from: A_REPORT, to: 'fixture-run', createdAt: '2026-10-30 09:00:00', createdBy: 'a-synthetic-worker', createdByType: 'agent', inferred: false },
    },
    { id: 'synthLinkBBB', standing: 'no longer held', inferredAtTheSeal: true, now: null },
  ],
  says: 'Synthetic: the stand-in office says the seal pinned 2 links.',
}

function aRecordsSeal(f: Fixture, pinsLinks: boolean): void {
  f.state.submission = {
    id: A_SEAL,
    seal: {
      kind: 'records',
      hash: 'a'.repeat(64),
      git: null,
      records: { records: [], dependencies: [], ...(pinsLinks ? { links: THE_PINNED_LINKS.links.map(({ id, inferredAtTheSeal }) => ({ id, hash: 'b'.repeat(64), inferred: inferredAtTheSeal })) } : {}) },
    },
  }
}

const theRecordsFolderOf = (f: Fixture, check: string): string => join(f.home, '.cache/mole-office/worktrees', `a-check-of-${f.run}-${check}-records`)
const bodyOf = (f: Fixture, door: string): Record<string, any> | undefined => f.state.writes.find((one) => one.path === `/api/checks/${f.run}/${door}`)?.body

describe('the check tool and the links a records seal pinned', () => {
  it('writes the reading of the pinned links beside the records, names the file to both doors, and says so in one line', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const check = aMadeUpCheckSession()
    aRecordsSeal(f, true)
    Object.assign(f.state.reading, { pinnedLinks: THE_PINNED_LINKS })
    const file = join(theRecordsFolderOf(f, check), THE_FILE)
    let written: unknown = null
    f.state.onPrompt = async () => {
      written = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : 'no file'
    }
    const ran = await f.inspect(['--check', check])
    expect(ran.code, ran.err).toBe(0)
    expect(written, 'the file holds the reading as the office gave it').toEqual(THE_PINNED_LINKS)
    expect(bodyOf(f, 'prompt')?.['pinnedLinksFile']).toBe(file)
    expect(bodyOf(f, 'assembled')?.['pinnedLinksFile']).toBe(file)
    expect(ran.out).toContain(`Wrote the 2 links the seal pinned into ${file}, for the model to read.\n`)
    expect(bodyOf(f, 'assembled')?.['read']?.['says']).toContain('This check reads the pinned record revisions and link evidence in the sealed manifest.')
  })

  it('says in one line that an office whose reading names no pinned links gave it none, and writes no file and names none', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const check = aMadeUpCheckSession()
    aRecordsSeal(f, true)
    let inTheFolder: string[] = []
    f.state.onPrompt = async () => {
      inTheFolder = readdirSync(theRecordsFolderOf(f, check))
    }
    const ran = await f.inspect(['--check', check])
    expect(ran.code, ran.err).toBe(0)
    expect(inTheFolder).not.toContain(THE_FILE)
    expect(bodyOf(f, 'prompt')).not.toHaveProperty('pinnedLinksFile')
    expect(bodyOf(f, 'assembled')).not.toHaveProperty('pinnedLinksFile')
    const said = `The office's reading of seal ${A_SEAL} does not say which links the seal pinned, so the tool wrote no file of links for the model.\n`
    expect(ran.out).toContain(said)
    expect(ran.out.split(said)).toHaveLength(2)
  })

  it('says an old seal was made before seals pinned links, writes no file for it, and claims no link evidence', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const check = aMadeUpCheckSession()
    aRecordsSeal(f, false)
    Object.assign(f.state.reading, { pinnedLinks: { links: null, says: 'Synthetic: the stand-in office says this seal was made before seals pinned links.' } })
    let inTheFolder: string[] = []
    f.state.onPrompt = async () => {
      inTheFolder = readdirSync(theRecordsFolderOf(f, check))
    }
    const ran = await f.inspect(['--check', check])
    expect(ran.code, ran.err).toBe(0)
    expect(inTheFolder).not.toContain(THE_FILE)
    expect(bodyOf(f, 'prompt')).not.toHaveProperty('pinnedLinksFile')
    expect(ran.out).toContain('The tool wrote no file of links for the model, because this seal was made before seals pinned links.\n')
    const says = String(bodyOf(f, 'assembled')?.['read']?.['says'])
    expect(says).toContain('This check reads the pinned record revisions in the sealed manifest; this seal was made before seals pinned links.')
    expect(says).not.toContain('link evidence')
  })

  it('reads a git seal as before: no file of links, no field, and no line about links', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.submission = { id: A_SEAL, seal: { kind: 'git', hash: 'a'.repeat(64), git: { directory: f.checkout, commit: f.git('rev-parse', 'HEAD'), forkBase: f.base }, records: null } }
    const check = aMadeUpCheckSession()
    let inTheFolder: string[] = []
    f.state.onPrompt = async () => {
      inTheFolder = readdirSync(theRecordsFolderOf(f, check))
    }
    const ran = await f.inspect(['--check', check])
    expect(ran.code, ran.err).toBe(0)
    expect(inTheFolder).toEqual([])
    expect(bodyOf(f, 'prompt')).not.toHaveProperty('pinnedLinksFile')
    expect(bodyOf(f, 'assembled')).not.toHaveProperty('pinnedLinksFile')
    expect(ran.out).not.toContain('the seal pinned')
    expect(ran.out).not.toContain('seals pinned links')
  })
})
