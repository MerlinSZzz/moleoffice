// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUESTIONS A REPORT ASKS THE PERSON, DRAWN AND ANSWERED IN PLACE, by two decisions on the
 * design CI_hZmfzVGJk.
 *
 * Four blocks are drawn here: a choice, a fill-in box, a button and a box of questions. One more
 * thing is drawn here too, the submit: the whole report's, the one send press for its answers.
 *
 * ONE SEND PRESS FOR THE WHOLE REPORT (wave 13u round 19), as a decision says.
 * A box drew a submit of its own until then, and a report of nine boxes asked the person for nine presses,
 * which is too many for a person or an agent. Now the whole report's submit is the only one, and it sends every unsent answer
 * at once, so the agent that wrote the report receives one message. A box frames its questions and
 * sends nothing on its own. The answer door still takes a box's scope; no page presses it.
 *
 * THE WHOLE REPORT'S SUBMIT IS DRAWN WHERE THE PERSON ANSWERS: straight after the last choice or
 * fill-in box, inside the report, or straight after the box that holds it. It was drawn at the
 * report's foot until wave 13k's round 30, under the second reading-length control, and the
 * review of the pictures found it read as a footer and sat far from the questions it sends. A button
 * is not a question this submit sends, so it does not decide where the submit goes.
 *
 * A SENT ANSWER IS DRAWN AS WORDS, NOT AS AN INPUT (round 30): the options with the chosen ones
 * marked, the person's own words quoted, who sent it, when and the decision. An input that is
 * already sent looked editable when nothing would change unless it was sent again. The person may
 * still change it: "Change this answer" opens the inputs with the sent answer in them, and a changed
 * answer is sent again by the same submits. While a kept answer differs from the sent one, the
 * inputs are drawn, with the sent answer read-only under them.
 *
 * A LINE AT THE TOP COUNTS THE QUESTIONS, not the fields: how many choices and fill-in boxes nobody
 * has answered, how many hold an answer not sent yet, or that every one is answered and sent. A
 * button is not counted, because not pressing it is an answer too, and counting it would keep "not
 * answered" on a report the person has finished.
 *
 * WHAT A PRESS COVERS AND WHAT IS UNSENT IS NOT WORKED OUT HERE. src/shared/answers.ts is the one
 * reading of a press's scope and of what is unsent, for the server's answer door and for this page,
 * so the button drawn here and the door it presses cannot disagree.
 *
 * WHAT IS KEPT AS THE PERSON ANSWERS. Every change is kept on the server as a draft: a choice on
 * each click, and words when the person leaves the box or stops typing for a moment. So the person
 * can answer part of a report and come back later. A submit sends only what is unsent.
 *
 * ONLY THE PERSON ANSWERS. When this page acts as anybody else, every input and every submit is
 * drawn disabled and the submit's line says why. That is the page being honest about what a press
 * would do; the answer door is the real gate, and its refusal is drawn with ErrorNote.
 *
 * THE BLOCK'S OWN WORDS ARE DRAWN BY src/web/components/SummaryBlocks.tsx and handed in, so a
 * question's words carry the same provenance and region marks as every other block's, and a box's
 * questions are drawn by the same block list a section uses. This file draws the controls.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import {
  answerStateOf,
  theScopeOf,
  unsentAnswer,
  type AnAnswer,
  type AnswersOfABlock,
  type AnswerSent,
  type AnsweredBlock,
  type ReportAnswers,
  type AnswerState,
  type ThePress,
} from '@shared/answers.ts'
import { gapBetween } from '@shared/spacing.ts'
import type { BoxBlock, ButtonBlock, ChoiceBlock, FillInBlock, SummaryBlock } from '@shared/types.ts'
import { api, errorMessage, faultOf, getActor } from '../api.ts'
import { Btn, ErrorNote, Stamp, TextArea } from './ui.tsx'
import { TieredPress } from './TieredPress.tsx'
import { RouteLink, recordPath } from './router.tsx'
import { ParticipantName } from '../pages/NotebookPage.tsx'

/** How long the person may stop typing before their words are kept. */
const PAUSE_BEFORE_KEEPING_MS = 900

/** What a block's element carries: where it is stored, which lane it stands in, and its measure. */
type Mark = Record<string, unknown>

/** The two things a question's answer holds that the page writes. A button's press is sent, not kept. */
type KeptAnswer = Pick<AnAnswer, 'chosen' | 'words'>

/**
 * WHAT THE QUESTIONS OF ONE REPORT NEED, given once by the report page.
 *
 * NULL WHERE THE BLOCKS ARE NOT A REPORT'S OWN PAGE: a module panel, a settings preview, a drawing
 * of blocks outside any record. The questions are still drawn there, with their controls off and a
 * line saying answers are kept only on the report's own page, because there is nowhere to keep them.
 */
