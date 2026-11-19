// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S OWN ROW, AND EVERY DURABLE AGENT MOVED INTO THE REGISTRY. A data migration.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, IN FOUR ACTS
 * ---------------------------------------------------------------------------------------
 *
 * 1. Writes or checks the one person this installation has, its owner, through
 *    `settleTheOfficeOwner` in src/server/db/owner-setting.ts: at the first migrate the owner comes
 *    from MOLE_OFFICE_OWNER_ID and MOLE_OFFICE_OWNER_NAME, and a new owner row gets the picture this
 *    product draws for that id. That file says every case, and which ones stop the migrate.
 * 2. Writes Mole Office's own participant row, which criterion M11 gives it so that the lines
 *    saying a group was opened, a member was added or two claims are in conflict have a sender.
 * 3. Writes one `agents` row for each handle held by a record of kind `agent` that no registry row
 *    bears yet, with that record's own name and retired state, and the picture drawn for the new
 *    row's id.
 * 4. Writes one `agent_records` row per agent record not mapped yet, saying which registry row it is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN THE `.sql` FILE
 * ---------------------------------------------------------------------------------------
 *
 * Two reasons, and both are rules this repository already holds.
 *
 * A TIMESTAMP. Every stamp in this database is local wall-clock time, written by one writer in
 * src/shared/time.ts, and no column here carries a SQL default — tests/migration.test.ts fails a
 * database that has one, because a SQL default stamps rows with the machine's UTC clock and erases
 * the local time everything else is read against. A `.sql` file cannot call that writer.
 *
 * A NAME. An agent record's title is the name a reader sees, and reading it out of a record needs
 * the record. SQL could do it; what SQL could not do is REFUSE with a sentence when a handle is not
 * usable, which is the other half of this file.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO RUN TWICE, AND THAT IS CHECKED RATHER THAN CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * Every write is `INSERT ... ON CONFLICT DO NOTHING`, so a second run inserts nothing. The report
 * says how many rows each act really wrote, and a second run says zero for all of them. It writes no
 * `records` row, no revision and no change row: nothing here changes what any record holds.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT THE REGISTRY ALREADY HOLDS IS LEFT AS IT IS
 * ---------------------------------------------------------------------------------------
 *
 * This runs on every start, so it runs over agents the registration door made. Since criterion I1 of
 * design/agents/IDENTITY-ACCEPTANCE.md the door gives a new agent an id of its own, which is not its
 * handle. So an `ON CONFLICT(id)` guard alone cannot see that such an agent is already registered:
 * the insert would hit the unique index on `agents.handle`, and the whole step would roll back.
 * Two rules stop that. A record already in `agent_records` is left alone. A record whose handle a
 * registry row already bears is mapped onto that row, the way `keepTheAgentRegistryInStep` in
 * src/server/lib/participants.ts maps it at the door. So a handle that has a row never gets a
 * second one. Since criterion I3 a handle may be borne by one live row and several retired ones: the
 * record is mapped onto the live row, or onto the one retired row where no live row bears it, and
 * onto none where several retired rows bear it and no live one does. An agent this step makes for the
 * first time gets a new id that could not be a handle, because the re-mint reads an id that could be
 * a handle as legacy or uncertain.
 *
 * ---------------------------------------------------------------------------------------
 * MAPPED BY HANDLE, WHICH IS WHAT M2 ASKS FOR, WITH ONE CONSEQUENCE WRITTEN DOWN
 * ---------------------------------------------------------------------------------------
 *
 * A handle is unique inside a project and not across the installation. Two projects each holding an
 * agent with the handle `builder` therefore end up sharing ONE registry row, and both records point
 * at it. That is the reading criterion M2 states — *Every existing `agent` record maps to one
 * registry row by handle* — and the report counts those cases so the sharing is visible rather than
 * silent.
 *
 * DELETED RECORDS ARE MAPPED TOO. A soft-deleted agent record can be restored, and its inbox is
 * still there; leaving it out would mean a restore brought back a record that answered to nothing.
 * The registry row it maps to is not marked retired for being deleted, because deletion of a record
 * and retirement of an identity are different facts and this migration invents neither.
 */

import type Database from 'better-sqlite3'
import { nowStamp } from '@shared/time.ts'
import { describeTheOwner, settleTheOfficeOwner } from './owner-setting.ts'
import { theOwnerIsKnown } from '@shared/person.ts'
import { anIdForAnAgent } from './ids.ts'
import {
  AVATAR_ASSET_KIND,
  GENERATED_AVATAR_LICENCE,
  GENERATED_AVATAR_MIME,
  MOLE_OFFICE_HANDLE,
  MOLE_OFFICE_NAME,
  declaredRuntimeOrNull,
  defaultAvatarAssetId,
  whyHandleIsRefused,
} from '@shared/participants.ts'

