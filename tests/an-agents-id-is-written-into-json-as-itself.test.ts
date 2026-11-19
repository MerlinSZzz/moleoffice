// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S ID AND HANDLE ARE WRITTEN INTO A SESSION'S JSON AS THEMSELVES. Wave 13j, item 0.
 *
 * The profile reads only the sessions whose stored text could name the agent: SQLite looks for the id inside the text of
 * `ranAs`. Which of those sessions are the agent's is then decided in JavaScript, by `ranAsIn`, as before. That keeps
 * every session that names the agent only if the id is in the stored text as itself. JSON writes some characters as an
 * escape (a quote as \", a newline as \n), and two writers may write one character as two different escapes. An id with
 * such a character could be stored in a form the search does not find, and its run would be left out with nothing
 * failing. `servingAgentId` is read with `json_extract`, which undoes the escapes, so a comparison of it with the
 * registry id does not rely on this. It is checked here too, so both keys a run names its agent by are covered.
 *
 * WHAT THIS HOLDS:
 *   1. no character an office id or a handle can hold is written as an escape, by JSON.stringify or by SQLite. The ids
 *      are an agent record's id and a registry id, made by `anOfficeId` or worked out from a hash by `anIdFromAHash`, and
 *      a registry id made before ids were minted is the agent's handle. Every character the handle rule accepts is
 *      tried, and the characters of ids those two makers drew;
 *   2. both keys as either writer stores them: an id of every id character and a handle of every handle character are
 *      found as themselves in the text of `ranAs`, and `servingAgentId` reads back equal to the registry id.
 *
 * CONTROL: a guard, green before and after the narrowing. It cannot be red before the change, because nothing changed
 * what an id or a handle may hold. It goes red if the handle rule or an id maker lets in a character JSON escapes, such
 * as a quote, a backslash or a control character. Then the narrowings in `theAgentsRuns` (src/server/lib/agent-runs.ts)
 * and `sessionRecordsThatCouldBeOf` (src/server/lib/presence.ts) must be changed before such an id is allowed.
 *
 * The ids and handles here are made up for this file and stand for nothing.
 */
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { urlAlphabet } from 'nanoid'
import { freshDb, type TestDb } from './helpers.ts'
import { anOfficeId } from '../src/server/lib/ids.ts'
import { anIdFromAHash } from '../src/server/lib/hash-id.ts'
import { whyHandleIsRefused } from '../src/shared/participants.ts'

/** How many ids each maker draws for the characters they use. */
const DRAWS = 2000

let t: TestDb

/** Every UTF-16 code unit the handle rule accepts in the middle of a handle. */
function everyHandleCharacter(): string[] {
  const accepted: string[] = []
  for (let code = 0; code <= 0xffff; code++) {
    const one = String.fromCharCode(code)
    if (whyHandleIsRefused(`a${one}a`) === null) accepted.push(one)
  }
  return accepted
}

/** Every character in the ids the two id makers drew, and in nanoid's own alphabet. */
function everyIdCharacter(): string[] {
  const seen = new Set<string>(urlAlphabet)
  for (let i = 0; i < DRAWS; i++) {
    for (const one of anOfficeId()) seen.add(one)
    for (const one of anIdFromAHash(randomBytes(32))) seen.add(one)
  }
  return [...seen].sort()
}

beforeAll(async () => {
  t = await freshDb()
})

afterAll(() => {
  t?.close()
})

describe('an agent’s id and handle in a session’s JSON', () => {
  it('1. hold no character JSON.stringify or SQLite writes as an escape', () => {
    const handles = everyHandleCharacter()
    const ids = everyIdCharacter()
    // THE CHARACTERS WERE FOUND, or the checks below would hold for nothing.
    expect(handles.length, 'the handle rule accepts no character at all').toBeGreaterThan(10)
    expect(ids.length, 'the id makers drew no character at all').toBeGreaterThan(10)
    const quote = t.client.sqlite.prepare('SELECT json_quote(?) AS text')
    const escaped: string[] = []
    for (const [whose, characters] of [['a handle', handles], ['an id', ids]] as const) {
      for (const one of characters) {
        const asJson = JSON.stringify(one)
        const bySqlite = (quote.get(one) as { text: string }).text
        if (asJson !== `"${one}"` || bySqlite !== `"${one}"`) escaped.push(`${whose} may hold U+${one.charCodeAt(0).toString(16).padStart(4, '0')}, written ${asJson} and ${bySqlite}`)
      }
    }
    expect(escaped).toEqual([])
  })

  it('2. are found as themselves in `ranAs` and read back from `servingAgentId`, as either writer stores them', () => {
    const anId = everyIdCharacter().join('')
    const aHandle = everyHandleCharacter().join('')
    const byJavaScript = (agentId: string, servingAgentId: string): string =>
      JSON.stringify({ state: 'finished', ranAs: [{ workspaceId: 'default', agentId }], servingAgentId })
    const bySqlite = t.client.sqlite.prepare(
      "SELECT json_set('{}', '$.ranAs', json_array(json_object('workspaceId', 'default', 'agentId', ?)), '$.servingAgentId', ?) AS data",
    )
    const read = t.client.sqlite.prepare(
      "SELECT instr(json_extract(?, '$.ranAs'), ?) > 0 AS found, json_extract(?, '$.servingAgentId') = ? AS same",
    )
    for (const [what, agentId, servingAgentId] of [['an id of every id character', anId, anId], ['a handle of every handle character', aHandle, aHandle]] as const) {
      for (const [writer, data] of [
        ['JSON.stringify', byJavaScript(agentId, servingAgentId)],
        ['SQLite', (bySqlite.get(agentId, servingAgentId) as { data: string }).data],
      ] as const) {
        const row = read.get(data, agentId, data, servingAgentId) as { found: number; same: number }
        expect(row.found, `${what}, written by ${writer}, is in the text of ranAs as itself`).toBe(1)
        expect(row.same, `${what}, written by ${writer}, reads back from servingAgentId`).toBe(1)
      }
    }
  })
})
