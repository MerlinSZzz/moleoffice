// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PROJECT'S OWN RULES, OVER HTTP. The design-first build of wave 13s's requirements.
 *
 *   POST /api/designs/:id/reviews                                    review one design at its current revision
 *   GET  /api/office-regulations/projects/current/chapters           read this project's own chapter
 *   POST /api/office-regulations/projects/current/chapters/preview   what a write of these rules would do; writes nothing
 *   POST /api/office-regulations/projects/current/chapters           write this project's own chapter
 *   POST /api/runs/:id/method-work                                   mark a run as method work or the go, once
 *   POST /api/design-reminders/:id/judgement                         judge one design reminder, once
 *   POST /api/runs/:id/missed-design-reminder                        file a miss for a marked run sealed unreminded
 *   GET  /api/office-regulations/projects/current/design-reminders   count this project's design reminders by the day
 *
 * THE RULES ARE IN src/server/lib/project-rules.ts, and those of the mark and the design reminder in
 * src/server/lib/design-reminders.ts. What is here is the door: the shape of the body, and what comes back. A design,
 * a run and a reminder are read through `recordInWorkspace`, so an id from another project is a 404 before anything is
 * written. "current" is the project the request is made in, so a project's chapter and count are read only there.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { DESIGN_REMINDER_VERDICTS, METHOD_WORKS } from '@shared/design-reminders.ts'
import { DESIGN_REVIEW_VERDICTS } from '@shared/project-rules.ts'
import { countTheDesignReminders, fileAMissedDesignReminder, judgeADesignReminder, markARunAsMethodWork } from '../lib/design-reminders.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { judgeADesign, previewTheProjectChapter, readTheProjectChapter, writeADesignReview, writeTheProjectChapter } from '../lib/project-rules.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const REVIEW_NOTE =
  'REVIEW ONE DESIGN AT ITS CURRENT REVISION. Body {"designRevision","verdict","words"}: the design\'s revision you read, "approved" or ' +
  '"changes-asked", and why, in words. A revision that is not the design\'s current one is refused with 409. The office ' +
  'writes who reviewed it from your key, and the revision of the project\'s own chapter it was written under. Anybody ' +
  'proved may review; a design counts a review by the agent its assigner answers to, or by the person. The answer ' +
  'carries what the project\'s rules now say of the design at method work.'

const CHAPTER_NOTE =
  "READ THIS PROJECT'S OWN CHAPTER: its rules, each naming one check from a closed list, the version a writer sends " +
  'back, any stored rule that does not read, and the closed list of checks. A project with no chapter answers so. It ' +
  "is never one of the office's general chapters."

const PREVIEW_NOTE =
  'PREVIEW A WRITE OF THIS PROJECT\'S CHAPTER. Body {"rules"}: every rule the chapter would hold. The answer names each ' +
  'problem that would stop the write, and says which rules are new, changed, the same, or taken out. Any reader may ' +
  'preview. Nothing is written.'

const SET_NOTE =
  'WRITE THIS PROJECT\'S OWN CHAPTER. Body {"version","because","rules"}: the version you read (null when there is no ' +
  'chapter), why, in 1 to 500 characters, and every rule the chapter will hold. Only the person, or a secretary of this ' +
  'project using its own key, writes it. A version that is not the current one is refused with 409. A rule that names a ' +
  'program, sets a general rule aside, is outside the closed lists or names no live record of this project as its ' +
  'source is refused with 400. The reason is kept with the revision, and each new or changed rule takes its number.'

const MARK_NOTE =
  'MARK A RUN AS METHOD WORK OR AS THE GO FOR A PILOT, once. Body {"work","because"}: "method-work" or "go", and why, ' +
  'in words. Only the person, or the agent that started the agent the run serves with its own key, marks it; the ' +
  "run's own agent may not. The office writes who and when. A marked run is reminded before its seal of the reviewed " +
  'design it lacks. A run the office started, and a run already marked, are refused with 409.'

const JUDGE_NOTE =
  'JUDGE ONE DESIGN REMINDER, once. Body {"verdict","words"?}: "right", "wrong-not-method-work" or ' +
  '"wrong-it-was-there", and words if you have them. Only the person, or the secretary the run\'s marker answers to ' +
  'with its own key, judges it. A reminder already judged, and a miss, are refused with 409.'

