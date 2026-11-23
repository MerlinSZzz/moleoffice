// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY MESSAGE IN THIS PROJECT, IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The person left a comment, landed on a page that told them whether a message had been sent, and could
 * not find it again. So messages need a page of their own, to see and manage the message pool.
 *
 * The page they reached was Agent conversations, as the next round confirmed. That page
 * reads a different store: the threads a person opens from the composer, with the run that answered
 * each. This page reads the POOL — one row per thing said, whoever said it and wherever it was said:
 * the chat panel, a comment on a page, a line to a group, a line the product itself wrote. Criterion
 * M27, problem `UPb5lRtU-Z5X`.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE ALWAYS SAYS WHAT IT IS NOT SHOWING
 * ---------------------------------------------------------------------------------------
 *
 * Five things narrow the list, and the page draws one page of what is left.
 * The narrowings and the page are sent to `GET /api/messages`, which works them out over the whole
 * pool before it cuts the page, so a search finds a message wherever it is. Whenever a narrowing is
 * set, the page says how many messages it is hiding and offers one press to clear it. A filter
 * somebody has forgotten they set is a lie about the data, which is the rule
 * `src/web/pages/RecordsPage.tsx` already states and this page follows.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PAGE DRAWS, IN ORDER (wave 13j round 12, on report n9Mjk3c_sJRu block b-17)
 * ---------------------------------------------------------------------------------------
 *
 * The owner took wave 13k's proposal as recommended: "Waiting for your
 * answer" first, then lists by day. So the page is:
 *   1. The head every page has: the title, one line naming the other page, and the one press at the
 *      right, which marks every unread message the list keeps read.
 *   2. Waiting for your answer, in the ask colour: the messages whose writer said they ask the
 *      person something and that the person has not answered. The server works out which (the rule is
 *      `theQuestionsWaitingForTheAnswerOf` in src/shared/messages.ts). When there are none, the
 *      quiet line says so.
 *   3. Every message, one plain list per day (Today, Yesterday, then the date), with the filters as
 *      this part's one control. No box around a message and none around a list (rule R10). A row is
 *      who wrote it and the words, who it reached, and the time at the right; the whole row opens it
 *      in its conversation.
 *
 * MESSAGE COUNTS ARE FOR DEVELOPER MODE (answer 7). The unread sentence and the number
 * in the mark-all press are drawn only there. The press itself works the same in both modes.
 *
 * What this page says about one message is what that message's own delivery rows say, read through
 * `DELIVERY` in src/shared/messages.ts, the same reader the panel uses.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  CHAT_WORDS,
  DELIVERY,
  MESSAGES_PAGE,
  isDeliveryMark,
  participantKey,
  recordIsAComment,
  theAgentAStoredSenderNames,
  theWritersName,
  unregisteredName,
  unregisteredWriterOf,
  type KnownParticipant,
  type UnregisteredWriter,
} from '@shared/messages.ts'
import { isMoleOffice, type ParticipantKind } from '@shared/participants.ts'
import { recordNamedByTarget, type Context } from '@shared/targets.ts'
import { NoticeWakeRules } from '../components/NoticeWakeRules.tsx'
import { api, errorMessage, faultOf, type Fault, type PoolEntry, type ParticipantOnTheWire } from '../api.ts'
import { Absence, Btn, ErrorNote, Field, Loading, Select, TextInput, drawnDay } from '../components/ui.tsx'
import { AgentPicker, type AnAgentToPick } from '../components/agent/AgentPicker.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { declaredAttributes } from '../components/declares.ts'
import { useInspect } from '../lib/mode.ts'
import { drawnStamp, localStamp } from '@shared/time.ts'
import { Pager } from '../components/Pager.tsx'
import { count, t } from '@shared/i18n.ts'
import { theWordsOfAnOfficeLine } from '@shared/dead-letter-lines.ts'
import { useLanguage } from '../lib/language.ts'
import type { PoolStateChoice } from '../../server/api/messages.ts'
import { Avatar } from '../components/Avatar.tsx'
// THE PICTURES A MESSAGE CARRIES, criterion M64. The same component the conversation draws, so the
// three answers the person's setting offers are decided in one place for both.
import { MessagePictures } from '../components/MessagePictures.tsx'
import { openTheChatAt, openTheChatAtUnregistered } from '../components/Chat.tsx'
import { openTheChatAtGroup } from '../lib/open-chat.ts'
import { recordPath } from '../components/router.tsx'
import { titleOrSentence, useRecordTitles } from '../lib/titles.ts'
// WHERE A COMMENT OPENS, and what has to be put where the drawing will find it before going there.
// One map, in one file, for the review column, a comment's own page and this list alike.
import { pageHolding, rememberTheCardACommentWasOn } from '../components/agent/ReviewBar.tsx'

/** Every choice the state filter offers: one per delivery mark, plus the two that are not marks. */
type WhichState = '' | PoolStateChoice

/**
 * How many messages one page draws. Measured on a copy of the office's data,
 * 8,857 messages drawn at once made the page 2.5 million pixels tall and took twelve seconds to open.
 */
export const MESSAGES_PAGE_SIZE = 50
/** How many marks the mark-all-read press sends at once. */
const MARKS_AT_ONCE = 8

/**
 * How long the words box waits after the last keystroke before it asks the server, so typing a word
 * is one request rather than one per letter. The same wait the Everything page's search box keeps.
 */
const WORDS_WAIT_MS = 200