/** One agent record's handle and what the registry row made from it should hold. */
interface AgentToRegister {
  handle: string
  /** The name a reader sees: the record's own title. */
  name: string
  /** The word the record actually carries, when it is not one of the three. Null when it is one, or none. */
  runtimeNobodyDeclared: string | null
  /** 1 when the record's state says retired. */
  retired: number
  retiredBecause: string | null
  /** The record's own `created_at`, which is when this identity was first written down. */
  createdAt: string
  /** Every record of kind `agent` holding this handle. More than one means two projects share it. */
  recordIds: string[]
  /** Those of `recordIds` that no `agent_records` row maps yet. Only these are mapped by this run. */
  unmappedRecordIds: string[]
  /**
   * The id of the registry row these records are, or null when no row bears this handle. The one
   * LIVE row bearing it; else, where no live row does, the one retired row bearing it.
   */
  registeredAs: string | null
  /**
   * The ids of every registry row bearing this handle, where more than one could be meant and none
   * is live, so these records are mapped onto nothing. Empty in every other case.
   */
  couldBeEitherOf: string[]
}

export interface ParticipantsMigrationReport {
  /** True when the tables are not there yet, which is the state before migration 0114 has run. */
  tableMissing: boolean
  /** 1 when this run wrote the owner's row, 0 when it was already there. */
  ownerWritten: number
  /** 1 when this run marked a person already here as the owner (an office from before the owner migration `the_owner_comes_from_the_installer`), else 0. */
  ownerMarked: number
  /** The owner's line, from `describeTheOwner`. Null when the tables are not there yet. */
  ownerSaid: string | null
  /** 1 when this run wrote Mole Office's own participant row, 0 when it was already there. */
  moleOfficeWritten: number
  /** How many registry rows this run wrote. */
  agentsWritten: number
  /** How many `agent_records` rows this run wrote. */
  recordsMapped: number
  /** How many asset rows this run wrote, one per participant it created. */
  avatarsWritten: number
  /** Handles held by more than one agent record, which therefore share one registry row. */
  handlesSharedAcrossRecords: string[]
  /** Agent records whose handle nothing could use, with the reason. Left unmapped rather than guessed at. */
  refused: { recordId: string; handle: string; because: string }[]
  /**
   * Agent records left unmapped because more than one retired registry row bears their handle and no
   * live one does. Criterion I3 lets a handle be taken again after retirement, so several retired
   * agents may bear one, and picking one of them would name the wrong agent in silence.
   */
  couldBeEither: { handle: string; recordIds: string[]; rows: string[] }[]
  /**
   * Registry rows left with no runtime because the record named one nobody declared, and the word.
   *
   * IT IS SAID OUT LOUD RATHER THAN LEFT AS AN EMPTY COLUMN. A column that quietly went empty would
   * look exactly like a record that never said anything, and those are two different facts.
   */
  runtimesNobodyDeclared: { handle: string; said: string }[]
}

/** Whether the four tables this writes into exist yet. */
function tablesPresent(sqlite: Database.Database): boolean {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('assets', 'people', 'agents', 'agent_records')",
    )
    .all() as { name: string }[]
  return rows.length === 4
}

/**
 * What this run would write, worked out before anything is written.
 *
 * Exported so a test can read the plan without applying it, the way the other data migrations here
 * are tested.
 */
