// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY CHANGE A NAME, A PICTURE AND A STATE, and what the refusal says when they may not.
 *
 * Criterion M3 of design/messages/ACCEPTANCE.md: *A person may upload their own and
 * may change any agent's avatar and name; an agent is given a default when it first sends a message
 * and may change only its own*. And criterion M4 for
 * the state: *A participant's state is short text they set themselves.*
 *
 * EVERY REFUSAL HERE IS CHECKED FOR ITS SENTENCE AND NOT ONLY FOR ITS NUMBER. A 403 that says
 * nothing leaves the caller to guess which of three rules they met.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { STATE_MAX, defaultAvatarAssetId, type ParticipantRef } from '../src/shared/participants.ts'

type RegistryLib = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let registry: RegistryLib

const HUMAN = { type: 'human', id: THE_PERSON } as const
const OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }

// THE TWO AGENTS BY REGISTRY ID, read back after they register. The library's setters take the id a
// door has already resolved, and a new agent's id is minted, so it is not its handle.
let AGENT_X: ParticipantRef = { kind: 'agent', id: '' }
let AGENT_Y: ParticipantRef = { kind: 'agent', id: '' }

beforeEach(async () => {
  t = await freshDb()
  registry = await import('../src/server/lib/participants.ts')
  // Two durable agents, through the product's own door, which is what registers them.
  for (const [title, handle] of [
    ['Builder X', 'builder-x'],
    ['Builder Y', 'builder-y'],
  ]) {
    t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'agent',
      title: title ?? '',
      data: { handle, runtime: 'claude-code', state: 'active' },
      actor: HUMAN,
    })
  }
  const idOf = (handle: string): string =>
    (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  AGENT_X = { kind: 'agent', id: idOf('builder-x') }
  AGENT_Y = { kind: 'agent', id: idOf('builder-y') }
})

afterEach(() => {
  t.close()
})


/** What the call threw, or a failure saying it threw nothing. */
function refusalFrom(fn: () => unknown): { status: number; message: string } {
  try {
    fn()
  } catch (err) {
    const status = (err as { status?: number }).status ?? 0
    return { status, message: err instanceof Error ? err.message : String(err) }
  }
  throw new Error('the call was allowed, and this test is about it being refused')
}

// ============================================================================ names

describe('a name is a person to give', () => {
  it('lets a person change any agent name, which is what the owner\'s words ask for', () => {
    registry.setParticipantName(AGENT_X, 'The one that reads code', OWNER)

    expect(registry.readParticipant(AGENT_X)?.name).toBe('The one that reads code')
  })

  it('lets a person change their own', () => {
    registry.setParticipantName(OWNER, `${THE_TEST_OFFICES_OWNER.name} Q`, OWNER)

    expect(registry.readParticipant(OWNER)?.name).toBe(`${THE_TEST_OFFICES_OWNER.name} Q`)
  })

  it('refuses an agent changing its own name, and says whose it is to change', () => {
    const refusal = refusalFrom(() => {
      registry.setParticipantName(AGENT_X, 'Something I chose myself', AGENT_X)
    })

    expect(refusal.status).toBe(403)
    expect(refusal.message).toContain('An agent may change its own')
    expect(registry.readParticipant(AGENT_X)?.name, 'the refusal wrote the name anyway').toBe('Builder X')
  })

  it('refuses an agent changing another agent name', () => {
    const refusal = refusalFrom(() => {
      registry.setParticipantName(AGENT_Y, 'Renamed by somebody else', AGENT_X)
    })

    expect(refusal.status).toBe(403)
    expect(registry.readParticipant(AGENT_Y)?.name).toBe('Builder Y')
  })

  it('refuses an empty name with the reason, rather than storing one nobody can read', () => {
    const refusal = refusalFrom(() => {
      registry.setParticipantName(AGENT_X, '   ', OWNER)
    })

    expect(refusal.status).toBe(400)
    expect(refusal.message).toContain('cannot be empty')
  })
})

// ============================================================================ pictures

