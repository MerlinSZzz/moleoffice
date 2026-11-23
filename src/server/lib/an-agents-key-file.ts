// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S KEY IN A FILE ON THIS COMPUTER: THE ENTRY AGENT'S, AND AN AGENT'S STARTED OUTSIDE THE OFFICE.
 *
 * The press that puts the entry in place makes one agent for the coding-tool sessions this computer starts, the entry
 * agent, and gives it a key of its own. The session hook sends that key for a session that holds no key and names no
 * agent (for-agents/session-hook.mjs). The new agent dialog's start outside the office gives the agent it makes a key
 * file of its own the same way. Where the files are is named in one place, src/config/the-entrys-agent.mjs.
 *
 * ONLY THE PERSON'S OWN PROVED PRESS MAKES A KEY, and never under a grant. A press by an agent the gate lets through,
 * or by a raised secretary, writes the entry's lines and makes no agent and no key, and the answer says why.
 *
 * A SECOND PRESS KEEPS A SOUND KEY AND WRITES NOTHING. A key is sound when its row is live and held by the live agent
 * the entry agent file names. Any other key file, missing, unreadable, revoked or another agent's, is replaced for the
 * same agent, and that agent's other live keys are revoked, so the agent holds one key and it is the one in the file.
 *
 * THE AGENT IS FOUND BY THE ID IN ITS FILE, never by its handle: a handle can pass to another agent after a retirement.
 * A missing file, or an id that names a retired agent or none, makes a new agent, and the answer says which.
 *
 * A FILE THAT CANNOT BE WRITTEN fails the press after the entry's lines were written. The key's row is rolled back
 * with it, and the refusal names the file.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TheEntrysKeyState } from '@shared/entry.ts'
import { THE_WORKER } from '@shared/roles.ts'
import { THE_AGENT_KEY } from '../../config/agent-key-reader.mjs'
import { settings } from '../../config/settings.mjs'
import {
  anOutsideAgentsKeyFileBeside,
  aPrivateFileRead,
  THE_ENTRYS_AGENT_ID,
  theEntrysFilesBeside,
} from '../../config/the-entrys-agent.mjs'
import { sqlite } from '../db/client.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { writeTheCardMessageToOne } from './cardmessage.ts'
import { heldKeyByHash } from './how-this-request-proved-itself.ts'
import { assertHandleIsFree } from './inbox.ts'
import { keyHash, makeAnAgentKey, revokeEveryLiveKeyHeldBy, writeAPrivateFile } from './keys.ts'
import { PanelError } from './panel-error.ts'
import { participantForActor } from './participant-for-actor.ts'
import { howThisPressProvesTheKeyItMakes, type HowAKeysMintWasProved } from './provedkeys.ts'
import { createRecordWithReport, throughTheCardDoor, type Actor } from './records.ts'
import { theAgentAStoredIdNames } from './the-agent-a-stored-id-names.ts'

/** The entry agent's title: what it is to the person reading the registry. */
export const THE_ENTRYS_AGENT_TITLE = 'Claude Code on this computer'
/** The entry agent's handle, or this with -2, -3 and on when it is taken. */
export const THE_ENTRYS_HANDLE = 'claude-code'

/** What became of the key in one file. */
export type WhatBecameOfTheKey = 'kept' | 'made' | 'replaced'

/** The folder of the office's own key file, where every file here is kept beside it. */
function theKeysPath(): string {
  return settings().keysPath
}

/**
 * WHETHER THIS PRESS MAY MAKE A KEY: only the person's own proved press, under no grant. The answer is the proof the
 * key is stored with, or why there is none, in one sentence.
 */
export function theKeyThisPressMayMake(actor: Actor): { proof: HowAKeysMintWasProved; why: null } | { proof: null; why: string } {
  if (actor.press?.underTheGrant !== undefined) {
    return { proof: null, why: "No agent key was made, because this press was made under the person's grant, and only the person's own press makes one." }
  }
  const proof = howThisPressProvesTheKeyItMakes(actor)
  if (proof !== 'the-persons-press') {
    return { proof: null, why: "No agent key was made, because this press did not carry the person's own key, and only the person's own press makes one." }
  }
  return { proof, why: null }
}

