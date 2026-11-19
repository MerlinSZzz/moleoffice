// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `checkWorkDomainIds` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * `liveRecord` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * `agentHandles` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * `sessionSaysItRanAs` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import { kindWord } from '@shared/words.ts'
import { withArticle } from '@shared/work.ts'
import { isObject } from './assert-nothing-resolved-on-create.ts'
import { sqlite } from '../db/client.ts'

/**
 * THE THREE CHECKS ON A WORK DOMAIN'S TWO IDS, run on the create path AND on the patch path.
 *
 * A rule enforced on one write path is not a rule. This repository has the measurement: four block
 * ids nothing answered to were stored through the create door and reported complete, because the
 * three rules that would have caught them lived only on the patch.
 *
 * WHY THEY ARE FIELDS AND NOT LINKS, since that is the question a reader arrives with. `part_of` is
 * single-parent containment, so spending a work domain's one parent on its session would refuse it
 * a parent anywhere else. And a link carries no qualification, while these two ids are checked
 * AGAINST EACH OTHER — which is the third rule below and the one that matters.
 */
export function checkWorkDomainIds(data: unknown, workspaceId: string): void {
  if (!isObject(data)) return

  // ABSENT IS `validateRecordData`'S BUSINESS. Both are required fields and the completeness reader
  // is what names a missing one; answering it here would say something about identity when the real
  // complaint is that nothing was sent.
  const agentId = data['agent']
  const sessionId = data['session']

  if (typeof agentId === 'string' && agentId !== '') {
    const agent = liveRecord(agentId, workspaceId)
    if (agent === null || agent.kind !== 'agent') {
      const handles = agentHandles(workspaceId)
      throw new PanelError(
        `A work domain names the durable agent the work belongs to, and "${agentId}" ` +
          `${agent === null ? 'is not a live record in this project' : `is ${withArticle(kindWord(agent.kind, 'normal').text)}, not an agent`}. ` +
          `Nothing was written. It is the agent identity that outlives the run, not the run: an overlap found ` +
          `next week has to be tellable to somebody, and a session that has died is not somebody. ` +
          (handles.length === 0
            ? `This project has no agent records yet. File one with POST /api/records ` +
              `{"kind":"agent","title":"<its name>","data":{"handle":"<short-name>","state":"active"}}.`
            : `The agents here are addressed as: ${handles.join(', ')}.`),
        400,
      )
    }
  }

  if (typeof sessionId === 'string' && sessionId !== '') {
    const session = liveRecord(sessionId, workspaceId)
    if (session === null || session.kind !== 'session') {
      throw new PanelError(
        `A work domain names the session that filed it, and "${sessionId}" ` +
          `${session === null ? 'is not a live record in this project' : `is ${withArticle(kindWord(session.kind, 'normal').text)}, not a session`}. ` +
          `Nothing was written. That id is what later attributes a change to this stretch of work, so a domain ` +
          `naming a session that is not there could never have its drift attributed to anybody.`,
        400,
      )
    }

    // THE THIRD CHECK, AND THE REASON THE FIRST TWO ARE NOT ENOUGH. Two statements of who is doing
    // this work, free to disagree, is this repository's own named defect. The refusal names both and
    // says which to change rather than picking one.
    if (typeof agentId === 'string' && agentId !== '') {
      const bound = sessionSaysItRanAs(session.data, workspaceId)
      if (bound !== null && bound !== agentId) {
        const boundRecord = liveRecord(bound, workspaceId)
        throw new PanelError(
          `Session "${session.title}" already says it ran as agent ${bound}` +
            `${boundRecord === null ? '' : ` ("${boundRecord.title}")`} in this project, and this work domain ` +
            `names agent ${agentId}. Nothing was written, because storing both would leave two answers to "who is ` +
            `doing this work" side by side, free to disagree, with nothing to say which is right. Change the ` +
            `domain's data.agent to ${bound}, or correct the session's data.ranAs entry for this project.`,
          400,
        )
      }
    }
  }
}
/** One live record's kind and title, or null when this project holds no such id. */
export function liveRecord(id: string, workspaceId: string): { kind: string; title: string; data: string } | null {
  const row = sqlite
    .prepare('SELECT kind, title, data FROM records WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL')
    .get(id, workspaceId) as { kind: string; title: string; data: string } | undefined
  return row ?? null
}
/** The handles of the live agents in this project, for a refusal that offers something to send. */
export function agentHandles(workspaceId: string): string[] {
  const rows = sqlite
    .prepare(
      "SELECT json_extract(data, '$.handle') AS handle FROM records " +
        "WHERE kind = 'agent' AND workspace_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 10",
    )
    .all(workspaceId) as { handle: string | null }[]
  return rows.map((r) => r.handle).filter((h): h is string => typeof h === 'string' && h !== '')
}
/**
 * WHICH AGENT A SESSION ALREADY SAYS IT RAN AS IN THIS PROJECT, or null when it has never said.
 *
 * `data.ranAs` is a list of `{workspaceId, agentId}` with at most one entry per project — wave 3's
 * shape, read here and not copied. All 92 sessions that existed when this was written carry no
 * entry at all, so this answers null for every one of them and nothing is refused.
 */
export function sessionSaysItRanAs(sessionData: string, workspaceId: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(sessionData)
  } catch {
    return null
  }
  if (!isObject(parsed)) return null
  const ranAs = parsed['ranAs']
  if (!Array.isArray(ranAs)) return null
  for (const entry of ranAs) {
    if (!isObject(entry)) continue
    if (entry['workspaceId'] !== workspaceId) continue
    const agentId = entry['agentId']
    if (typeof agentId === 'string' && agentId !== '') return agentId
  }
  return null
}
