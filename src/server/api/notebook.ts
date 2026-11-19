// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR DOORS OF A SECRETARY'S NOTEBOOK. Criterion N2.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE NOTEBOOK IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The person's entries come first, and the person can always read and change the notebook; the
 * secretary adds its own afterwards.
 *
 *   GET    /api/agents/:handle/notebook                    read it, and say when there is none
 *   POST   /api/agents/:handle/notebook/entries            add one entry
 *   PATCH  /api/agents/:handle/notebook/entries/:entryId   change one entry's words or its kind
 *   DELETE /api/agents/:handle/notebook/entries/:entryId   take one entry out
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY, AND WHY IT IS NOT THE SAME ANSWER FOR BOTH
 * ---------------------------------------------------------------------------------------
 *
 * The person may write, change and remove any entry, including the secretary's. The secretary may
 * write, change and remove its own entries; it may not touch the person's, in either direction.
 * Everybody else is refused outright, and the refusal says whose notebook it is.
 *
 * WHY THE SECRETARY MAY NOT EDIT OR REMOVE THE PERSON'S ENTRIES. Chapter 4 rule 5 and chapter 8 rule 1: a
 * person's words are kept as they were said, and nothing writes as the person. An agent that could
 * rewrite or remove "what is theirs to do" would be an agent editing its own instructions, and the
 * next run would read the edit, or the absence, as the person's.
 *
 * THE SECRETARY MAY REMOVE ITS OWN — CRITERION N5. The secretary may remove and change its own entries.
 * An earlier build refused the remove outright, and its report named that as its own choice rather
 * than a rule; that choice is superseded now. The DELETE
 * door takes the secretary's own entries from the secretary exactly as the PATCH door already does.
 *
 * ---------------------------------------------------------------------------------------
 * WHO WROTE IT AND WHEN ARE NEVER READ FROM A BODY
 * ---------------------------------------------------------------------------------------
 *
 * The same rule POST /api/records/:id/pass-the-question-on states in so many words: a name sent in
 * a body is a name anybody can send, and a time sent in one is a time anybody can choose. These
 * routes take the entry's KIND and its WORDS, and build `writtenByKind`, `writtenById`, `at`, `id`
 * and `changedByThePerson` themselves. `checkTheNotebookEntries` in lib/records/notebook-entries.ts is the
 * enforcement, so a hand-written PATCH to `data.entries` gets the same refusal.
 *
 * THE FIRST ENTRY MAKES THE NOTEBOOK. There is no separate press to make an empty one: a notebook
 * with nothing in it is a record that says nothing, and the person's first words are what starts
 * it. `checkTheNotebook` on the create path still refuses one for an agent without the card.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { createRecord, patchRecord } from '../lib/records.ts'
import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { theNotebookFor, type TheNotebook } from '../lib/notebook.ts'
import { nowStamp } from '@shared/time.ts'
import {
  NOTEBOOK_ENTRY_KIND_KEYS,
  NOTEBOOK_KIND,
  THE_NOTEBOOK_DOOR,
  newestFirst,
  notebookStatistics,
  theEntryKind,
  type NotebookEntry,
} from '@shared/notebook.ts'

/** The longest an entry may be. A notebook is read whole at the start of every run. */
export const LONGEST_ENTRY = 4000

const handleParams = z.strictObject({ handle: z.string().min(1) })
const entryParams = z.strictObject({ handle: z.string().min(1), entryId: z.string().min(1) })

/**
 * WHAT A WRITER SENDS: which of the eight kinds, and the words. Nothing else.
 *
 * `entryKind` is checked against the declared list here as well as by `validateData`, so the
 * refusal a writer gets names the eight rather than describing a union type.
 */
const entryBody = z.strictObject({
  entryKind: z.string().min(1),
  text: z.string().min(1).max(LONGEST_ENTRY),
})

/** A change may move either half, and a body that moves neither is refused rather than written. */
const changeBody = z.strictObject({
  entryKind: z.string().min(1).optional(),
  text: z.string().min(1).max(LONGEST_ENTRY).optional(),
})

/** Who is asking, in the two words the entries are stored under. */
type Asker = { kind: 'person'; id: string } | { kind: 'agent'; id: string }

