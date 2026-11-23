// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHECKLISTS, OVER HTTP. This was decided on proposal XEFZwmSBw8xQ.
 *
 *   POST  /api/checklists                                   make a checklist; the caller owns it, or the person for a secretary
 *   GET   /api/checklists                                   the caller's own checklists, or ?owner=
 *   GET   /api/checklists/evidence-choices                  what an item's "done" may name, to pick from
 *   GET   /api/checklists/:id                               one checklist, whoever owns it
 *   PATCH /api/checklists/:id                               its title or its label
 *   POST  /api/checklists/:id/items                         add one item
 *   PATCH /api/checklists/:id/items/:item                   change one item
 *   PUT   /api/checklists/:id/items/:item/reminder          switch its reminder on at a time, or off; the owner only
 *
 * THE RULES ARE IN src/server/lib/checklists.ts and src/shared/checklists.ts. What is here is the
 * door: what shape the body is, and what comes back. Refusals are 400 for a shape or a rule, 403 for
 * who is asking, 404 for an id this project does not hold, and 409 for the state of the thing.
 *
 * EVERY DOOR THAT NAMES AN ID READS THE CHECKLIST FIRST, through `recordInWorkspace`: an id from
 * another project is a 404 before anything else is asked, and before anything is written.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { getRecord } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { theProjectsAQueryAsks } from '../lib/across-projects.ts'
import { theMessageReader } from '../lib/messages.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { sameParticipant } from '@shared/messages.ts'
import { PROJECTS_QUERY } from '@shared/across-projects.ts'
import { EVIDENCE_KINDS } from '@shared/checklists.ts'
import { evidenceChoices } from '../lib/checklist-evidence.ts'
import {
  A_CHECKLIST_CHANGE,
  A_NEW_CHECKLIST,
  A_NEW_ITEM,
  AN_ITEM_CHANGE,
  A_REMINDER_SWITCH,
  addAnItem,
  changeAChecklist,
  changeAnItem,
  listChecklists,
  listChecklistsOfProjects,
  makeAChecklist,
  readOneChecklist,
  switchTheReminder,
  whoseChecklistsAreAsked,
} from '../lib/checklists.ts'

// ============================================================================ the sentences

const ITEM_SHAPE =
  '{"words","fromMessage"?,"state"?,"style"?,"mustBeInManual"?,"evidence"?,"supersededBy"?,"links"?,"tell"?,"standing"?}. `words` are the ' +
  'request as it was asked, and `fromMessage` the id of the message it came in. `state` is one of "open" (the ' +
  'default), "in progress", "waiting on the owner", "done" and "superseded". `style` is "plain" (the default) for an ' +
  'item whose left box its owner ticks directly, or "evidence-or-words" for the special item whose left box opens the ' +
  'evidence picker; the agent that creates the item chooses it, and it is never changed afterwards. An agent\'s "done" needs `evidence`, a list of ' +
  '{"kind":"commit","commit":"<hash>"}, {"kind":"report","record"}, {"kind":"run","record"} or {"kind":"manual ' +
  'section","record","block"}; an item with "mustBeInManual":true is done only with a manual section among them. ' +
  'Only the person marks an item done with no evidence: see PATCH /api/checklists/<id>/items/<item id>. ' +
  '"superseded" needs `supersededBy`, the later message. `links` are the ids of any records the item is about. ' +
  '`tell` lists the agents, by id or handle, the office tells when the person marks the item done, in place of ' +
  'whoever added it; put the adder in the list as well to tell both. The office writes who added the item. ' +
  '`standing`: true makes it a standing item, an entry the owner opens every session such as the owner\'s experiment ' +
  'manual: it has no done box, is never marked done and is never counted as open work, so it is "open" until a later ' +
  'message supersedes it.'

const MAKE_NOTE =
  `MAKE A CHECKLIST. Body {"title","items"?,"label"?,"forThePerson"?}. Each item is ${ITEM_SHAPE} The caller is its owner, ` +
  'written by the office and refused in the body. `label` is its name at reading level 1, written here because ' +
  'the ordinary short-forms door refuses this kind. Anybody may make one, people included. A secretary, proved by its ' +
  'own key, may send "forThePerson":{"reason":"…"} to make one the person owns, saying why: the person reads it in the ' +
  'checklists window, and the change log names the secretary. Anybody else who sends it is refused. A checklist made ' +
  'for the person with items sends the person one line saying how many; one with no items sends nothing until its ' +
  'first item is added.'

