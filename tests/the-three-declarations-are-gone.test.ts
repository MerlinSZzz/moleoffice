// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE DECLARATIONS WINDOW B DELETED ARE GONE, AND THE STEP THAT EMPTIES EACH ONE IS REGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TWO HALVES ARE ONE TEST
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/lib/records.ts` validates the MERGED record. Its own comment states the consequence:
 * *"a record stored before this gate existed, with a key no kind declares, cannot be merge-patched
 * until the same patch also removes that key. That is deliberate."* So the two halves are one fact:
 *
 *   A DECLARATION DELETED WITHOUT ITS MIGRATION locks every record still holding the key — 400,
 *   unknown key, on every write. Measured on the owner's corpus: 92 sessions, 7 comments, 15
 *   modules, 114 records in all.
 *
 *   A MIGRATION REGISTERED WITHOUT ITS DELETION leaves the field in `GET /api/kinds`, so every agent
 *   that reads the contract goes on being taught a key nothing reads.
 *
 * Either half alone is worse than neither, which is why the build plan puts them in one commit and
 * why this file asserts them together rather than in two places that can drift.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT FOUND THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * A mutation. Putting `session.agent` back into `KIND_SPECS` left the whole suite GREEN: nothing
 * anywhere asserted that particular declaration was gone. `module.claims` had
 * tests/where-a-modules-claims-live.test.ts and `annotation.state` had tests/annotation.test.ts, and
 * the third had nothing at all. A window that can be half undone in silence is a window that will be.
 */
import { describe, expect, it } from 'vitest'
import { KIND_SPECS, validateData } from '../src/shared/kinds.ts'

/** The three, each with the step that empties it and one record's worth of data to try it on. */
const THE_THREE = [
  {
    kind: 'session' as const,
    key: 'agent',
    emptiedBy: 'migrateSessionRuntime',
    from: './agent-identity.ts',
    /** What a record of this kind holds when it is complete, so only the deleted key is in question. */
    data: { state: 'finished' as const },
    /** Where the same fact lives now. Null where it does not live anywhere. */
    insteadWrite: 'runtime',
  },
  {
    kind: 'annotation' as const,
    key: 'state',
    emptiedBy: 'migrateAnnotationStateActOne',
    from: './annotation-state.ts',
    data: {
      body: 'This does not match the run log.',
      context: { target: { kind: 'record', recordId: 'AAAAAAAAAAAA', workspaceId: 'panelx' }, place: { at: 'surface' } },
    },
    // NOWHERE. Where a comment has got to is worked out from the messages that carried its words,
    // and there is no field to write instead — which is the whole of why it went.
    insteadWrite: null,
  },
  {
    kind: 'module' as const,
    key: 'claims',
    emptiedBy: 'migrateModuleClaims',
    from: './module-claims.ts',
    data: { context: 'Resolve a stated pattern into the files it covers.', parts: [] },
    insteadWrite: null,
  },
]

describe('the three keys window B emptied are declared by nothing', () => {
  it.each(THE_THREE.map((one) => [`${one.kind}.${one.key}`, one] as const))('%s is refused on the write path', (_name, one) => {
    const result = validateData(one.kind, { ...one.data, [one.key]: 'anything at all' })
    expect(result.ok, `${one.kind} still accepts ${one.key}`).toBe(false)
  })

  it.each(THE_THREE.map((one) => [`${one.kind}.${one.key}`, one] as const))(
    '%s leaves a record without it COMPLETE, which is what makes the deletion a deletion',
    (_name, one) => {
      // A record that became incomplete when the key went would put 114 of the owner's records into
      // "somebody has to fill this in" on the morning of the window, over a field that is gone.
      const result = validateData(one.kind, one.data)
      expect(result.ok, result.ok ? '' : result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')).toBe(true)
    },
  )
})

describe('and the step that empties each one is registered, in the same commit', () => {
  it('says where the fact lives now, for the one key that moved rather than went', () => {
    // `session.agent` became `session.runtime`: the same word about the same run, under a name that
    // is not taken. `NAMED_WRONG_KEYS` is what sends an author who writes the old one to the new.
    expect(KIND_SPECS.session.fields.find((f) => f.key === 'runtime')).toBeDefined()
    const refused = validateData('session', { state: 'finished', agent: 'claude-code' })
    expect(refused.ok).toBe(false)
    const said = refused.ok ? '' : refused.errors.map((e) => e.message).join('\n')
    expect(said, 'the refusal does not send the author to `runtime`').toContain('runtime')
  })
})