interface QuestionsOfAReport {
  recordId: string
  blocks: readonly SummaryBlock[]
  answers: ReportAnswers
  /** The page acts as the person. See the header. */
  mayAnswer: boolean
  /** Keep one answer as a draft. Throws what the door refused. */
  keep: (blockId: string, answer: KeptAnswer) => Promise<void>
  /** Keep every change still waiting for a pause, then send one press. Throws what the door refused. */
  send: (press: ThePress) => Promise<void>
  /** The questions changed on the page and not kept yet. A submit counts them as unsent. */
  changing: ReadonlySet<string>
  setChanging: (blockId: string, changing: boolean) => void
  /** Where each question leaves the way to keep its waiting change now, so a submit can ask first. */
  waiting: Map<string, () => Promise<void>>
  /** The block the whole report's submit is drawn after, or null when it is drawn nowhere. See the header. */
  reportSubmitAfter: string | null
}

const QuestionsHere = createContext<QuestionsOfAReport | null>(null)

/**
 * THE REPORT PAGE'S HALF: it holds the answers, keeps and sends them, and draws the line at the top
 * that counts them. `stored` is the record's `answers` field as it was read; after a write
 * the door's reply replaces it here, and after a send the page is read again through `onSent`.
 */
export function ReportQuestions({
  recordId,
  blocks,
  stored,
  onSent,
  children,
}: {
  recordId: string
  blocks: readonly SummaryBlock[]
  stored: ReportAnswers
  onSent: () => void
  children: ReactNode
}) {
  const [answers, setAnswers] = useState<ReportAnswers>(stored)
  // THE RECORD READ AGAIN WINS. Compared by what it says, because a fresh read is a fresh object
  // even when nothing in it changed.
  const storedSays = JSON.stringify(stored)
  useEffect(() => {
    setAnswers(JSON.parse(storedSays) as ReportAnswers)
  }, [storedSays])
  const [changing, setChangingSet] = useState<ReadonlySet<string>>(new Set())
  const waiting = useRef(new Map<string, () => Promise<void>>()).current
  const setChanging = useCallback((blockId: string, on: boolean) => {
    setChangingSet((now) => {
      if (now.has(blockId) === on) return now
      const next = new Set(now)
      if (on) next.add(blockId)
      else next.delete(blockId)
      return next
    })
  }, [])
  const keep = useCallback(
    async (blockId: string, answer: KeptAnswer) => {
      const said = await api.keepAnAnswer(recordId, blockId, answer)
      setAnswers(said.answers)
    },
    [recordId],
  )
  const send = useCallback(
    async (press: ThePress) => {
      // WORDS STILL WAITING FOR A PAUSE ARE KEPT FIRST, so a press made straight after typing sends
      // what was typed rather than what was kept a moment before.
      await Promise.all([...waiting.values()].map((keepNow) => keepNow()))
      const said = await api.sendAnswers(recordId, press)
      setAnswers(said.answers)
      onSent()
    },
    [recordId, onSent, waiting],
  )
  const mayAnswer = getActor().type === 'human'
  // WHERE THE WHOLE REPORT'S SUBMIT GOES: after the last of the questions it sends, or after the box
  // that holds it. The one reading says which questions it sends. See the header.
  const reportSubmitAfter = useMemo(() => {
    const sends = theScopeOf(blocks, { scope: 'report' })
    if (typeof sends === 'string') return null
    const last = sends.at(-1)
    return last === undefined ? null : (last.box?.id ?? last.block.id)
  }, [blocks])
  const here = useMemo<QuestionsOfAReport>(
    () => ({ recordId, blocks, answers, mayAnswer, keep, send, changing, setChanging, waiting, reportSubmitAfter }),
    [recordId, blocks, answers, mayAnswer, keep, send, changing, setChanging, waiting, reportSubmitAfter],
  )
  return (
    <QuestionsHere.Provider value={here}>
      <style href="mole-office-report-questions" precedence="default">{REPORT_QUESTIONS_CSS}</style>
      <CountLine />
      {children}
    </QuestionsHere.Provider>
  )
}

/**
 * THE LINE AT THE TOP OF A REPORT THAT ASKS: how many of its questions are not answered, how many
 * hold an answer not sent yet, or that every one is answered and sent. See the header.
 *
 * It counts the questions the whole report's submit sends, read from the one reading, and a question
 * whose words are being typed and not kept yet counts as not sent, as the submits count it. Nothing
 * is drawn for a report with no choice and no fill-in box.
 */