/** Why a key file's key is not sound for this agent, or null because it is. */
function whyTheKeyIsNotSound(file: string, agentId: string): string | null {
  const read = aPrivateFileRead(file, THE_AGENT_KEY)
  if (read.is === 'absent') return null
  if (read.is === 'refused') return read.why
  const row = heldKeyByHash(keyHash(read.value))
  if (row === undefined) return `The key in ${file} is revoked, or this office never gave it.`
  if (row.whose_kind !== 'agent' || row.whose_id !== agentId) return `The key in ${file} is another holder's.`
  const agent = theAgentAStoredIdNames(agentId)
  if (agent === null || agent.retired) return `The agent ${agentId} that holds the key in ${file} is retired.`
  return null
}

/**
 * KEEP A SOUND KEY IN `file`, OR PUT A NEW ONE THERE FOR `agentId`. A sound key is kept and nothing is written. A file
 * with no key gets one. Any other file is replaced, and the agent's other live keys are revoked first, so the agent
 * holds the one key in the file. The row and the file go together: a file that cannot be written rolls the row back.
 */
export function keepOrReplaceTheKeyIn(file: string, agentId: string, proof: HowAKeysMintWasProved): { became: WhatBecameOfTheKey; why: string | null } {
  const there = aPrivateFileRead(file, THE_AGENT_KEY)
  const why = there.is === 'absent' ? null : whyTheKeyIsNotSound(file, agentId)
  if (there.is !== 'absent' && why === null) return { became: 'kept', why: null }
  sqlite.transaction(() => {
    revokeEveryLiveKeyHeldBy('agent', agentId, `A new key was put in ${file} for this agent, so its other keys were revoked.`)
    const key = makeAnAgentKey(agentId, proof)
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    try {
      writeAPrivateFile(file, `${key}\n`)
    } catch (err) {
      throw new PanelError(
        `The key file ${file} could not be written (${err instanceof Error ? err.message : String(err)}), so no key was made for the agent ${agentId}. Everything written before the key was kept.`,
        500,
      )
    }
  })()
  return { became: there.is === 'absent' ? 'made' : 'replaced', why }
}

/** The first handle of the entry agent's that no live agent has and nobody in the project had. */
function aFreeHandle(workspaceId: string): string {
  for (let n = 1; n < 1000; n++) {
    const handle = n === 1 ? THE_ENTRYS_HANDLE : `${THE_ENTRYS_HANDLE}-${String(n)}`
    if (agentByHandle(handle) !== null) continue
    try {
      assertHandleIsFree(handle, workspaceId, null)
      return handle
    } catch (err) {
      if (err instanceof PanelError) continue
      throw err
    }
  }
  throw new PanelError(`Every handle from ${THE_ENTRYS_HANDLE} to ${THE_ENTRYS_HANDLE}-999 is taken, so no entry agent was made.`, 409)
}

/** Make the entry agent, with the person as its starter and the worker card, and hand back its registry id and handle. */
function makeTheEntrysAgent(actor: Actor, workspaceId: string): { id: string; handle: string } {
  const starter = participantForActor(actor)
  if (starter === null) throw new PanelError('The person who pressed is not in the registry, so nobody would be the entry agent\'s starter. No agent was made.', 403)
  const handle = aFreeHandle(workspaceId)
  const made = throughTheCardDoor(() =>
    createRecordWithReport({
      workspaceId,
      kind: 'agent',
      title: THE_ENTRYS_AGENT_TITLE,
      data: {
        handle,
        state: 'active',
        runtime: 'claude-code',
        startedBy: { kind: starter.kind, id: starter.id },
        role: THE_WORKER,
        cardChosenBy: { how: 'a-starter', who: { kind: starter.kind, id: starter.id } },
      },
      actor,
    }),
  )
  const registered = agentForRecord(made.record.id)
  if (registered === null) throw new PanelError(`No registry row answered for the entry agent's record ${made.record.id}, so it was given no key.`, 500)
  writeTheCardMessageToOne({ to: { kind: 'agent', id: registered.id }, workspaceId, role: THE_WORKER, actor })
  return { id: registered.id, handle }
}