export function planParticipants(sqlite: Database.Database): {
  tableMissing: boolean
  agents: AgentToRegister[]
  refused: ParticipantsMigrationReport['refused']
} {
  if (!tablesPresent(sqlite)) return { tableMissing: true, agents: [], refused: [] }

  const rows = sqlite
    .prepare(
      `SELECT id,
              title,
              created_at AS createdAt,
              json_extract(data, '$.handle') AS handle,
              json_extract(data, '$.runtime') AS runtime,
              json_extract(data, '$.state') AS state,
              json_extract(data, '$.retiredBecause') AS retiredBecause
         FROM records
        WHERE kind = 'agent'
        ORDER BY created_at, id`,
    )
    .all() as {
    id: string
    title: string | null
    createdAt: string
    handle: unknown
    runtime: unknown
    state: unknown
    retiredBecause: unknown
  }[]

  const byHandle = new Map<string, AgentToRegister>()
  const refused: ParticipantsMigrationReport['refused'] = []

  for (const row of rows) {
    const handle = typeof row.handle === 'string' ? row.handle.trim() : ''
    // A RECORD WITH NO USABLE HANDLE IS LEFT UNMAPPED AND NAMED. The kind requires one, so this is
    // a row written before the rule or through the import, and inventing a handle for it would put
    // an address into the registry that nobody chose and that another agent may later ask for.
    const because = handle === '' ? 'The record carries no handle.' : whyHandleIsRefused(handle)
    if (because !== null) {
      refused.push({ recordId: row.id, handle, because })
      continue
    }
    const existing = byHandle.get(handle)
    if (existing !== undefined) {
      existing.recordIds.push(row.id)
      continue
    }
    byHandle.set(handle, {
      handle,
      // The record's title is the human name, exactly as the `agent` kind's own words say. A record
      // with no title falls back to the handle, which is the only other name anybody wrote down.
      name: row.title === null || row.title.trim() === '' ? handle : row.title.trim(),
      // WHAT THE RECORD SAID, WHEN IT IS NOT ONE OF THE THREE, so the report can name it. The
      // record keeps this word, and the registry row carries no runtime at all any
      // more. So there is no column here to stay empty. See `declaredRuntimeOrNull` and
      // problem `3zYuz90LvTS5`.
      runtimeNobodyDeclared:
        declaredRuntimeOrNull(row.runtime) === null && typeof row.runtime === 'string' && row.runtime.trim() !== ''
          ? row.runtime.trim()
          : null,
      retired: row.state === 'retired' ? 1 : 0,
      retiredBecause:
        row.state === 'retired' && typeof row.retiredBecause === 'string' && row.retiredBecause.trim() !== ''
          ? row.retiredBecause.trim()
          : null,
      createdAt: row.createdAt,
      recordIds: [row.id],
      unmappedRecordIds: [],
      registeredAs: null,
      couldBeEitherOf: [],
    })
  }

  // WHAT THE REGISTRY ALREADY HOLDS, read once per handle. The file header says why this matters.
  //
  // A HANDLE IS UNIQUE AMONG LIVE ROWS ONLY (criterion I3, migration 0174), so every row bearing it is
  // read. The one live row is the agent at work under that name. Where no live row bears it, the one
  // retired row does. Where several retired rows bear it and no live one, nothing says which of them
  // these records are, so they are mapped onto none.
  const mapped = sqlite.prepare('SELECT 1 FROM agent_records WHERE record_id = ?')
  const bearers = sqlite.prepare('SELECT id, retired FROM agents WHERE handle = ? ORDER BY id')
  for (const agent of byHandle.values()) {
    agent.unmappedRecordIds = agent.recordIds.filter((id) => mapped.get(id) === undefined)
    const rows = bearers.all(agent.handle) as { id: string; retired: number }[]
    const live = rows.filter((row) => row.retired === 0)
    if (live.length === 1) agent.registeredAs = live[0]!.id
    else if (rows.length === 1) agent.registeredAs = rows[0]!.id
    else if (rows.length > 1) agent.couldBeEitherOf = rows.map((row) => row.id)
  }

  return { tableMissing: false, agents: [...byHandle.values()], refused }
}

/**
 * Write the owner's row, the registry rows and the mapping. Nothing else in this database moves.
 */