export function MessagesPage() {
  useLanguage()
  const [who] = useProjectAsync(() => api.participants(), [], { keep: 'messages.participants' })
  const [groups] = useProjectAsync(() => api.groups(), [], { keep: 'messages.groups' })
  /**
   * WHO IS READING THIS PAGE.
   *
   * A conversation has two sides and one of them is the reader, so which conversation a message
   * belongs to cannot be worked out without knowing who is asking. The contacts read is where the
   * product already answers that, and it answers it from the actor headers rather than from
   * anything this page could guess.
   */
  const [reader] = useProjectAsync(() => api.messageContacts(), [], { keep: 'messages.contacts' })
  /**
   * THE MESSAGES WAITING FOR THE READER'S ANSWER. Which they are is the server's answer, by the one
   * rule in @shared/messages.ts (`theQuestionsWaitingForTheAnswerOf`); the page works nothing out.
   */
  const [waitingOffset, setWaitingOffset] = useState(0)
  const [waiting] = useProjectAsync(
    () => api.messagePool('waiting-for-my-answer', false, { limit: MESSAGES_PAGE_SIZE, offset: waitingOffset }),
    [waitingOffset],
    { keep: `messages.waiting.${String(waitingOffset)}` },
  )
  /** Developer mode, where the message counts are said (answer 7). */
  const developer = useInspect()

  /** Who wrote it. Empty means everybody. */
  const [sender, setSender] = useState('')
  /** Who it reached. Empty means everybody. */
  const [contact, setContact] = useState('')
  /** Which group it went to. Empty means every group and the ones that went to nobody's group. */
  const [group, setGroup] = useState('')
  /** How far it got, or that it is a comment. Empty means every state. */
  const [state, setState] = useState<WhichState>('')
  /** Words in the body. Empty means every message. */
  const [words, setWords] = useState('')
  /** The words the server was last asked about: `words`, once typing has stopped for a moment. */
  const [askedWords, setAskedWords] = useState('')
  /** How many messages come before the page on screen. Every change to a narrowing goes back to 0. */
  const [offset, setOffset] = useState(0)
  /** The words last sent, so a pause in typing that changed nothing does not send the reader back to page one. */
  const lastAsked = useRef('')
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = words.trim()
      if (next === lastAsked.current) return
      lastAsked.current = next
      setAskedWords(next)
      setOffset(0)
    }, WORDS_WAIT_MS)
    return () => clearTimeout(timer)
  }, [words])
  /** A narrowing changed, so the page starts again at the first message. */
  const narrowTo = <T,>(set: (next: T) => void) => (next: T): void => {
    set(next)
    setOffset(0)
  }
  /** The top of the list, which a press below it brings back into view. */
  const top = useRef<HTMLDivElement>(null)

  /**
   * ONE PAGE OF THE POOL, narrowed by the server over every message before it cut the page. The
   * answer says how many messages the pool holds (`total`) and how many the narrowings kept
   * (`matched`), so the lines below count the whole pool and not only this page. It carries the
   * offset it was asked for: the rows on screen stay until the next page arrives, so the line saying
   * which messages are shown is worked out from the answer on screen.
   */
  const [pool, readThePoolAgain] = useProjectAsync(
    () =>
      api
        .messagesPage({
          ...(sender === '' ? {} : { sender }),
          ...(contact === '' ? {} : { contact }),
          ...(group === '' ? {} : { group }),
          ...(state === '' ? {} : { state }),
          ...(askedWords === '' ? {} : { words: askedWords }),
          limit: MESSAGES_PAGE_SIZE,
          offset,
        })
        .then((reply) => ({ ...reply, offset })),
    [sender, contact, group, state, askedWords, offset],
    { keep: `messages.pool:${JSON.stringify([sender, contact, group, state, askedWords, offset])}`, saysRefreshing: true },
  )
  /** Where the page on screen starts, from the answer on screen. */
  const shownOffset = pool.status === 'ready' ? pool.value.offset : 0

  /**
   * EVERYBODY, KEYED THE ONE WAY A PARTICIPANT IS EVER KEYED.
   *
   * `participantKey` builds the key, here and in the panel and in the server library. Writing the
   * key by hand was the first thing that went wrong on this page: it joined with a slash where the
   * one function joins with a colon, so every lookup missed and every row drew a stored id where a
   * name belongs. That is the defect CLAUDE.md names — one fact worked out in two places.
   */
  const everybody = useMemo(() => {
    const out = new Map<string, ParticipantOnTheWire>()
    if (who.status !== 'ready') return out
    for (const one of who.value.people) out.set(participantKey({ kind: 'person', id: one.id }), one)
    for (const one of who.value.agents) out.set(participantKey({ kind: 'agent', id: one.id }), one)
    return out
  }, [who])

  /** The messages on this page, already narrowed by the server. */
  const said = pool.status === 'ready' ? pool.value.messages : []
  /** How many messages the pool holds, and how many of them the narrowings kept, on every page. */
  const total = pool.status === 'ready' ? pool.value.total : 0
  const matched = pool.status === 'ready' ? pool.value.matched : 0

  /** The records these messages point at, so a comment can say what it is about by name. */
  const titles = useRecordTitles(
    [...said, ...(waiting.status === 'ready' ? waiting.value.messages : [])].flatMap((one) => {
      const place = one.target
      if (place === null || typeof place !== 'object') return []
      const named = recordNamedByTarget((place as Context).target)
      return named === null ? [] : [named]
    }),
  )

  const kept = said
  const hidden = total - matched
  const narrowed = sender !== '' || contact !== '' || group !== '' || state !== '' || askedWords !== ''

  /**
   * WHO IS READING, once, and WHAT OF THIS LIST IS STILL UNREAD FOR THEM.
   *
   * The definition is the pool's own, the same one the chat panel and the server's
   * waiting-for-me reading use: a delivery row addressed to the reader whose mark is not seen.
   * Nothing else counts as unread, so this page cannot disagree with the circle about one message.
   *
   * TWO COUNTS, EACH SAID FOR WHAT IT COUNTS. `unreadInAll` is the door's `unreadForYou`: the
   * messages the filters keep that the reader has not read, on every page, worked out on the server
   * over every matching message. It decides whether "Nothing unread on any page." is drawn, and it
   * is what the press marks and names. A message the filters have removed is not in it: that is the lesson the rail learned on the notes row (its badge counted sessions
   * the page filters out). The reader is unknown until the contacts have answered: an unknown
   * reader has no unread of their own, so neither the press nor the lines are drawn until then.
   */
  const me = reader.status === 'ready' ? reader.value.me : null
  const unreadInAll = pool.status === 'ready' ? pool.value.unreadForYou : 0

  /**
   * THE PRESS MARKS EVERY UNREAD MESSAGE THE LIST HOLDS, ON EVERY PAGE.
   *
   * With a filter on, that is every unread message the filter keeps, on every page, as it was before
   * the list was paged. Round 6 made it mark only the page on screen; that changed what the owner
   * decided, and it is put back. No door marks a pool at once, so the press asks the pool door for
   * the ids of every unread message the narrowings keep (`unreadMessageIdsForMe`) and sends each
   * through the one mark door, POST /api/messages/:id/mark with seen, a few at a time.
   *
   * The list is taken at the moment of the press: a message that arrives after it is not in that
   * list and is never marked. Afterwards the pool is read again, so the count falls to what is
   * actually unread instead of to a guess. A mark that does not land is said beside the list: no
   * fake zero.
   */
  const [marking, setMarking] = useState(false)
  const poolAfterMark = useRef<{ value: unknown; error: unknown; sawRefresh: boolean } | null>(null)
  /**
   * WHY A MARK DID NOT LAND. Two things are held here: the page's own sentence when some marks failed, which has no
   * fault, and a caught error, which keeps its fault so ErrorNote draws it by its one rule.
   */
  const [markFault, setMarkFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  useLayoutEffect(() => {
    const waiting = poolAfterMark.current
    if (waiting === null || pool.status !== 'ready') return
    if (pool.refreshing === true) { waiting.sawRefresh = true; return }
    if (!waiting.sawRefresh && pool.value === waiting.value && pool.reReadError === waiting.error) return
    poolAfterMark.current = null
    if (pool.reReadError !== undefined) setMarkFault({ message: pool.reReadError.message, fault: pool.reReadError.fault ?? null })
    setMarking(false)
  }, [pool])
  const markEverythingUnread = (): void => {
    if (me === null || marking) return
    void (async () => {
      setMarking(true)
      setMarkFault(null)
      let waitingForPool = false
      try {
        const which = await api.unreadMessageIdsForMe({
          ...(sender === '' ? {} : { sender }),
          ...(contact === '' ? {} : { contact }),
          ...(group === '' ? {} : { group }),
          ...(state === '' ? {} : { state }),
          ...(askedWords === '' ? {} : { words: askedWords }),
        })
        // A FEW AT A TIME, so a press over hundreds of messages does not open hundreds of requests
        // at once. Every mark is sent even when one fails, and the fault names how many did not land.
        let failed = 0
        let firstFault = ''
        for (let at = 0; at < which.length; at += MARKS_AT_ONCE) {
          const results = await Promise.allSettled(which.slice(at, at + MARKS_AT_ONCE).map((id) => api.markMessage(id, 'seen')))
          for (const one of results) {
            if (one.status === 'rejected') {
              failed += 1
              if (firstFault === '') firstFault = errorMessage(one.reason)
            }
          }
        }
        if (failed > 0) {
          const said = t('messages.unread.someNotMarked', { n: failed, count: count(failed), total: count(which.length), why: firstFault })
          setMarkFault({ message: said, fault: null })
        } else if (pool.status === 'ready') {
          poolAfterMark.current = { value: pool.value, error: pool.reReadError, sawRefresh: false }
          waitingForPool = true
        }
        readThePoolAgain()
      } catch (err: unknown) {
        setMarkFault({ message: errorMessage(err), fault: faultOf(err) })
      } finally {
        if (!waitingForPool) setMarking(false)
      }
    })()
  }

  const clear = (): void => {
    setSender('')
    setContact('')
    setGroup('')
    setState('')
    setWords('')
    lastAsked.current = ''
    setAskedWords('')
    setOffset(0)
  }

  const people = [...everybody.values()]
  /**
   * EVERYBODY EITHER REGISTRY HOLDS, in the shape `unregisteredWriterOf` reads.
   *
   * The same set the server builds for the contacts list, built here for the same question: whether
   * this message's writer is somebody a registry answers for. The rule is `@shared/messages.ts`;
   * only the set is gathered twice, because the browser has already fetched both registries.
   */
  const everyone: KnownParticipant[] = people.map((one) => ({
    who: { kind: one.kind as ParticipantKind, id: one.id },
    name: one.name,
    handle: one.handle,
    record: one.record,
  }))
  /** Who the sender and the contact pickers offer: everybody either registry holds, each by its participant key. */
  const pickable: AnAgentToPick[] = useMemo(
    () => [...everybody.values()].map((one) => ({
      kind: one.kind as 'person' | 'agent',
      id: one.id,
      value: participantKey({ kind: one.kind as ParticipantKind, id: one.id }),
    })),
    [everybody],
  )
  const groupNames = useMemo(
    () => new Map((groups.status === 'ready' ? groups.value.groups : []).map((one) => [one.id, one.name])),
    [groups],
  )
  /** Both reads have answered, so every row can be drawn with the names it needs. */
  const ready = pool.status === 'ready' && who.status === 'ready'
  /** The messages of this page, one list per day, in the order the door gave them (newest first). */
  const days = useMemo(() => byDay(kept), [kept])
  const row = (one: PoolEntry, when: 'time' | 'day') => (
    <MessageRow key={one.id} said={one} when={when} me={me} everybody={everybody} everyone={everyone} titles={titles} groupNames={groupNames} />
  )

  return (
    <>
      <style href="mole-office-messages" precedence="default">
        {MESSAGES_CSS}
      </style>
      {/* THE SAME HEAD AS EVERY PAGE (rule R9): the title, one line, and the page's one press at the
          right. The line names the other page, because a signpost is what a line under a title is
          for. The press marks every unread message the list keeps; it is never drawn for a reader
          nobody knows, because then there is nothing of theirs to mark. */}
      <header className="px-ms-page-head">
        <div className="px-ms-ident">
          <h1 className="px-ms-title">{t('nav.messages')}</h1>
        </div>
        {ready && me !== null ? (
          <div className="px-ms-act">
            {unreadInAll === 0 ? (
              <span className="px-ms-nothing-unread">{t('messages.unread.none')}</span>
            ) : (
              <>
                {/* A MESSAGE COUNT IS FOR DEVELOPER MODE ONLY (answer 7 to report
                    n9Mjk3c_sJRu). The press works the same in both modes; only its words differ. */}
                {developer ? <span className="px-ms-unread-count">{t('messages.unread.inAll', { n: unreadInAll })}</span> : null}
                <span className="px-ms-mark-all">
                  <Btn size="sm" pending={marking} pendingFailed={markFault !== null} pendingSucceeded={markFault === null} onClick={markEverythingUnread}>
                    {developer ? t('messages.unread.markAll', { n: unreadInAll, count: count(unreadInAll) }) : t('messages.unread.markAllPlain')}
                  </Btn>
                </span>
              </>
            )}
          </div>
        ) : null}
      </header>
      {markFault === null ? null : <ErrorNote message={markFault.message} fault={markFault.fault} label={MESSAGES_PAGE.markDidNotLand} />}

      {/* FIRST, IN THE ASK COLOUR: WHAT WAITS FOR YOUR ANSWER (rule R6, decision question 10). Which
          messages those are is worked out once, on the server, by the rule in @shared/messages.ts;
          this page only draws what GET /api/messages?only=waiting-for-my-answer answers. A reader
          who is not a person can never be asked this way, so for them the section is not drawn. */}
      {me === null || me.kind !== 'person' ? null : (
        <section className="px-ms-waiting" data-group="waiting" {...declaredAttributes({ surface: 'messages.waiting' })}>
          <h2 className="px-ms-waiting-head">{MESSAGES_PAGE.waitingTitle}</h2>
          {waiting.status === 'error' ? (
            <ErrorNote message={waiting.message} fault={waiting.fault} label={MESSAGES_PAGE.couldNotReadWaiting} />
          ) : null}
          {waiting.status === 'ready' && who.status === 'ready' ? (
            waiting.value.messages.length === 0 ? (
              <p className="px-ms-quiet">{MESSAGES_PAGE.nothingWaiting}</p>
            ) : (
              <ol className="px-ms-list">{waiting.value.messages.map((one) => row(one, 'day'))}</ol>
            )
          ) : null}
          {waiting.status === 'ready' && (waitingOffset > 0 || waiting.value.next != null) ? (
            <div className="px-ms-waiting-pages">
              {waitingOffset === 0 ? null : <Btn size="sm" onClick={() => setWaitingOffset(Math.max(0, waitingOffset - MESSAGES_PAGE_SIZE))}>{t('paging.previous')}</Btn>}
              {waiting.value.next == null ? null : <span className="px-ms-waiting-more"><Btn size="sm" onClick={() => setWaitingOffset(waitingOffset + MESSAGES_PAGE_SIZE)}>{t('paging.next')}</Btn></span>}
            </div>
          ) : null}
        </section>
      )}

      <NoticeWakeRules />

      {/* THEN EVERY MESSAGE, ONE LIST PER DAY. The filters are this part's one control, behind a
          press: a page being read draws no box and no dropdown until somebody asks for one
          (tests/read-before-edit.test.ts). No box around the part and none around a message
          (rule R10). */}
      <section className="px-ms-said" {...declaredAttributes({ surface: 'messages.all' })}>
        <details className="px-ms-narrow" {...declaredAttributes({ surface: 'messages.narrow' })}>
          <summary className="px-ms-narrow-open">{MESSAGES_PAGE.chooseWhatToShow}</summary>
          <div className="px-ms-filters">
            {/* THE SENDER AND THE CONTACT ARE CHOSEN IN AGENT PICKERS, which find a person or an agent by typing. Each
                offers everybody either registry holds, retired agents behind its press, and "anybody" first. */}
            <AgentPicker
              className="px-ms-sender"
              label={MESSAGES_PAGE.bySender}
              candidates={pickable}
              chosen={sender}
              onChoose={narrowTo(setSender)}
              fixed={[{ value: '', name: MESSAGES_PAGE.anybody }]}
            />
            <AgentPicker
              className="px-ms-contact"
              label={MESSAGES_PAGE.byContact}
              candidates={pickable}
              chosen={contact}
              onChoose={narrowTo(setContact)}
              fixed={[{ value: '', name: MESSAGES_PAGE.anybody }]}
            />
            <Field label={MESSAGES_PAGE.byGroup}>
              <Select
                value={group}
                onChange={narrowTo(setGroup)}
                options={[
                  { value: '', label: MESSAGES_PAGE.everyGroup },
                  ...(groups.status === 'ready' ? groups.value.groups : []).map((one) => ({
                    value: one.id,
                    label: one.name,
                  })),
                ]}
              />
            </Field>
            <Field label={MESSAGES_PAGE.byState}>
              <Select
                value={state}
                onChange={narrowTo(setState)}
                options={[
                  { value: '', label: MESSAGES_PAGE.anyState },
                  { value: 'queued', label: DELIVERY.queued.word },
                  { value: 'delivered', label: DELIVERY.delivered.word },
                  { value: 'seen', label: DELIVERY.seen.word },
                  { value: 'archived', label: DELIVERY.archived.word },
                  { value: 'comment', label: MESSAGES_PAGE.onlyComments },
                  { value: 'nowhere', label: MESSAGES_PAGE.reachedNobody },
                ]}
              />
            </Field>
            <Field label={MESSAGES_PAGE.byWords}>
              <TextInput value={words} onChange={setWords} />
            </Field>
          </div>
        </details>
        {narrowed ? (
          <p className="px-ms-hiding">
            {hidingLine({ hidden, total, matched, offset: shownOffset, pageSize: MESSAGES_PAGE_SIZE })}{' '}
            <button type="button" className="px-ms-clear" onClick={clear}>
              {MESSAGES_PAGE.showEverything}
            </button>
          </p>
        ) : null}

        {/* THE LIST WAITS FOR THE REGISTRIES TOO, not only for the pool. Who wrote a message and
            who it reached are names, and the names are in the registries; drawing the rows before
            those have answered puts a stored id on the screen where a name belongs. */}
        {pool.status === 'loading' || who.status === 'loading' ? <Loading what={MESSAGES_PAGE.loading} rows={5} /> : null}
        {who.status === 'error' ? <ErrorNote message={who.message} fault={who.fault} label={MESSAGES_PAGE.couldNotReadWho} /> : null}
        {pool.status === 'error' ? <ErrorNote message={pool.message} fault={pool.fault} label={MESSAGES_PAGE.couldNotRead} /> : null}
        {ready && total === 0 ? <Absence tier="told-apart" looked title={MESSAGES_PAGE.nothingSaidAtAll} /> : null}
        {ready && total > 0 && matched === 0 ? <Absence tier="told-apart" looked title={MESSAGES_PAGE.nothingMatches} /> : null}
        {/* ONE PAGE OF MESSAGES, with the way to the others above and below
            it. A day that runs over the end of a page carries on under the same heading
            on the next one. */}
        <div ref={top} className="px-ms-top" />
        {!ready || kept.length === 0 ? null : (
          <>
            <Pager offset={shownOffset} pageSize={MESSAGES_PAGE_SIZE} total={matched} onGo={setOffset} />
            {days.map((day) => (
              <section key={day.key} className="px-ms-day" data-day={day.key}>
                <h2 className="px-ms-day-head">{dayHeading(day.key)}</h2>
                <ol className="px-ms-list">{day.messages.map((one) => row(one, 'time'))}</ol>
              </section>
            ))}
            <Pager
              offset={shownOffset}
              pageSize={MESSAGES_PAGE_SIZE}
              total={matched}
              onGo={(next) => {
                setOffset(next)
                top.current?.scrollIntoView({ block: 'start' })
              }}
              line={false}
            />
          </>
        )}
      </section>
    </>
  )
}