function CountLine() {
  const here = useContext(QuestionsHere)
  if (here === null) return null
  const questions = theScopeOf(here.blocks, { scope: 'report' })
  if (typeof questions === 'string' || questions.length === 0) return null
  const states: AnswerState[] = questions.map((one) =>
    here.changing.has(one.block.id) ? 'notSent' : answerStateOf(here.answers[one.block.id]),
  )
  const total = states.length
  const unanswered = states.filter((one) => one === 'unanswered').length
  const notSent = states.filter((one) => one === 'notSent').length
  const says: string[] = []
  if (unanswered === total) says.push(t('rq.count.noneAnswered', { n: total }))
  else if (unanswered > 0) says.push(t('rq.count.notAnswered', { n: unanswered, total }))
  if (notSent > 0) says.push(t('rq.count.notSent', { n: notSent }))
  if (says.length === 0) says.push(t('rq.count.allSent', { n: total }))
  return (
    <p className="rq-count" data-unanswered={unanswered} data-not-sent={notSent}>
      {says.reduce((all, one) => all + gapBetween(all, one) + one)}
    </p>
  )
}

/** THE WHOLE REPORT'S SUBMIT, drawn after the block the report names. See the header. */
function ReportSubmitAfter({ blockId }: { blockId: string }) {
  const here = useContext(QuestionsHere)
  if (here === null || here.reportSubmitAfter !== blockId) return null
  return (
    <div className="rq-report-submit">
      <SubmitPress press={{ scope: 'report' }} label={t('rq.submit.report')} />
    </div>
  )
}

/**
 * WHETHER A QUESTION DRAWS ITS INPUTS, or its sent answer as words. Its inputs are drawn while
 * nothing has been sent, while a kept answer or one being typed differs from the sent one, and after
 * the person pressed "Change this answer" on the answer now sent. `openFor` is the message that
 * carried the answer the person opened, so a new send closes the inputs again.
 */
function drawsItsInputs(here: QuestionsOfAReport | null, blockId: string, kept: AnswersOfABlock | undefined, openFor: string | null): boolean {
  const sent = kept?.sent
  if (sent === undefined) return true
  if (openFor === sent.message) return true
  if (here?.changing.has(blockId) === true) return true
  return unsentAnswer(kept) !== null
}

/** THE PRESS THAT OPENS A SENT ANSWER'S INPUTS AGAIN. Off, with the reason, where the page may not answer. */
function ChangePress({ off, onPress }: { off: string | null; onPress: () => void }) {
  return (
    <div className="rq-change">
      <Btn variant="secondary" disabled={off !== null} {...(off === null ? {} : { reason: off })} onClick={onPress}>
        {t('rq.change')}
      </Btn>
    </div>
  )
}

/**
 * KEEPING ONE QUESTION'S ANSWER: at once, or after a pause, and the refusal if the door says no.
 *
 * A change waiting for a pause is left with the report, so a submit pressed before the pause ends
 * keeps it first.
 */
function useKeeper(blockId: string) {
  const here = useContext(QuestionsHere)
  const [fault, setFault] = useState<unknown>(null)
  const timer = useRef<number | null>(null)
  const pending = useRef<KeptAnswer | null>(null)
  /** How many of this question's keeps have not been answered yet. */
  const inFlight = useRef(0)
  const stopTheTimer = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  const now = async (answer: KeptAnswer): Promise<void> => {
    stopTheTimer()
    pending.current = null
    if (here === null) return
    inFlight.current += 1
    try {
      await here.keep(blockId, answer)
      setFault(null)
    } catch (err) {
      setFault(err)
    } finally {
      inFlight.current -= 1
      if (pending.current === null) here.setChanging(blockId, false)
    }
  }
  const keepWaiting = useRef<() => Promise<void>>(async () => {})
  keepWaiting.current = async () => {
    const answer = pending.current
    if (answer !== null) await now(answer)
  }
  const later = (answer: KeptAnswer): void => {
    if (here === null) return
    pending.current = answer
    here.setChanging(blockId, true)
    stopTheTimer()
    timer.current = window.setTimeout(() => void keepWaiting.current(), PAUSE_BEFORE_KEEPING_MS)
  }
  const waiting = here?.waiting
  useEffect(() => {
    if (waiting === undefined) return
    waiting.set(blockId, () => keepWaiting.current())
    return () => {
      waiting.delete(blockId)
      stopTheTimer()
    }
  }, [blockId, waiting])
  /** True while the question has no change of its own waiting for a pause or waiting for the door's answer. */
  const quiet = (): boolean => pending.current === null && inFlight.current === 0
  return { now, later, leave: () => keepWaiting.current(), fault, quiet }
}

/**
 * THE BOXES TAKE THE KEPT ANSWER WHENEVER THE PAGE IS HANDED A NEWER ONE, unless the question has a
 * change of its own still waiting or being kept (problem AJGgg93KaQ5p). A record page opened again draws
 * the page cache's copy first and the fresh read after it (src/web/lib/pagecache.ts), and a keep's reply
 * carries every question's answer, another tab's too. A question that took its boxes from the first
 * answers it was handed drew the cached ones for good, and a press then kept the stale words.
 *
 * A change still waiting wins over what it is handed, and is kept over it when its pause ends or its box
 * is left: the last write wins, and the box then shows what was kept.
 */