describe('a picture is a person to give, and an agent may change its own', () => {
  it('lets an agent change its own', () => {
    const mine = defaultAvatarAssetId({ kind: 'person', id: THE_PERSON })

    registry.setParticipantAvatar(AGENT_X, mine, AGENT_X)

    expect(registry.readParticipant(AGENT_X)?.avatarAssetId).toBe(mine)
  })

  it('refuses an agent changing another agent picture, and says so in one sentence', () => {
    const before = registry.readParticipant(AGENT_Y)?.avatarAssetId

    const refusal = refusalFrom(() => {
      registry.setParticipantAvatar(AGENT_Y, defaultAvatarAssetId(AGENT_X), AGENT_X)
    })

    expect(refusal.status).toBe(403)
    expect(refusal.message).toContain("no other agent's")
    expect(registry.readParticipant(AGENT_Y)?.avatarAssetId).toBe(before)
  })

  it('lets a person change any agent picture', () => {
    const mine = defaultAvatarAssetId({ kind: 'person', id: THE_PERSON })

    registry.setParticipantAvatar(AGENT_Y, mine, OWNER)

    expect(registry.readParticipant(AGENT_Y)?.avatarAssetId).toBe(mine)
  })

  it('refuses a picture nothing answers to, and leaves the one that is there', () => {
    const before = registry.readParticipant(AGENT_X)?.avatarAssetId

    const refusal = refusalFrom(() => {
      registry.setParticipantAvatar(AGENT_X, 'no-such-picture', OWNER)
    })

    expect(refusal.status).toBe(404)
    expect(refusal.message).toContain('Nothing was written')
    expect(registry.readParticipant(AGENT_X)?.avatarAssetId).toBe(before)
  })
})

// ============================================================================ states

/**
 * A PERSON'S LINE IS THEIR OWN; AN AGENT'S IS ITS OWN OR THE OWNER'S, SINCE 4 SEPTEMBER 2026.
 *
 * This block used to prove one rule for both — a state is set by whoever it is about and by nobody
 * else. Decision `lUh6uis7oB6z` splits it: the person keeps the power to set it, but the line is a
 * mark like reporting or working, not offline or online. The line is a working mark, and marking what an agent is doing is
 * a thing the person running the work does. Criterion M21.
 *
 * WHAT DID NOT CHANGE, and is still proved below: a person's own line is theirs alone, and one agent
 * still cannot write on another. Both used to refuse with the same sentence; each now refuses with
 * its own, saying which rule it is.
 */