const LIST_NOTE =
  'CHECKLISTS IN THIS PROJECT. Without ?owner= it is your own. ?owner=everyone is every checklist in the project; ' +
  '?owner=agent:<id or handle> or ?owner=person:<id> is one owner\'s. Those with an item waiting on the owner come ' +
  'first, then the newest change. Each carries its items, its counts and its version. An empty list says so in ' +
  'words. Writes nothing. ?projects=all reads every project instead, and ?projects=<project id> that one project; ' +
  'each checklist carries its workspaceId. ?items=open hands only the items not yet done or replaced, and the counts ' +
  'still count every item. Each finished item is then in finishedItems, with only its id and who added it, and the ' +
  'records, people, flows and presses are only those the open items name. Read one checklist by its id for all of it.'

const READ_NOTE =
  'ONE CHECKLIST, whoever owns it: its owner, its items with every field, its counts, its version, and `flows`: for each item ' +
  'the office put there when an agent entered a flow, the flow, its flow run, what it is about, what ends it and whether it has ended. ' +
  '`linked` is every record the items name in their links and evidence, with its title and the name of each block named in it; ' +
  'a message you may not read has no title there. Writes nothing. ' +
  '?projects=all reads it in whichever project holds it.'

const CHOICES_NOTE =
  'WHAT AN ITEM\'S "DONE" MAY NAME AS EVIDENCE, in this project, to pick from rather than to type. ?kind= is one of ' +
  `${EVIDENCE_KINDS.join(', ')}; ?words= keeps the choices whose title holds every word; ?offset= skips that many. ` +
  'Newest first, 25 at a time. A commit is a landed merge entry\'s commit; a manual section is one block of a report ' +
  'or a module. Each choice carries the evidence ready to send. Writes nothing.'

const CHANGE_NOTE = 'CHANGE A CHECKLIST\'S TITLE OR LABEL. Body {"title"?,"label"?,"ifVersion"?}. Its owner is not changed here.'

const ADD_NOTE = `ADD ONE ITEM. Body ${ITEM_SHAPE} The office gives it its id. Anybody may add an item. An agent that adds an item to the person's checklist sends the person one line saying so.`

const ITEM_NOTE =
  'CHANGE ONE ITEM. Body: the keys that change, from {"words","fromMessage","state","mustBeInManual","evidence",' +
  '"supersededBy","links","tell","standing"}, "onThePersonsWords"?, "response"? and "ifVersion"?. `evidence` and `links` replace the list; `addEvidence` and `addLinks` ' +
  'add to it. A null takes fromMessage or supersededBy away. The rules for "done" and "superseded" are the ones at ' +
  'POST /api/checklists/<id>/items. A null takes tell away too, and "standing":false takes standing away; to mark a ' +
  'standing item done, send "standing":false with "state":"done". THE OWNER\'S OWN WORDS: the checklist\'s own owner ' +
  'may send "response" — the passage they write — in the same change that marks the item done ("state":"done"), and ' +
  'that change must carry "ifVersion", the version the checklist read handed back; the words are kept exactly as ' +
  'written, are read under the item, and are carried whole by the notice the agents told receive. They are not ' +
  'evidence, and they go when the item leaves done. Anybody else who sends them is refused checklistOwnWordsNotTheOwner; ' +
  'a response without the done press is refused checklistOwnWordsNeedTheDonePress; one without ifVersion is refused ' +
  'checklistOwnWordsNeedTheVersion. THE PERSON\'S OWN "DONE" NEEDS NO EVIDENCE: the ' +
  'person\'s press, an agent that sends "state":"done" with "onThePersonsWords":"<message id>" naming a message the ' +
  'person sent that it read as naming this item, or a secretary under the person\'s raise. The office keeps the mark ' +
  'in `doneByThePerson`, tells whoever added the item (or the agents `tell` names) in one message, and for the ' +
  'person\'s words sends the person one line beside that message. An agent that changes an item on the person\'s ' +
  'checklist sends the person one line saying what happened to which item. Anybody may change an item, except that the item of a flow an agent is in, ' +
  'until the flow ends, is changed only by that agent or the person: any key, links included, and which flow it is ' +
  'is read from the item as stored, before the change. Anybody else is refused with flowItemTickedByAnother for a ' +
  'tick (planItemTickedByAnother for a planning item) and flowItemChangedByAnother for any other change. An ' +
  '"ifVersion" the checklist no longer has is refused 409 with checklistChangedSinceRead, and nothing is written.'

const REMINDER_NOTE =
  'SWITCH AN ITEM\'S REMINDER. Body {"on":true,"at":"YYYY-MM-DD HH:MM"} or {"on":false}. A reminder is off until ' +
  'its checklist\'s owner switches it on, and only the owner may. At its time the office sends the owner alone one ' +
  'line about the item, once, if the item is still open. While the gate who-switches-a-checklist-reminder is off, ' +
  'an agent its own key proves may also switch a reminder on another owner\'s checklist, and the item names that ' +
  'agent; the reminder still goes to the owner alone. `at` is on the office computer\'s clock and must be later ' +
  'than now.'

