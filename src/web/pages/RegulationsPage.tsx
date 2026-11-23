// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { behaviorForJump, washJumpTarget } from '../lib/motion.ts'
/**
 * `#/regulations` — THE OFFICE REGULATIONS: THE PERSON'S OWN CONSTRAINTS, AND THE CHAPTERS. Criterion G5.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE WORDS COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * The chapter doors select the content this page draws and the rules file exports. Stored chapters
 * are module records carrying extra.chapter; the office may select the shipped chapter when a stored
 * record cannot be used, and the page then names that record and its problems above the chapter.
 * So a rule on this page and a rule in the file are one selected fact read twice, and the file cannot
 * drift from the page without one of them moving. The export is never read here: it is a copy.
 * The older reading supplies the office-only marks; the selected reply supplies both languages.
 *
 * The regulations are the `regulation` records of the project, each drawn with its sentence in the
 * person's own words and its revocation state. Revoking one is the person's own act (criterion
 * G2); the page only says what the records say.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE REFUSES ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * A page that read the regulations and then judged the reader would be a hard gate, which is ruled
 * out: the secretary raises a regulation in conversation, and no door refuses
 * on it. This page draws. It is where a person goes to read what they have bound themselves to.
 */

import { useState } from 'react'
import type { SelectedChapter, TheSelectedChapters } from '@shared/chapter-edit.ts'
import { ChapterEditor } from '../components/ChapterEditor.tsx'
import { api, errorMessage, faultOf, getActor } from '../api.ts'
import { Absence, Btn, ErrorNote, Field, Loading, TextArea, TextInput } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { RouteLink, recordPath } from '../components/router.tsx'
import { dayKey } from '@shared/planning.ts'
import { content, dayInThePageLanguage, listJoined, sentencesJoined, t, wordLanguage, writtenDayRange } from '@shared/i18n.ts'
import { wordWithSpacedValues } from '@shared/spacing.ts'
import { parseLocalStamp } from '@shared/time.ts'
import { cardWord } from '@shared/card-words.ts'
import { declaredAttributes } from '../components/declares.ts'
import { DRAWS_THE_NAME } from '../components/agent/pointing.ts'
import { SideBySide, WIDE_SCREEN } from '../components/SideBySide.tsx'
import { theEnglishHashOfARegulation, theNameOfAChapter, theOnlyCopyIsTheFirst } from '@shared/office-rules.ts'
import type { OfficeChapterInBothLanguages, OneRegulation, WhatTheOfficeRegulationsSay } from '@shared/office-rules.ts'
import type { ProjectRule, ProjectRuleProblem, TheProjectChapter } from '@shared/project-rules.ts'
import { DESIGN_REMINDER_VERDICTS } from '@shared/design-reminders.ts'
import type { ADesignReminderListed, ADesignReminderNamed, DesignReminderAnswer, DesignReminderVerdict, MethodWork, TheDesignReminderCount, TheDesignReminderCounts } from '@shared/design-reminders.ts'

/**
 * EVERY WORD THIS PAGE DRAWS THAT IS NOT READ OFF THE REPLY, read from the word lists in the page's
 * language when it is drawn (section R8b of src/shared/words). Each is a getter, so a page drawn
 * after a change of language says the new words. Under Node, where the tests draw this half, t()
 * answers in English.
 */
export const REGULATIONS_WORDS = {
  /** Over the list of the person's own constraints. */
  get theirRegulations() { return t('unrowedPages.regulations.person') },
  /** The words drawn when no regulation record is filed. A real answer, not a list still arriving. */
  get noneYet() { return t('unrowedPages.regulations.noneYet') },
  /** The two states a regulation can stand in. The words say the state, not the mechanism. */
  get standing() { return t('unrowedPages.regulations.standing') },
  /**
   * THE REVOKE PRESS IS FOR THE PERSON ONLY. Revoking is their own act and the office never delegates it,
   * so the press is drawn to them and to nobody else, and the one sentence it asks for is the
   * `revoked_because` the kind requires beside the date.
   */
  get revoke() { return t('unrowedPages.regulations.revoke') },
  get revokeWhy() { return t('unrowedPages.regulations.revokeWhy') },
  get revokeConfirm() { return t('unrowedPages.regulations.revokeConfirm') },
  get keepIt() { return t('unrowedPages.regulations.keepIt') },
  /** Over the list of chapters. */
  get chapters() { return t('unrowedPages.regulations.chapters') },
}

/** Suggested Chinese titles, keyed by the regulation record id. */
export const REGULATION_CHINESE_TITLE_SUGGESTIONS: Record<string, string> = {
  // A decision records this suggestion for the first regulation.
  Jx1aakVYqZft: '架构设计',
}

