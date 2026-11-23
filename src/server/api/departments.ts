// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEPARTMENTS OF THIS PROJECT: TWO READ DOORS AND TWO WRITE DOORS. Wave 13s round 281, step 1 of departments and
 * posts.
 *
 *   GET  /api/departments       one page of the top departments, each with every department under it, or that nobody
 *                               has filed one                                                     (anyone who may read)
 *   POST /api/departments       files a department                                                (the person, or a secretary on the person's words)
 *   GET  /api/departments/:id   one department, the departments directly under it, and its history (anyone who may read)
 *   PUT  /api/departments/:id   writes one department                                             (the person, or a secretary on the person's words)
 *
 * src/server/lib/grant/departments.ts is the one guard: src/server/lib/records.ts calls it on every create, change,
 * delete, restore and move of the kind, so this file only finds the record and hands the write on. The level word, the
 * team count, the leader, the head, the project part and the order of the top departments are worked out by
 * src/server/lib/departments.ts on every request and stored nowhere.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  DEPARTMENT_FIELDS,
  DEPARTMENTS_ON_A_PAGE_AT_MOST,
  type ADepartmentWritten,
  type OneDepartment,
  type TheDepartments,
} from '@shared/departments.ts'
import type { PanelRecord } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { DEPARTMENT_KIND, THE_ACT_OF_WRITING_A_DEPARTMENT, theBindingOf } from '../lib/grant/departments.ts'
import { DEPARTMENTS_ON_A_PAGE, DEPARTMENT_REVISIONS_SHOWN, oneDepartment, theDepartmentsOf } from '../lib/departments.ts'
import { actorFrom, actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { PanelError } from '../lib/panel-error.ts'
import { parse } from '../lib/parse.ts'
import { createRecord, patchRecord, recordInWorkspace, type Actor } from '../lib/records.ts'
import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { warrantBody } from './records.ts'

const LIST_NOTE =
  'One page of the departments of this project. project is the same on every page, and is answered whether or not a ' +
  "department is filed: the project's title, owner (the office owner, as {\"kind\": \"person\", \"id\"}), departments " +
  '(how many top departments are not merged) and teams (how many teams those hold, one counted as one team where it is ' +
  'a team). departments lists the top departments, those with no department above them, ordered by their head before ' +
  "the page is cut: first an agreed head, by the head's handle compared without case and a head with no handle after " +
  'those, then a head whose lines disagree, then no head or no line with a leader; each tie in the order filed. Each ' +
  'comes with subDepartments holding every department under it to any depth, in the order filed, merged ones too. ' +
  'Each gives its codes, its name and what it does in English ' +
  'and in Chinese (null where none is recorded), parent, supervisor, state, mergedInto, restsOn, level ("team" where ' +
  'no live sub-department that is not merged is under it, "department" otherwise), teams (how many teams are under it ' +
  'at any depth, or null for a team), leader (the recorded owner of its supervisor, or why there is none) and head. ' +
  'head is null where no live department is directly under it. Otherwise it is worked out from the recorded leaders ' +
  'of the live departments directly under it, leaving out each whose leader is not recorded: "agreed" with leader, ' +
  'handle and from (the departments it came from) where they share one; "the-lines-disagree" with leaders, each with ' +
  'leader, handle and from, where they name more than one; "no-line-has-a-leader" with says where none records one. ' +
  'project, level, teams, leader and head are worked out when read and stored nowhere. Where nobody has filed a ' +
  'department, departments is null and nobodyFiled says so. ?offset and ?limit page the top departments, ' +
  `${String(DEPARTMENTS_ON_A_PAGE)} at a time unless limit asks for 1 to ${String(DEPARTMENTS_ON_A_PAGE_AT_MOST)}; ` +
  'total counts them all.'

const ONE_NOTE =
  'One department of this project, by its record id: department as the list gives it, subDepartments the departments ' +
  `directly under it, and history its last ${String(DEPARTMENT_REVISIONS_SHOWN)} revisions, newest first, each with ` +
  "seq, op, at, who wrote it and onTheWordsOf: the person's words it was written on, or null. A record of another " +
  'kind is a 400, and a deleted department is a 404.'

const WRITE_NOTE =
  "Files or writes one department of this project. Body {\"codes\"?: the codes it is named by, \"nameEn\"? and " +
  '"nameZh"?: its names, at least one, "doesEn"? and "doesZh"?: what it does, "parent"?: the id of the department ' +
  'above it, "supervisor"?: {"kind": "agent", "id": <registry id>}, "state": "running", "resting" or "merged", ' +
  '"mergedInto"?: the id of the department it was merged into, written only when merged, "restsOn"?: the ids of the ' +
  "person's decisions it rests on, \"warrant\"?: warrant}. The person may write by their own press. A secretary must " +
  "use its own key, name the person's decisions in restsOn and carry a warrant quoting the person's words from one " +
  `of them, with "for" naming ${THE_ACT_OF_WRITING_A_DEPARTMENT}:<id, or new on a create>: plus JSON of the ` +
  `department in the order ${DEPARTMENT_FIELDS.join(', ')}. Every other caller is refused. A write replaces the ` +
  'department, so a field left out is removed; any other key the record holds is kept. The title follows the English ' +
  'name, or the Chinese where there is no English. The reply is what GET /api/departments/<id> answers, with written ' +
  'and the record.'

/** The list door's query. */
const listQuery = z.strictObject({
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(DEPARTMENTS_ON_A_PAGE_AT_MOST).optional(),
})

/** A department as a write sends it, and the warrant that opens the write for a secretary. */
const departmentBody = z.strictObject({
  codes: z.array(z.string()).optional(),
  nameEn: z.string().optional(),
  nameZh: z.string().optional(),
  doesEn: z.string().optional(),
  doesZh: z.string().optional(),
  parent: z.string().optional(),
  supervisor: z.record(z.string(), z.unknown()).optional(),
  state: z.string(),
  mergedInto: z.string().optional(),
  restsOn: z.array(z.string()).optional(),
  warrant: warrantBody.optional(),
})

/** A department's title: its English name, or its Chinese where it has none. The guard refuses one with neither. */
const theTitleOf = (fields: { nameEn?: string; nameZh?: string }): string => fields.nameEn ?? fields.nameZh ?? 'A department with no name'

/** The department `:id` names in this project, or a 404 or 400 that says why it is not one. */
function theDepartmentNamed(req: FastifyRequest, workspaceId: string): PanelRecord {
  const record = recordInWorkspace((req.params as { id: string }).id, workspaceId)
  if (record.kind !== DEPARTMENT_KIND) {
    throw new PanelError(`${record.id} is a ${kindWord(record.kind).text}, not a department. GET /api/departments lists the departments of this project.`, 400)
  }
  if (record.deletedAt !== null) {
    throw new PanelError(
      `"${record.title}" was deleted, so it is not one of this project's departments now. POST /api/records/${record.id}/restore brings it back.`,
      404,
    )
  }
  return record
}

/** The fields a write sends, and the actor the warrant opens it for, bound to the department as it will stand. */
function theWrite(req: FastifyRequest, id: string | null): { fields: Record<string, unknown> & { nameEn?: string; nameZh?: string }; actor: Actor } {
  const { warrant: _warrant, ...fields } = parse(departmentBody, req.body ?? {}, 'A department:')
  const warrant = theWordsInTheBody(req)
  const actor = warrant === undefined ? actorFrom(req) : actorWithTheWordsItActsOn(req, warrant, theBindingOf(id, fields))
  return { fields, actor }
}

export async function departmentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/departments', route('departments.list', 'remote', LIST_NOTE), async (req): Promise<TheDepartments> => {
    const query = parse(listQuery, req.query ?? {}, 'The departments asked for:')
    return theDepartmentsOf(workspaceOf(req), { offset: query.offset ?? 0, limit: query.limit ?? DEPARTMENTS_ON_A_PAGE })
  })

  app.post('/departments', route('departments.create', 'remote', WRITE_NOTE), async (req, reply): Promise<ADepartmentWritten> => {
    const workspaceId = workspaceOf(req)
    const { fields, actor } = theWrite(req, null)
    const record = createRecord({ kind: DEPARTMENT_KIND, title: theTitleOf(fields), data: fields, workspaceId, actor })
    void reply.code(201)
    return { ...oneDepartment(workspaceId, record.id), written: 'created', record }
  })

  app.get('/departments/:id', route('departments.one', 'remote', ONE_NOTE), async (req): Promise<OneDepartment> => {
    const workspaceId = workspaceOf(req)
    return oneDepartment(workspaceId, theDepartmentNamed(req, workspaceId).id)
  })

  app.put('/departments/:id', route('departments.write', 'remote', WRITE_NOTE), async (req): Promise<ADepartmentWritten> => {
    const workspaceId = workspaceOf(req)
    const found = theDepartmentNamed(req, workspaceId)
    const { fields, actor } = theWrite(req, found.id)
    // A PUT REPLACES THE DEPARTMENT AND KEEPS THE REST: the record's own keys beside the department's fields stay.
    const kept = Object.fromEntries(Object.entries(found.data).filter(([key]) => !(DEPARTMENT_FIELDS as readonly string[]).includes(key)))
    const { record, newSeq, nothingWritten } = patchRecord(found.id, { title: theTitleOf(fields), data: { ...kept, ...fields } }, actor)
    return {
      ...oneDepartment(workspaceId, found.id),
      written: newSeq === null ? 'nothing changed' : 'changed',
      record,
      ...(nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }),
    }
  })
}
