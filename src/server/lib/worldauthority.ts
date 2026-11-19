// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY HOLD THE OWNER'S AUTHORITY. Criterion P84, and
 * rule 5 of chapter 8.
 *
 * ---------------------------------------------------------------------------------------
 * THE QUESTION AND WHAT WAS DECIDED
 * ---------------------------------------------------------------------------------------
 *
 * The question was whether the agent that started a test world, or the secretary, should hold full authority there.
 * The secretary decided both: the agent that started a test world holds the
 * owner's authority in that world, because it photographs the owner's presses for its handback; and
 * the secretary holds it in every test world, because the secretary reviews worlds for the owner.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE THIS
 * ---------------------------------------------------------------------------------------
 *
 * 8 September 2026, on a world started by tools/isolated-mole-office.mjs and on a stack the test
 * runner started. A request in a world is attributed exactly as one in the office: `actorFrom` reads
 * the three identity headers and nothing else, and every one of the owner's acts is refused to every
 * agent with the same sentence — "Trusting a machine is the owner's own act, and this request was
 * made by '<an agent>', which is not him". Nothing in a world knew who had started it: the tool passed no
 * such value, and the ledger row it registers held the branch, the port and the copy path only
 * inside an English sentence. `GET /api/health` said the world was `scratch`, with three reasons, and
 * nothing read that on the permission path.
 *
 * ---------------------------------------------------------------------------------------
 * A WORLD IS TOLD, AND A WORLD THAT WAS NOT TOLD APPLIES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * Two settings carry it, written into the world's environment by the tool that starts it:
 * `MOLE_OFFICE_WORLD_STARTED_BY` is the starter's handle, from the ledger row the tool registers, and
 * `MOLE_OFFICE_WORLD_SECRETARIES` is the handles holding the secretary card IN THE OFFICE THE COPY
 * WAS TAKEN FROM.
 *
 * NEITHER IS READ OUT OF THE WORLD'S OWN DATABASE, and that is the point of passing them in. A
 * world's database is a copy, so a row inside it could be changed inside it; reading who the
 * secretaries are from the copy would mean the answer to "who holds the owner's authority here" could
 * be edited by whoever is already in the world.
 *
 * A WORLD NAMED NEITHER GIVES NOBODY THE OWNER'S AUTHORITY. Empty is not "everybody" and not "the person":
 * every one of the owner's acts stays refused to every agent, exactly as in the office. That is what makes
 * this safe to have in one build for both.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT TELLS A PROCESS IT IS A TEST WORLD: THE TWO SETTINGS BEING SET, EVEN EMPTY
 * ---------------------------------------------------------------------------------------
 *
 * tools/isolated-mole-office.mjs writes both settings into the environment of every world it starts,
 * empty where it named nobody (`environmentForTheWorld`). A throwaway world, started with no
 * `--show-to-the-person`, never asks the office who its secretaries are, so both are empty there.
 * Before this, empty read as "not a world", so a throwaway world trusted every key in its own
 * `held_keys` exactly as the office does (problem FmGa9AOxfaw1, a check of 25 September 2026).
 * So a world is a process in which either setting was SET, and an empty value counts: the settings
 * declaration already says empty and absent are two different statements.
 *
 * THE OFFICE IS NEVER A TEST WORLD. It is both settings being absent that says so — the office is
 * started by `npm start` and by the person, and nothing writes either variable for it.
 */

import { settingValue, settingWasSet } from '../../config/settings.mjs'

/** What a world was told about who holds the owner's authority in it. */
export interface TheWorldsOwnAuthority {
  /** True when this process was told it is a test world: either setting was set, even empty. */
  inATestWorld: boolean
  /** The handle of the agent that started it, or null because nobody named one. */
  startedBy: string | null
  /** The handles holding the secretary card in the office it was copied from. Empty is an answer. */
  secretaries: readonly string[]
}

/**
 * Read once, when this module is first asked.
 *
 * A world's environment does not change while it runs, and re-reading per request would mean two
 * requests one second apart could be answered under two different rules with nothing saying which —
 * the same reason src/server/lib/roles.ts reads the role cards once.
 */
let held: TheWorldsOwnAuthority | null = null

/** What this process was told. Read the environment once and hold it. */
export function theWorldsOwnAuthority(): TheWorldsOwnAuthority {
  if (held !== null) return held
  const starter = readOne('MOLE_OFFICE_WORLD_STARTED_BY')
  const secretaries = readMany('MOLE_OFFICE_WORLD_SECRETARIES')
  held = {
    inATestWorld:
      settingWasSet('MOLE_OFFICE_WORLD_STARTED_BY') || settingWasSet('MOLE_OFFICE_WORLD_SECRETARIES'),
    startedBy: starter,
    secretaries,
  }
  return held
}

/** Read them again on the next call. For a test, which sets the environment itself. */
export function forgetTheWorldsOwnAuthority(): void {
  held = null
}

function readOne(name: string): string | null {
  const said = settingValue(name)
  if (typeof said !== 'string') return null
  const trimmed = said.trim()
  return trimmed === '' ? null : trimmed
}