export function RegulationsPage() {
  const [state, reload] = useProjectAsync(async () => {
    const [said, selected, project, reminders] = await Promise.all([api.officeRegulations(), api.officeChapters(), api.projectChapter(), api.designReminders()])
    return { said, selected, project, reminders }
  }, [])
  // THE ONE PRESS THAT JUDGES A DESIGN REMINDER is drawn to the person only. The secretary the marking agent answers to
  // judges through the same door with its own key; the door says who may.
  const judge = getActor().type === 'human'
    ? async (reminder: string, verdict: DesignReminderVerdict): Promise<void> => {
        await api.judgeADesignReminder(reminder, verdict)
        reload()
      }
    : undefined
  return (
    <div className="page ofc">
      <style href="mole-office-office-regulations" precedence="default">
        {REGULATIONS_CSS}
      </style>
      <header className="ofc-head">
        {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
        <h1 className="ofc-title">{t('nav.regulations')}</h1>
      </header>
      {state.status === 'loading' ? <Loading what={t('unrowedPages.regulations.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? (
        <TheRegulations said={state.value.said} selected={state.value.selected} project={state.value.project} reminders={state.value.reminders} judge={judge} onChanged={reload} />
      ) : null}
    </div>
  )
}

/**
 * The page, given the regulations and the selected chapters.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER, the way `TheCensus` is: this half is a pure
 * function of what was fetched, and that is the half a test can hold still.
 *
 * `onChanged` IS THE PAGE'S OWN RE-READ, handed down so a revocation or title save redraws the list. It is
 * optional because a test that draws this half has no page around it and nothing to re-read.
 *
 * THE FORM IS ONE DOCUMENT (report n9Mjk3c_sJRu block b-13).
 * The person's regulations come first, as a list across the full width. Then the chapters are one text
 * read from top to bottom: chapter headings, rule lines and rule text share one left edge, and the
 * numbers sit inline instead of making an indent. The chapter list stands beside the text on a wide
 * screen and above it on a narrow one, and a press on it jumps to the chapter.
 *
 * TWO LABELLED PARTS. General holds the person's regulations and the office's chapters,
 * which every project reads. This project holds the rules the current project keeps beside them, read at
 * GET /api/office-regulations/projects/current/chapters; it is drawn when `project` is given. Each chapter says its
 * record's revision, and each project rule the chapter revision at which it last changed.
 *
 * THE DESIGN REMINDERS OF THE DAYS close the This project part, when `reminders` is given: the five counts, and each
 * reminder or miss. `judge` draws the three verdicts as presses on each reminder nobody judged; it is given for the
 * person only.
 */
export function TheRegulations({
  said,
  selected,
  project,
  reminders,
  judge,
  onChanged,
}: {
  said: WhatTheOfficeRegulationsSay
  selected?: TheSelectedChapters
  project?: TheProjectChapter
  reminders?: TheDesignReminderCount
  judge?: (reminder: string, verdict: DesignReminderVerdict) => Promise<void> | void
  onChanged?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const person = getActor().type === 'human'
  const canEdit = person && editing
  // THE FOLD NAMES NO FILE, in either mode: it says in general words that any file written from the
  // chapters is a copy, and that the record is right where the two differ. The reply's own says
  // field is the server's English and is not drawn at all.
  const chapters = selected === undefined ? said.chapters : selected.chapters.map(one => chapterForReading(one, said.chapters))
  const chapterCount = selected === undefined ? chapters.length : selected.chapters.filter(one => one.inUse !== 'none').length
  const standing = said.regulations.filter((one) => one.revokedAt === null).length
  return (
    <>
      {person ? <div className="ofc-mode">
        <Btn variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
          {t(editing ? 'regulationsMode.read' : 'regulationsMode.edit')}
        </Btn>
      </div> : null}

      <section className="ofc-part" data-part="general" aria-labelledby="ofc-part-general">
      <PartHead id="ofc-part-general" name={t('regulationsPage.general')} />
      <section className="ofc-sec" {...declaredAttributes({ surface: 'regulations.person' })}>
        <h3 className="ofc-label">
          <span data-title-is="its-label" {...DRAWS_THE_NAME}>{REGULATIONS_WORDS.theirRegulations}</span>
          {said.regulations.length === 0 ? null : (
            <span className="ofc-count">{t('regulationsPage.standingCount', { n: standing })}</span>
          )}
        </h3>
        {said.regulations.length === 0 ? (
          <p className="ofc-none">
            {/* NO REGULATION IS SAID IN WORDS, not with a lone dash whose words are only on hover (open point 32). */}
            <Absence tier="ordinary" title={REGULATIONS_WORDS.noneYet} say />
          </p>
        ) : (
          <ul className="ofc-regs">
            {said.regulations.map((one) => (
              <Regulation key={one.id} one={one} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </section>

      {selected?.unsupported ? <div role="status" className="ofc-unsupported" data-unsupported-chapters="">
        <p>{t('regulationsPage.notInUse')}</p>
        <ul>{selected.unsupported.records.map(id => <li key={id}><RouteLink to={recordPath(id)}>{id}</RouteLink></li>)}</ul>
      </div> : null}

      <SideBySide className="ofc-read">
        <nav className="ofc-toc" data-column="end" aria-label={t('regulationsPage.jumpTo')} {...declaredAttributes({ surface: 'regulations.chapters' })}>
          <h3 className="ofc-label">
            <span data-title-is="its-label" {...DRAWS_THE_NAME}>{REGULATIONS_WORDS.chapters}</span>
            {chapterCount === 0 ? null : (
              <span className="ofc-count">{t('regulationsPage.chapterCount', { n: chapterCount })}</span>
            )}
          </h3>
          {/* WHERE THESE CHAPTERS CAME FROM, when a start copied them from the default set
              (src/server/lib/default-regulations.ts), so the owner knows they may change them. */}
          {said.copiedFromTheDefaults === null ? null : (
            <p className="ofc-copied">{theCopiesInWords(said.copiedFromTheDefaults)}</p>
          )}
          {chapters.length === 0 ? (
            <p className="ofc-none">
              <Absence tier="ordinary" word={t('absence.none')} />
            </p>
          ) : (
            <ol className="ofc-toc-list">
              {chapters.map((one) => (
                <li key={one.id}>
                  <TocEntry one={one} />
                </li>
              ))}
            </ol>
          )}
        </nav>
        {chapters.length === 0 ? null : (
          <article className="ofc-doc" data-column="start">
            {chapters.map((one) => (
              <Chapter key={one.n} one={one} editing={canEdit} selected={selected?.chapters.find(chapter => chapter.n === one.n)} onChanged={onChanged} />
            ))}
          </article>
        )}
      </SideBySide>
      </section>

      {project === undefined ? null : <TheProjectsPart project={project} reminders={reminders} judge={judge} />}
    </>
  )
}

/** A part's name and the one line that says what is in it. */
function PartHead({ id, name }: { id: string; name: string }) {
  return (
    <header className="ofc-part-head">
      <h2 className="ofc-part-name" id={id}>{name}</h2>
    </header>
  )
}

/**
 * THE THIS PROJECT PART: the current project's own chapter, as its read door answers it. A project that keeps no chapter
 * says so. Its record, where every change is kept with its reason, is linked with the revision it is at. A stored rule
 * that does not read as a rule is counted and named, so the list is never taken for the whole chapter. The door's
 * `says` is the server's English and is not drawn; each fact is drawn from the word lists. The design reminders of the
 * days follow the rules, and are drawn when the project keeps no chapter too.
 */
function TheProjectsPart({ project, reminders, judge }: { project: TheProjectChapter; reminders?: TheDesignReminderCount; judge?: TheJudge }) {
  return (
    <section className="ofc-part" data-part="project" aria-labelledby="ofc-part-project">
      <PartHead id="ofc-part-project" name={t('regulationsPage.thisProject')} />
      {project.chapter === null ? (
        <p className="ofc-none">
          <Absence tier="ordinary" title={t('regulationsPage.project.noRules')} say />
        </p>
      ) : (
        <>
          <p className="ofc-proj-record">
            <RouteLink to={recordPath(project.chapter)} className="ofc-ch-open">{t('regulationsPage.project.record')}</RouteLink>
            {project.version === null ? null : <span className="ofc-rev">{t('regulationsPage.revision', { n: project.version })}</span>}
            <span className="ofc-count">{t('regulationsPage.project.ruleCount', { n: project.rules.length })}</span>
          </p>
          {project.problems.length === 0 ? null : <ProjectProblems problems={project.problems} />}
          {project.rules.length === 0 ? null : (
            <ol className="ofc-proj-rules">
              {project.rules.map((rule) => <ProjectRuleRow key={rule.id} rule={rule} />)}
            </ol>
          )}
        </>
      )}
      {reminders === undefined ? null : <TheDesignReminders count={reminders} judge={judge} />}
    </section>
  )
}

/** The words for each check of the closed list, by its name. */
const CHECK_WORDS = {
  'evidence-linked': (rule: ProjectRule) => t('regulationsPage.checks.evidenceLinked', { evidence: rule.check.evidence ?? '' }),
  'reviewed-design-linked': () => t('regulationsPage.checks.reviewedDesignLinked'),
  'threshold-names-its-source': () => t('regulationsPage.checks.thresholdNamesItsSource'),
} as const satisfies Record<ProjectRule['check']['name'], (rule: ProjectRule) => string>

/** When a rule is asked, by its trigger. */
const TRIGGER_WORDS = {
  'method-work': () => t('regulationsPage.triggers.methodWork'),
  go: () => t('regulationsPage.triggers.go'),
} as const satisfies Record<ProjectRule['trigger'], () => string>

/**
 * ONE PROJECT RULE: its heading and words as the project wrote them, then its facts. Why it is kept, the record it comes
 * from, what it checks, when it is asked and that it only reminds, whether it is on, and the chapter revision at which it
 * last changed. On and off are words, not a colour.
 */
function ProjectRuleRow({ rule }: { rule: ProjectRule }) {
  return (
    <li className="ofc-proj-rule" data-project-rule={rule.id} data-on={rule.on ? 'on' : 'off'}>
      <h3 className="ofc-proj-rule-name">{content(rule.heading)}</h3>
      <p className="ofc-rule-text">{content(rule.text)}</p>
      <dl className="ofc-proj-facts">
        <div className="ofc-fact"><dt>{t('regulationsPage.rule.why')}</dt><dd>{content(rule.reason)}</dd></div>
        <div className="ofc-fact"><dt>{t('regulationsPage.rule.source')}</dt><dd><RouteLink to={recordPath(rule.source)} className="ofc-reg-link">{t('regulationsPage.rule.openSource')}</RouteLink></dd></div>
        <div className="ofc-fact"><dt>{t('regulationsPage.rule.check')}</dt><dd>{CHECK_WORDS[rule.check.name](rule)}</dd></div>
        <div className="ofc-fact"><dt>{t('regulationsPage.rule.when')}</dt><dd>{TRIGGER_WORDS[rule.trigger]()}</dd></div>
        <div className="ofc-fact"><dt>{t('regulationsPage.rule.state')}</dt><dd>{t(rule.on ? 'regulationsPage.rule.on' : 'regulationsPage.rule.off')} · {t('regulationsPage.revision', { n: rule.revision })}</dd></div>
      </dl>
    </li>
  )
}

/** The stored rules that do not read as rules: how many, and each by its place and its id where it has one. */
function ProjectProblems({ problems }: { problems: ProjectRuleProblem[] }) {
  return (
    <div role="status" className="ofc-unsupported" data-project-problems="">
      <p>{t('regulationsPage.project.unread', { n: problems.length })}</p>
      <ul>
        {problems.map((problem) => (
          <li key={`${String(problem.at)}-${problem.code}`}>
            {t('regulationsPage.project.problemAt', { n: problem.at + 1 })}
            {problem.rule === null ? null : <> <code>{content(problem.rule)}</code></>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The press that judges one design reminder, as the page hands it down. */
type TheJudge = (reminder: string, verdict: DesignReminderVerdict) => Promise<void> | void

/** The five counts, in the order the week's end shows them, each with its word. */
const COUNT_WORDS = [
  ['right', () => t('regulationsPage.reminders.right')],
  ['wrongNotMethodWork', () => t('regulationsPage.reminders.wrongNotMethodWork')],
  ['wrongItWasThere', () => t('regulationsPage.reminders.wrongItWasThere')],
  ['notJudged', () => t('regulationsPage.reminders.notJudged')],
  ['misses', () => t('regulationsPage.reminders.misses')],
] as const satisfies readonly (readonly [keyof TheDesignReminderCounts, () => string])[]

/** Each verdict's word, on a judged reminder and on its press. */
const VERDICT_WORDS = {
  right: () => t('regulationsPage.reminders.right'),
  'wrong-not-method-work': () => t('regulationsPage.reminders.wrongNotMethodWork'),
  'wrong-it-was-there': () => t('regulationsPage.reminders.wrongItWasThere'),
} as const satisfies Record<DesignReminderVerdict, () => string>

/** Each lack's word, by its answer. The server's English sentence beside it is for an agent and is not drawn. */
const ANSWER_WORDS = {
  'no-design': () => t('regulationsPage.reminders.answer.noDesign'),
  'no-review': () => t('regulationsPage.reminders.answer.noReview'),
  'wrong-reviewer': () => t('regulationsPage.reminders.answer.wrongReviewer'),
  'changes-asked': () => t('regulationsPage.reminders.answer.changesAsked'),
  'stale-review': () => t('regulationsPage.reminders.answer.staleReview'),
  'rule-changed': () => t('regulationsPage.reminders.answer.ruleChanged'),
  missing: () => t('regulationsPage.reminders.answer.missing'),
  unreadable: () => t('regulationsPage.reminders.answer.unreadable'),
  'not-checked': () => t('regulationsPage.reminders.answer.notChecked'),
} as const satisfies Record<DesignReminderAnswer, () => string>

/** What the marking agent said the run was. */
const WORK_WORDS = {
  'method-work': () => t('regulationsPage.reminders.work.methodWork'),
  go: () => t('regulationsPage.reminders.work.go'),
} as const satisfies Record<MethodWork, () => string>

/** A day the count door writes as YYYY-MM-DD, as a date in the page's clock, or null when it does not read as one. */
function aCountedDay(day: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  return parts === null ? null : new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
}

/** The days counted, written once as a range; a day that does not read as one is shown as it came. */
function theDaysCounted(count: TheDesignReminderCount): string {
  const from = aCountedDay(count.from)
  const to = aCountedDay(count.to)
  return from === null || to === null
    ? content(`${count.from} – ${count.to}`)
    : writtenDayRange(from, to, { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * THE DESIGN REMINDERS OF THE DAYS (part 6, decision bYwACBK03tGT): the days counted, the five counts, and each reminder
 * or miss. A reminder nobody judged is counted and drawn as not judged, never as right or wrong. Days with none say so in
 * words. The count door's `says` is the server's English and is not drawn.
 */
function TheDesignReminders({ count, judge }: { count: TheDesignReminderCount; judge?: TheJudge }) {
  return (
    <section className="ofc-sec ofc-rems" data-design-reminders={`${count.from} ${count.to}`} aria-labelledby="ofc-rems-title">
      <h3 className="ofc-label" id="ofc-rems-title">
        <span>{t('regulationsPage.reminders.title')}</span>
        <span className="ofc-count">{t('regulationsPage.reminders.range', { range: theDaysCounted(count) })}</span>
      </h3>
      <dl className="ofc-rems-counts">
        {COUNT_WORDS.map(([key, word]) => (
          <div key={key} className="ofc-rems-count" data-count={key}>
            <dt>{word()}</dt>
            <dd>{count.counts[key]}</dd>
          </div>
        ))}
      </dl>
      {count.reminders.length === 0 ? (
        // Its own class: an empty count is not one of the empty lists of regulations above it.
        <p className="ofc-rems-none">
          <Absence tier="ordinary" title={t('absence.none')} say />
        </p>
      ) : (
        <ol className="ofc-rems-list">
          {count.reminders.map((one) => <DesignReminderRow key={one.id} one={one} judge={judge} />)}
        </ol>
      )}
    </section>
  )
}

/**
 * ONE REMINDER OR MISS: its day, what the run was marked as, its run and its record, then what it named or the miss's
 * words, then how it was judged. A miss is counted as a miss and is not judged. An unjudged reminder offers the three
 * verdicts as presses when the page is given `judge`.
 */
function DesignReminderRow({ one, judge }: { one: ADesignReminderListed; judge?: TheJudge }) {
  const at = parseLocalStamp(one.at)
  return (
    <li className="ofc-rem" data-design-reminder={one.id} data-was={one.was}>
      <p className="ofc-rem-head">
        <span className="ofc-rev">{at === null ? content(one.at) : dayInThePageLanguage(new Date(at), true)}</span>
        <span>{WORK_WORDS[one.work]()}</span>
        <RouteLink to={recordPath(one.run)} className="ofc-reg-link">{t('regulationsPage.reminders.openRun')}</RouteLink>
        <RouteLink to={recordPath(one.id)} className="ofc-reg-link">{t('regulationsPage.reminders.openRecord')}</RouteLink>
      </p>
      {one.was === 'missed' ? (
        <p className="ofc-rem-words">
          <strong>{t('record.option.design_reminder.was.missed')}</strong>
          {one.words === null ? null : <> {content(one.words)}</>}
        </p>
      ) : (
        <ul className="ofc-rem-named">
          {one.named.map((named, n) => <DesignReminderLack key={`${String(n)}-${named.answer}`} named={named} />)}
        </ul>
      )}
      {one.was === 'missed' ? null : one.judgement !== null ? (
        <>
          <p className="ofc-rem-words" data-verdict-is={one.judgement.verdict}>
            <strong>{VERDICT_WORDS[one.judgement.verdict]()}</strong>
            {' · '}
            {t(one.judgement.by.kind === 'person' ? 'regulationsPage.reminders.byThePerson' : 'regulationsPage.reminders.bySecretary')}
          </p>
          {/* THE JUDGE'S WORDS ARE A LINE OF THEIR OWN, so they never read as the end of "Judged by the person". */}
          {one.judgement.words === null ? null : <p className="ofc-rem-said">{content(one.judgement.words)}</p>}
        </>
      ) : (
        <>
          <p className="ofc-rem-words">{t('regulationsPage.reminders.notJudged')}</p>
          {judge === undefined ? null : <JudgeADesignReminder reminder={one.id} judge={judge} />}
        </>
      )}
    </li>
  )
}

/** One lack a reminder named: its word, the design it is about, and the project's rule and its source when one answered. */
function DesignReminderLack({ named }: { named: ADesignReminderNamed }) {
  return (
    <li className="ofc-rem-lack" data-answer={named.answer}>
      <span>{ANSWER_WORDS[named.answer]()}</span>
      {named.design === null ? null : <RouteLink to={recordPath(named.design)} className="ofc-reg-link">{t('regulationsPage.reminders.openDesign')}</RouteLink>}
      {named.rule === null ? null : <span>{t('regulationsPage.reminders.rule')} <code>{content(named.rule)}</code></span>}
      {named.source === null ? null : <RouteLink to={recordPath(named.source)} className="ofc-reg-link">{t('regulationsPage.rule.openSource')}</RouteLink>}
    </li>
  )
}

/** The three verdicts as presses. A refused press says why beside them, and the reminder stays not judged. */
function JudgeADesignReminder({ reminder, judge }: { reminder: string; judge: TheJudge }) {
  const [busy, setBusy] = useState<DesignReminderVerdict | null>(null)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const press = async (verdict: DesignReminderVerdict): Promise<void> => {
    setBusy(verdict)
    setFailed(null)
    try {
      await judge(reminder, verdict)
    } catch (error) {
      setFailed({ message: errorMessage(error), fault: faultOf(error) })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="ofc-rem-judge" role="group" aria-label={t('regulationsPage.reminders.judge')}>
      {DESIGN_REMINDER_VERDICTS.map((verdict) => (
        <span key={verdict} data-verdict={verdict}>
          <Btn variant="ghost" size="sm" pending={busy === verdict} onClick={() => void press(verdict)}>
            {VERDICT_WORDS[verdict]()}
          </Btn>
        </span>
      ))}
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('regulationsPage.reminders.notSaved')} />}
    </div>
  )
}

/** The selected content carries current Chinese. Office-only marks still come from the same stored record. */
function chapterForReading(selected: SelectedChapter, existing: OfficeChapterInBothLanguages[]): OfficeChapterInBothLanguages {
  const shipped = selected.shipped
  const source = selected.chapter ?? (shipped === null
    ? null
    : { ...shipped, conclusion: '', rules: [], zh: shipped.zh === null ? null : { ...shipped.zh, conclusion: '' } })
  // The office selects a number the shipped file lacks only with its stored content, so neither is a broken answer.
  if (source === null) throw new Error(`The office sent chapter ${String(selected.n)} with neither the content in use nor shipped text.`)
  const old = existing.find(one => one.id === selected.record && one.n === selected.n)
  return {
    n: selected.n, id: selected.record ?? `chapter-${selected.n}`, label: source.label, title: source.title,
    conclusion: source.conclusion, context: '', source: '', ...(selected.forRole === undefined ? {} : { forRole: selected.forRole }),
    zh: selected.chineseWaiting.includes('chapter') ? null : source.zh,
    outline: source.rules.map(rule => {
      const previous = old?.outline.find(one => one.id === rule.id)
      return { id: rule.id, name: rule.heading, text: rule.text,
        zh: selected.chineseWaiting.includes(rule.id) || rule.zh === null ? null : { name: rule.zh.heading, text: rule.zh.text },
        onlyThisOffice: selected.inUse === 'stored' ? previous?.onlyThisOffice ?? null : null,
      }
    }),
  }
}

/**
 * WHICH START COPIED WHICH CHAPTERS, in the page's words, in the cases the door's sentence has
 * (`copiedFromTheDefaultsSentence` in src/server/lib/office-regulations.ts). When the office's first copy is the only
 * one (`theOnlyCopyIsTheFirst`), the note says every chapter was copied then, or names the others as added later.
 * Otherwise it says each copy, then the chapters with no copy stamp, then that the person may change them.
 */
function theCopiesInWords(copied: NonNullable<WhatTheOfficeRegulationsSay['copiedFromTheDefaults']>): string {
  const numbers = (list: readonly number[]): string => listJoined(list.map(String))
  const only = theOnlyCopyIsTheFirst(copied)
  if (only !== null) {
    return copied.notCopied.length === 0
      ? wordWithSpacedValues(t, 'regulationsPage.copiedAtTheStart', { date: theDayCopied(only.at) })
      : t('regulationsPage.copiedAndAddedLater', { n: copied.notCopied.length, numbers: numbers(copied.notCopied), date: theDayCopied(only.at) })
  }
  return sentencesJoined([
    ...copied.copies.map(copy => t(copy.first ? 'regulationsPage.copiedAtTheFirstStart' : 'regulationsPage.laterStartCopied', { n: copy.chapters.length, numbers: numbers(copy.chapters), date: theDayCopied(copy.at) })),
    ...(copied.notCopied.length === 0 ? [] : [t('regulationsPage.notCopied', { n: copied.notCopied.length, numbers: numbers(copied.notCopied) })]),
  ])
}

/**
 * THE DAY THE CHAPTERS WERE COPIED, in the office's one way of writing a day (`dayInThePageLanguage`):
 * "2 Oct 2026" on an English page, "2026年10月2日" on a Chinese one. A stamp that cannot be read is shown
 * as it is stored rather than guessed at.
 */
function theDayCopied(at: string): string {
  const ms = parseLocalStamp(at)
  return ms === null ? content(at) : dayInThePageLanguage(new Date(ms), true)
}

/** A chapter's name in English: its reading-level-1 label when one is written, and its record title when not. */
function nameOf(one: OfficeChapterInBothLanguages): string {
  return theNameOfAChapter(one).name
}

/**
 * ONE PART OF THE REGULATIONS IN THE PAGE'S LANGUAGE, and whether it had to be drawn in English
 * . English is the source. On a Chinese page a part is drawn in Chinese when the
 * reply carries its Chinese; the server answers a Chinese half written from another English as none,
 * so a stale one never reaches this page. Every other case (a part with no current Chinese, or a
 * language the office does not keep, such as the test language) is the English, marked lang="en" for
 * a screen reader. Nothing beside it says that it is in English: the English is the part itself, and a
 * reader can do nothing about a translation nobody has written yet. The Chinese is drawn as ordinary
 * text, not as a draft: the inspector checks it before release.
 */
function inThePageLanguage<T>(english: T, zh: T | null): { said: T; untranslated: boolean } {
  const language = wordLanguage()
  if (language === 'en') return { said: english, untranslated: false }
  if (language === 'zh' && zh !== null) return { said: zh, untranslated: false }
  return { said: english, untranslated: true }
}

/**
 * A chapter's name and Conclusion in the page's language. The Chinese name stands where the English
 * one does: the Chinese label where the English page draws the label, and the Chinese title where it
 * draws the title. A Chinese half that carries no label is named by its Chinese title.
 */
function chapterWords(one: OfficeChapterInBothLanguages): { name: string; conclusion: string; untranslated: boolean } {
  const read = inThePageLanguage(
    { name: nameOf(one), conclusion: one.conclusion },
    one.zh === null ? null : { name: theNameOfAChapter(one).zh ?? one.zh.title, conclusion: one.zh.conclusion },
  )
  return { ...read.said, untranslated: read.untranslated }
}

/** The card a role chapter is for, in the page language, or null for a chapter every run reads. */
function forTheRole(one: OfficeChapterInBothLanguages): string | null {
  return one.forRole === undefined ? null : t('regulationsPage.forRole', { role: cardWord(one.forRole) })
}

/** One row of the chapter list: the number, the name, the card a role chapter is for and, on a narrow page, the Conclusion. */
function TocEntry({ one }: { one: OfficeChapterInBothLanguages }) {
  const words = chapterWords(one)
  const role = forTheRole(one)
  return (
    <button type="button" className="ofc-toc-go" data-chapter={one.n} onClick={() => jumpToChapter(one.n)}>
      <span className="num">{one.n}</span>
      <span className="ofc-toc-name" lang={words.untranslated ? 'en' : undefined}>{words.name}</span>
      {role === null ? null : <span className="ofc-toc-role" data-for-role={one.forRole}>{role}</span>}
      {words.conclusion === '' ? null : <span className="ofc-toc-says" lang={words.untranslated ? 'en' : undefined}>{words.conclusion}</span>}
    </button>
  )
}

/** The id of a chapter's heading, which the chapter list jumps to. */
function chapterAnchor(n: number): string {
  return `ofc-ch-${String(n)}`
}

/**
 * THE JUMP. The chapter's heading is brought to the top of the view and given focus, so a keyboard
 * or screen-reader user goes on reading from the chapter. The page's address is a hash route, so a
 * plain in-page link would change the route; this press moves the view and leaves the address alone.
 */
function jumpToChapter(n: number): void {
  const heading = document.getElementById(chapterAnchor(n))
  if (heading === null) return
  heading.scrollIntoView({ block: 'start', behavior: behaviorForJump() })
  washJumpTarget(heading)
  heading.focus({ preventScroll: true })
}

/**
 * One regulation: the person's sentence, then its name, whom it binds, since when and whether it still stands.
 *
 * THE REVOKE PRESS IS ON THE ROW, AT ITS RIGHT (question 14 of report n9Mjk3c_sJRu, answered by a
 * decision), and it still asks why before anything is written. It is tiered
 * "asks first" in report wUhNFK-SnAKv, keeping this reason step.
 *
 * THE REVOKE PRESS IS THE PERSON'S AND NOBODY ELSE'S, drawn in the same way the record page draws its own
 * human-only controls: `getActor().type === 'human'`. The server refuses the write to every agent —
 * `assertMayRevokeARegulation` in src/server/lib/regulations.ts — so drawing it to an agent would
 * offer a press that is always refused, which is worse than no press.
 */
function Regulation({ one, onChanged }: { one: OneRegulation; onChanged?: () => void }) {
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [chineseTitle, setChineseTitle] = useState(one.zhTitle)
  const [storedChineseTitleIsStale, setStoredChineseTitleIsStale] = useState(one.zhTitleIsStale)
  const [titleDraft, setTitleDraft] = useState(
    one.storedZhTitle ?? REGULATION_CHINESE_TITLE_SUGGESTIONS[one.id] ?? '',
  )
  const [savingTitle, setSavingTitle] = useState(false)
  const [titleFailure, setTitleFailure] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  const canRevoke = getActor().type === 'human' && one.revokedAt === null
  const canEditTitle = getActor().type === 'human'
  // THE TITLE IS DRAWN IN THE PAGE'S LANGUAGE; THE SENTENCE NEVER IS. The sentence is the person's own words.
  const title = inThePageLanguage(one.title, chineseTitle)

  async function saveChineseTitle(): Promise<void> {
    const next = titleDraft.trim()
    if (next === '') return
    setSavingTitle(true)
    setTitleFailure(null)
    try {
      await api.updateRecord(
        one.id,
        { dataPatch: { zh: { title: next, from: theEnglishHashOfARegulation(one) } } },
        // THE PROJECT IT IS FILED IN, which may not be the one in the switcher: every project draws the office's regulations.
        one.filedIn,
      )
      setTitleDraft(next)
      setChineseTitle(next)
      setStoredChineseTitleIsStale(false)
      onChanged?.()
    } catch (err) {
      setTitleFailure({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setSavingTitle(false)
    }
  }

  async function revoke(): Promise<void> {
    setBusy(true)
    setFailed(null)
    try {
      // THE TWO FIELDS THE PERSON ALONE MAY WRITE, through the door that already exists — the same
      // PATCH /api/records/:id every other change on this page would use. The date is the local
      // calendar day, from the one helper the planning routes also read it with, so this page and
      // the server never come to write a date two different ways.
      await api.updateRecord(
        one.id,
        { dataPatch: { revoked_at: dayKey(new Date()), revoked_because: why.trim() } },
        // THE PROJECT IT IS FILED IN, which may not be the one in the switcher: every project draws the office's regulations.
        one.filedIn,
      )
      setAsking(false)
      setWhy('')
      onChanged?.()
    } catch (err) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="ofc-reg">
      <div className="ofc-reg-main">
        <blockquote className="ofc-reg-words">{one.sentence}</blockquote>
        <p className="ofc-reg-meta">
          <span className="ofc-reg-name">
            <RouteLink to={recordPath(one.id)} className="ofc-reg-link">
              {title.said}
            </RouteLink>
          </span>
          <span className="ofc-rev">
            {one.revision === null ? <Absence tier="ordinary" word={t('regulationsPage.revisionNone')} /> : t('regulationsPage.revision', { n: one.revision })}
          </span>
          <span>
            {/* WHOM IT BINDS, only as the record says it. A record that says neither is the absence
                it is, and is never drawn as binding the person. */}
            {one.binds === 'role' ? (
              t('unrowedPages.regulations.bindsRole', { role: cardWord(one.role ?? '') })
            ) : one.binds === 'person' ? (
              t('unrowedPages.regulations.bindsPerson')
            ) : (
              <Absence tier="ordinary" word={t('regulationsPage.bindsNotRecorded')} />
            )}
          </span>
          {one.since === null ? null : <span>{t('unrowedPages.regulations.since', { date: content(one.since) })}</span>}
          {one.revokedAt === null ? (
            <span>{REGULATIONS_WORDS.standing}</span>
          ) : (
            <span>{t('unrowedPages.regulations.revoked', { date: content(one.revokedAt) })}</span>
          )}
        </p>
        {one.revokedBecause === null ? null : <p className="ofc-reg-because">{one.revokedBecause}</p>}
      </div>
      {canRevoke ? (
        <div className="ofc-revoke" data-asking={asking ? '' : undefined}>
          {asking ? (
            <div className="ofc-revoke-form">
              <Field label={REGULATIONS_WORDS.revokeWhy}>
                <TextArea rows={2} value={why} onChange={setWhy} placeholder={t('unrowedPages.regulations.inYourWords')} />
              </Field>
              <div className="ofc-revoke-acts">
                <Btn
                  variant="danger"
                  size="sm"
                  pending={busy}
                  disabled={why.trim() === ''}
                  reason={t('unrowedPages.regulations.revokeNeedsAReason')}
                  onClick={() => void revoke()}
                >
                  {REGULATIONS_WORDS.revokeConfirm}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setAsking(false)}>
                  {REGULATIONS_WORDS.keepIt}
                </Btn>
              </div>
              {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('unrowedPages.regulations.notRevoked')} />}
            </div>
          ) : (
            <Btn variant="ghost" size="sm" onClick={() => setAsking(true)}>
              {REGULATIONS_WORDS.revoke}
            </Btn>
          )}
        </div>
      ) : null}
      {canEditTitle ? (
        <div className="ofc-reg-title-edit">
          {storedChineseTitleIsStale ? <p className="ofc-title-stale">{t('regZh.titleIsStale')}</p> : null}
          <Field label={t('regZh.chineseTitle')}>
            <TextInput value={titleDraft} onChange={setTitleDraft} />
          </Field>
          <div className="ofc-title-edit-acts">
            <Btn
              variant="ghost"
              size="sm"
              pending={savingTitle}
              disabled={titleDraft.trim() === ''}
              reason={t('regZh.titleRequired')}
              onClick={() => void saveChineseTitle()}
            >
              {t('regZh.saveTitle')}
            </Btn>
          </div>
          {titleFailure === null ? null : (
            <ErrorNote message={titleFailure.message} fault={titleFailure.fault} label={t('regZh.titleNotSaved')} />
          )}
        </div>
      ) : null}
    </li>
  )
}

/**
 * One chapter of the document: its number and name, a link to its record, its Conclusion, then its
 * rules as the record holds them. Every block starts at the document's one left edge; a rule's
 * number (2.1) is written inline before its name.
 */
function Chapter({ one, selected, editing, onChanged }: { one: OfficeChapterInBothLanguages; selected?: SelectedChapter; editing: boolean; onChanged?: () => void }) {
  const words = chapterWords(one)
  const english = words.untranslated ? 'en' : undefined
  const role = forTheRole(one)
  const heading = <div className="ofc-ch-head">
        <h3 className="ofc-ch-name" id={chapterAnchor(one.n)} tabIndex={-1} lang={english}>
          <span className="num">{one.n}</span> {words.name}
        </h3>
        {selected?.inUse === 'shipped' ? <span className="ofc-rev">{t('regulationsPage.shipped')}</span> : null}
        {selected?.inUse === 'stored' && selected.revision !== null ? <span className="ofc-rev">{t('regulationsPage.revision', { n: selected.revision })}</span> : null}
        {role === null ? null : <span className="ofc-rev" data-for-role={one.forRole}>{role}</span>}
        {selected?.inUse === 'none' ? null : <RouteLink to={recordPath(one.id)} className="ofc-ch-open">
          {t('regulationsPage.openRecord')}
        </RouteLink>}
      </div>
  return (
    <section className="ofc-ch" aria-labelledby={chapterAnchor(one.n)}>
      {selected === undefined ? heading : <ChapterEditor selected={selected} editing={editing} onChanged={onChanged}>{heading}</ChapterEditor>}
      {words.conclusion === '' ? null : <p className="ofc-ch-conclusion" lang={english}>{words.conclusion}</p>}
      {one.outline.length === 0 ? null : (
        <ol className="ofc-rules">
          {one.outline.map((rule, i) => {
            const read = inThePageLanguage({ name: rule.name, text: rule.text }, rule.zh)
            const inEnglish = read.untranslated ? 'en' : undefined
            return (
              <li key={rule.id === '' ? rule.name : rule.id} className="ofc-rule">
                <p className="ofc-rule-name" lang={inEnglish}>
                  <span className="num">
                    {one.n}.{i + 1}
                  </span>{' '}
                  {read.said.name}
                </p>
                {read.said.text === '' ? null : <p className="ofc-rule-text" lang={inEnglish}>{read.said.text}</p>}
                {selected !== undefined && selected.inUse !== 'stored' ? null : <RuleMark chapter={one.id} rule={rule} editing={editing} onChanged={onChanged} />}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/**
 * WHETHER A RULE IS ONLY FOR THIS OFFICE, and the person's press that changes it. By a decision, a
 * rule the person marks is left out of the default regulations a new office
 * copies. Everybody sees the mark on a marked
 * rule; the person sees the press in edit mode, because the server refuses it to everyone else
 * (POST /api/office-regulations/only-this-office). An unmarked rule draws nothing for anybody else.
 */
function RuleMark({ chapter, rule, editing, onChanged }: { chapter: string; rule: OfficeChapterInBothLanguages['outline'][number]; editing: boolean; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const canMark = editing && getActor().type === 'human'
  const marked = rule.onlyThisOffice !== null
  if (rule.id === '' || (!marked && !canMark)) return null
  const press = async (): Promise<void> => {
    setBusy(true)
    setFailed(null)
    try {
      await api.markARuleOnlyForThisOffice(chapter, rule.id, !marked)
      onChanged?.()
    } catch (error) {
      setFailed({ message: errorMessage(error), fault: faultOf(error) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ofc-rule-mark">
      {marked ? <p className="ofc-rule-only">{t('regulationsPage.onlyForThisOffice')}</p> : null}
      {canMark ? (
        <Btn variant="ghost" size="sm" pending={busy} pendingFailed={failed !== null} pendingSucceeded={failed === null} onClick={() => void press()}>
          {marked ? t('regulationsPage.giveToNewOffices') : t('regulationsPage.keepForThisOffice')}
        </Btn>
      ) : null}
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('regulationsPage.markNotChanged')} />}
    </div>
  )
}

/**
 * The page's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 * EXPORTED because the browser test has to give the page's own stylesheet to Chromium by hand:
 * renderToStaticMarkup returns the markup and not the styles React hoists into the document head.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
export const REGULATIONS_CSS = `
.ofc-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); min-width: 0; }
.ofc-title { margin: 0; font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); color: var(--text); }
.ofc-mode { display: flex; flex-wrap: wrap; gap: var(--pad); margin-top: var(--pad); }
.ofc-unsupported { border-top: 3px solid var(--accent); margin: var(--gut) 0; padding: .5rem 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ofc-unsupported p { margin: .5rem 0; }
.ofc-unsupported a { color: var(--accent); }
.ofc-none { margin: var(--pad) 0 0; }
.ofc-rule-mark { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--pad); margin: 4px 0 0; }
.ofc-rule-only { margin: 0; color: var(--text-2); font: italic var(--fs-1)/var(--lh-read) var(--font-ui); }
.ofc-copied { margin: var(--pad) 0 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }

/* A SECTION IS NOT A BOX: a heading in the look's label style over a rule, and its rows. */
.ofc-sec { margin: calc(var(--pad-lg) * 2) 0 0; min-width: 0; }
.ofc-label {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--pad-lg);
  margin: 0; padding-bottom: var(--section-pad); border-bottom: var(--section-rule);
  color: var(--text); font-family: var(--section-font); font-size: var(--section-size); font-weight: var(--section-weight);
}
.ofc-label [data-title-is='its-label'] { text-transform: var(--section-case); letter-spacing: var(--section-space); }
.ofc-count { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); text-transform: none; letter-spacing: 0; }

/* THE OWNER'S REGULATIONS, a list across the full width. One row each: the owner's sentence, then its facts, and the
   revoke press at the row's right. Rows are split by a thin line, not boxed. */
.ofc-regs { list-style: none; margin: 0; padding: 0; }
.ofc-reg {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--pad) var(--pad-lg); align-items: start;
  min-width: 0; padding: var(--pad-lg) 0; border-bottom: var(--border-w) solid var(--border);
}
.ofc-reg-main { min-width: 0; }
.ofc-reg-words { margin: 0; color: var(--text); font: var(--fs-3)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ofc-reg-meta { display: flex; flex-wrap: wrap; gap: 2px var(--pad-lg); margin: 4px 0 0; color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.ofc-reg-link { color: var(--text-2); text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; }
.ofc-reg-link:hover { color: var(--text); }
/* THE STATE IS THE WORD, NOT A COLOUR: standing and revoked read the same, in the row's own ink. */
.ofc-reg-because { margin: 4px 0 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; white-space: pre-wrap; }
/* THE REVOKE PRESS, quiet, at the row's right. The form it opens takes the row's full width
   under the row's words and asks for the one sentence the record needs beside the date. */
.ofc-revoke { justify-self: end; }
.ofc-revoke[data-asking] { grid-column: 1 / -1; justify-self: stretch; }
.ofc-revoke-form { display: grid; gap: var(--pad); max-width: var(--measure-read); }
.ofc-revoke-acts { display: flex; flex-wrap: wrap; gap: var(--pad); }
.ofc-reg-title-edit {
  grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, var(--measure-read)) auto;
  align-items: end; gap: var(--pad) var(--pad-lg); min-width: 0;
}
.ofc-reg-title-edit .px-field { min-width: 0; }
.ofc-title-stale { grid-column: 1 / -1; margin: 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.ofc-title-edit-acts { display: flex; align-items: end; }
@media (max-width: 60rem) {
  .ofc-reg-title-edit { grid-template-columns: minmax(0, 1fr); }
}

/* THE CHAPTERS. The list first in the source, so a phone shows it above the text; on a wide screen
   it moves beside the text and stays in view while the text scrolls. Where the switch is, and the two
   columns, are the product's one width rule, components/SideBySide.tsx. */
.ofc-read { --sbs-columns: minmax(0, var(--measure-read)) minmax(12rem, 18rem); gap: calc(var(--pad-lg) * 2) 4rem; margin: calc(var(--pad-lg) * 2) 0 0; }
.ofc-toc { min-width: 0; }
.ofc-toc-list { list-style: none; margin: var(--pad) 0 0; padding: 0; }
.ofc-toc-go {
  display: grid; grid-template-columns: 2.25em minmax(0, 1fr); column-gap: var(--pad); width: 100%;
  min-height: 44px; align-content: center; padding: 4px 0; border: 0; background: none; text-align: left; cursor: pointer;
  color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui);
}
.ofc-toc-go:hover .ofc-toc-name { text-decoration: underline; }
.ofc-toc-go .num { color: var(--text-3); font-variant-numeric: tabular-nums; }
.ofc-toc-says { grid-column: 2; margin-top: 2px; color: var(--text-3); font-size: var(--fs-1); line-height: var(--lh-read); }
.ofc-toc-role { grid-column: 2; margin-top: 2px; color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-tight); }

/* THE DOCUMENT. One left edge for everything in it: no indent, no box, numbers inline. */
.ofc-doc { min-width: 0; max-width: var(--measure-read); }
.ofc-ch { padding: calc(var(--pad-lg) * 2) 0; border-top: var(--border-w) solid var(--border); }
.ofc-ch:first-child { border-top: 0; padding-top: 0; }
.ofc-ch-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px var(--pad-lg); }
.ofc-ch-name { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.ofc-ch-open { color: var(--accent); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.ofc-ch-conclusion { margin: var(--pad) 0 0; color: var(--text); font: var(--fs-3)/var(--lh-read) var(--font-ui); }
.ofc-rules { list-style: none; margin: 0; padding: 0; }
.ofc-rule { margin: var(--pad-lg) 0 0; min-width: 0; }
.ofc-rule-name { margin: 0; color: var(--text); font: 600 var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ofc-rule-text { margin: 2px 0 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ofc-doc .num { color: var(--text-3); font-weight: 400; font-variant-numeric: tabular-nums; }

.ofc-reg-name { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad); min-width: 0; }

/* THE TWO PARTS, General and This project. A part is named over a strong rule, so it reads apart from the sections
   inside it, which keep their own label style. */
.ofc-part { margin: calc(var(--pad-lg) * 3) 0 0; min-width: 0; }
.ofc-part-head { padding-top: var(--pad-lg); border-top: 2px solid var(--text); }
.ofc-part-name { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); }
.ofc-part .ofc-label { font-weight: var(--section-weight); }
.ofc-rev { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); font-variant-numeric: tabular-nums; }

/* THE PROJECT'S RULES, one under another at the reading width, split by a thin line. Each fact is its label and its
   words on one line; where the line is too narrow, the words go under the label. On and off are words, not a colour. */
.ofc-proj-record { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--pad-lg); margin: var(--pad-lg) 0 0; }
.ofc-proj-rules { list-style: none; margin: var(--pad) 0 0; padding: 0; max-width: var(--measure-read); }
.ofc-proj-rule { min-width: 0; padding: var(--pad-lg) 0; border-bottom: var(--border-w) solid var(--border); }
.ofc-proj-rule-name { margin: 0; color: var(--text); font: 600 var(--fs-3)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ofc-proj-facts { margin: var(--pad) 0 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.ofc-fact { display: flex; flex-wrap: wrap; gap: 0 var(--pad-lg); min-width: 0; }
.ofc-fact dt { flex: 0 0 9rem; color: var(--text-3); }
.ofc-fact dd { flex: 1 1 16rem; min-width: 0; margin: 0; color: var(--text-2); overflow-wrap: anywhere; }

/* THE DESIGN REMINDERS OF THE DAYS, at the reading width. The five counts sit side by side and wrap; each reminder is a
   row split by a thin line. Every word a person or an agent wrote may break anywhere, so nothing scrolls sideways. */
.ofc-rems { max-width: var(--measure-read); }
.ofc-rems-counts { display: flex; flex-wrap: wrap; gap: var(--pad) calc(var(--pad-lg) * 2); margin: var(--pad-lg) 0 0; }
.ofc-rems-count { min-width: 0; }
.ofc-rems-count dt { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.ofc-rems-count dd { margin: 2px 0 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); font-variant-numeric: tabular-nums; }
.ofc-rems-list { list-style: none; margin: var(--pad) 0 0; padding: 0; }
.ofc-rems-none { margin: var(--pad) 0 0; }
.ofc-rem { min-width: 0; padding: var(--pad-lg) 0; border-bottom: var(--border-w) solid var(--border); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.ofc-rem-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad-lg); margin: 0; color: var(--text-2); }
.ofc-rem-named { margin: var(--pad) 0 0; padding-left: 1.25em; color: var(--text); }
.ofc-rem-lack { min-width: 0; overflow-wrap: anywhere; }
.ofc-rem-lack > * + * { margin-left: var(--pad); }
.ofc-rem-words { margin: var(--pad) 0 0; color: var(--text-2); overflow-wrap: anywhere; white-space: pre-wrap; }
.ofc-rem-said { margin: 2px 0 0; color: var(--text); overflow-wrap: anywhere; white-space: pre-wrap; }
.ofc-rem-judge { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); margin: var(--pad) 0 0; }

/* BESIDE THE TEXT, THE LIST STAYS IN VIEW AND SAYS LESS. The switch is the product's one width rule,
   components/SideBySide.tsx, which also puts the list in the second column. Until wave 13k's round
   18 this page asked its own width at 56rem instead. */
@media ${WIDE_SCREEN} {
  .ofc-toc { position: sticky; top: var(--pad-lg); align-self: start; }
  .ofc-toc-says { display: none; }
  .ofc-toc-go { min-height: 0; padding: 6px 0; }
}
`