// ============================================================================ the params

const whichChecklist = z.object({ id: z.string().min(1) }).strict()
const whichItem = z.object({ id: z.string().min(1), item: z.string().min(1) }).strict()
const choicesQuery = z
  .object({
    kind: z.enum(EVIDENCE_KINDS, { error: `kind must be one of: ${EVIDENCE_KINDS.join(', ')}` }),
    words: z.string().optional(),
    offset: z.coerce.number({ error: 'offset must be a whole number of choices to skip' }).int().min(0).optional(),
  })
  .strict()
const whoseQuery = z.object({ owner: z.string().trim().min(1).optional(), items: z.literal('open').optional() }).strict()

/**
 * WHAT THE OFFICE WRITES AND A CALLER MAY NOT, refused by name with the reason. A strict shape would
 * refuse them as unknown keys, which says the key is wrong and not that the fact is somebody else's.
 */
function refuseWhatTheOfficeWrites(body: unknown, where: 'checklist' | 'item'): void {
  if (body === null || typeof body !== 'object') return
  const said = body as Record<string, unknown>
  if ('owner' in said) {
    throw new PanelError(
      'A checklist\'s owner is written by the office from whoever made it, and never from the body: the owner is ' +
        'the one its reminders go to. Make it as yourself. Nothing was written.',
      403,
    )
  }
  if ('id' in said && where === 'item') {
    throw new PanelError('An item\'s id is given by the office. Leave it out. Nothing was written.', 403)
  }
  if ('reminder' in said) {
    throw new PanelError(
      'An item\'s reminder is switched only by the checklist\'s owner, at PUT /api/checklists/<id>/items/<item ' +
        'id>/reminder. Nothing was written.',
      403,
    )
  }
  if ('addedBy' in said && where === 'item') {
    throw new PanelError('Who added an item is written by the office from the caller, and never from the body. Leave addedBy out. Nothing was written.', 400)
  }
  if ('doneByThePerson' in said && where === 'item') {
    throw new PanelError(
      'The person\'s mark on an item is written by the office, from the person\'s press, from "onThePersonsWords" or ' +
        'from the person\'s raise, and never from the body. Leave doneByThePerson out. Nothing was written.',
      400,
    )
  }
  if (where === 'checklist' && Array.isArray(said['items'])) {
    for (const item of said['items'] as unknown[]) refuseWhatTheOfficeWrites(item, 'item')
  }
}

// ============================================================================ the routes

