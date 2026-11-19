// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD-DUTY CHECK: A NOTEBOOK, OR A PROJECT'S MODULES OR FLOWS, LEFT UNCHANGED. Problem UBCrM0LoMCm3 (nothing reminded or
 * checked a secretary's record duties), decision jlXCnK4feOuR as refined by aZGg6gerakM1, both the coordinator's, of 5 October
 * 2026.
 *
 * - A NOTEBOOK unchanged for 7 days reminds the agent it belongs to (its `agentHandle`), in the notebook's project. A
 *   notebook holds lasting lessons and ways of working, not what happened each day, so the reminder asks whether there
 *   is a new lesson and says that an unchanged notebook may be right. The age was 3 days until 11 November 2026; a
 *   later decision of the coordinator's made it 7, because a short age pushed the notebook towards a diary.
 * - A PROJECT'S MODULES unchanged for 14 days remind the ONE secretary named for that project, in one line that names
 *   them all. Who that is comes from the one reading in lib/module-reminder-secretaries.ts: the secretary set on the
 *   Settings page, or, when nothing is set there, MOLE_OFFICE_MODULE_REMINDER_SECRETARIES (wave 13p round 29). A module changes only when its part
 *   changes, so the age is longer. Stable and retired modules are left out (`MODULE_STATES_LEFT_OUT_OF_THE_AGE_CHECK`).
 * - A PROJECT'S FLOWS unchanged for 14 days remind the same one secretary, in a second line that names them all (wave
 *   13j round 50). A retired flow is left out, by the rule the Flows page folds it by (`isRetired` in lib/flows.ts; wave
 *   13y round 141).
 *
 * "Unchanged" is the record's own `updatedAt`. Each line is said at most once a local day: for a notebook, once per
 * notebook; for modules and for flows, once per project each. The tick finds what it has already said today from the office's own lines,
 * the way the draft reminder does, so no flag elsewhere can disagree with what was written. It never blocks anything:
 * it writes office lines and nothing else.
 *
 * WHAT IT COULD NOT SAY is handed back as sentences for the server's log, each once while this server runs: a project
 * with modules left unchanged and nobody named, a name that answers to no one agent, a named project that does not
 * exist, a notebook that names no agent. Revisit after a week of reminders (decision jlXCnK4feOuR).
 */
import { and, eq, isNull, not, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records, STORED_FIELDS } from '../db/schema.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { MODULE_STATES_LEFT_OUT_OF_THE_AGE_CHECK } from '@shared/kinds.ts'
import { FLOW_KIND } from '@shared/flow.ts'
import { NOTEBOOK_KIND } from '@shared/notebook.ts'
import { moleOffice } from '@shared/participants.ts'
import { localStamp, parseStoredStamp } from '@shared/time.ts'
import { isRetired } from '../db/is-retired.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theModuleReminderSecretaries } from './module-reminder-secretaries.ts'
import { everyAgentAStoredStampCouldName, type Actor } from './records.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'

/** Days without a change after which a notebook is stale (decision jlXCnK4feOuR; 7 since 11 November 2026). */
export const A_NOTEBOOK_IS_STALE_AFTER_DAYS = 7
/** Days without a change after which a module is stale (decision jlXCnK4feOuR). */
export const A_MODULE_IS_STALE_AFTER_DAYS = 14
/**
 * Days without a change after which a flow is stale. NO DECISION SETS THIS AGE: jlXCnK4feOuR set the notebook's and the
 * module's only. A flow, like a module, changes only when what it describes changes, so it takes the module's 14 days
 * and goes to the module's one secretary (wave 13j round 50). The secretary may set another.
 */
export const A_FLOW_IS_STALE_AFTER_DAYS = A_MODULE_IS_STALE_AFTER_DAYS

const DAY_MS = 24 * 60 * 60 * 1000

/** What one pass did: the lines it wrote, and what it could not say, each sentence once while this server runs. */
export interface TheStaleCheck {
  reminded: string[]
  couldNotSay: string[]
}

/** What this server has already said in its log, by what it was about, so each is said once even as its numbers change. */
const alreadyLogged = new Set<string>()

