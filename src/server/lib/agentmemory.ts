// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A DURABLE AGENT ALREADY KNOWS, gathered for a run that is about to answer as it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion H3 of design/messages/ACCEPTANCE.md section 10. When nobody has an agent open in a
 * terminal, Mole Office starts a run to answer the message. That run is a fresh process that has
 * never heard of the work, and until now it was handed the message and nothing else. This is the
 * rest: the agent's own notes, and the records it has written lately.
 *
 * ---------------------------------------------------------------------------------------
 * HOW AN AGENT SAYS WHERE ITS NOTES ARE
 * ---------------------------------------------------------------------------------------
 *
 * A `notes` field on its `agent` record, holding an absolute path to a folder. A Claude Code agent's is
 * a `memory` folder under `~/.claude/projects/<the working directory, flattened>/`, which is where Claude Code keeps
 * the notes a session writes for its next self.
 *
 * IT IS A FIELD RATHER THAN A CONVENTION because there is no convention that would be true of three
 * runtimes. Claude Code, Codex and OpenCode each keep their own state in their own place, and
 * guessing at one would read the wrong folder for two of them and say nothing about it.
 *
 * NOTHING IS EVER WRITTEN INTO THE FOLDER. This reads and nothing else. The notes belong to whoever
 * writes them; Mole Office carries them to a run and keeps no copy.
 *
 * WHY THE OFFICE CARRIES THEM AND KEEPS NO COPY, which this rule stated with no reason until
 * 21 September 2026. When it was written there was no message handle, so a chat with an agent opened
 * a branch its own main session could not see. That reason was written down when a later design met the
 * bare rule and read it as a ban; it is recorded in a decision. A rule stated
 * with no reason is read as a ban, which is why the reason is written here beside the rule.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS LEFT OUT IS NAMED, ALWAYS
 * ---------------------------------------------------------------------------------------
 *
 * The folder can hold anything. A bundle that quietly stopped at a size limit would hand a run half
 * of what an agent knows while saying it had handed it everything, and the run would then answer
 * confidently from a gap it could not see. So every file that was not carried is named, with the
 * reason, and the count of what was read is beside it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import type { FiledLately } from '@shared/profile.ts'
import { kindWord } from '@shared/words.ts'

import { sqlite } from '../db/client.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import type { TheFiledAliases } from './registry-aliases/runs.ts'
import { isOneOfTheStamps, theStampsOfAnAgent } from './registry-aliases/stamps.ts'
import { getRecord } from './records.ts'
import { PanelError } from './panel-error.ts'

/** How many notes are carried, and how big one may be. */
const MOST_NOTES = 40
const MOST_BYTES_PER_NOTE = 40_000
/** How many of the agent's own recent records are named. */
const MOST_RECORDS = 25

/** One note file, as it is carried. */
export interface ANote {
  name: string
  bytes: number
  text: string
}

/** One thing left out, and why. */
export interface LeftOut {
  name: string
  because: string
}

/**
 * One record this agent wrote lately, as a run sees it.
 *
 * THE SAME SHAPE THE PROFILE PAGE DRAWS, and the name here is the one this file has always used.
 * Declaring the four fields again would be one shape in two places with nothing making them agree,
 * so this is an alias and `FiledLately` in shared/profile.ts is the declaration.
 */
export type ARecentRecord = FiledLately

/** Everything a run is handed about the agent it is answering as. */
export interface WhatTheAgentKnows {
  handle: string
  name: string
  /** The folder the agent record names, or null because nobody has said where its notes are. */
  notesAt: string | null
  /** One plain sentence about the notes: where they came from, or why there are none. */
  notesSay: string
  notes: ANote[]
  leftOut: LeftOut[]
  recent: ARecentRecord[]
  /** The agent's own record in this project, so the run can read the whole of it. */
  record: string | null
}

/**
 * WHERE THIS AGENT SAYS ITS NOTES ARE, read off its record in this project.
 *
 * Null is a real answer with two different meanings and the sentence beside it says which: nobody
 * has filled the field in, or this agent has no record in this project at all.
 */