export async function checklistRoutes(app: FastifyInstance): Promise<void> {
  app.post('/checklists', route('checklist.make', 'remote', MAKE_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    refuseWhatTheOfficeWrites(req.body, 'checklist')
    const said = parse(A_NEW_CHECKLIST, req.body, 'The checklist')
    const actor = actorFrom(req)
    const checklist = makeAChecklist({ workspaceId, said, actor })
    void reply.code(201)
    const me = participantForActor(actor)
    const yours = me !== null && sameParticipant(checklist.owner, me)
    return {
      checklist,
      says: yours
        ? `The checklist "${checklist.title}" is made, and you are its owner.`
        : `The checklist "${checklist.title}" is made for ${checklist.ownerName}, who owns it and reads it in the checklists window. Its change log names you.`,
      workspaceId,
    }
  })

  app.get('/checklists', route('checklist.list', 'remote', LIST_NOTE), async (req) => {
    // ACROSS PROJECTS WHEN `?projects=` IS ASKED, the way the counters door reads them. Without it, the
    // header's project, answered exactly as before.
    const { [PROJECTS_QUERY]: projectsWord, ...rest } = (req.query ?? {}) as Record<string, unknown>
    const { owner, items } = parse(whoseQuery, rest, 'Whose checklists to read')
    const actor = actorFrom(req)
    const whose = whoseChecklistsAreAsked(owner)
    const openItemsOnly = items === 'open'
    if (projectsWord === undefined) {
      const workspaceId = workspaceOf(req)
      return { ...listChecklists({ workspaceId, actor, whose, openItemsOnly }), workspaceId }
    }
    const projects = theProjectsAQueryAsks(req.query, theMessageReader(actor)) ?? []
    const checklists = listChecklistsOfProjects({ workspaceIds: projects.map((project) => project.id), actor, whose, openItemsOnly })
      .sort((a, b) => Number(b.counts.waitingOnTheOwner > 0) - Number(a.counts.waitingOnTheOwner > 0) || b.updatedAt.localeCompare(a.updatedAt))
    const where = projects.length === 1 ? `the project "${projects[0]!.id}"` : `the ${String(projects.length)} projects read`
    return {
      projects: projects.map((project) => project.id),
      checklists,
      says:
        checklists.length === 0
          ? `There are no checklists in ${where}.`
          : `${String(checklists.length)} checklist${checklists.length === 1 ? '' : 's'} in ${where}. Those with an item waiting on the owner come first.`,
    }
  })

  app.get('/checklists/evidence-choices', route('checklist.read', 'remote', CHOICES_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(choicesQuery, req.query ?? {}, 'The evidence choices to read')
    const page = evidenceChoices({ workspaceId, kind: asked.kind, ...(asked.words === undefined ? {} : { words: asked.words }), ...(asked.offset === undefined ? {} : { offset: asked.offset }) })
    return {
      ...page,
      says: page.matched === 0 ? `Nothing of the kind "${asked.kind}" in this project${asked.words === undefined || asked.words.trim() === '' ? '' : ' holds those words'}.` : `${String(page.matched)} to choose from.`,
      workspaceId,
    }
  })

  app.get('/checklists/:id', route('checklist.read', 'remote', READ_NOTE), async (req) => {
    const { [PROJECTS_QUERY]: projectsWord } = (req.query ?? {}) as Record<string, unknown>
    const { id } = parse(whichChecklist, req.params, 'The checklist to read')
    if (projectsWord === undefined) {
      const workspaceId = workspaceOf(req)
      return { checklist: readOneChecklist({ workspaceId, id, actor: actorFrom(req) }), workspaceId }
    }
    // WHICHEVER OF THE PROJECTS ASKED HOLDS IT. A checklist in a project that was not asked is read in the
    // first project asked, so it is refused there with the door's own refusal.
    const projects = theProjectsAQueryAsks(req.query, theMessageReader(actorFrom(req))) ?? []
    const holder = getRecord(id)?.workspaceId
    const workspaceId = projects.find((project) => project.id === holder)?.id ?? projects[0]?.id ?? workspaceOf(req)
    return { checklist: readOneChecklist({ workspaceId, id, actor: actorFrom(req) }), workspaceId }
  })

  app.patch('/checklists/:id', route('checklist.change', 'remote', CHANGE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichChecklist, req.params, 'The checklist to change')
    refuseWhatTheOfficeWrites(req.body, 'checklist')
    const said = parse(A_CHECKLIST_CHANGE, req.body, 'The change')
    const { checklist, nothingWritten } = changeAChecklist({ workspaceId, id, said, actor: actorFrom(req) })
    return { checklist, says: nothingWritten ?? `The checklist "${checklist.title}" was changed.`, workspaceId, ...(nothingWritten === undefined ? {} : { nothingWritten }) }
  })

  app.post('/checklists/:id/items', route('checklist.addItem', 'remote', ADD_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichChecklist, req.params, 'The checklist to add to')
    refuseWhatTheOfficeWrites(req.body, 'item')
    const said = parse(A_NEW_ITEM, req.body, 'The item')
    const done = addAnItem({ workspaceId, id, said, actor: actorFrom(req) })
    void reply.code(201)
    return { ...done, says: `Item ${done.item.id} is added to "${done.checklist.title}", and it is ${done.item.state}.`, workspaceId }
  })

  app.patch('/checklists/:id/items/:item', route('checklist.changeItem', 'remote', ITEM_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id, item } = parse(whichItem, req.params, 'The item to change')
    refuseWhatTheOfficeWrites(req.body, 'item')
    const said = parse(AN_ITEM_CHANGE, req.body, 'The change')
    const { told, ...done } = changeAnItem({ workspaceId, id, itemId: item, said, actor: actorFrom(req) })
    const changed = `Item ${done.item.id} of "${done.checklist.title}" was changed, and it is ${done.item.state}.`
    return { ...done, says: done.nothingWritten ?? (told === undefined ? changed : `${changed} ${told}`), workspaceId }
  })

  app.put('/checklists/:id/items/:item/reminder', route('checklist.reminder', 'remote', REMINDER_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id, item } = parse(whichItem, req.params, 'The item whose reminder to switch')
    const said = parse(A_REMINDER_SWITCH, req.body, 'The switch')
    const done = switchTheReminder({ workspaceId, id, itemId: item, said, actor: actorFrom(req) })
    const reminder = done.item.reminder
    return {
      ...done,
      says:
        reminder === undefined
          ? `The reminder on item ${done.item.id} is off.`
          : `The reminder on item ${done.item.id} is on. At ${reminder.at} the office sends the checklist's owner one line about it, if it is still open.`,
      workspaceId,
    }
  })
}