/** The office's lines of this check already written today, as `notebook:<id>` and `modules:<project>`. */
function saidToday(day: string): Set<string> {
  const said = new Set<string>()
  for (const one of db
    .select({ about: sql<unknown>`json_extract(${records.data}, '$.extra.staleCheck.about')` })
    .from(records)
    .where(
      and(
        // ONLY THE MESSAGES CHANGED SINCE THE DAY BEFORE ARE READ, through `records_updated_idx`. A line of this check
        // carries the local day it was written on, and every write sets `updated_at` to the local stamp, so no line of
        // today is older than today; the day before is for a clock change. The office's own messages were found through
        // the index of senders before, and that was every one of its 14,000 lines, about 13 ms of every minute on a copy at
        // the live counts (wave 13y round 17). The `+` keeps SQLite off the kind index and the senders' index.
        sql`${records.updatedAt} >= datetime(${day}, '-1 day')`,
        sql`+${records.kind} = 'message'`,
        sql`+${STORED_FIELDS.messageSentById(records.data)} = ${moleOffice().id}`,
        isNull(records.deletedAt),
        sql`json_extract(${records.data}, '$.extra.staleCheck.day') = ${day}`,
        sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent' AND json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}`,
      ),
    )
    .all()) {
    if (typeof one.about === 'string') said.add(one.about)
  }
  return said
}

/** The one live agent a stored handle names, or why there is none. The nightly governs check reads it too. */
export function theOneAgent(handle: string): { id: string; handle: string } | string {
  const named = everyAgentAStoredStampCouldName(handle)
  if (named.length === 0) return `no registered agent answers to "${handle}"`
  if (named.length > 1) return `"${handle}" could mean more than one agent`
  if (named[0]!.retired) return `${named[0]!.handle} is retired`
  return named[0]!
}

/**
 * A record's rows of one kind in one project, with how many whole days it has gone unchanged, or null when its time cannot be read.
 * `also` is a further condition a row must meet to be read.
 */
function theAgesOf(kind: string, workspaceId: string, at: number, also?: SQL) {
  return db
    .select({ id: records.id, title: records.title, data: records.data, updatedAt: records.updatedAt })
    .from(records)
    .where(and(eq(records.kind, kind), eq(records.workspaceId, workspaceId), isNull(records.deletedAt), also))
    .all()
    .map((row) => {
      const changed = parseStoredStamp(row.updatedAt)
      return { ...row, days: changed === null ? null : Math.floor((at - changed) / DAY_MS) }
    })
}

/**
 * ONE PASS OF THE RECORD-DUTY CHECK, in every project of the installation. Called by the office's reminder tick,
 * `sendTheRemindersThatAreDue` in lib/reminders.ts, with its clock. MOLE_OFFICE_MODULE_REMINDER_SECRETARIES that
 * cannot be read throws when some project has nothing set on the Settings page and so depends on it, and the tick says
 * so in its log and runs every other sweep. When every project has a secretary set there, the line is not needed and
 * the check runs.
 */