function useTheKeptAnswer(kept: AnswersOfABlock | undefined, quiet: () => boolean, take: (answer: AnAnswer) => void): void {
  const says = JSON.stringify(startingAnswer(kept))
  const taken = useRef(says)
  const takeRef = useRef(take)
  takeRef.current = take
  useEffect(() => {
    if (says === taken.current || !quiet()) return
    taken.current = says
    takeRef.current(JSON.parse(says) as AnAnswer)
  })
}

/** What a question's controls start from: the answer kept and not sent, or else the answer sent. */
function startingAnswer(kept: AnswersOfABlock | undefined): AnAnswer {
  return kept?.draft?.answer ?? kept?.sent?.answer ?? {}
}

/** Why a question's controls are off, or null when the person may answer here. */
function whyOff(here: QuestionsOfAReport | null): string | null {
  if (here === null) return t('rq.notOnThisPage')
  return here.mayAnswer ? null : t('rq.onlyThePerson')
}

/** A refusal from the door, drawn as the product draws every refusal. */
function Refusal({ fault }: { fault: unknown }) {
  if (fault === null) return null
  return <ErrorNote message={errorMessage(fault)} fault={faultOf(fault)} />
}

/** A CHOICE: the question, two to four options with the recommended one marked, and a box for the person's own words. */
export function ChoiceQuestion({
  block,
  mark,
  question,
  labels,
}: {
  block: ChoiceBlock
  mark: Mark
  /** The question's words, drawn by the block renderer. */
  question: ReactNode
  /** Each option's words, drawn by the block renderer, in the order of `block.options`. */
  labels: readonly ReactNode[]
}) {
  const here = useContext(QuestionsHere)
  const kept = here?.answers[block.id]
  const start = startingAnswer(kept)
  const [chosen, setChosen] = useState<string[]>(start.chosen ?? [])
  const [words, setWords] = useState(start.words ?? '')
  const keeper = useKeeper(block.id)
  useTheKeptAnswer(kept, keeper.quiet, (answer) => {
    setChosen(answer.chosen ?? [])
    setWords(answer.words ?? '')
  })
  const off = whyOff(here)
  const group = useId()
  const many = block.many === true
  const [openFor, setOpenFor] = useState<string | null>(null)
  const sent = kept?.sent
  const answering = drawsItsInputs(here, block.id, kept, openFor)
  const choose = (id: string): void => {
    const next = many ? (chosen.includes(id) ? chosen.filter((one) => one !== id) : [...chosen, id]) : [id]
    setChosen(next)
    void keeper.now({ chosen: next, words })
  }
  if (!answering && sent !== undefined) {
    const sentChosen = sent.answer.chosen ?? []
    // AN OPTION SENT AND NO LONGER IN THE QUESTION is still said, in the words WhatWasAnswered uses for it.
    const gone = sentChosen.filter((id) => !block.options.some((option) => option.id === id))
    const own = sent.answer.words ?? ''
    // "YOUR CHOICE" ONLY WHERE THE PERSON CHOSE IT. A secretary may choose and send an answer under the grant, and an
    // older answer recorded nobody as its chooser, so either is tagged in words that name nobody. The line under it says
    // who chose it, or that nobody recorded it.
    const theirs = sent.chosenBy?.kind === 'person'
    const chosenTag = t(theirs ? 'rq.sent.chosen' : 'rq.sent.chosenAsSent')
    return (
      <>
        <div className="sb-block rq rq-choice" data-state="sent" {...mark}>
          <div className="rq-q">{question}</div>
          <ul className="rq-sent-options">
            {block.options.map((option, at) => {
              const yes = sentChosen.includes(option.id)
              return (
                <li key={option.id} data-chosen={yes ? 'yes' : undefined}>
                  <span className="rq-sent-tick" aria-hidden="true">{yes ? '✓' : ''}</span>
                  <span className="rq-option-words">{labels[at]}</span>
                  {yes || option.recommended === true ? (
                    <span className="rq-sent-tags">
                      {yes ? <span className="rq-chosen">{chosenTag}</span> : null}
                      {option.recommended === true ? <span className="rq-recommended">{t('rq.choice.recommended')}</span> : null}
                    </span>
                  ) : null}
                </li>
              )
            })}
            {gone.map((id) => (
              <li key={`gone-${id}`} data-chosen="yes">
                <span className="rq-sent-tick" aria-hidden="true">✓</span>
                <span className="rq-option-words">{t('rq.missingOption', { id })}</span>
                <span className="rq-sent-tags"><span className="rq-chosen">{chosenTag}</span></span>
              </li>
            ))}
          </ul>
          {own.trim() === '' ? null : (
            <p className="rq-sent-own">
              <span className="rq-own-label">{t(theirs ? 'rq.sent.ownWords' : 'rq.sent.wordsSent')}</span>
              <q className="rq-sent-words">{own}</q>
            </p>
          )}
          <SentLine block={block} sent={sent} saysWhat={false} />
          <ChangePress
            off={off}
            onPress={() => {
              setChosen(sentChosen)
              setWords(own)
              setOpenFor(sent.message)
            }}
          />
        </div>
        <ReportSubmitAfter blockId={block.id} />
      </>
    )
  }
  return (
    <>
    <div className="sb-block rq rq-choice" data-state="answering" {...mark}>
      <div id={`${group}-q`} className="rq-q">{question}</div>
      {many ? <p className="rq-hint">{t('rq.choice.many')}</p> : null}
      <div className="rq-options" role={many ? 'group' : 'radiogroup'} aria-labelledby={`${group}-q`}>
        {block.options.map((option, at) => (
          <label key={option.id} className="rq-option" data-chosen={chosen.includes(option.id) ? 'yes' : undefined}>
            <input
              type={many ? 'checkbox' : 'radio'}
              name={group}
              value={option.id}
              checked={chosen.includes(option.id)}
              disabled={off !== null}
              onChange={() => choose(option.id)}
            />
            <span className="rq-option-words">{labels[at]}</span>
            {option.recommended === true ? <span className="rq-recommended">{t('rq.choice.recommended')}</span> : null}
          </label>
        ))}
      </div>
      <label className="rq-own" onBlur={() => void keeper.leave()}>
        <span className="rq-own-label">{t('rq.choice.ownWords')}</span>
        {/* SEVERAL LINES: the person's own words take Enter as a new line, and the box
            grows with them. Nothing here sends on Enter; the submits send. */}
        <TextArea
          value={words}
          rows={2}
          disabled={off !== null}
          onChange={(next) => {
            setWords(next)
            keeper.later({ chosen, words: next })
          }}
        />
      </label>
      <WhatIsKept block={block} kept={kept} />
      <Refusal fault={keeper.fault} />
    </div>
    <ReportSubmitAfter blockId={block.id} />
    </>
  )
}

