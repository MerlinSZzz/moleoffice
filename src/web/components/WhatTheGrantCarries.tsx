// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE, ON THE SECRETARY'S PAGE. Wave 13s round 2a.
 *
 * The secretary card gives each of the person's doors an answer: kept for the person, ask the person first, or the
 * secretary may press it. Each office's person may give any door this office's own answer, which stands instead of the
 * card's (src/server/lib/what-the-grant-carries.ts). This draws the list the read door answers, in three groups by the
 * answer in force, and on each door who set it.
 *
 * A CHANGE IS CHOSEN, THEN PRESSED. Choosing an answer in a door's menu changes nothing: it adds a line to the list of
 * changes not made yet, which says each door's answer before and after. "Change it" sends them all in one write, which
 * only the person pressing it themselves may make. A caller the write door would refuse reads the list without menus;
 * the read door says which callers those are (`refusal`), so this page does not guess.
 *
 * EACH ROW SAYS WHAT THE CARD SAYS, so the menu's first choice can be just "the card's answer" and still fit a phone.
 * Where this office has its own answer, the same line says who set it and when.
 *
 * A DOOR THAT DOES NOT ASK YET SAYS SO. Its menu is drawn, because the answer is kept and holds once the door asks, but
 * the line under it says the door still refuses the secretary, so "may press" there is never read as true today.
 *
 * A DOOR THAT ALSO NEEDS THE PERSON'S WORDS SAYS FOR WHICH CHANGES. The two role card doors need them only for a change
 * to a card's words, so their line says the grant alone may press a change that leaves the words as they are.
 */
import { useState } from 'react'

import {
  doesThisDoorNeedThePersonsWordsOnlyForACardsWords,
  isAnAnswerAboutADoor,
  type AChoiceForADoor,
  type ADoorAndWhatTheGrantDoes,
  type AnAnswerAboutADoor,
  type WhatTheGrantCarriesReading,
  type WhoSetIt,
} from '@shared/what-the-grant-carries.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { Absence, Btn, ErrorNote, Select, useAsync, WordsAroundAStamp } from './ui.tsx'

/** The three answers in the order the groups are drawn: the strictest first. */
const THE_GROUPS: readonly AnAnswerAboutADoor[] = ['kept', 'ask-first', 'may-press']

const GROUP_WORD: Readonly<Record<AnAnswerAboutADoor, WordKey>> = {
  kept: 'grantList.group.kept',
  'ask-first': 'grantList.group.askFirst',
  'may-press': 'grantList.group.mayPress',
}
const ANSWER_WORD: Readonly<Record<AnAnswerAboutADoor, WordKey>> = {
  kept: 'grantList.answer.kept',
  'ask-first': 'grantList.answer.askFirst',
  'may-press': 'grantList.answer.mayPress',
}
const SHORT_WORD: Readonly<Record<AnAnswerAboutADoor, WordKey>> = {
  kept: 'grantList.short.kept',
  'ask-first': 'grantList.short.askFirst',
  'may-press': 'grantList.short.mayPress',
}

/** A door's choice as it stands: this office's answer, or the card's default. */
function theChoiceNow(door: ADoorAndWhatTheGrantDoes): AChoiceForADoor {
  return door.office?.answer ?? 'default'
}

/** A choice in the short words a line about a change uses. */
function aChoiceInShortWords(choice: AChoiceForADoor, door: ADoorAndWhatTheGrantDoes): string {
  return choice === 'default' ? t('grantList.short.default', { answer: t(SHORT_WORD[door.card]) }) : t(SHORT_WORD[choice])
}

export function WhatTheGrantCarries() {
  useLanguage()
  const [reading, reload] = useAsync(() => api.whatTheGrantCarries(), [])
  if (reading.status === 'loading') return <p className="wgc-loading"><Absence say title={t('grantList.loading')} /></p>
  if (reading.status === 'error') return <ErrorNote message={reading.message} fault={reading.fault} retry={reload} />
  return <TheList reading={reading.value} onChanged={reload} />
}