const MISS_NOTE =
  'FILE A MISS: a run marked as method work sealed with no design reminder, and should have had one. Body {"words"}: ' +
  "why, in words. Only the reminder's judges file it: the person, or the secretary the run's marker answers to. A run " +
  'nobody marked, a run not sealed, and a run that already has a reminder or a miss are refused with 409.'

const COUNT_NOTE =
  "COUNT THIS PROJECT'S DESIGN REMINDERS by the day each was filed, ?from=YYYY-MM-DD&to=YYYY-MM-DD, both counted; the " +
  'seven days to today when left out. The answer counts right, wrong because the run was not method work, wrong ' +
  'because what it named was there, not judged, and misses, and lists each one with who may judge it. Writes nothing.'

const someRules = z.array(z.unknown()).max(100)
const aPreview = z.strictObject({ rules: someRules })
const aWrite = z.strictObject({
  version: z.number().int().nonnegative().nullable(),
  because: z.string().trim().min(1).max(500),
  rules: someRules,
})

const whichDesign = z.strictObject({ id: z.string().min(1) })
const aReview = z.strictObject({
  designRevision: z.number().int().positive(),
  verdict: z.enum(DESIGN_REVIEW_VERDICTS),
  words: z.string().trim().min(1).max(4000),
})

const whichRecord = z.strictObject({ id: z.string().min(1) })
const aMark = z.strictObject({ work: z.enum(METHOD_WORKS), because: z.string().trim().min(1).max(2000) })
const aJudgement = z.strictObject({ verdict: z.enum(DESIGN_REMINDER_VERDICTS), words: z.string().trim().min(1).max(4000).optional() })
const aMiss = z.strictObject({ words: z.string().trim().min(1).max(4000) })
const aRange = z.strictObject({ from: z.string().optional(), to: z.string().optional() })

export async function projectRulesRoutes(app: FastifyInstance): Promise<void> {
  app.post('/designs/:id/reviews', route('design.review', 'remote', REVIEW_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichDesign, req.params, 'The design')
    const sent = parse(aReview, req.body, 'The review')
    const review = writeADesignReview(id, workspaceId, sent, actorFrom(req))
    void reply.code(201)
    return { review, judged: judgeADesign(id, 'method-work') }
  })

  app.get('/office-regulations/projects/current/chapters', route('project.rules.chapter', 'remote', CHAPTER_NOTE), async (req) => {
    actorFrom(req)
    return readTheProjectChapter(workspaceOf(req))
  })

  app.post('/office-regulations/projects/current/chapters/preview', route('project.rules.preview-chapter', 'remote', PREVIEW_NOTE), async (req) => {
    actorFrom(req)
    const { rules } = parse(aPreview, req.body, 'The preview')
    return previewTheProjectChapter(workspaceOf(req), rules)
  })

  app.post('/office-regulations/projects/current/chapters', route('project.rules.set-chapter', 'remote', SET_NOTE), async (req) => {
    const sent = parse(aWrite, req.body, 'The chapter')
    return writeTheProjectChapter(workspaceOf(req), sent, actorFrom(req))
  })

  app.post('/runs/:id/method-work', route('run.method-work', 'remote', MARK_NOTE), async (req) => {
    const { id } = parse(whichRecord, req.params, 'The run')
    const sent = parse(aMark, req.body, 'The mark')
    return markARunAsMethodWork(id, workspaceOf(req), sent, actorFrom(req))
  })

  app.post('/design-reminders/:id/judgement', route('design-reminder.judge', 'remote', JUDGE_NOTE), async (req) => {
    const { id } = parse(whichRecord, req.params, 'The design reminder')
    const sent = parse(aJudgement, req.body, 'The judgement')
    return judgeADesignReminder(id, workspaceOf(req), sent, actorFrom(req))
  })

  app.post('/runs/:id/missed-design-reminder', route('design-reminder.miss', 'remote', MISS_NOTE), async (req, reply) => {
    const { id } = parse(whichRecord, req.params, 'The run')
    const { words } = parse(aMiss, req.body, 'The miss')
    const filed = fileAMissedDesignReminder(id, workspaceOf(req), words, actorFrom(req))
    void reply.code(201)
    return filed
  })

  app.get('/office-regulations/projects/current/design-reminders', route('project.rules.design-reminders', 'remote', COUNT_NOTE), async (req) => {
    actorFrom(req)
    const { from, to } = parse(aRange, req.query, 'The range')
    return countTheDesignReminders(workspaceOf(req), from, to)
  })
}
