// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A THROWAWAY OFFICE OF THE LIVE OFFICE'S SHAPE, FOR THE NINE SLOWEST READS. Made-up rows only.
 *
 * Round 13 of wave 13y followed a decision to optimise first. On 9 October 2026 the office's
 * call log (briefs/api-timings-24h.json) showed reads of seconds on the owner's chat page: GET /api/messages/comments,
 * /api/messages/between-agents, /api/messages/groups, /api/participants, /api/presence, /api/messages/contacts,
 * /api/groups and /api/resources, and POST /api/resources/:id/release.
 *
 * IT STARTS FROM THE CHAT'S OFFICE (tests/the-chat-office-of-the-live-shape.ts), which holds the agents, messages,
 * groups and runs, and adds what those reads also read and that office does not hold:
 *   - open runs, some of them with a recent request in `api_calls`, and old rows of `api_calls`, which presence reads;
 *   - comments on the project's records, which GET /api/messages/comments reads;
 *   - a ledger of live and released resource rows, which GET /api/resources reads.
 *
 * EVERY ROW HAS A FIXED ID AND A FIXED TIME, so two builds give the same answers and an answer can be compared with
 * one taken before a change. Times are counted back from `THE_MEASURED_NOW`, the moment a test pins the clock to.
 * Every pid and port in the ledger is one nothing on a machine uses, so no answer depends on what is running.
 */
import type Database from 'better-sqlite3'
import { buildTheChatOffice, type Shape, type TheChatOffice } from './the-chat-office-of-the-live-shape.ts'

/** The moment the measured requests are made at. A test pins `Date` to it. */
export const THE_MEASURED_NOW = new Date(2026, 9, 9, 12, 0, 0)

/** How many of each extra row to make. */
export interface TheExtras {
  /** Runs still open, out of the chat office's runs. */
  openRuns: number
  /** How many of those have a request in the last few minutes. */
  runsWithARecentRequest: number
  /** Older rows of `api_calls`. The live office had 944,834 on 27 September 2026. */
  oldApiCalls: number
  /** Comments on records of the project. The page's read answered 33 on average. */
  comments: number
  /** Resource rows still open. The live read answered 76 on average. */
  liveResources: number
  /** Resource rows released. */
  releasedResources: number
}

/** The live office's numbers, as the header says. */
export const THE_LIVE_EXTRAS: TheExtras = {
  openRuns: 1_500,
  runsWithARecentRequest: 36,
  oldApiCalls: 200_000,
  comments: 40,
  liveResources: 76,
  releasedResources: 3_400,
}

/** A local wall-clock stamp `minutes` before the measured moment, as the records table writes one. */
function stampBefore(minutes: number): string {
  const at = new Date(THE_MEASURED_NOW.getTime() - minutes * 60_000)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

/** A pid no machine gives out: Linux's highest is 4,194,304. */
const NO_SUCH_PID = 9_000_000

/** Builds the chat office of `shape` and the extras in the database `sqlite` holds, in one transaction each. */
export function buildTheOfficeOfTheSlowestReads(
  sqlite: Database.Database,
  person: string,
  shape: Shape,
  extras: TheExtras = THE_LIVE_EXTRAS,
): TheChatOffice {
  const chat = buildTheChatOffice(sqlite, person, shape)
  sqlite.transaction(() => {
    // OPEN RUNS: the newest runs of the chat office, still running, some of them asking now.
    const sessions = (sqlite.prepare(`select id from records where kind = 'session' and origin = 'fixture' order by id desc limit ?`).all(extras.openRuns) as { id: string }[]).map((one) => one.id)
    const open = sqlite.prepare(`update records set data = json_set(data, '$.state', 'running') where id = ?`)
    for (const id of sessions) open.run(id)
    const call = sqlite.prepare(
      `insert into api_calls (id, at_ms, ms, method, waits, status, session_id, identity_source) values (?, ?, 1.0, 'GET', 0, 200, ?, 'header')`,
    )
    const now = THE_MEASURED_NOW.getTime()
    for (let i = 0; i < extras.runsWithARecentRequest && i < sessions.length; i++) call.run(`call-recent-${String(i)}`, now - (i % 5) * 60_000, sessions[i * 7 % sessions.length])
    for (let i = 0; i < extras.oldApiCalls; i++) call.run(`call-old-${String(i)}`, now - 3_600_000 - i * 1000, null)

    // COMMENTS: messages from the person to an agent, pointing at a record of the project.
    const targets = (sqlite.prepare(`select id from records where workspace_id = 'default' and kind <> 'session' order by id limit ?`).all(extras.comments) as { id: string }[]).map((one) => one.id)
    const someone = (sqlite.prepare(`select id from agents where retired = 0 and handle <> 'mole-office' order by id limit 1`).get() as { id: string }).id
    const addRecord = sqlite.prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, 'message-centre', 'owner', ?, ?, 'message', ?, null, ?, null, 'fixture')`,
    )
    const addDelivery = sqlite.prepare(
      `insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because, run, inferred_by) values (?, ?, 'agent', ?, 'seen', ?, null, null, null)`,
    )
    targets.forEach((recordId, i) => {
      const at = stampBefore(600 - i)
      const id = `comment-${String(i).padStart(3, '0')}`
      const data = {
        body: `A made-up remark ${String(i)} about this record.`,
        to: [{ kind: 'agent', id: someone }],
        target: { target: { kind: 'record', recordId, workspaceId: 'default' }, place: { at: 'surface' } },
        writtenIn: { project: 'default' },
        writtenFrom: { how: 'this machine', machine: 'made-up-machine' },
        sentBy: { kind: 'person', id: person },
      }
      addRecord.run(id, at, at, `A made-up remark ${String(i)}`, JSON.stringify(data))
      addDelivery.run(`comment-delivery-${String(i).padStart(3, '0')}`, id, someone, at)
    })

    // THE LEDGER: live rows of processes, ports and locks, against open runs, and released rows against finished ones.
    const addResource = sqlite.prepare(
      `insert into session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by, released_at, released_by, release_note, world, started_by_the_product)
       values (?, 'default', ?, ?, ?, ?, ?, ?, ?, 'made-up-agent', ?, ?, ?, null, 0)`,
    )
    const finished = (sqlite.prepare(`select id from records where kind = 'session' and json_extract(data, '$.state') = 'finished' order by id limit 200`).all() as { id: string }[]).map((one) => one.id)
    for (let i = 0; i < extras.liveResources; i++) {
      const type = i % 10 < 6 ? 'process' : i % 10 < 9 ? 'port' : 'lock'
      const pid = NO_SUCH_PID + i
      const key = type === 'process' ? String(pid) : type === 'port' ? String(61_000 + i) : `/tmp/made-up-${String(i)}.lock`
      addResource.run(`resource-live-${String(i).padStart(4, '0')}`, sessions[i % sessions.length], type, key, type === 'process' ? pid : null, type === 'process' ? stampBefore(300) : null, `A made-up ${type} for a measurement`, stampBefore(300 - i), null, null, null)
    }
    for (let i = 0; i < extras.releasedResources; i++) {
      const pid = NO_SUCH_PID + 10_000 + i
      addResource.run(`resource-released-${String(i).padStart(5, '0')}`, finished[i % finished.length], 'process', String(pid), pid, stampBefore(20_000), 'A made-up process for a measurement', stampBefore(20_000 - i), stampBefore(10_000 - i), 'made-up-agent', 'made up')
    }
  })()
  return chat
}