/**
 * THE MESSAGES OF ONE PAGE, ONE LIST PER DAY, in the order they came (newest first).
 *
 * The day is the stored stamp's own date, which is the operator's local day (src/shared/time.ts).
 * A stamp that is not a stamp keeps itself as its day, so it is shown as it is rather than dropped.
 */
export function byDay(messages: readonly PoolEntry[]): { key: string; messages: PoolEntry[] }[] {
  const out: { key: string; messages: PoolEntry[] }[] = []
  for (const one of messages) {
    const key = /^\d{4}-\d{2}-\d{2}/.test(one.sentAt) ? one.sentAt.slice(0, 10) : one.sentAt
    const last = out[out.length - 1]
    if (last !== undefined && last.key === key) last.messages.push(one)
    else out.push({ key, messages: [one] })
  }
  return out
}

/** A day's heading: Today, Yesterday, or the date, by the reader's own clock. */
export function dayHeading(key: string, now: Date = new Date()): string {
  const at = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (at === null) return key
  const today = localStamp(now).slice(0, 10)
  const yesterday = localStamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)).slice(0, 10)
  if (key === today) return MESSAGES_PAGE.today
  if (key === yesterday) return MESSAGES_PAGE.yesterday
  return drawnDay(new Date(Number(at[1]), Number(at[2]) - 1, Number(at[3])))
}