/** A FILL-IN BOX: the sentence saying what to write, and a box for the person's words that takes line breaks. */
export function FillInQuestion({ block, mark, asks }: { block: FillInBlock; mark: Mark; asks: ReactNode }) {
  const here = useContext(QuestionsHere)
  const kept = here?.answers[block.id]
  const [words, setWords] = useState(startingAnswer(kept).words ?? '')
  const keeper = useKeeper(block.id)
  useTheKeptAnswer(kept, keeper.quiet, (answer) => setWords(answer.words ?? ''))
  const off = whyOff(here)
  const box = useId()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const sent = kept?.sent
  const answering = drawsItsInputs(here, block.id, kept, openFor)
  const change = (next: string): void => {
    setWords(next)
    keeper.later({ words: next })
  }
  if (!answering && sent !== undefined) {
    return (
      <>
        <div className="sb-block rq rq-fillin" data-state="sent" {...mark}>
          <div className="rq-asks">{asks}</div>
          <blockquote className="rq-sent-words">{sent.answer.words ?? ''}</blockquote>
          <SentLine block={block} sent={sent} saysWhat={false} />
          <ChangePress
            off={off}
            onPress={() => {
              setWords(sent.answer.words ?? '')
              setOpenFor(sent.message)
            }}
          />
        </div>
        <ReportSubmitAfter blockId={block.id} />
      </>
    )
  }
  return (
    <>
    <div className="sb-block rq rq-fillin" data-state="answering" {...mark}>
      <label htmlFor={box} className="rq-asks">{asks}</label>
      {/* HOW WIDE THE BOX IS: what its writer chose, or narrow for one line and wide for
          several. The stylesheet below turns "narrow" into the 36rem the choices keep. */}
      <div className="rq-words" data-box-width={block.boxWidth ?? (block.lines === 'many' ? 'wide' : 'narrow')} onBlur={() => void keeper.leave()}>
        {/* EVERY FILL-IN BOX TAKES LINE BREAKS. Its lines only say how tall it starts. */}
        <TextArea id={box} value={words} onChange={change} rows={block.lines === 'many' ? 4 : 2} disabled={off !== null} />
      </div>
      <WhatIsKept block={block} kept={kept} />
      <Refusal fault={keeper.fault} />
    </div>
    <ReportSubmitAfter blockId={block.id} />
    </>
  )
}