export function migrateParticipants(sqlite: Database.Database): ParticipantsMigrationReport {
  const plan = planParticipants(sqlite)
  const report: ParticipantsMigrationReport = {
    tableMissing: plan.tableMissing,
    ownerWritten: 0,
    ownerMarked: 0,
    ownerSaid: null,
    moleOfficeWritten: 0,
    agentsWritten: 0,
    recordsMapped: 0,
    avatarsWritten: 0,
    handlesSharedAcrossRecords: plan.agents.filter((a) => a.recordIds.length > 1).map((a) => a.handle),
    runtimesNobodyDeclared: plan.agents
      .filter((a) => a.runtimeNobodyDeclared !== null)
      .map((a) => ({ handle: a.handle, said: a.runtimeNobodyDeclared ?? '' })),
    refused: plan.refused,
    couldBeEither: plan.agents
      .filter((a) => a.couldBeEitherOf.length > 0 && a.unmappedRecordIds.length > 0)
      .map((a) => ({ handle: a.handle, recordIds: a.unmappedRecordIds, rows: a.couldBeEitherOf })),
  }
  if (plan.tableMissing) return report

  const stamp = nowStamp()

  const insertAsset = sqlite.prepare(
    'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) ' +
      "VALUES (?, ?, 'default', NULL, ?, NULL, ?, NULL, NULL, ?) ON CONFLICT(id) DO NOTHING",
  )
  const insertPerson = sqlite.prepare(
    'INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at, created_by_kind, created_by_id) ' +
      'VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, NULL) ON CONFLICT(id) DO NOTHING',
  )
  const insertAgent = sqlite.prepare(
    // NO RUNTIME. The registry row carried a copy of the agent record's `data.runtime`, and that
    // second copy was the defect (problem KVvt74765Na1). A decision makes the record the one
    // store. So this row has none to write.
    'INSERT INTO agents (id, name, handle, avatar_asset_id, state, state_at, retired, retired_because, ' +
      'created_at, created_by_kind, created_by_id) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, NULL) ' +
      'ON CONFLICT(id) DO NOTHING',
  )
  const mapRecord = sqlite.prepare(
    'INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?) ON CONFLICT(record_id) DO NOTHING',
  )

  const apply = sqlite.transaction(() => {
    // 1. THE OWNER, from the setting in the database, written at the first migrate from what the
    //    installer set (src/server/db/owner-setting.ts). A new owner row is made the way it always
    //    was: the picture this product draws for that id, then the row.
    const owner = settleTheOfficeOwner(sqlite, (id, name) => {
      const ownerAvatar = defaultAvatarAssetId({ kind: 'person', id })
      report.avatarsWritten += insertAsset.run(
        ownerAvatar,
        AVATAR_ASSET_KIND,
        GENERATED_AVATAR_MIME,
        stamp,
        GENERATED_AVATAR_LICENCE,
      ).changes
      report.ownerWritten += insertPerson.run(id, name, id, ownerAvatar, stamp).changes
    })
    if (owner !== null && owner.did === 'marked') report.ownerMarked = 1
    // AND THIS PROCESS NOW KNOWS WHO OWNS THE OFFICE IT MIGRATED (@shared/person.ts).
    if (owner !== null) theOwnerIsKnown(owner.owner.id)
    report.ownerSaid =
      owner === null
        ? 'The migrations run so far do not make people.office_owner yet, so no owner was written.'
        : describeTheOwner(owner)

    // 2. MOLE OFFICE ITSELF, which criterion M11 makes a participant so that the lines saying a
    //    group was opened, a member was added or two claims are in conflict have a sender and are
    //    not faked as an agent's. Its row is in `agents` because that registry already holds a name,
    //    a handle, a picture and a state, and M2 says there are two registries and no third. What
    //    tells it apart from an agent somebody runs is `isMoleOffice` in shared/participants.ts,
    //    which every screen that draws a message asks.
    //
    //    NO RUNTIME AND NEVER RETIRED. Nothing serves it, because it is not a run: it has no agent
    //    record naming a runtime, so the registry's `runtime` reads NULL and its presence therefore
    //    reads offline, which is the honest answer. `retired` is 0 and no door can set it: the retire
    //    door refuses this row to every caller, the person included (`whoMayRetire` in
    //    lib/participants.ts), and the handle `mole-office` is refused to every agent record by
    //    `whyHandleIsRefused`, so nothing can map a record onto this row and retire it through the
    //    record's state.
    // FIND THE LIVE ROW BY HANDLE, so a row whose id is already minted remains the one office row.
    // A live row is left as it is, id and picture together: rebuilding the picture from a new id
    // would change its face. A fresh database gets an id that could not be a handle. This step never
    // re-mints a row.
    const liveOffice = sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(MOLE_OFFICE_HANDLE)
    if (liveOffice === undefined) {
      const moleOfficeId = anIdForAnAgent()
      const moleOfficeAvatar = defaultAvatarAssetId({ kind: 'agent', id: moleOfficeId })
      report.avatarsWritten += insertAsset.run(
        moleOfficeAvatar,
        AVATAR_ASSET_KIND,
        GENERATED_AVATAR_MIME,
        stamp,
        GENERATED_AVATAR_LICENCE,
      ).changes
      report.moleOfficeWritten += insertAgent.run(
        moleOfficeId,
        MOLE_OFFICE_NAME,
        MOLE_OFFICE_HANDLE,
        moleOfficeAvatar,
        0,
        null,
        stamp,
      ).changes
    }

    // 3. THE DURABLE AGENTS. Each new row gets an id that could not be a handle, drawn here because
    //    this step writes the row. The handle is only a name and may be changed afterwards; the id
    //    may not, and an id is opaque once written.
    for (const agent of plan.agents) {
      // EVERY RECORD OF THIS HANDLE IS MAPPED ALREADY, so there is nothing to write for it.
      if (agent.unmappedRecordIds.length === 0) continue
      // SEVERAL RETIRED ROWS BEAR THIS HANDLE AND NO LIVE ONE DOES, so these records could be any of
      // them. Nothing is written for them, and the report names them.
      if (agent.couldBeEitherOf.length > 0) continue
      // A ROW ALREADY BEARS THIS HANDLE, whatever its id is, so these records are that agent. No new
      // row and no new picture: only the mapping is written.
      if (agent.registeredAs !== null) {
        for (const recordId of agent.unmappedRecordIds) {
          report.recordsMapped += mapRecord.run(recordId, agent.registeredAs).changes
        }
        continue
      }
      const id = anIdForAnAgent()
      const avatar = defaultAvatarAssetId({ kind: 'agent', id })
      report.avatarsWritten += insertAsset.run(
        avatar,
        AVATAR_ASSET_KIND,
        GENERATED_AVATAR_MIME,
        stamp,
        GENERATED_AVATAR_LICENCE,
      ).changes
      report.agentsWritten += insertAgent.run(
        id,
        agent.name,
        agent.handle,
        avatar,
        agent.retired,
        agent.retiredBecause,
        // THE RECORD'S OWN CREATION TIME, because that is when this identity was first written down.
        // Using this run's clock would say every agent in the corpus was created the day the
        // registry arrived, which is a fact about the migration and not about the agent.
        agent.createdAt,
      ).changes

      // 4. THE MAPPING. Nothing is deleted: the record stays, and this row says what it is.
      for (const recordId of agent.unmappedRecordIds) {
        report.recordsMapped += mapRecord.run(recordId, id).changes
      }
    }
  })

  apply()
  return report
}