/**
 * THE LINK THAT OPENS WHAT A COMMENT IS ABOUT.
 *
 * A COMMENT WRITTEN ON A CARD OPENS THAT DRAWING, AT THAT CARD, AT THAT LEVEL. `pageHolding` is the
 * one map from a stored context to an address, and it answers a drawing for a comment written on one.
 *
 * THE PRESS IS WHAT REMEMBERS THE CARD. The address cannot carry a card or a level, so the card goes
 * through the per-visit store the drawing reads when it opens, and it is written on the press rather
 * than while this row is drawn, because drawing must not write anything.
 *
 * THE FALLBACK IS THE RECORD PAGE. Where the map cannot answer with a page (a comment on a part of
 * Mole Office's own screen) the record page is what is offered.
 */
function OpenWhereTheCommentWas({ context, fallback }: { context: Context; fallback: string }) {
  const where = pageHolding(context)
  const to = 'path' in where ? where.path : fallback
  return (
    <a
      href={`#${to}`}
      onClick={() => {
        rememberTheCardACommentWasOn(context)
      }}
    >
      {MESSAGES_PAGE.openTheRecord}
    </a>
  )
}

/**
 * ONE MESSAGE AS A ROW (rule R11): who wrote it and its words on the left, who it reached and the
 * time at the right. The whole row opens the message in its conversation. How far it got with each
 * recipient is the delivery row's own word, read through `DELIVERY`, so this page cannot disagree
 * with the panel. The delivery's reason is that word's hover text; the reason in full and the run
 * that took it are on the message's own page.
 */