/** A BUTTON: one press, asked once more, sent at once and on its own. */
export function ButtonQuestion({ block, mark }: { block: ButtonBlock; mark: Mark }) {
  const here = useContext(QuestionsHere)
  const kept = here?.answers[block.id]
  const [fault, setFault] = useState<unknown>(null)
  const pressed = kept?.sent?.answer.pressed === true
  const off = whyOff(here) ?? (pressed ? t('rq.button.sentAlready') : null)
  return (
    <div className="sb-block rq rq-button" {...mark}>
      {/* THE PRESS IS THIS BLOCK'S WRITING: its words are the button's label, and a measure stated
          on the block holds this line to it as it holds a paragraph. */}
      <div className="rq-press-line" data-writing="">
        <TieredPress
          tier="confirm"
          press={block.label}
          pending={t('rq.button.sending')}
          question={block.confirm ?? t('rq.button.sure')}
          quote={block.label}
          warning={t('rq.button.warning')}
          cancel={t('rq.button.cancel')}
          confirm={t('rq.button.yes')}
          disabled={off !== null}
          {...(off === null ? {} : { disabledReason: off })}
          onPress={async () => {
            if (here === null) return
            // THE REFUSAL IS DRAWN UNDER THE BUTTON, with its code, rather than as the dialog's
            // plain message, so a coded refusal reads in the page's language.
            try {
              await here.send({ scope: 'button', id: block.id })
              setFault(null)
            } catch (err) {
              setFault(err)
            }
          }}
        />
      </div>
      <WhatIsKept block={block} kept={kept} />
      <Refusal fault={fault} />
    </div>
  )
}

/**
 * A BOX OF QUESTIONS: a frame around its questions, with no submit of its own.
 * When it holds the report's last question, the whole report's submit is drawn straight after it.
 */
export function QuestionBox({
  block,
  mark,
  title,
  children,
}: {
  block: BoxBlock
  mark: Mark
  /** The box's title, drawn by the block renderer, or null. */
  title: ReactNode
  /** The box's blocks, drawn by the same block list a section uses. */
  children: ReactNode
}) {
  return (
    <>
      <section className="sb-block sb-section rq rq-box" {...mark}>
        {title}
        <div className="rq-box-body">{children}</div>
      </section>
      <ReportSubmitAfter blockId={block.id} />
    </>
  )
}

/**
 * THE ONE SUBMIT: the whole report's. It sends only what is unsent in its scope.
 *
 * With nothing unsent it is drawn off, and its line says which of two things is true: everything
 * answered has been sent, or nothing has been answered yet. Those are different facts, and a line
 * saying everything was sent over a box nobody answered would be false.
 */
function SubmitPress({ press, label }: { press: ThePress; label: string }) {
  const here = useContext(QuestionsHere)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<unknown>(null)
  if (here === null) {
    const why = t('rq.notOnThisPage')
    return (
      <div className="rq-submit">
        <Btn variant="primary" disabled reason={why}>{label}</Btn>
        <p className="rq-submit-state">{why}</p>
      </div>
    )
  }
  const scope = theScopeOf(here.blocks, press)
  // A PRESS NAMING NOTHING IT COVERS IS A FAULT IN THE REPORT, said in the words of the one reading.
  if (typeof scope === 'string') return <ErrorNote message={scope} />
  const unsent = scope.filter(
    (one) => here.changing.has(one.block.id) || unsentAnswer(here.answers[one.block.id]) !== null,
  ).length
  const anySent = scope.some((one) => here.answers[one.block.id]?.sent !== undefined)
  const line = !here.mayAnswer
    ? t('rq.onlyThePerson')
    : unsent > 0
      ? t('rq.submit.unsent', { n: unsent })
      : anySent
        ? t('rq.submit.allSent')
        : t('rq.submit.nothingAnswered')
  const off = !here.mayAnswer || unsent === 0
  // NOTHING LEFT TO SEND, AND SOMETHING SENT: no greyed press, only the line saying everything is sent
  // (round 33, from the review of round 32). A press that can never be pressed reads as a fault.
  if (here.mayAnswer && unsent === 0 && anySent) {
    return (
      <div className="rq-submit" data-unsent={0} data-all-sent="yes">
        <p className="rq-submit-state" role="status">{line}</p>
      </div>
    )
  }
  return (
    <div className="rq-submit" data-unsent={unsent}>
      <Btn
        variant="primary"
        disabled={off || busy}
        reason={busy ? t('rq.submit.sending') : line}
        pending={busy}
        onClick={() => {
          setBusy(true)
          setFault(null)
          void here
            .send(press)
            .catch((err: unknown) => setFault(err))
            .finally(() => setBusy(false))
        }}
      >
        {label}
      </Btn>
      <p className="rq-submit-state" role="status">{line}</p>
      <Refusal fault={fault} />
    </div>
  )
}

/**
 * WHAT IS KEPT FOR ONE QUESTION, UNDER IT: the answer sent, with who sent it, when, what it was and
 * the decision a choice was recorded as; and an answer changed since, marked as not sent yet.
 */