function TheList({ reading, onChanged }: { reading: WhatTheGrantCarriesReading; onChanged: () => void }) {
  const { language } = useLanguage()
  const mayChange = reading.refusal === null
  // THE CHANGES CHOSEN AND NOT MADE YET, by door. A choice that matches the door's answer now is no change.
  const [chosen, setChosen] = useState<ReadonlyMap<string, AChoiceForADoor>>(new Map())
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)

  const choose = (door: ADoorAndWhatTheGrantDoes, choice: AChoiceForADoor): void => {
    const next = new Map(chosen)
    if (choice === theChoiceNow(door)) next.delete(door.door)
    else next.set(door.door, choice)
    setChosen(next)
  }

  const send = (changes: { door: string; answer: AChoiceForADoor }[]): void => {
    setFault(null)
    setBusy(true)
    api
      .changeWhatTheGrantCarries(changes)
      .then(() => {
        setChosen(new Map())
        onChanged()
      })
      .catch((err: unknown) => {
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const wordsOf = (door: ADoorAndWhatTheGrantDoes): string => (language === 'zh' ? door.words.zh : door.words.en)
  const pending = reading.doors.filter((door) => chosen.has(door.door))

  return (
    <section className="wgc" data-what-the-grant-carries>
      <p className="wgc-head tc-label">{t('grantList.heading')}</p>
      <p className="wgc-intro">{t('grantList.intro')}</p>
      {mayChange ? null : <p className="wgc-read-only">{t('grantList.readOnly')}</p>}
      {THE_GROUPS.map((answer) => {
        const doors = reading.doors.filter((door) => door.answer === answer)
        return (
          <details className="wgc-group" key={answer} data-group={answer}>
            <summary className="wgc-group-head">{t(GROUP_WORD[answer], { n: reading.counts[answer] })}</summary>
            {doors.length === 0 ? (
              <p className="wgc-none">{t('grantList.group.none')}</p>
            ) : (
              <ul className="wgc-rows">
                {doors.map((door) => (
                  <li className="wgc-row" key={door.door} data-door={door.door} data-chosen={chosen.has(door.door) ? 'yes' : undefined}>
                    <span className="wgc-about">
                      <span className="wgc-door">{wordsOf(door)}</span>
                      <span className="wgc-who">
                        {t('grantList.byTheCard', { answer: t(SHORT_WORD[door.card]) })}
                        {door.office === null ? null : <WhoSetThisOfficesAnswer office={door.office} />}
                      </span>
                      {door.asksTheCheck ? null : <span className="wgc-not-yet">{t('grantList.doesNotAskYet')}</span>}
                      {door.alsoNeedsThePersonsWords ? (
                        <span className="wgc-needs-words">
                          {t(
                            doesThisDoorNeedThePersonsWordsOnlyForACardsWords(door.door, door.card, door.answer)
                              ? 'grantList.alsoNeedsYourWordsForACardsWords'
                              : 'grantList.alsoNeedsYourWords',
                          )}
                        </span>
                      ) : null}
                    </span>
                    <span className="wgc-answer">
                      {mayChange ? (
                        <Select<AChoiceForADoor>
                          aria-label={t('grantList.menu', { door: wordsOf(door) })}
                          value={chosen.get(door.door) ?? theChoiceNow(door)}
                          onChange={(next) => {
                            choose(door, next)
                          }}
                          options={[
                            { value: 'default', label: t('grantList.answer.default') },
                            ...THE_GROUPS.map((one) => ({ value: one, label: t(ANSWER_WORD[one]) })),
                          ]}
                        />
                      ) : (
                        t(ANSWER_WORD[door.answer])
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        )
      })}
      {reading.stale.length === 0 ? null : (
        <div className="wgc-stale">
          <p className="wgc-group-head">{t('grantList.stale.head')}</p>
          <p className="wgc-intro">{t('grantList.stale.says')}</p>
          <ul className="wgc-rows">
            {reading.stale.map((row) => (
              <li className="wgc-row" key={row.door} data-stale-door={row.door}>
                <span className="wgc-door">
                  <WordsAroundAStamp
                    at={row.at}
                    words={(when) =>
                      t('grantList.stale.row', { door: row.door, answer: isAnAnswerAboutADoor(row.answer) ? t(SHORT_WORD[row.answer]) : row.answer, when })
                    }
                  />
                </span>
                {mayChange ? (
                  <span className="wgc-answer">
                    <Btn
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      reason={busy ? t('grantList.changing') : undefined}
                      onClick={() => send([{ door: row.door, answer: 'default' }])}
                    >
                      {t('grantList.stale.remove')}
                    </Btn>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pending.length === 0 ? null : (
        <div className="wgc-confirm" data-changes-not-made={pending.length}>
          <p className="wgc-confirm-head">{t('grantList.confirmHead', { n: pending.length })}</p>
          <ul className="wgc-confirm-list">
            {pending.map((door) => (
              <li key={door.door}>
                {t('grantList.fromTo', {
                  door: wordsOf(door),
                  from: aChoiceInShortWords(theChoiceNow(door), door),
                  to: aChoiceInShortWords(chosen.get(door.door) ?? theChoiceNow(door), door),
                })}
              </li>
            ))}
          </ul>
          <div className="wgc-confirm-acts">
            <Btn
              variant="secondary"
              pending={busy}
              onClick={() => send(pending.map((door) => ({ door: door.door, answer: chosen.get(door.door) ?? theChoiceNow(door) })))}
            >
              {busy ? t('grantList.changing') : t('grantList.changeIt')}
            </Btn>
            <Btn variant="ghost" disabled={busy} reason={busy ? t('grantList.changing') : undefined} onClick={() => setChosen(new Map())}>
              {t('grantList.leaveIt')}
            </Btn>
          </div>
        </div>
      )}
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <style href="mole-office-what-the-grant-carries" precedence="default">
        {WHAT_THE_GRANT_CARRIES_CSS}
      </style>
    </section>
  )
}

/** Who set this office's answer about a door, and when, after the card's answer on the same line. */
function WhoSetThisOfficesAnswer({ office }: { office: WhoSetIt }) {
  return (
    <>
      {' '}
      <WordsAroundAStamp
        at={office.at}
        words={(when) => (office.kind === 'human' ? t('grantList.byThePerson', { when }) : t('grantList.byAnother', { who: office.id, when }))}
      />
    </>
  )
}

/**
 * The list's own rules. Every value is a token. A row is the door's words with what the card says and who set this
 * office's answer under them, and the answer beside them. At 40rem and below the answer stands under the words.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const WHAT_THE_GRANT_CARRIES_CSS = `
.wgc { margin-top: var(--pad); border-top: 1px solid var(--border); padding-top: var(--pad); min-width: 0; }
.wgc-head { margin: 0; width: auto; }
.wgc-intro { margin: 4px 0 var(--pad); max-width: var(--measure); color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-read); }
.wgc-read-only { margin: 0 0 var(--pad); color: var(--text-2); font-size: var(--fs-1); }
.wgc-loading { margin: var(--pad) 0 0; color: var(--text-3); font-size: var(--fs-1); }
.wgc-group { margin: 0 0 var(--pad); min-width: 0; }
.wgc-group-head { margin: 0; cursor: pointer; color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.wgc-stale .wgc-group-head { cursor: default; }
.wgc-none { margin: 4px 0 0; color: var(--text-3); font-size: var(--fs-1); }
.wgc-rows { list-style: none; margin: 6px 0 0; padding: 0; min-width: 0; }
.wgc-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 18rem); gap: 4px var(--gut);
  align-items: center; min-width: 0; padding: 6px 0; border-top: 1px solid var(--border);
}
.wgc-about { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wgc-row[data-chosen="yes"] { background: var(--hover); }
.wgc-door { min-width: 0; color: var(--text); font-size: var(--fs-2); overflow-wrap: anywhere; }
.wgc-who { min-width: 0; color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.wgc-answer { min-width: 0; color: var(--text); font-size: var(--fs-2); }
.wgc-answer .px-select { width: 100%; max-width: 100%; }
.wgc-not-yet, .wgc-needs-words { color: var(--text-2); font-size: var(--fs-1); }
.wgc-confirm {
  display: flex; flex-direction: column; gap: var(--pad); margin: var(--pad) 0 0; padding: var(--pad);
  border-left: var(--rail) solid var(--accent); border-radius: var(--radius-sm); background: var(--hover); min-width: 0;
}
.wgc-confirm-head { margin: 0; color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.wgc-confirm-list { margin: 0; padding-left: 1.2em; color: var(--text); font-size: var(--fs-2); overflow-wrap: anywhere; }
.wgc-confirm-acts { display: flex; flex-wrap: wrap; gap: var(--pad); }
@media (max-width: 40rem) {
  .wgc-row { grid-template-columns: minmax(0, 1fr); }
  .wgc-confirm-acts > .px-btn { width: 100%; }
}
`