function MessageRow({
  said,
  when,
  me,
  everybody,
  everyone,
  titles,
  groupNames,
}: {
  said: PoolEntry
  /** The time alone under a day's heading, or the day and the time where there is no heading. */
  when: 'time' | 'day'
  me: { kind: ParticipantKind; id: string } | null
  everybody: Map<string, ParticipantOnTheWire>
  /** The same set as `everybody`, in the shape the rule about who wrote a message reads. */
  everyone: readonly KnownParticipant[]
  titles: ReturnType<typeof useRecordTitles>
  /** Each group's name by its id, from the groups door. Empty until that door has answered. */
  groupNames: ReadonlyMap<string, string>
}) {
  const named = said.sentBy === null ? null : theAgentAStoredSenderNames(said.sentBy, everyone)
  const from = named === null ? undefined : everybody.get(participantKey(named))
  const writer = theWritersName(said, everyone)
  const comment = recordIsAComment({ kind: 'message', data: { target: said.target } })
  const other = theOtherSide(said, me, everyone)
  const place = said.target === null || typeof said.target !== 'object' ? null : (said.target as Context)
  const about = place === null ? null : recordNamedByTarget(place.target)
  // THE TIME TO THE MINUTE (rule R7). Under a day's heading the time alone; elsewhere the day too.
  const drawn = drawnStamp(said.sentAt)
  const time = when === 'time' && /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(drawn) ? drawn.slice(11) : drawn
  const otherName =
    other === null
      ? null
      : other.what === 'unregistered'
        ? unregisteredName(other.writer, 'inASentence')
        : other.what === 'group'
          ? (groupNames.get(other.id) ?? other.id)
          : theWritersName({ sentBy: other.who, from: null }, everyone, 'inASentence')

  return (
    <li className="px-ms-one" data-opens={other === null ? undefined : '1'}>
      {/* THE WHOLE ROW IS THE PRESS. It lies over the row and says, for a screen reader, where it
          opens; the words drawn on the row are the row itself. A message with no other side (one
          nobody was reading as themself) opens nothing, so it draws no press. */}
      {other === null || otherName === null ? null : (
        <button
          type="button"
          className="px-ms-open"
          data-other={other.what}
          title={MESSAGES_PAGE.openItWhereItIsRead(otherName)}
          onClick={() => {
            if (other.what === 'participant') openTheChatAt(other.who)
            else if (other.what === 'group') openTheChatAtGroup(other.id, said.id)
            else openTheChatAtUnregistered(other.writer)
          }}
        >
          <span className="sr-only">{MESSAGES_PAGE.openItWhereItIsRead(otherName)}</span>
        </button>
      )}
      <div className="px-ms-main">
        <div className="px-ms-head">
          {from === undefined ? null : (
            <Avatar kind={from.kind as ParticipantKind} id={from.id} name={from.name} url={from.avatarUrl} size={20} />
          )}
          <span className="px-ms-from">{writer}</span>
          {comment ? <span className="px-ms-tag">{MESSAGES_PAGE.isAComment}</span> : null}
        </div>
        {/* A LINE OF MOLE OFFICE'S IS NAMED BY ITS FEW WORDS, in the page's language where it is a dead-letter line
            (`theWordsOfAnOfficeLine`, the reader the chat uses). Every other message shows its own words. */}
        <div className="px-ms-words">{said.sentBy !== null && isMoleOffice(said.sentBy) ? theWordsOfAnOfficeLine(t, said).line : said.body}</div>
        {/* AND THE PICTURES IT CARRIES, criterion M64: the same component the conversation draws, so
            the reader's setting is read once for both. */}
        <div className="px-ms-pics">
          <MessagePictures pictures={said.pictures} inProject={said.workspaceId} />
        </div>
        {/* WHAT IT IS ABOUT, when it is a comment. `pageHolding` decides where it opens. */}
        {comment && about !== null && place !== null ? (
          <p className="px-ms-about">
            {CHAT_WORDS.aboutThePlace(titleOrSentence(titles, about))}{' '}
            <OpenWhereTheCommentWas context={place} fallback={recordPath(about)} />
          </p>
        ) : null}
      </div>
      {/* WHO IT REACHED, and how far it got with each of them. */}
      <ul className="px-ms-went">
        {/* THE GROUP'S NAME, NOT ITS ID. The id is left only for a group the groups door does not
            name, which is what the message stores and all the page knows. */}
        {/* A GROUP LINE MOLE OFFICE DELIVERED TO SOME MEMBERS ONLY, OR TO NONE, says so (problem 0WUuvB0IhRfb),
            and is not also called a message that reached nobody for want of a recipient. */}
        {said.toGroup !== null ? (
          <li className="px-ms-to">
            {said.deliveredOnlyTo === undefined
              ? MESSAGES_PAGE.toAGroup(groupNames.get(said.toGroup) ?? said.toGroup)
              : MESSAGES_PAGE.toAGroupDeliveredOnlyTo(groupNames.get(said.toGroup) ?? said.toGroup, said.deliveries.length === 0)}
          </li>
        ) : null}
        {said.deliveries.length === 0 && said.toGroup !== null && said.deliveredOnlyTo !== undefined ? null : said.deliveries.length === 0 ? (
          <li className="px-ms-to">{MESSAGES_PAGE.reachedNobodyAtAll}</li>
        ) : (
          said.deliveries.map((one) => {
            const mark = isDeliveryMark(one.mark) ? DELIVERY[one.mark] : null
            return (
              <li key={participantKey(one.to)} className="px-ms-to">
                <span className="px-ms-who">{theWritersName({ sentBy: one.to, from: null }, everyone)}</span>
                {/* WHY IT STANDS THERE (which run took it, why nothing could start) is the word's
                    hover text: a list row locates, and the message's own page says it in full. */}
                <span className="px-ms-mark" {...(one.because === null ? {} : { title: one.because })}>
                  {mark === null ? MESSAGES_PAGE.markNobodyCanRead : mark.word}
                </span>
              </li>
            )
          })
        )}
      </ul>
      <span className="px-ms-when">
        <time dateTime={said.sentAt} title={drawn}>
          {time}
        </time>
      </span>
    </li>
  )
}

