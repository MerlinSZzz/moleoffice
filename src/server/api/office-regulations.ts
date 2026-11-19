// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE REGULATIONS AS THE PAGE READS THEM: THE PERSON'S REGULATIONS AND THE CHAPTERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE EACH HALF COMES FROM, AND WHY THE TWO ARE NOT READ THE SAME WAY
 * ---------------------------------------------------------------------------------------
 *
 * The chapters are drawn from their records (decision `JC_raqC0fRCh`: the record is the only
 * authority), through the one mapping in @shared/office-rules.ts that the exporter uses. They are the
 * office's one set, read in whichever project they are filed, so every project shows the same chapters
 * (an office holds one set of regulations, not one per project).
 * THIS DOOR DOES NOT READ THE EXPORT. src/config/rules/chapters.json is a copy, and a page that drew
 * from the copy would keep agreeing with the file after the records had moved on.
 *
 * `src/server/lib/chapters.ts` reads the same records for what an agent is handed. Until wave 13w it
 * read the export, which held the chapters of the office this repository is developed in, so an
 * agent in any other office was named that office's chapters.
 *
 * The regulations are the `regulation` records of the project asked for, with their revocation
 * state as the records hold it. Nothing here may write one: filing and revoking are governed at
 * the record door, where G2's checks live.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'

