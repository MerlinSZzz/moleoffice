// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT CANNOT ACCEPT ITS OWN GUESS, AND A GUESS THAT WAS ACCEPTED STILL SAYS IT WAS ONE.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO CLAIMS THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A.4 ends with *"An LLM guess must not silently become canonical ownership."* Four of the five
 * mechanisms that hold it are structural and are pinned in `implementation-map-boundary.test.ts`.
 * The fifth is a gate, and this file drives it: an agent proposes, then the same agent tries to
 * accept, and is refused. The mutation is removing the human-only clause from
 * `assertMayAcceptAGuess`, and the acceptance then returns a row whose authority is `stated`.
 *
 * The second claim is what survives an acceptance. `provenance` is NOT altered, so the corpus keeps
 * both facts — an agent proposed this, and a named person accepted it on a named day. A read of an
 * accepted row must never say *the person declared this*, because the owner did not.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

type Implementation = typeof import('../src/server/lib/implementation.ts')
type Repositories = typeof import('../src/server/lib/repositories.ts')

let t: TestDb
let map: Implementation
let repos: Repositories
const madeDirs: string[] = []

const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.name, stated: true } as const
const NOBODY = { type: 'human', id: THE_TEST_OFFICES_OWNER.name, stated: false } as const
const ANOTHER_AGENT = { type: 'agent', id: 'other-agent', sessionId: 'sess-two' } as const

let repositoryId: string
let moduleId: string
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  // The libraries' own module instances, imported after `freshDb` resets the module registry.
  map = await import('../src/server/lib/implementation.ts')
  repos = await import('../src/server/lib/repositories.ts')
}, 60_000)

afterAll(() => t.close())

beforeEach(() => {
  caseNumber += 1
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-map-')))
  madeDirs.push(dir)
  // Each case gets its own repository and its own module, so no reading names a row another wrote.
  repositoryId = repos.registerRepository({
    workspaceId: 'default',
    name: `panelx-case-${String(caseNumber)}`,
    root: dir,
    actor: PERSON,
  }).id
  moduleId = t.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title: 'the write path',
    actor: PERSON,
  }).id
})