export function sendTheStaleRecordRemindersThatAreDue(now: Date, by: Actor): TheStaleCheck {
  const at = now.getTime()
  const day = localStamp(now).slice(0, 10)
  // THE ONE READING OF WHO IS REMINDED, the same one the Settings page shows (invariant 9).
  const secretaries = theModuleReminderSecretaries()
  if (!secretaries.envLine.readable && secretaries.projects.some((one) => one.storedHere === null)) {
    throw new Error(secretaries.envLine.why)
  }
  const done: TheStaleCheck = { reminded: [], couldNotSay: [] }
  const sayOnce = (about: string, sentence: string): void => {
    if (alreadyLogged.has(about)) return
    alreadyLogged.add(about)
    done.couldNotSay.push(sentence)
  }
  let said: Set<string> | null = null
  const projects = listWorkspaces()
  for (const named of secretaries.envNamesUnknownProjects) {
    if (!projects.some((one) => one.id === named)) sayOnce(`project:${named}`, `MOLE_OFFICE_MODULE_REMINDER_SECRETARIES names the project "${named}", which does not exist`)
  }

  for (const project of projects) {
    for (const notebook of theAgesOf(NOTEBOOK_KIND, project.id, at)) {
      if (notebook.days === null) {
        sayOnce(`time:${notebook.id}`, `the notebook ${notebook.id} in ${project.id} has a change time that cannot be read ("${notebook.updatedAt}")`)
        continue
      }
      if (notebook.days < A_NOTEBOOK_IS_STALE_AFTER_DAYS) continue
      said ??= saidToday(day)
      const about = `notebook:${notebook.id}`
      if (said.has(about)) continue
      const handle = (notebook.data as Record<string, unknown> | null)?.['agentHandle']
      const agent = typeof handle === 'string' ? theOneAgent(handle) : 'it names no agent'
      if (typeof agent === 'string') {
        sayOnce(about, `the notebook ${notebook.id} in ${project.id} has not changed for ${notebook.days} days, and nobody was reminded: ${agent}`)
        continue
      }
      writeASystemLineToOne(
        { kind: 'agent', id: agent.id },
        project.id,
        SYSTEM_LINES.aNotebookHasNotChanged(
          `Your notebook "${notebook.title}" (${notebook.id}) in ${project.id} has not changed for ${notebook.days} days, ` +
            `since ${notebook.updatedAt}. A notebook holds lasting lessons and ways of working, not what happened ` +
            `each day, so after ${A_NOTEBOOK_IS_STALE_AFTER_DAYS} days Mole Office asks: is there a new lesson, a new way of ` +
            `working, or a change in how the person wants to be answered? If so, fold it into the entry of its kind. ` +
            `If not, leave the notebook as it is. It says so at most once a day while the notebook stays unchanged, and it blocks nothing.`,
        ),
        by,
        undefined,
        { staleCheck: { day, about } },
      )
      said.add(about)
      done.reminded.push(`${agent.handle} about ${notebook.id}`)
    }

    const staleModules = theAgesOf('module', project.id, at).filter((module) => {
      const state = (module.data as Record<string, unknown> | null)?.['state']
      if (typeof state === 'string' && (MODULE_STATES_LEFT_OUT_OF_THE_AGE_CHECK as readonly string[]).includes(state)) return false
      if (module.days === null) {
        sayOnce(`time:${module.id}`, `the module ${module.id} in ${project.id} has a change time that cannot be read ("${module.updatedAt}")`)
        return false
      }
      return module.days >= A_MODULE_IS_STALE_AFTER_DAYS
    })
    // A RETIRED FLOW IS LEFT OUT, by the rule the Flows page folds it by, so the two cannot disagree (wave 13y round 141).
    const staleFlows = theAgesOf(FLOW_KIND, project.id, at, not(isRetired)).filter((flow) => {
      if (flow.days === null) {
        sayOnce(`time:${flow.id}`, `the flow ${flow.id} in ${project.id} has a change time that cannot be read ("${flow.updatedAt}")`)
        return false
      }
      return flow.days >= A_FLOW_IS_STALE_AFTER_DAYS
    })
    for (const group of [
      { word: 'modules', stale: staleModules, days: A_MODULE_IS_STALE_AFTER_DAYS, line: SYSTEM_LINES.modulesHaveNotChanged, left: 'Stable and retired modules are not counted. ', change: 'if its part has changed' },
      { word: 'flows', stale: staleFlows, days: A_FLOW_IS_STALE_AFTER_DAYS, line: SYSTEM_LINES.flowsHaveNotChanged, left: 'Retired flows are not counted. ', change: 'if what actually happens has changed' },
    ] as const) {
      const { word, stale, days } = group
      if (stale.length === 0) continue
      const inForce = secretaries.projects.find((one) => one.project === project.id)?.inForce
      if (inForce === undefined) throw new Error(`The project ${project.id} is not in the reading of who is reminded about modules, which was read a moment before. Nothing was guessed.`)
      if (inForce.from === 'nobody named' || inForce.from === '.env line unreadable') {
        sayOnce(`${word}:${project.id}`, `${project.id} has ${stale.length} ${word} unchanged for ${days} days or more, and nobody is named for it on the Settings page or in MOLE_OFFICE_MODULE_REMINDER_SECRETARIES, so nobody was reminded`)
        continue
      }
      if (inForce.from === 'set here, cannot remind') {
        sayOnce(`${word}:${project.id}`, `${project.id} has ${stale.length} ${word} unchanged for ${days} days or more, and nobody was reminded: the secretary set for it on the Settings page, ${inForce.storedName}, is ${inForce.cannotBecause}`)
        continue
      }
      said ??= saidToday(day)
      const about = `${word}:${project.id}`
      if (said.has(about)) continue
      // SET HERE NAMES AN AGENT BY ITS REGISTRY ID, ALREADY CHECKED. The .env line names a handle, resolved here as before.
      const agent = inForce.from === 'set here' ? inForce.agent : theOneAgent(inForce.handle)
      if (typeof agent === 'string') {
        sayOnce(about, `${project.id} has ${stale.length} ${word} unchanged for ${days} days or more, and nobody was reminded: ${agent}`)
        continue
      }
      writeASystemLineToOne(
        { kind: 'agent', id: agent.id },
        project.id,
        group.line(
          `${stale.length} ${word} in ${project.id} have not changed for ${days} days or more. You are the ` +
            `secretary named to hear about this project's modules and flows. ${group.left}Look at each, and ` +
            `change it ${group.change}: ` +
            stale.map((one) => `"${one.title}" (${one.id}), unchanged for ${one.days} days`).join('; ') +
            '. Mole Office says this at most once a day, and it blocks nothing.',
        ),
        by,
        undefined,
        { staleCheck: { day, about, [word]: stale.map((one) => one.id) } },
      )
      said.add(about)
      done.reminded.push(`${agent.handle} about ${stale.length} ${word} in ${project.id}`)
    }
  }
  return done
}