function notesFolder(agentId: string, workspaceId: string): { at: string | null; record: string | null } {
  const recordId = recordForAgentIn(agentId, workspaceId)
  if (recordId === null) return { at: null, record: null }
  const record = getRecord(recordId)
  const data = record === null || typeof record.data !== 'object' || record.data === null ? {} : record.data
  const said = (data as Record<string, unknown>)['notes']
  return { at: typeof said === 'string' && said !== '' ? said : null, record: recordId }
}

/** Every markdown file in the folder, oldest name first, with what could not be carried named. */
function readTheNotes(at: string): { notes: ANote[]; leftOut: LeftOut[]; say: string } {
  if (!existsSync(at)) {
    return {
      notes: [],
      leftOut: [],
      say: `This agent's record says its notes are in ${at}, and nothing is there on the machine Mole Office is ` +
        'running on. Nothing was read and nothing was guessed at.',
    }
  }
  let names: string[]
  try {
    names = readdirSync(at).filter((name) => name.endsWith('.md')).sort()
  } catch (err) {
    return {
      notes: [],
      leftOut: [],
      say: `This agent's notes are in ${at} and it could not be read: ${(err as Error).message}. Nothing was read.`,
    }
  }
  const notes: ANote[] = []
  const leftOut: LeftOut[] = []
  for (const name of names) {
    if (notes.length >= MOST_NOTES) {
      leftOut.push({ name, because: `only the first ${String(MOST_NOTES)} notes are carried` })
      continue
    }
    const path = join(at, name)
    let bytes: number
    try {
      bytes = statSync(path).size
    } catch (err) {
      leftOut.push({ name, because: `it could not be measured: ${(err as Error).message}` })
      continue
    }
    if (bytes > MOST_BYTES_PER_NOTE) {
      leftOut.push({
        name,
        because: `it is ${String(bytes)} bytes and a note is carried up to ${String(MOST_BYTES_PER_NOTE)}`,
      })
      continue
    }
    try {
      notes.push({ name, bytes, text: readFileSync(path, 'utf8') })
    } catch (err) {
      leftOut.push({ name, because: `it could not be read: ${(err as Error).message}` })
    }
  }
  const say =
    names.length === 0
      ? `This agent's notes are in ${at} and it holds no markdown files.`
      : `${String(notes.length)} of ${String(names.length)} notes in ${at} are here in full.` +
        (leftOut.length === 0 ? '' : ` The other ${String(leftOut.length)} are named below with the reason.`)
  return { notes, leftOut, say }
}

/**
 * THE RECORDS THIS AGENT WROTE LATELY, newest first.
 *
 * READ FROM THE CHANGE LOG AND NOT FROM `records.owner_id`. Every record this product holds is owned
 * by the person whose installation it is — `createRecord` writes their id whoever is asking — so the
 * owner column says nothing about which agent wrote a thing. The `changes` row for the create says
 * exactly that, because it carries the actor id the writer sent.
 *
 * BY BOTH THE HANDLE AND THE REGISTRY ID, because an actor id is whatever the writer typed and a
 * durable agent has written under both over its life. That is the same pair `participantForActor`
 * looks a caller up by, for the same reason. And by each old registry id filed for it that only it answers to.
 */
export function recentlyWritten(
  agentId: string,
  handle: string,
  workspaceId: string,
  // MESSAGES THE READER MAY NOT READ, read by `everyMessageHiddenFrom`, left out before the list is cut,
  // so the list is the newest records this reader may see. Empty for a reader who
  // reads all.
  hidden: readonly string[],
  // THE FILED REGISTRY ALIASES, from a page that reads them for something else too, so they are read once for it.
  aliases?: TheFiledAliases,
): ARecentRecord[] {
  const stamps = theStampsOfAnAgent(sqlite, { id: agentId, handle }, aliases)
  const rows = sqlite
    .prepare(
      "SELECT r.id AS id, r.kind AS kind, r.title AS title, r.created_at AS created_at " +
        'FROM records r JOIN changes c ON c.record_id = r.id ' +
        // A MESSAGE IS KEPT IN THE MESSAGE CENTRE; it counts for the project its writing was filed in.
        "WHERE (r.workspace_id = ? OR (r.workspace_id = ? AND c.workspace_id = ?)) AND r.deleted_at IS NULL AND c.op = 'create' " +
        `AND c.actor_type = 'agent' AND ${isOneOfTheStamps('c.actor_id', stamps)} ` +
        'AND r.id NOT IN (SELECT value FROM json_each(?)) ' +
        'ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?',
    )
    .all(workspaceId, MESSAGE_CENTRE, workspaceId, ...stamps, JSON.stringify(hidden), MOST_RECORDS) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row['id']),
    kind: String(row['kind']),
    title: String(row['title']),
    when: String(row['created_at']),
  }))
}