describe('a person writes their own line, and an agent line is its own or the owner\'s', () => {
  it('lets a person set their own, and keeps the moment they set it', () => {
    registry.setParticipantState(OWNER, 'writing the messages cluster', OWNER)

    const held = registry.readParticipant(OWNER)
    expect(held?.state).toBe('writing the messages cluster')
    expect(held?.stateAt, 'a state with no time on it cannot be read as recent or stale').not.toBeNull()
  })

  it('lets an agent set its own', () => {
    registry.setParticipantState(AGENT_X, 'reading the migration tests', AGENT_X)

    expect(registry.readParticipant(AGENT_X)?.state).toBe('reading the migration tests')
  })

  it('lets a person write an agent line, and writes down that it was theirs', () => {
    registry.setParticipantState(AGENT_X, 'holding the wrist camera rig', OWNER)

    const held = registry.readParticipant(AGENT_X)
    expect(held?.state).toBe('holding the wrist camera rig')
    expect(held !== null && 'stateBy' in held ? held.stateBy : null).toEqual(OWNER)
  })

  it('says the agent set its own when the agent did', () => {
    registry.setParticipantState(AGENT_X, 'reading the migration tests', AGENT_X)

    const held = registry.readParticipant(AGENT_X)
    expect(held !== null && 'stateBy' in held ? held.stateBy : null).toEqual(AGENT_X)
  })

  it('refuses a person setting another person line, because that one is still their own', () => {
    const refusal = refusalFrom(() => {
      registry.setParticipantState(OWNER, 'busy, somebody else decided', AGENT_X)
    })

    expect(refusal.status).toBe(403)
    expect(refusal.message).toContain('theirs to write')
  })

  it('refuses one agent writing on another', () => {
    const refusal = refusalFrom(() => {
      registry.setParticipantState(AGENT_X, 'busy, another agent decided', { kind: 'agent', id: 'agent-y' })
    })

    expect(refusal.status).toBe(403)
    expect(refusal.message).toContain('no other')
  })

  it('clears who set it along with the line', () => {
    registry.setParticipantState(AGENT_X, 'holding the rig', OWNER)
    registry.setParticipantState(AGENT_X, '', AGENT_X)

    const held = registry.readParticipant(AGENT_X)
    expect(held?.state).toBeNull()
    expect(held !== null && 'stateBy' in held ? held.stateBy : null).toBeNull()
  })

  it('clears a state to nobody has said, with no time left behind', () => {
    registry.setParticipantState(AGENT_X, 'working', AGENT_X)

    registry.setParticipantState(AGENT_X, '  ', AGENT_X)

    const held = registry.readParticipant(AGENT_X)
    expect(held?.state).toBeNull()
    expect(held?.stateAt, 'a cleared state left a time behind, so a page could draw one without the other').toBeNull()
  })

  it('takes a state of exactly the length allowed, and refuses one longer with both numbers', () => {
    registry.setParticipantState(AGENT_X, 'x'.repeat(STATE_MAX), AGENT_X)
    expect(registry.readParticipant(AGENT_X)?.state).toHaveLength(STATE_MAX)

    const refusal = refusalFrom(() => {
      registry.setParticipantState(AGENT_X, 'x'.repeat(STATE_MAX + 1), AGENT_X)
    })

    expect(refusal.status).toBe(400)
    expect(refusal.message).toContain(String(STATE_MAX))
    expect(refusal.message).toContain(String(STATE_MAX + 1))
  })

  it('stores the words and nothing else, so a state the presets do not offer is kept', () => {
    // The presets are the app's, not the door's. A door with a list would refuse a state nobody had
    // thought of, and a self-set state somebody else has to approve is not self-set.
    registry.setParticipantState(AGENT_X, 'waiting on the owner to read a proposal', AGENT_X)

    expect(registry.readParticipant(AGENT_X)?.state).toBe('waiting on the owner to read a proposal')
  })
})

// ============================================================================ nobody in particular

describe('a caller the registries do not know', () => {
  it('is refused, and told how to be registered', () => {
    const refusal = refusalFrom(() => {
      registry.setParticipantName(AGENT_X, 'Renamed by a stranger', null)
    })

    expect(refusal.status).toBe(403)
    expect(refusal.message).toContain('who is asking')
    expect(refusal.message, 'the refusal says no and not what to do about it').toContain('registered')
  })

  it('is still allowed to write records, which is the rule that did not change', () => {
    // Criterion M14 and the owner's F1 answer of 3 September 2026: a record write from an
    // unregistered agent was accepted exactly as it was, and the surfaces name it. Since 16 September
    // 2026 such a write over HTTP is refused (criterion M14 as amended on 30 September 2026); this
    // write is made in process, which that refusal does not ask, so it is still accepted here. Only a
    // change to somebody's own name, picture or state needs the caller to be somebody, in process too.
    const made = t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'note',
      title: 'Filed by an agent nobody registered',
      actor: { type: 'agent', id: 'claude-code/nobody-registered' },
    })

    expect(made.title).toBe('Filed by an agent nobody registered')
  })
})

// ============================================================================ reading them back

describe('both registries read back together', () => {
  it('hands back the people and the agents, each in handle order', () => {
    const both = registry.listParticipants()

    expect(both.people.map((p) => p.handle)).toEqual([THE_PERSON])
    // MOLE OFFICE'S OWN ROW IS IN THE AGENT REGISTRY, written by the same migration that writes the
    // owner's. Criterion M11 makes it a participant so that the lines saying a group was opened, a
    // member was added or two claims are in conflict have a sender.
    expect(both.agents.map((a) => a.handle)).toEqual(['builder-x', 'builder-y', 'mole-office'])
    expect(both.agents[0]?.runtime).toBe('claude-code')
    expect(both.agents[0]?.retired).toBe(false)
  })

  it('answers nothing for a participant no row answers to, rather than an empty one', () => {
    expect(registry.readParticipant({ kind: 'agent', id: 'nobody' })).toBeNull()
    expect(registry.readParticipant({ kind: 'person', id: 'nobody' })).toBeNull()
  })
})