/**
 * WHOSE CONVERSATION THIS MESSAGE IS IN, seen from the reader, or null because there is none.
 *
 * A message to a group is in that group's conversation and in no one-to-one conversation, which is
 * the rule `isBetween` in src/server/lib/messages.ts follows, so the row opens the group at it.
 *
 * `unregisteredWriterOf` IS THE SAME FUNCTION THE PANEL AND THE CONTACTS LIST USE (criterion M27): a
 * writer nobody registered has a conversation of its own, and a second copy of "is this writer
 * registered" is the defect CLAUDE.md names as this repository's own.
 */
type TheOtherSide =
  | { what: 'participant'; who: { kind: ParticipantKind; id: string } }
  | { what: 'unregistered'; writer: UnregisteredWriter }
  | { what: 'group'; id: string }

function theOtherSide(
  said: PoolEntry,
  me: { kind: ParticipantKind; id: string } | null,
  everyone: readonly KnownParticipant[],
): TheOtherSide | null {
  if (me === null) return null
  if (said.toGroup !== null) return { what: 'group', id: said.toGroup }
  const writer = unregisteredWriterOf(said, everyone)
  if (writer !== null) return { what: 'unregistered', writer }
  const mine = (who: { kind: string; id: string }): boolean => who.kind === me.kind && who.id === me.id
  const sender = said.sentBy === null ? null : theAgentAStoredSenderNames(said.sentBy, everyone)
  if (sender !== null && !mine(sender)) return { what: 'participant', who: sender }
  const to = said.deliveries.map((one) => theAgentAStoredSenderNames(one.to, everyone) ?? one.to).find((one) => !mine(one))
  return to === undefined ? null : { what: 'participant', who: to }
}

