// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THEIR MAIL TOOL, IN THEIR SETTINGS, NOT AN AGENT OR CARD. Two decisions, on report H-forI_Vk5H7 (30 September 2026),
 * change another decision here.
 * Only the hash of their tool's key is kept in held_keys, like their paired devices, but its own
 * kind proves only this tool. The value goes straight into its folder, never a reply or log.
 * Their install press moves the old agent in one transaction: make and save the tool key, retire
 * the agent through the office's retirement writer and take every old agent key back. Its record
 * and history stay, and its handle is freed. theKey() reads the file every round, so neither a
 * restart nor moving its summons cursor is needed. A second press reuses a working tool key.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { TheMailTool } from '@shared/summons.ts'
import { sqlite } from '../db/client.ts'
import {
  THE_MAIL_TOOL_HANDLE,
  THE_MAIL_TOOL_UNIT,
  THE_MAIL_TOOL_UNIT_MARK,
  theMailToolFolder,
  saveTheMailToolsKey,
  theMailToolPage,
  theMailToolUnitPath,
  theSystemctl,
  theToolStartsAtLogin,
  theUnitIsThisOfficesOwn,
  type Systemctl,
} from '../../config/the-mail-tool.mjs'
import { holdTheKeyWhoseHashIs, revokeEveryLiveKeyHeldBy, theLiveKeyHeldBy, theLiveKeyWithThisId } from './keys.ts'
import { THEIR_TOOL_KEY_KIND } from './how-this-request-proved-itself.ts'
import { keyHash, theHeldKeyRowWhoseHashIs } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { retireThisAgent, type RegisteredAgent } from './participants.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { howThisCallProvesTheKeyItMakes } from './provedkeys.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/**
 * WHO PRESSED, AS A RECORD NAMES THEM. The person's own press is the person's; a secretary's press under their grant
 * names the secretary, never the person whose tool it moved. The press row written beside the door names the grant.
 */
function asTheCaller(actor: Actor): { kind: 'person' | 'agent'; id: string } {
  return { kind: actor.type === 'human' ? 'person' : 'agent', id: actor.id }
}

// The old tool holds this card on its agent record; do not look it up in roles.json.
// It keeps reading after 13k removes the card, but no new agent can receive a removed card.
// This limits the old way to the mail tool until their press moves it.
export const THE_OLD_MAIL_TOOL_CARD = 'mailer'

/** The live agent registered as the mail tool, or null while none is. */
export function theMailToolAgent(): RegisteredAgent | null {
  return agentByHandle(THE_MAIL_TOOL_HANDLE)
}

/** The old tool may read only while its live agent holds its stored card. The door and Settings use the same rule. */
export function theOldMailToolAgent(): RegisteredAgent | null {
  const agent = theMailToolAgent()
  return agent?.role === THE_OLD_MAIL_TOOL_CARD ? agent : null
}

/** The key in the tool's folder, or null when there is none. */
function theKeyInTheFolder(home: string): string | null {
  try {
    const key = readFileSync(join(theMailToolFolder({}, home), 'key'), 'utf8').trim()
    return key === '' ? null : key
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new PanelError('The mail tool’s key file could not be read. Nothing changed. Make sure its folder holds a readable key file, then press install again.', 409)
  }
}

/** Whether the folder's key proves their mail tool now, with no agent or card involved. */
function theKeyProvesTheirTool(key: string): boolean {
  const row = theHeldKeyRowWhoseHashIs(keyHash(key))
  return row !== null && row.whoseKind === THEIR_TOOL_KEY_KIND && row.whoseId === THE_MAIL_TOOL_HANDLE && row.revokedAt === null
}

/** The old live agent's key, only until their install press moves it. */
function theKeyProves(key: string, agent: RegisteredAgent): boolean {
  const row = theHeldKeyRowWhoseHashIs(keyHash(key))
  return row !== null && row.whoseKind === 'agent' && row.whoseId === agent.id && row.revokedAt === null
}

/**
 * Their press makes a fresh tool key, or reuses the working one. The database and file move
 * together; a failed retirement or database commit restores the previous file. A file write
 * failure rolls the database back before the agent is retired. Their key's take-back is reversible
 * only by a new install, so a missing or revoked file never falls back to an agent key.
 * Two decisions and report H-forI_Vk5H7 change another decision's
 * registration here.
 */