function whoIsAsking(req: Parameters<typeof actorFrom>[0]): Asker {
  const actor = actorFrom(req)
  return actor.type === 'agent' ? { kind: 'agent', id: actor.id } : { kind: 'person', id: actor.id }
}

/**
 * THE REFUSAL EVERY DOOR SHARES: this is not your notebook.
 *
 * It names whose it is, because a refusal that does not is one the reader has to research.
 */
function refuseAStranger(asker: Asker, handle: string, act: string): never {
  throw new PanelError(
    `This notebook is kept under "${handle}", and ${asker.kind === 'person' ? 'you are' : `"${asker.id}" is`} not ` +
      `${handle} and not the person. Nothing was written, and nothing about the notebook changed. A notebook is ` +
      `what one person and one secretary have written down about working together, so only those two write in ` +
      `it. What you can do instead: say it in a message to ${handle}, or to the person, and let them write it. ` +
      `The act refused was: ${act}.`,
    403,
  )
}

/**
 * The agent row's own handle, or a refusal naming the name nothing answers to.
 *
 * The address is `#/who/agent/<handle>/notebook`, so a handle is what a person sends. The one
 * resolver is asked in reading mode anyway: it answers a handle at its third step and an id at its
 * second, and it refuses a name that means two agents rather than choosing one. What it returns is
 * the agent's canonical handle, and the notebook is kept under that, so an id and a handle reach
 * the same notebook.
 */
function theAgent(handle: string): { handle: string } {
  const named = theAgentAnArrivingReferenceNames(handle, 'reading')
  if (named === null) {
    throw new PanelError(
      `Mole Office has no agent with the handle "${handle}", so there is no notebook under that name and none ` +
        `was made. GET /api/participants lists every agent this installation knows.`,
      404,
    )
  }
  return { handle: named.agent.handle }
}

/** The entry by its id, or a refusal naming what the notebook does hold. */
function theEntry(notebook: TheNotebook, entryId: string): NotebookEntry {
  const found = notebook.entries.find((one) => one.id === entryId)
  if (found === undefined) {
    throw new PanelError(
      `This notebook has no entry "${entryId}". Nothing was written. It holds ` +
        `${String(notebook.entries.length)} ` +
        `${notebook.entries.length === 1 ? 'entry' : 'entries'}` +
        `${notebook.entries.length === 0 ? '' : `: ${notebook.entries.map((one) => one.id).join(', ')}`}. ` +
        `GET /api/agents/${notebook.agent}/notebook reads them all.`,
      404,
    )
  }
  return found
}

/**
 * One of the eight, or a refusal that lists them. Answers the word to store, which is the new word where an
 * older client sent a word renamed since (`NOTEBOOK_KINDS_RENAMED` in src/shared/renamed-words.ts).
 */
function checkTheEntryKind(said: string): string {
  const kind = theEntryKind(said)
  if (kind !== null) return kind.key
  throw new PanelError(
    `"${said}" is not a kind of notebook entry. Nothing was written. The kinds are: ` +
      `${NOTEBOOK_ENTRY_KIND_KEYS.join(', ')}. They are read out of the person's own words about what a notebook holds, ` +
      `and the list is closed because the numbers on the role card are counts of these.`,
    400,
  )
}

/** What every door hands back: the notebook, newest first, with the numbers already counted. */
function asRead(notebook: TheNotebook | null, handle: string): Record<string, unknown> {
  if (notebook === null) {
    return {
      agent: handle,
      isThere: false,
      recordId: null,
      entries: [],
      statistics: null,
      note:
        `No notebook has been written for "${handle}" yet. Nobody has recorded how this person works, how they ` +
        `want to be answered, what this agent may settle alone, or what its character is. That is an absence ` +
        `and not an answer. The first entry makes the notebook: POST /api/agents/${handle}/notebook/entries.`,
      write: `POST /api/agents/${handle}/notebook/entries`,
      kinds: NOTEBOOK_ENTRY_KIND_KEYS,
    }
  }
  return {
    agent: notebook.agent,
    isThere: true,
    recordId: notebook.id,
    title: notebook.title,
    entries: newestFirst(notebook.entries),
    statistics: notebookStatistics(notebook.entries),
    write: `POST /api/agents/${notebook.agent}/notebook/entries`,
    kinds: NOTEBOOK_ENTRY_KIND_KEYS,
  }
}