function WhatIsKept({ block, kept }: { block: AnsweredBlock; kept: AnswersOfABlock | undefined }) {
  const sent = kept?.sent
  const draft = kept?.draft
  const unsent = unsentAnswer(kept)
  return (
    <>
      {sent === undefined ? null : <SentLine block={block} sent={sent} saysWhat />}
      {unsent === null || draft === undefined ? null : (
        <div className="rq-said" data-answer="kept">
          <span className="rq-tag rq-tag-kept">{t('rq.kept')}</span>
          <Stamp at={draft.at} />
          <WhatWasAnswered block={block} answer={unsent} />
        </div>
      )}
    </>
  )
}

/**
 * THE LINE SAYING AN ANSWER WAS SENT: who sent it, when, who chose it, and the decision a choice was recorded as.
 * `saysWhat` adds what was sent, for where the answer is not drawn above the line already. Who chose it is a part of
 * its own after the time, so a sentence about the chooser never runs on from the sender's name. A send under the
 * person's grant says so in words, and the grant's id is never drawn, because no page opens one grant.
 */
function SentLine({ block, sent, saysWhat }: { block: AnsweredBlock; sent: AnswerSent; saysWhat: boolean }) {
  return (
    <div className="rq-said" data-answer="sent">
      <span className="rq-tag">{t('rq.sent')}</span>
      <span className="rq-who">
        <ParticipantName kind={sent.underTheGrant === undefined ? 'person' : 'agent'} id={sent.by} />
        {sent.underTheGrant === undefined ? null : <span> {t('rq.sent.underTheGrant')}</span>}
      </span>
      <Stamp at={sent.at} />
      {sent.chosenBy === undefined ? (
        <span className="rq-chooser">{t('rq.sent.chooserNotRecorded')}</span>
      ) : sent.chosenBy.kind === (sent.underTheGrant === undefined ? 'person' : 'agent') && sent.chosenBy.id === sent.by ? null : (
        <span className="rq-chooser">
          {t('rq.sent.chosenBy')} <ParticipantName kind={sent.chosenBy.kind} id={sent.chosenBy.id} />
        </span>
      )}
      {saysWhat ? <WhatWasAnswered block={block} answer={sent.answer} /> : null}
      {sent.decision === undefined ? null : (
        <RouteLink className="rq-decision" to={recordPath(sent.decision, 'decision')}>
          {t('rq.decision')}
        </RouteLink>
      )}
    </div>
  )
}

/** One answer in words: the options chosen and the person's own words, the words written, or the press. */
function WhatWasAnswered({ block, answer }: { block: AnsweredBlock; answer: AnAnswer }) {
  if (block.type === 'button') return <span className="rq-what">{t('rq.button.pressed')}</span>
  const chosen =
    block.type === 'choice'
      ? (answer.chosen ?? []).map((id) => block.options.find((option) => option.id === id)?.label ?? t('rq.missingOption', { id }))
      : []
  const words = answer.words ?? ''
  return (
    <>
      {chosen.length === 0 ? null : <span className="rq-what">{chosen.join(t('rq.listGap'))}</span>}
      {words.trim() === '' ? null : <q className="rq-what rq-what-words">{words}</q>}
    </>
  )
}

/*
 * THE STYLESHEET. Tokens only. No backtick may appear inside it, because it is a template literal
 * and one would close it: quote a class name in plain words in these comments.
 *
 * EVERY CONTROL IS A FINGER'S TARGET AT 390: an option is a whole row at least 44px tall, and the
 * shared button and box rules already reach 44px below 480px. A long option, a long label on a
 * submit and a long answer wrap rather than push the page sideways.
 */