/** THE STATE OF THIS COMPUTER'S ENTRY KEY, as Settings shows it: none yet, held, or refused. */
export function theStateOfTheEntrysKey(): TheEntrysKeyState {
  const files = theEntrysFilesBeside(theKeysPath())
  const key = aPrivateFileRead(files.key, THE_AGENT_KEY)
  if (key.is === 'absent') return 'none-yet'
  const agent = aPrivateFileRead(files.agent, THE_ENTRYS_AGENT_ID)
  if (key.is === 'refused' || agent.is !== 'held') return 'refused'
  return whyTheKeyIsNotSound(files.key, agent.value) === null ? 'held' : 'refused'
}

/**
 * THE ENTRY PRESS'S KEY STEP, after its lines were written: find or make the entry agent, keep or replace its key,
 * and say what was done. A press that may make no key writes nothing here and says why.
 */
export function giveTheEntrysAgentItsKey(actor: Actor, workspaceId: string): { thisComputersKey: TheEntrysKeyState; says: string } {
  const may = theKeyThisPressMayMake(actor)
  if (may.proof === null) return { thisComputersKey: theStateOfTheEntrysKey(), says: may.why }
  const files = theEntrysFilesBeside(theKeysPath())
  const named = aPrivateFileRead(files.agent, THE_ENTRYS_AGENT_ID)
  const found = named.is === 'held' ? theAgentAStoredIdNames(named.value) : null
  const said: string[] = []
  let agent: { id: string; handle: string }
  if (found !== null && !found.retired) {
    agent = { id: found.id, handle: found.handle }
  } else {
    agent = makeTheEntrysAgent(actor, workspaceId)
    const because =
      named.is === 'absent'
        ? aPrivateFileRead(files.key, THE_AGENT_KEY).is === 'absent'
          ? 'this computer had none yet'
          : `the entry agent file ${files.agent} was missing, so nothing said whose key ${files.key} holds`
        : named.is === 'refused'
          ? named.why
          : found === null
            ? `no agent has the id ${named.value} that ${files.agent} named`
            : `the agent ${found.handle} that ${files.agent} named is retired`
    said.push(`The entry agent ${agent.handle} was made, because ${because.replace(/\.$/u, '')}.`)
  }
  mkdirSync(files.folder, { recursive: true })
  if (named.is !== 'held' || named.value !== agent.id) writeAPrivateFile(files.agent, `${agent.id}\n`)
  const key = keepOrReplaceTheKeyIn(files.key, agent.id, may.proof)
  if (key.became === 'kept') said.push(`The entry agent ${agent.handle} keeps the key it holds in ${files.key}.`)
  else if (key.became === 'made') said.push(`The entry agent ${agent.handle} was given a key of its own, in ${files.key}.`)
  else said.push(`The entry agent ${agent.handle} was given a new key in ${files.key}, because ${(key.why ?? 'the old one was not sound').replace(/\.$/u, '')}. Its other keys were revoked.`)
  return { thisComputersKey: theStateOfTheEntrysKey(), says: said.join(' ') }
}

/**
 * THE KEY FILE OF AN AGENT STARTED OUTSIDE THE OFFICE, kept or made on the person's own press, or null with why when
 * this press may make no key, so the agent is started with no key and the answer says so.
 */
export function anOutsideStartsKeyFile(actor: Actor, agentId: string): { file: string; says: string } | { file: null; says: string } {
  const may = theKeyThisPressMayMake(actor)
  if (may.proof === null) return { file: null, says: `It was started with no key of its own. ${may.why}` }
  const file = anOutsideAgentsKeyFileBeside(theKeysPath(), agentId)
  try {
    const key = keepOrReplaceTheKeyIn(file, agentId, may.proof)
    return { file, says: key.became === 'kept' ? `It keeps its key in ${file}.` : `Its key is in ${file}.` }
  } catch (err) {
    return { file: null, says: `It was started with no key of its own: ${err instanceof Error ? err.message : String(err)}` }
  }
}