/** Store the entries back on the record, through the door flag that lets the write past the guard. */
function writeTheEntries(
  notebookId: string,
  entries: readonly NotebookEntry[],
  req: Parameters<typeof actorFrom>[0],
) {
  return patchRecord(notebookId, { dataPatch: { entries: [...entries] }, [THE_NOTEBOOK_DOOR]: true }, actorFrom(req))
}

export async function notebookRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/agents/:handle/notebook',
    route(
      'record.read',
      'remote',
      'ONE SECRETARY\'S NOTEBOOK, whole: how this person works, how they want to be answered, what the secretary ' +
        'may settle alone, what is theirs to do, dated summaries, and the secretary\'s own feelings, character and ' +
        'way of replying. Entries newest first, each saying who wrote it and when, with the numbers the role ' +
        'card draws already counted. An agent with no notebook is answered with isThere false and a sentence ' +
        'saying nobody has written one, which is not the same as there being nothing to know.',
    ),
    async (req) => {
      const { handle: asked } = parse(handleParams, req.params, 'The URL is not usable:')
      const workspaceId = workspaceOf(req)
      const { handle } = theAgent(asked)
      return asRead(theNotebookFor(workspaceId, handle), handle)
    },
  )

  app.post(
    '/agents/:handle/notebook/entries',
    route(
      'record.write',
      'remote',
      'ADD ONE ENTRY to this secretary\'s notebook, and make the notebook if there is not one yet. Takes ' +
        '{entryKind, text} and nothing else: who wrote it, when, and its id are written by Mole Office, because ' +
        'a name sent in a body is a name anybody can send. The person may write any kind; the secretary may ' +
        'write in its own name; anybody else is refused. A notebook for an agent that does not hold the ' +
        'secretary card is refused, and so is a second notebook for one agent.',
    ),
    async (req, reply) => {
      const { handle: asked } = parse(handleParams, req.params, 'The URL is not usable:')
      const said = parse(entryBody, req.body, 'That is not an entry:')
      const workspaceId = workspaceOf(req)
      const asker = whoIsAsking(req)
      const { handle } = theAgent(asked)
      if (asker.kind === 'agent' && asker.id !== handle) {
        refuseAStranger(asker, handle, `adding an entry to ${handle}'s notebook`)
      }
      const entryKind = checkTheEntryKind(said.entryKind)

      const at = nowStamp()
      const entry: NotebookEntry = {
        id: `entry-${at.replace(/[^0-9]/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
        writtenByKind: asker.kind,
        writtenById: asker.id,
        at,
        entryKind,
        text: said.text,
      }

      const already = theNotebookFor(workspaceId, handle)
      if (already === null) {
        // THE FIRST ENTRY MAKES THE NOTEBOOK, and `checkTheNotebook` on the create path still asks
        // whether this agent holds the card — so an agent that may not have one is refused here in
        // the same words a hand-written POST /api/records gets.
        createRecord({
          kind: NOTEBOOK_KIND,
          // THE TITLE IS 秘书笔记, "secretary notes", SINCE ITEM 1 OF A DECISION. A record made
          // before it keeps the title it was made with ("<handle>: the notebook"). No migration
          // rewrites those titles, because a title changed under a record with no line in its
          // history would be a change nobody can see was made; a rename through the record's own
          // door keeps that line.
          title: `${handle}: secretary notes`,
          workspaceId,
          data: { agentHandle: handle, entries: [entry] },
          actor: actorFrom(req),
          [THE_NOTEBOOK_DOOR]: true,
        })
      } else {
        writeTheEntries(already.id, [...already.entries, entry], req)
      }
      reply.code(201)
      return asRead(theNotebookFor(workspaceId, handle), handle)
    },
  )

  app.patch(
    '/agents/:handle/notebook/entries/:entryId',
    route(
      'record.write',
      'remote',
      'CHANGE ONE ENTRY\'S WORDS OR ITS KIND. The person may change any entry, and the change records that the ' +
        'person changed it with when, keeping who wrote the original. The secretary may change only entries it ' +
        'wrote itself. Who wrote an entry is never rewritten by a change.',
    ),
    async (req) => {
      const { handle: asked, entryId } = parse(entryParams, req.params, 'The URL is not usable:')
      const said = parse(changeBody, req.body, 'That is not a change to an entry:')
      if (said.entryKind === undefined && said.text === undefined) {
        throw new PanelError(
          'This change moves nothing: it names neither new words nor a new kind. Nothing was written. Send ' +
            '{"text":"…"}, {"entryKind":"…"}, or both.',
          400,
        )
      }
      const workspaceId = workspaceOf(req)
      const asker = whoIsAsking(req)
      const { handle } = theAgent(asked)
      if (asker.kind === 'agent' && asker.id !== handle) {
        refuseAStranger(asker, handle, `changing an entry in ${handle}'s notebook`)
      }
      const notebook = theNotebookFor(workspaceId, handle)
      if (notebook === null) {
        throw new PanelError(
          `No notebook has been written for "${handle}", so there is no entry to change. Nothing was written.`,
          404,
        )
      }
      const entry = theEntry(notebook, entryId)

      // THE SECRETARY MAY NOT CHANGE THE PERSON'S WORDS. Chapter 4 rule 5: a person's words are kept
      // as said. The refusal names the entry and says what to do instead, so it is not a dead end.
      if (asker.kind === 'agent' && entry.writtenByKind === 'person') {
        throw new PanelError(
          `Entry "${entryId}" was written by the person, and you may not change what a person wrote. Nothing was ` +
            `written and the entry is exactly as it was. Write your own entry saying what you think has changed, ` +
            `and let the person change theirs: POST /api/agents/${handle}/notebook/entries.`,
          403,
        )
      }
      const entryKind = said.entryKind === undefined ? undefined : checkTheEntryKind(said.entryKind)

      const changed: NotebookEntry = {
        ...entry,
        ...(entryKind === undefined ? {} : { entryKind }),
        ...(said.text === undefined ? {} : { text: said.text }),
        // WHO WROTE IT AND WHEN STAY EXACTLY AS THEY WERE. What a change by the person adds is this,
        // and nothing else moves. Criterion N2 asks for that in so many words.
        ...(asker.kind === 'person' ? { changedByThePerson: { at: nowStamp() } } : {}),
      }
      const written = writeTheEntries(
        notebook.id,
        notebook.entries.map((one) => (one.id === entryId ? changed : one)),
        req,
      )
      return { ...asRead(theNotebookFor(workspaceId, handle), handle), ...(written.nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }) }
    },
  )

  app.delete(
    '/agents/:handle/notebook/entries/:entryId',
    route(
      'record.write',
      'remote',
      'TAKE ONE ENTRY OUT. The person may remove any entry, including the secretary\'s. The secretary may remove ' +
        'its own, and may not remove what the person wrote. Everybody else is refused, and the refusal says ' +
        'whose notebook it is. The notebook record stays, with every removal on its own history.',
    ),
    async (req) => {
      const { handle: asked, entryId } = parse(entryParams, req.params, 'The URL is not usable:')
      const workspaceId = workspaceOf(req)
      const asker = whoIsAsking(req)
      const { handle } = theAgent(asked)
      if (asker.kind === 'agent' && asker.id !== handle) {
        refuseAStranger(asker, handle, `taking an entry out of ${handle}'s notebook`)
      }
      const notebook = theNotebookFor(workspaceId, handle)
      if (notebook === null) {
        throw new PanelError(
          `No notebook has been written for "${handle}", so there is no entry to take out. Nothing was written.`,
          404,
        )
      }
      const entry = theEntry(notebook, entryId)

      // THE SECRETARY MAY NOT REMOVE THE PERSON'S WORDS. Criterion N5 gives the secretary its own
      // entries, not the person's: chapter 4 rule 5 and chapter 8 rule 1 hold here exactly as they do on the
      // PATCH door above.
      if (asker.kind === 'agent' && entry.writtenByKind === 'person') {
        throw new PanelError(
          `Entry "${entryId}" was written by the person, and you may not take out what a person wrote. Nothing ` +
            `was written and the entry is exactly as it was. Write your own entry saying what you think has ` +
            `changed, and let the person remove theirs: POST /api/agents/${handle}/notebook/entries.`,
          403,
        )
      }
      writeTheEntries(
        notebook.id,
        notebook.entries.filter((one) => one.id !== entryId),
        req,
      )
      return asRead(theNotebookFor(workspaceId, handle), handle)
    },
  )
}