function readMany(name: string): string[] {
  const said = settingValue(name)
  if (Array.isArray(said)) return said.map((one) => String(one).trim()).filter((one) => one !== '')
  if (typeof said !== 'string') return []
  return said
    .split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '')
}

/** Who this request is, as much as this rule needs: the two identity headers. */
export interface WhoIsAsking {
  type: string
  id: string
}

/** Whether this caller holds the owner's authority here, and the reason it does. */
export interface TheOwnersAuthorityHere {
  holds: boolean
  /** The reason it holds, in plain words, or null because it does not. */
  because: string | null
}

/**
 * DOES THIS CALLER HOLD THE OWNER'S AUTHORITY IN THIS WORLD?
 *
 * Only an agent is ever asked about. A person is already the person and every one of their acts is
 * already open to them; asking this about them would be a second way to be the owner, and two ways to
 * be one thing is the ninth invariant broken on a permission.
 */
export function theOwnersAuthorityOf(asking: WhoIsAsking): TheOwnersAuthorityHere {
  const world = theWorldsOwnAuthority()
  if (!world.inATestWorld) return { holds: false, because: null }
  if (asking.type !== 'agent') return { holds: false, because: null }
  if (world.startedBy !== null && asking.id === world.startedBy) {
    return {
      holds: true,
      because:
        `"${asking.id}" started this test world, and inside a world its starter holds the owner's authority ` +
        '(rule 5 of chapter 8). Nothing written here counts as the owner\'s own, and none of this reaches the office this ' +
        'world was copied from.',
    }
  }
  if (world.secretaries.includes(asking.id)) {
    return {
      holds: true,
      because:
        `"${asking.id}" holds the secretary card in the office this world was copied from, and the secretary ` +
        "holds the owner's authority in every test world (rule 5 of chapter 8), because the secretary reviews " +
        'worlds for the owner. Nothing written here counts as the owner\'s own.',
    }
  }
  return { holds: false, because: null }
}

/**
 * WHO MAY DO THE PERSON'S ACTS HERE, as a sentence for a refusal, or null because this is the office.
 *
 * It names the starter and the secretaries rather than saying "somebody else may": a refusal that
 * does not say who to ask is a refusal the reader has to research.
 */
export function whoMayDoThePersonsActsHere(): string | null {
  const world = theWorldsOwnAuthority()
  if (!world.inATestWorld) return null
  if (world.startedBy === null && world.secretaries.length === 0) {
    return (
      'This is a test world, and nobody in it was named as holding the owner\'s authority. Every one of the owner\'s acts ' +
      'is the owner\'s own here, exactly as in the office.'
    )
  }
  return (
    'This is a test world. Inside one, the agent that started it and the secretary hold the owner\'s authority — ' +
    `rule 5 of chapter 8. ${theStarterAndSecretariesNamed()} Nothing written here counts as the owner's own, and none of it ` +
    'reaches the office this world was copied from.'
  )
}

/**
 * WHO WAS NAMED HERE, IN ONE SENTENCE, for the two refusals that have to name them.
 *
 * THE STARTER AND THE SECRETARIES ARE NAMED BY HANDLE and never as "somebody else", because a refusal
 * that does not say who to ask is one the reader has to research. The sentence above and the key
 * refusal below read this, so the naming cannot come to differ between them.
 */
function theStarterAndSecretariesNamed(): string {
  const world = theWorldsOwnAuthority()
  const started =
    world.startedBy === null
      ? 'Nobody was named as having started this world.'
      : `"${world.startedBy}" started this world.`
  // EMPTY IS TWO PATHS, SO THE SENTENCE SAYS ONLY WHAT IS TRUE OF BOTH. The tool writes an empty list
  // when the office it asked had no secretary, and also for a throwaway world, which never asks.
  const secretaries =
    world.secretaries.length === 0
      ? 'No secretary was named for this world.'
      : `The secretaries of the office it was copied from are ${world.secretaries.map((one) => `"${one}"`).join(', ')}.`
  return `${started} ${secretaries}`
}

/**
 * THE REFUSAL FOR A KEY THIS TEST WORLD DOES NOT TRUST. Criterion P84's last clause, W2.
 *
 * WHAT WAS REFUSED AND THAT NOTHING WAS WRITTEN. The sentence says the key is not trusted here, names
 * the holder it belongs to and never the key's bytes, and says nothing was written. It then names who
 * may in this world — the agent that started it and the secretary — for the same reason every other
 * refusal here does: the reader has to be able to act on it.
 */
export function aWorldRefusesTheKeyHeldBy(holder: string): string {
  return (
    `This test world does not trust the key this request carried, which "${holder}" holds. A key proves a caller ` +
    `here only when it is the key of the agent that started this world or the secretary's key. Nothing was ` +
    `written. This is a test world. Inside one, the agent that started it and the secretary hold the owner's ` +
    `authority — rule 5 of chapter 8. ${theStarterAndSecretariesNamed()} Nothing written here counts as the owner's own, and ` +
    'none of it reaches the office this world was copied from.'
  )
}