afterEach(() => {
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** One proposed relationship, made by an agent, the way the accept path meets them. */
function aGuess(by: typeof AGENT = AGENT): string {
  return map.declareRelationship({
    workspaceId: 'default',
    recordId: moduleId,
    repositoryId,
    pattern: 'src/server/lib/records.ts',
    proposing: true,
    actor: by,
  }).row.id
}

// ============================================================ declaring

describe('declaring a relationship', () => {
  it('writes it, attributes it, and says what it covers now', () => {
    const out = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/server/lib',
      actor: PERSON,
    })
    expect(out.row.provenance).toBe('declared')
    expect(out.row.authority).toBe('stated')
    expect(out.row.statedBy).toBe(`human:${THE_TEST_OFFICES_OWNER.name}`)
    // The repository has never been rebuilt under its own id, so Mole Office cannot say what the pattern
    // covers — and that is not the same as it covering nothing.
    expect(out.indexBuilt).toBe(false)
    expect(out.note).toContain('has no index of its own yet')
  })

  it('appends one change row against the record, because it happened to that record', () => {
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/server/lib',
      actor: PERSON,
    })
    const change = t.client.sqlite
      .prepare("SELECT field, new_value FROM changes WHERE record_id = ? AND field LIKE 'implementation%'")
      .get(moduleId) as { field: string; new_value: string } | undefined
    expect(change?.field).toBe('implementation.implements')
    expect(change?.new_value).toBe('src/server/lib')
  })

  it('lets an agent state a fact as well as propose a guess', () => {
    const stated = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      actor: AGENT,
    })
    expect(stated.row.provenance).toBe('declared')
    expect(stated.row.authority).toBe('stated')
    const guessed = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/b.ts',
      proposing: true,
      actor: AGENT,
    })
    expect(guessed.row.provenance).toBe('llm')
    expect(guessed.row.authority).toBe('guessed')
  })

  it('refuses a person marking their own statement as a machine guess', () => {
    expect(() =>
      map.declareRelationship({
        workspaceId: 'default',
        recordId: moduleId,
        repositoryId,
        pattern: 'src/a.ts',
        proposing: true,
        actor: PERSON,
      }),
    ).toThrow(/there is nobody to accept it/)
  })

  it('refuses an absolute path with the sentence the one matcher already writes', () => {
    expect(() =>
      map.declareRelationship({
        workspaceId: 'default',
        recordId: moduleId,
        repositoryId,
        pattern: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/src`,
        actor: PERSON,
      }),
    ).toThrow(/absolute path/)
  })

  /**
   * THE REFUSAL IS READ BY A PERSON, SO IT IS PUNCTUATED LIKE ONE SENTENCE AND SAYS EACH THING ONCE.
   *
   * Found by typing an absolute path into Add code in a browser on 26 August 2026. The refusal read
   * "…outside this repository.. Nothing was written. A pattern is written relative to the repository
   * — …" — two full stops together, and the instruction about relative paths twice, because the
   * caller appended both unconditionally to a message `claimProblem` had already punctuated and
   * already explained.
   */
  it('never doubles a full stop and never says the same thing twice in one refusal', () => {
    const write = (pattern: string) => () =>
      map.declareRelationship({
        workspaceId: 'default',
        recordId: moduleId,
        repositoryId,
        pattern,
        actor: PERSON,
      })

    for (const pattern of [`${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/src`, 'src\\web', '../other/src']) {
      let said = ''
      try {
        write(pattern)()
      } catch (err) {
        said = err instanceof Error ? err.message : String(err)
      }
      expect(said, pattern).not.toBe('')
      // A LETTER, THEN TWO STOPS, THEN A SPACE — the shape the doubling made
      // ("…outside this repository.. Nothing was written."). A bare `..` is not the fault: the
      // pattern `../other/src` is quoted back, and so is the `".."` the refusal names by hand.
      expect(said, `${pattern}: two full stops together`).not.toMatch(/[A-Za-z]\.\.(\s|$)/)
      const advice = said.split('relative to the repository').length - 1
      expect(advice, `${pattern}: the relative-path advice appears ${advice} times`).toBeLessThanOrEqual(1)
      expect(said, pattern).toContain('Nothing was written.')
    }
  })

  it('refuses a kind that does not own code, naming the kind', () => {
    const problem = t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'the arm droops',
      actor: PERSON,
    })
    expect(() =>
      map.declareRelationship({
        workspaceId: 'default',
        recordId: problem.id,
        repositoryId,
        pattern: 'src/a.ts',
        actor: PERSON,
      }),
    ).toThrow(/is a problem, and a relationship to code is about a structural thing/)
  })

  it('refuses a relation word it has no meaning for, and says why depends_on is absent', () => {
    expect(() =>
      map.declareRelationship({
        workspaceId: 'default',
        recordId: moduleId,
        repositoryId,
        pattern: 'src/a.ts',
        relation: 'depends_on',
        actor: PERSON,
      }),
    ).toThrow(/no "depends_on"/)
  })

  it('refuses an exact repeat and names the row that is already there', () => {
    const first = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      actor: PERSON,
    })
    expect(() =>
      map.declareRelationship({
        workspaceId: 'default',
        recordId: moduleId,
        repositoryId,
        pattern: 'src/a.ts',
        actor: PERSON,
      }),
    ).toThrow(new RegExp(first.row.id))
  })

  it("lets a person's statement and an agent's guess about one pattern coexist", () => {
    const guess = aGuess()
    // The agent's guess is there; a SECOND agent stating the same pattern as a fact is a different
    // row, because the unique index includes the provenance.
    const stated = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/server/lib/records.ts',
      actor: ANOTHER_AGENT,
    })
    expect(stated.row.id).not.toBe(guess)
    expect(map.statedFor(moduleId, 'default').length).toBe(2)
  })

  it("sends a person restating an agent's un-answered guess to the accept route instead", () => {
    const guess = aGuess()
    expect(() =>
      map.declareRelationship({
        workspaceId: 'default',
        recordId: moduleId,
        repositoryId,
        pattern: 'src/server/lib/records.ts',
        actor: PERSON,
      }),
    ).toThrow(new RegExp(`ACCEPT IT INSTEAD.*${guess}`, 's'))
  })
})

// ============================================================ the gate

describe('only a person may accept a guess', () => {
  // THE CONTROL. Every refusal below is "this returns 403", which is trivially satisfied by an
  // accept that never works at all. So the act is shown working first.
  it('lets a person accept one', () => {
    const id = aGuess()
    const out = map.acceptGuess(id, 'default', PERSON)
    expect(out.row.authority).toBe('stated')
    expect(out.row.acceptedBy).toBe(`human:${THE_TEST_OFFICES_OWNER.name}`)
  })

  it('refuses the agent that made it', () => {
    const id = aGuess()
    expect(() => map.acceptGuess(id, 'default', AGENT)).toThrow(/came from agent "claude-code"/)
    expect(map.statedById(id, 'default')?.authority).toBe('guessed')
  })

  it('refuses a DIFFERENT agent too, because it is the act and not the author that is reserved', () => {
    const id = aGuess()
    expect(() => map.acceptGuess(id, 'default', ANOTHER_AGENT)).toThrow(/came from agent "other-agent"/)
  })

  it('refuses a request that named nobody', () => {
    const id = aGuess()
    expect(() => map.acceptGuess(id, 'default', NOBODY)).toThrow(/sent no actor headers/)
  })

  it('keeps both facts: an agent proposed this, a person accepted it', () => {
    const id = aGuess()
    const out = map.acceptGuess(id, 'default', PERSON)
    // THE PROVENANCE IS UNTOUCHED. A read of this row must never say the person declared it.
    expect(out.row.provenance).toBe('llm')
    expect(out.row.statedBy).toBe('agent:claude-code')
    expect(out.note).toContain('will never say you declared it')
  })

  it('refuses to accept something already stated, because there is nothing to accept', () => {
    const stated = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      actor: PERSON,
    })
    expect(() => map.acceptGuess(stated.row.id, 'default', PERSON)).toThrow(/already stated/)
  })

  it('says what a findings id is rather than answering no such row', () => {
    t.client.sqlite
      .prepare(
        'INSERT INTO implementation_findings (id, workspace_id, record_id, repository_id, path, relation, provenance, evidence_path, evidence_detail, built_at) ' +
          "VALUES ('finding1', 'default', ?, ?, 'src/a.ts', 'implements', 'imports', 'src/b.ts', './a.ts', '2026-08-25 10:00:00')",
      )
      .run(moduleId, repositoryId)
    expect(() => map.acceptGuess('finding1', 'default', PERSON)).toThrow(/a row a resolver worked out/)
  })
})

// ============================================================ retiring

describe("an agent may not delete what a person stated", () => {
  it('refuses, and names the row to write instead', () => {
    const stated = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      actor: PERSON,
    })
    expect(() => map.retireRelationship(stated.row.id, 'default', AGENT)).toThrow(/WHAT TO DO INSTEAD/)
    expect(map.statedFor(moduleId, 'default').length).toBe(1)
  })

  it('lets an agent delete a row it stated itself', () => {
    const own = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      actor: AGENT,
    })
    map.retireRelationship(own.row.id, 'default', AGENT)
    expect(map.statedFor(moduleId, 'default')).toEqual([])
  })

  it('is a soft delete, so the row keeps its author and its date', () => {
    const own = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      actor: AGENT,
    })
    map.retireRelationship(own.row.id, 'default', AGENT)
    const after = map.statedById(own.row.id, 'default')
    expect(after?.deletedAt).not.toBeNull()
    expect(after?.statedBy).toBe('agent:claude-code')
  })
})

// ============================================================ code revisions

describe('a code revision is stored and never resolved', () => {
  it('keeps the string the caller supplied', () => {
    const revision = map.recordRevision({
      workspaceId: 'default',
      repositoryId,
      ref: '9f3c1ab',
      label: 'R42',
      note: 'the build the arm ran',
      actor: PERSON,
    })
    expect(revision.ref).toBe('9f3c1ab')
    expect(map.listRevisions(repositoryId, 'default').map((r) => r.ref)).toEqual(['9f3c1ab'])
  })

  it('has no column saying whether it is a commit, a tag or a branch', () => {
    const columns = t.client.sqlite
      .prepare("SELECT name FROM pragma_table_info('implementation_revisions')")
      .all() as { name: string }[]
    // Those are Git's words and Mole Office cannot check any of them. A caller who wants to say what it
    // is writes it in `note`.
    expect(columns.map((c) => c.name)).not.toContain('kind')
    expect(columns.map((c) => c.name)).toContain('note')
  })

  it('refuses a second row for one string, because it cannot tell two spellings apart', () => {
    map.recordRevision({ workspaceId: 'default', repositoryId, ref: '9f3c1ab', actor: PERSON })
    expect(() => map.recordRevision({ workspaceId: 'default', repositoryId, ref: '9f3c1ab', actor: PERSON })).toThrow(
      /already recorded/,
    )
  })

  it('lets a relationship be stated as of one, and refuses one that is not there', () => {
    const revision = map.recordRevision({ workspaceId: 'default', repositoryId, ref: '9f3c1ab', actor: PERSON })
    const out = map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      revisionId: revision.id,
      actor: PERSON,
    })
    expect(out.row.revisionId).toBe(revision.id)
    expect(() =>
      map.declareRelationship({
        workspaceId: 'default',
        recordId: moduleId,
        repositoryId,
        pattern: 'src/b.ts',
        revisionId: 'nosuchrev',
        actor: PERSON,
      }),
    ).toThrow(/No code revision/)
  })
})