/** Everything a run is handed about the agent it is answering as, or a refusal naming the handle. */
export function whatTheAgentKnows(handle: string, workspaceId: string, hidden: readonly string[]): WhatTheAgentKnows {
  // AN ARRIVING REFERENCE, NOT A HANDLE ONLY. The address this is called from names an agent in
  // whichever shape the caller sent: the parameter is called `handle` for history, but a caller that
  // sends the agent's id must not be refused. Reading mode, because nothing is written here.
  const found = theAgentAnArrivingReferenceNames(handle, 'reading')
  if (found === null) {
    throw new PanelError(
      `No durable agent in this installation has the handle "${handle}", so there is nothing it knows. ` +
        'GET /api/participants lists every agent that is registered.',
      404,
    )
  }
  const agent = found.agent
  const where = notesFolder(agent.id, workspaceId)
  const read =
    where.at === null
      ? {
          notes: [],
          leftOut: [],
          say:
            where.record === null
              ? `${handle} has no agent record in this project, so nothing says where it keeps its notes. Its ` +
                'recent records are below and nothing else was read.'
              : `Nobody has said where ${handle} keeps its notes. Put an absolute path in the "notes" field of ` +
                `record ${where.record} and every run of this agent is handed them. Its recent records are below.`,
        }
      : readTheNotes(where.at)
  return {
    handle: agent.handle,
    name: agent.name,
    notesAt: where.at,
    notesSay: read.say,
    notes: read.notes,
    leftOut: read.leftOut,
    recent: recentlyWritten(agent.id, agent.handle, workspaceId, hidden),
    record: where.record,
  }
}

/**
 * THE BUNDLE AS A RUN READS IT: one markdown file, written where the run's output goes.
 *
 * IT IS A FILE AND NOT PART OF THE PROMPT. The coordinator's own notes are a quarter of a megabyte;
 * putting that in every prompt would spend a model call's worth of reading on every message and
 * would be cut off somewhere nobody chose. A file is read by the run when it wants it, whole, and
 * the prompt names it and says what is in it.
 *
 * THE TEXT IS BUILT HERE, ON THE SERVER, so the worker holds no view about what an agent knows —
 * the worker's own header says it holds no database path and this keeps that true.
 */
export function theBundleAsText(known: WhatTheAgentKnows): string {
  const lines: string[] = []
  lines.push(`# What ${known.name} knows`)
  lines.push('')
  lines.push(
    'Mole Office gathered this for the run answering a message as this agent. Nobody has this agent open in a ' +
      'terminal, so a fresh run is answering, and this is what that run would otherwise have no way of knowing.',
  )
  lines.push('')
  lines.push('## Its own notes')
  lines.push('')
  lines.push(known.notesSay)
  if (known.leftOut.length > 0) {
    lines.push('')
    lines.push('Not carried:')
    for (const one of known.leftOut) lines.push(`- ${one.name} — ${one.because}`)
  }
  for (const note of known.notes) {
    lines.push('')
    lines.push(`### ${note.name}`)
    lines.push('')
    lines.push(note.text.replace(/\n+$/, ''))
  }
  lines.push('')
  lines.push('## What it has written lately')
  lines.push('')
  if (known.recent.length === 0) {
    lines.push('Nothing in this project was written under this agent’s name. That is not the same as it having done')
    lines.push('nothing: it may have written under another name, or its work may be in another project.')
  } else {
    lines.push('Newest first. Read any of them with GET /api/records/<id>.')
    lines.push('')
    for (const one of known.recent) lines.push(`- ${one.when} · ${kindWord(one.kind).text} · ${one.id} · ${one.title}`)
  }
  if (known.record !== null) {
    lines.push('')
    lines.push(`Its own record in this project is ${known.record}.`)
  }
  return `${lines.join('\n')}\n`
}