import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { markARuleOnlyForThisOffice, theOfficeRegulations, type WhatTheMarkIs } from '../lib/office-regulations.ts'
import { actorFrom, actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { z } from 'zod'
import { theSelectedChapters, previewChapter, previewAChapterEdit, resolveAChapterRestore, writeChapter, chapterHistory } from '../lib/office-regulations.ts'
import { refuseChapterEdit } from '../lib/refuse-chapter-edit.ts'
import { PanelError } from '../lib/panel-error.ts'
import { warrantBody } from './records.ts'
import { nothingWrittenSentence } from '../lib/records.ts'
import { aSecretaryWithItsOwnKey } from './runtime-settings.ts'
import type { WhatTheOfficeRegulationsSay } from '@shared/office-rules.ts'

const THE_NOTE =
  'The person’s regulations and the chapters of the office regulations, as the office’s records hold them in ' +
  'whichever project each is filed, the same in every project. The chapters are module records carrying ' +
  'extra.chapter. Usable stored chapters are selected; failed stored chapters read shipped recovery content with their record ids and problems named. An absent chapter stays absent. A file written from selected content is a copy. Regulations are the ' +
  'regulation records with their revocation state, each saying the project it is filed in (filedIn); writing one ' +
  'is governed at the record door, addressed to that project.'

export async function officeRegulationRoutes(app: FastifyInstance): Promise<void> {
  const common = { n: z.number().int(), version: z.string().nullable(), because: z.string().trim().min(1).max(500), keep: z.string().min(1).optional(), warrant: warrantBody.optional() }
  const edit = z.strictObject({ ...common, chapter: z.unknown() })
  const restore = z.strictObject({ ...common, from: z.union([z.literal('shipped'), z.number().int().positive()]) })

  /**
   * THE ACTOR CARRYING THE OWNER'S WORDS FOR ONE CHAPTER ACT. Every door asks first that the caller is a secretary that uses
   * its own key; any other caller goes on with the plain actor, and the library guard refuses it in the door's old words. A
   * warrant that does not name this exact act is refused through the door's own refusal, so nothing is written.
   */
  function actorWithTheseWords(req: FastifyRequest, words: unknown, actingOn: string) {
    try {
      return actorWithTheWordsItActsOn(req, words, actingOn)
    } catch (error) {
      if (error instanceof PanelError) refuseChapterEdit(error.message, error.status)
      throw error
    }
  }

  app.get('/office-regulations/chapters', route('office.rules.chapters', 'remote', 'Read each shipped chapter number, the content in use, the role it is for when its record names one, its version and the stored records this release cannot use.'), async req => { actorFrom(req); return theSelectedChapters() })
  app.post('/office-regulations/chapters/preview', route('office.rules.preview-chapter', 'remote', 'Preview English chapter content, rule changes and the run rules file size. Any reader may preview. Nothing is written.'), async req => {
    actorFrom(req)
    const body = (req.body ?? {}) as Record<string, unknown>
    const hasChapter = Object.hasOwn(body, 'chapter'), hasFrom = Object.hasOwn(body, 'from')
    const parsed = z.union([
      z.strictObject({ n: z.number().int(), chapter: z.unknown(), keep: z.string().min(1).optional() }),
      z.strictObject({ n: z.number().int(), from: z.union([z.literal('shipped'), z.number().int().positive()]), keep: z.string().min(1).optional() }),
    ]).safeParse(body)
    if (!parsed.success || hasChapter === hasFrom) refuseChapterEdit('Send a chapter to preview or a shipped or historical source to restore, with its chapter number. Do not send both or extra fields.')
    if ('from' in parsed.data) {
      const resolved = resolveAChapterRestore(parsed.data.n, parsed.data.from, parsed.data.keep)
      return previewChapter(parsed.data.n, resolved.chapter, true, resolved.before)
    }
    return previewAChapterEdit(parsed.data.n, parsed.data.chapter, parsed.data.keep)
  })
  app.get('/office-regulations/chapters/:n/history', route('office.rules.chapter-history', 'remote', 'Read ten revisions of this office-wide chapter record, newest first, with writer, time, reason and content. The number is a chapter number, not a record id.'), async req => {
    actorFrom(req)
    const parsed = z.strictObject({ offset: z.coerce.number().int().min(0).optional() }).safeParse(req.query)
    const n = Number((req.params as { n: string }).n)
    if (!parsed.success || !Number.isInteger(n)) refuseChapterEdit('Use a chapter number and a non-negative history offset.')
    return chapterHistory(n, parsed.data.offset)
  })
  app.post('/office-regulations/chapters', route('office.rules.set-chapter', 'remote', 'Apply checked chapter content in both languages as the person, with the version read and a reason in its record revision. A secretary holding the person\'s grant may apply it only where this office\'s list of what the grant carries says the grant presses both this door and the write of a regulation; the secretary card keeps both. A secretary carrying the owner\'s written words for this one change may apply it too, whatever this office\'s list says. Changed English needs its Chinese in the same change. The door computes the Chinese source hashes; neutral twins and office marks stay with surviving rules.'), async req => {
    const parsed = edit.safeParse(req.body)
    if (!parsed.success) refuseChapterEdit('Send the chapter number, version read, a reason of 1 to 500 characters and complete chapter content in both languages. Do not send extra fields.')
    const body = parsed.data
    const words = theWordsInTheBody(req)
    const plain = actorFrom(req)
    const actor = words !== undefined && aSecretaryWithItsOwnKey(plain)
      ? actorWithTheseWords(req, words, `office.rules.set-chapter:${JSON.stringify({ n: body.n, version: body.version })}`)
      : plain
    return writeChapter({ n: body.n, version: body.version, because: body.because, chapter: body.chapter, ...(body.keep === undefined ? {} : { keep: body.keep }), actor })
  })
  app.post('/office-regulations/chapters/restore', route('office.rules.restore-chapter', 'remote', 'Restore the shipped chapter or both languages from a revision in its record history, as the person. Check the content again and preserve the reason in a new revision. A secretary holding the person\'s grant may restore it only where this office\'s list of what the grant carries says the grant presses both this door and the write of a regulation; the secretary card keeps both. A secretary carrying the owner\'s written words for this one change may restore it too, whatever this office\'s list says. Where the English changes, shipped restoration writes the English alone; unchanged parts keep their Chinese.'), async req => {
    const parsed = restore.safeParse(req.body)
    if (!parsed.success) refuseChapterEdit('Send the chapter number, version read, a reason of 1 to 500 characters and shipped or a revision number to restore. Do not send extra fields.')
    const body = parsed.data
    const words = theWordsInTheBody(req)
    const plain = actorFrom(req)
    const actor = words !== undefined && aSecretaryWithItsOwnKey(plain)
      ? actorWithTheseWords(req, words, `office.rules.restore-chapter:${JSON.stringify({ n: body.n, version: body.version, from: body.from })}`)
      : plain
    return writeChapter({ n: body.n, version: body.version, because: body.because, from: body.from, ...(body.keep === undefined ? {} : { keep: body.keep }), actor })
  })

  app.get(
    '/office-regulations',
    route('office.rules.read', 'remote', THE_NOTE),
    async (req: FastifyRequest): Promise<WhatTheOfficeRegulationsSay> => {
      return theOfficeRegulations(workspaceOf(req))
    },
  )

  app.post(
    '/office-regulations/only-this-office',
    route('office.rules.mark-only-this-office', 'remote', THE_MARK_NOTE),
    async (req: FastifyRequest): Promise<WhatTheMarkIs & { nothingWritten?: string }> => {
      const body = (req.body ?? {}) as Record<string, unknown>
      const chapter = body['chapter']
      const rule = body['rule']
      const only = body['only']
      if (typeof chapter !== 'string' || chapter.trim() === '' || typeof rule !== 'string' || rule.trim() === '' || typeof only !== 'boolean') {
        throw new PanelError(
          'This door takes {"chapter": "<chapter record id>", "rule": "<rule id, such as r-3>", "only": true or false}. Nothing was written.',
          400,
        )
      }
      let actor = actorFrom(req)
      const words = theWordsInTheBody(req)
      if (words !== undefined && aSecretaryWithItsOwnKey(actor)) {
        actor = actorWithTheWordsItActsOn(req, words, `office.rules.mark-only-this-office:${JSON.stringify({ chapter, rule, only })}`)
      }
      const marked = markARuleOnlyForThisOffice({ chapter, rule, only, actor })
      return marked.changed ? marked : { ...marked, nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }
    },
  )
}

const THE_MARK_NOTE =
  'The person marks one rule of a chapter record of this office, from any project, as only for this office, or takes the mark off. A marked rule is left ' +
  'out of the default regulations a new office copies. Only the person, with their own key, may press it, or a secretary ' +
  'holding their grant where this office\'s list of what the grant carries says the grant presses it; a secretary carrying ' +
  'the owner\'s written words for this one mark may press it too, whatever this office\'s list says. The secretary card ' +
  'keeps it for the person.'