const REPORT_QUESTIONS_CSS = `
.rq { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.rq-q p, .rq-q { margin: 0; }
.rq-q > *, .rq-asks { font-weight: var(--heading-weight); line-height: var(--lh-read); overflow-wrap: anywhere; }
.rq-asks, .rq-asks-words { display: block; margin: 0; }
.rq-hint { margin: 0; font-size: var(--fs-1); color: var(--text-2); }
.rq { --rq-option-most: 36rem; }
/* A CHOICE'S OPTIONS ARE AS WIDE AS THEIR WORDS, NOT AS WIDE AS THE PAGE.
   Each option is fit-content up to 36rem and wraps inside it: 36rem is about 65 Latin letters or
   about 33 Chinese characters at the reading size, one comfortable line of reading, inside the
   reading measure the rest of a report keeps (40rem). A short option is a short button. The sent
   options below keep the same width. */
.rq-options { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); }
.rq-option {
  width: fit-content; max-width: min(100%, var(--rq-option-most)); box-sizing: border-box;
  display: grid; grid-template-columns: 1.15rem minmax(0, auto); align-items: center; column-gap: var(--pad); row-gap: 4px;
  min-height: 44px; padding: var(--pad) var(--pad-lg);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  background: var(--panel); cursor: pointer; overflow-wrap: anywhere;
}
.rq-option:hover { border-color: var(--control-hover-border); }
.rq-option[data-chosen="yes"] { background: var(--chosen-bg); border-color: var(--chosen-edge); color: var(--chosen-ink); }
.rq-option input { flex: none; width: 1.15rem; height: 1.15rem; margin: 0; accent-color: var(--accent); }
.rq-option input:disabled { cursor: not-allowed; }
.rq-option-words { min-width: 0; }
/* THE RECOMMENDED BADGE GOES UNDER THE WORDS, in the words' column, so it never narrows them: at 390 an
   English badge beside a long Chinese option squeezed its words into a third of the row (round 33). */
.rq-option .rq-recommended { grid-column: 2; justify-self: start; }
.rq-recommended {
  flex: none; padding: 1px var(--pad); border-radius: var(--radius-pill);
  background: var(--accent-soft); color: var(--text); font-size: var(--fs-1); font-weight: var(--button-weight);
}
.rq-own { display: flex; flex-direction: column; gap: 4px; max-width: min(100%, var(--rq-option-most)); }
.rq-own-label { font-size: var(--fs-1); color: var(--text-2); }
.rq-words { display: flex; flex-direction: column; min-width: 0; }
/* A NARROW ANSWER BOX IS AS NARROW AS THE CHOICES: a short answer in a 1,160 px box
   had the same stretched look the choices had. A wide one keeps the column. */
.rq-words[data-box-width="narrow"] { max-width: min(100%, var(--rq-option-most)); }
.rq-said {
  display: flex; flex-wrap: wrap; align-items: baseline; column-gap: var(--pad); row-gap: 2px;
  font-size: var(--fs-2); color: var(--text-2); overflow-wrap: anywhere;
}
.rq-tag { font-size: var(--fs-1); font-weight: var(--button-weight); color: var(--st-done); }
.rq-tag-kept { color: var(--st-doing); }
.rq-who { color: var(--text); }
.rq-what { color: var(--text); min-width: 0; }
.rq-what-words { white-space: pre-wrap; }
.rq-press-line { display: block; }
.rq .px-btn, .rq-report-submit .px-btn { white-space: normal; text-align: center; max-width: 100%; }
.rq-count {
  margin: 0 0 var(--pad-lg); padding: var(--pad) var(--pad-lg);
  border: var(--border-w) solid var(--border); border-radius: var(--radius);
  background: var(--panel-2); color: var(--text); font-size: var(--fs-2); line-height: var(--lh-read);
  overflow-wrap: anywhere;
}
.rq-sent-options { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.rq-sent-options li {
  width: fit-content; max-width: min(100%, var(--rq-option-most)); box-sizing: border-box;
  display: grid; grid-template-columns: 1.15rem minmax(0, auto); align-items: baseline; column-gap: var(--pad); row-gap: 2px;
  color: var(--text-3); overflow-wrap: anywhere;
}
.rq-sent-options li[data-chosen="yes"] { color: var(--text); font-weight: var(--heading-weight); }
.rq-sent-options .rq-option-words { min-width: 0; }
/* THE TAGS GO UNDER THE WORDS, in the words' column, so a long option is not squeezed beside them at 390. */
.rq-sent-tags { grid-column: 2; display: flex; flex-wrap: wrap; gap: var(--pad); }
.rq-sent-tick { flex: none; width: 1.15rem; text-align: center; color: var(--st-done); }
.rq-chosen { flex: none; font-size: var(--fs-1); font-weight: var(--button-weight); color: var(--st-done); }
.rq-sent-own { margin: 0; display: flex; flex-direction: column; gap: 2px; }
/* THE PERSON'S WORDS ARE SHOWN AS WRITTEN, with their line breaks. */
.rq-sent-words { color: var(--text); overflow-wrap: anywhere; white-space: pre-wrap; }
blockquote.rq-sent-words {
  margin: 0; padding: 2px 0 2px var(--pad-lg); border-left: 3px solid var(--border-strong);
  white-space: pre-wrap; line-height: var(--lh-read);
}
.rq-change { display: flex; }
.rq-box {
  padding: var(--pad-lg); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  background: var(--panel-2);
}
.rq-box-body {
  display: grid; grid-template-columns: minmax(0, 1fr); row-gap: var(--sb-gap);
  container-type: inline-size; container-name: blocks;
}
.rq-box-body > * { min-width: 0; }
.rq-report-submit { padding-top: var(--pad); border-top: var(--border-w) solid var(--border); }
.rq-submit { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); }
.rq-submit-state { margin: 0; font-size: var(--fs-2); color: var(--text-2); flex: 1 1 14rem; min-width: 0; }
`