/**
 * WHAT THE FILTERS ARE HIDING, said for the list as it is paged: how many of the project's messages
 * they hide, or that they hide none and which messages this page shows. Every number is the door's,
 * counted over the whole pool; `offset` is where the page on screen starts. Every number is grouped
 * by thousands the way the page's language writes it.
 */
export function hidingLine(at: { hidden: number; total: number; matched: number; offset: number; pageSize: number }): string {
  if (at.hidden > 0) return t('messages.hiding.some', { hidden: count(at.hidden), total: count(at.total) })
  if (at.total === 0) return t('messages.hiding.noneAtAll')
  return t('messages.hiding.none', {
    total: count(at.total),
    from: count(Math.min(at.offset + 1, at.matched)),
    to: count(Math.min(at.offset + at.pageSize, at.matched)),
  })
}

/**
 * THE PAGE'S OWN SHEET. Every class here is this page's own (px-ms-*): React keeps a page's sheet
 * after the page closes, so a name another page uses would restyle that page too. NO BACKTICK
 * ANYWHERE IN THIS STRING, including in a comment.
 */
const MESSAGES_CSS = `
.px-ms-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--gut) var(--pad-lg); flex-wrap: wrap; min-width: 0; margin: 0 0 calc(var(--gut) * 2); }
.px-ms-ident { min-width: 0; flex: 1 1 22rem; display: flex; flex-direction: column; gap: 4px; }
.px-ms-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.px-ms-act { flex: none; display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
.px-ms-nothing-unread, .px-ms-unread-count { color: var(--text-2); font-size: var(--fs-1); font-variant-numeric: tabular-nums; }

/* A SECTION IS NOT A BOX: a heading in the look's label style, and rows split by a line. */
.px-ms-waiting, .px-ms-said { display: flex; flex-direction: column; min-width: 0; margin: 0 0 calc(var(--gut) * 2); container-type: inline-size; container-name: pxms; }
.px-ms-waiting-head, .px-ms-day-head {
  margin: 0 0 var(--pad); font-family: var(--section-font); font-size: var(--panel-title-size); font-weight: var(--section-weight);
  text-transform: var(--section-case); letter-spacing: var(--section-space); line-height: var(--lh-tight); color: var(--text);
}
.px-ms-waiting-head { color: var(--ask); }
.px-ms-waiting .px-ms-one { background: var(--ask-row); }
.px-ms-quiet { margin: 0; color: var(--text-3); font-size: var(--fs-2); }
.px-ms-day { display: flex; flex-direction: column; min-width: 0; margin: var(--gut) 0 0; }

.px-ms-narrow { margin: 0 0 var(--pad); }
.px-ms-narrow-open { cursor: pointer; color: var(--text-2); font-size: var(--fs-1); }
.px-ms-narrow-open:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; border-radius: var(--radius-sm); }
.px-ms-narrow[open] .px-ms-narrow-open { margin-bottom: var(--pad); }
.px-ms-filters { display: grid; gap: var(--pad); grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); }
.px-ms-filters .agp { grid-column: 1 / -1; }
.px-ms-hiding { margin: 0 0 var(--pad); color: var(--text-2); line-height: var(--lh-body); }
.px-ms-clear { border: 1px solid var(--border-strong); border-radius: 0.25rem; background: none; color: var(--text); padding: 0.1rem 0.4rem; cursor: pointer; }

/* ONE ROW. The words take what is left; who it reached and the time sit at its right in columns of
   fixed width, so they line up down the page and sit beside the words. */
.px-ms-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
.px-ms-one {
  position: relative;
  display: grid; grid-template-columns: minmax(0, 1fr) 15rem 8rem; align-items: start; gap: 4px var(--gut);
  min-height: 44px; padding: var(--pad); min-width: 0;
  border-bottom: 1px solid var(--border);
}
.px-ms-one[data-opens="1"]:hover { background: var(--hover); }
/* THE PRESS LIES OVER THE WHOLE ROW, and what must stay pressable of its own sits above it. */
.px-ms-open { position: absolute; inset: 0; margin: 0; padding: 0; border: 0; background: none; cursor: pointer; }
.px-ms-open:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: -2px; }
.px-ms-pics, .px-ms-about a { position: relative; z-index: 1; }
.px-ms-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.px-ms-head { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; min-width: 0; }
.px-ms-from { font-size: var(--fs-2); font-weight: 600; line-height: var(--lh-tight); overflow-wrap: anywhere; }
.px-ms-tag { border: 1px solid var(--border); border-radius: 0.2rem; padding: 0 0.3rem; color: var(--text-3); font-size: var(--fs-1); }
/* THE WORDS IN ONE OR TWO LINES. The whole message is in its conversation, which the row opens. */
.px-ms-words {
  white-space: pre-wrap; overflow-wrap: anywhere; line-height: var(--lh-body); color: var(--text-2); font-size: var(--fs-2);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden;
}
.px-ms-pics:empty { display: none; }
.px-ms-about { margin: 0; color: var(--text-2); font-size: var(--fs-1); }
.px-ms-went { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.px-ms-to { display: flex; gap: 0.4rem; align-items: baseline; flex-wrap: wrap; font-size: var(--fs-1); line-height: var(--lh-tight); color: var(--text-2); min-width: 0; }
/* A LONG WORD MAY BREAK ANYWHERE ON THIS LINE. A reason that carries an address, written with no
   space in it, pushed the page 6 px past the right edge of a 390 px phone (measured on a copy of the
   office's data, 27 September 2026). Each part of the line may shrink and break instead. */
.px-ms-to > * { min-width: 0; overflow-wrap: anywhere; }
.px-ms-who { font-weight: 600; color: var(--text); }
.px-ms-mark { color: var(--text-3); }
.px-ms-when { font-size: var(--fs-1); line-height: var(--lh-tight); color: var(--text-3); font-variant-numeric: tabular-nums; text-align: right; }

/* A NARROW LIST (a phone, and the 660 window): one column, and who it reached and the time go on a
   line of their own under the words. */
@container pxms (width < 46rem) {
  .px-ms-one { grid-template-columns: minmax(0, 1fr) auto; }
  .px-ms-main { grid-column: 1 / -1; }
  .px-ms-went { flex-direction: row; flex-wrap: wrap; gap: 2px var(--gut); }
}

/* ON A PHONE THE PAGE'S PRESS IS THE FULL WIDTH UNDER THE HEAD, and at least 44 px tall (rule R8). */
@media (max-width: 40rem) {
  .px-ms-act { flex: 1 1 100%; }
  .px-ms-mark-all { flex: 1 1 100%; display: flex; }
  .px-ms-mark-all .px-btn { flex: 1 1 auto; min-height: 44px; }
}
`