export function theKeyForTheMailTool(input: { actor: Actor; workspaceId: string; home: string }): { keyMade: boolean } {
  const agent = theMailToolAgent()
  if (agent !== null && agent.role !== THE_OLD_MAIL_TOOL_CARD) {
    throw new PanelError('The live agent named "mail-tool" does not hold the old mail tool’s card. Nothing was written. ' +
      'Retire it on its page, then press install again.', 409)
  }
  const before = theKeyInTheFolder(input.home)
  if (agent === null && before !== null && theKeyProvesTheirTool(before)) return { keyMade: false }
  let saved = false
  let step = "Making the mail tool’s key"
  try {
    return sqlite.transaction(() => {
      const key = randomBytes(32).toString('hex')
      // A lost file must not leave a second live key: the tool holds one key at a time.
      revokeEveryLiveKeyHeldBy(THEIR_TOOL_KEY_KIND, THE_MAIL_TOOL_HANDLE, 'The install press replaced the mail tool’s key.')
      holdTheKeyWhoseHashIs(THEIR_TOOL_KEY_KIND, THE_MAIL_TOOL_HANDLE, keyHash(key), howThisCallProvesTheKeyItMakes(input.actor))
      step = "Saving the mail tool’s key file"
      saveTheMailToolsKey(input.home, key)
      saved = true
      if (agent !== null) {
        const because = 'The mail tool is now the person’s personal tool in Settings (H-forI_Vk5H7).'
        step = 'Retiring the old mail-tool agent'
        retireThisAgent(agent.id, asTheCaller(input.actor), because)
        step = 'Taking the old mail-tool agent’s keys back'
        revokeEveryLiveKeyHeldBy('agent', agent.id, because)
      }
      step = 'Committing the mail tool’s key move'
      return { keyMade: true }
    })()
  } catch (err) {
    if (saved) {
      if (before === null) rmSync(join(theMailToolFolder({}, input.home), 'key'))
      else saveTheMailToolsKey(input.home, before)
    }
    const why = err instanceof Error ? err.message : String(err)
    const wayOn = saved ? 'Resolve the reported failure, then press install again.'
      : 'Make sure its folder can hold a key file, then press install again.'
    throw new PanelError(`${step} failed and the move was undone (${why}). Nothing changed in the office. ${wayOn}`, 409)
  }
}

/** Their take-back ends every live key of this tool, retaining each row as its history. The caller is written on the press row. */
export function takeBackTheMailToolsKey(actor: Actor): number {
  // The tool must read nothing after their press; stopping its service would also move its cursor.
  // By two decisions and report H-forI_Vk5H7, their next install makes the only
  // way back.
  return revokeEveryLiveKeyHeldBy(THEIR_TOOL_KEY_KIND, THE_MAIL_TOOL_HANDLE, `The mail tool's key was taken back in Settings by ${actor.type === 'human' ? 'the person' : `the agent "${actor.id}"`}.`)
}

/**
 * THE MAIL TOOL AS IT STANDS, for their Settings page. Reads; writes nothing.
 *
 * WHERE IT ANSWERS, WITH ITS SECRET, IS GIVEN ONLY FOR THIS OFFICE'S OWN TOOL (problem c-6HsJmIsYE3): this office
 * made its personal tool key (or still holds the old live agent) and the key in its folder proves it, the unit is the one this office's press wrote for this office
 * (theUnitIsThisOfficesOwn), systemd says it runs, and this office is no test world. A test office on their computer
 * otherwise read the same folder and handed out where their real tool answers.
 */
export function theMailToolAsItStands(
  home: string,
  office: { api: string; inATestWorld: boolean },
  systemctl: Systemctl = theSystemctl,
): TheMailTool {
  const agent = theOldMailToolAgent()
  const key = theKeyInTheFolder(home)
  const held = theLiveKeyHeldBy(THEIR_TOOL_KEY_KIND, THE_MAIL_TOOL_HANDLE)
  const row = held === null ? null : theLiveKeyWithThisId(held.id)
  const toolKey = row === null ? null : { madeAt: row.madeAt, lastUsedAt: row.lastUsedAt }
  const keyWorks = key !== null && (theKeyProvesTheirTool(key) || (agent !== null && theKeyProves(key, agent)))
  let unitText: string | null = null
  try {
    unitText = readFileSync(theMailToolUnitPath(home), 'utf8')
  } catch {
    unitText = null
  }
  const unit = unitText === null ? 'not installed' : unitText.startsWith(THE_MAIL_TOOL_UNIT_MARK) ? 'installed' : 'not the press’s'
  const active = systemctl(['is-active', THE_MAIL_TOOL_UNIT])
  const running = active.out.trim() === 'active' ? true : active.out.trim() === '' && active.code !== 0 && active.err.trim() !== '' ? null : false
  // WHETHER IT STARTS AT THEIR LOGIN, which their press that turns it off takes away, read the
  // one way the press reads it (problem 4U_5cC8TozAI).
  const enabled = theToolStartsAtLogin(systemctl)
  const itIsThisOfficesOwn = !office.inATestWorld && keyWorks === true && unitText !== null && theUnitIsThisOfficesOwn(unitText, office.api)
  const page = running === true && itIsThisOfficesOwn ? theMailToolPage(theMailToolFolder({}, home)) : null
  const says =
    unit === 'not the press’s'
      ? `A file named ${THE_MAIL_TOOL_UNIT} is there that the press did not write, so the press leaves it alone.`
      : unit === 'not installed'
        ? 'The mail tool is not installed. The press gives it your tool’s key, and starts it as a service of your login.'
        : keyWorks !== true
          ? 'The mail tool is installed, and the key in its folder does not prove it, so it reads no summons.'
          : running === true
            ? page === null
              ? 'The mail tool is running, and has not said yet where it answers.'
              : 'The mail tool is running. Its addresses and its test letter are in its entry on the Settings page.'
            : enabled === false
              ? 'The mail tool is turned off: it does not run, and does not start at your login. The install press turns it back on.'
              : 'The mail tool is installed and not running. The press starts it again.'
  return { key: toolKey, keyWorks, unit, running, enabled, page, says }
}