/** One line for the migration report, whether this step did anything or not. */
export function describeParticipants(report: ParticipantsMigrationReport): string {
  if (report.tableMissing) {
    return (
      'participants: this database has no `people` table, so NOTHING was written and nothing was skipped over — ' +
      'there was nowhere to write. Migration 0114 creates the four tables; point the command at the whole ' +
      'drizzle/ folder.'
    )
  }
  const wrote =
    report.ownerWritten + report.ownerMarked + report.moleOfficeWritten + report.agentsWritten + report.recordsMapped + report.avatarsWritten ===
    0
      ? 'participants: Nothing to do. The owner, Mole Office itself and every durable agent are already registered. Nothing was written.'
      : `participants: ${report.ownerWritten} owner row, ${report.moleOfficeWritten} row for Mole Office itself, ` +
        `${report.agentsWritten} registry row(s) for durable agents, ` +
        `${report.avatarsWritten} generated picture(s), ${report.recordsMapped} record(s) mapped to the agent ` +
        `each one is. No record was changed and none was deleted.`
  const lines = [wrote]
  if (report.ownerSaid !== null) lines.push(report.ownerSaid)
  if (report.handlesSharedAcrossRecords.length > 0) {
    lines.push(
      `${report.handlesSharedAcrossRecords.join(', ')}: this handle is held by an agent record in more than one ` +
        'project, and criterion M2 maps by handle, so those records share one registry row. That is stated here ' +
        'rather than left for somebody to notice.',
    )
  }
  for (const one of report.refused) {
    lines.push(
      `${one.recordId} was left unmapped: ${one.because} Nothing was invented for it, so it answers to no ` +
        'registry row until somebody gives it a usable handle.',
    )
  }
  for (const one of report.couldBeEither) {
    lines.push(
      `${one.recordIds.join(', ')} ${one.recordIds.length === 1 ? 'was' : 'were'} left unmapped: the handle ` +
        `"${one.handle}" is borne by ${String(one.rows.length)} retired registry rows (${one.rows.join(', ')}) and by ` +
        'no live one, so nothing says which of them the record is. Nothing was written for it.',
    )
  }
  for (const one of report.runtimesNobodyDeclared) {
    lines.push(
      `${one.handle} says its runtime is "${one.said}", which is not one this product has an adapter for, so its ` +
        'registry row says nothing about which runtime serves it. The record keeps the word it was written with; ' +
        'nothing here rewrote it to the nearest one on the list.',
    )
  }
  return lines.join(' ')
}
