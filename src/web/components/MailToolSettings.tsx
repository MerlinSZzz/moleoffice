// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIL TOOL'S OWN SETTINGS, IN ITS ENTRY ON THE SETTINGS PAGE, by the plan 9y8_m1dheYm_ and two
 * decisions: which account it sends from, the list of addresses,
 * and a test letter. Until 28 September 2026 these were on a page of the tool's own, in a window of its own;
 * now a tool's settings fold open in its entry, with no second-level page and no window.
 *
 * IT ASKS THE TOOL ITSELF, on this computer (src/web/lib/the-mail-tool.ts), so no address passes through the office.
 * On that computer InstallTheMailTool draws this only while the tool runs and has said where it answers.
 *
 * ON ANOTHER DEVICE IT READS THE SAME ANSWER THROUGH THE OFFICE, because the tool answers on its own computer alone: the
 * office there asks it and passes the answer on, keeping nothing (GET /api/office/mail-tool/state). Each press is passed
 * on the same way (POST /api/office/mail-tool/addresses, /account and /test), and the office writes the press down as
 * their act. When the office has no answer of the tool's, it says why in a short state word; after a press, that the
 * change was not confirmed, since the tool may or may not have made it.
 *
 * EVERY WORD IS FROM THE WORD LISTS, IN THEIR LANGUAGE: the tool answers codes and data, never a sentence. Their addresses,
 * the accounts and a summons's title are the person's content and are drawn as they are. What the office, the account reader
 * and the mail server said, in their own English, is drawn in developer mode alone, through ServerNote.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useCallback, useEffect, useState } from 'react'

import { content, t, type WordKey } from '@shared/i18n.ts'
import type { TheMailToolsChangeThroughTheOffice, WhyTheToolWasNotRead } from '@shared/the-mail-tool-through-the-office.ts'
import { api, errorMessage, faultOf } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import {
  theTool,
  type ALetter,
  type AddressesDone,
  type TheToolsState,
  type WhereTheToolIs,
  type WhyItCannotSend,
  type WhyNotSent,
} from '../lib/the-mail-tool.ts'
import { Btn, ErrorNote, Field, Loading, ServerNote, TextArea } from './ui.tsx'

/** Why an account cannot send, in the words of the lists. */
const WHY_IT_CANNOT: Readonly<Record<WhyItCannotSend, WordKey>> = {
  'no address': 'settingsPanel.mailtool.cannot.noAddress',
  'no mail server': 'settingsPanel.mailtool.cannot.noMailServer',
  'asks a password': 'settingsPanel.mailtool.cannot.asksAPassword',
  'not encrypted': 'settingsPanel.mailtool.cannot.notEncrypted',
  'log in again': 'settingsPanel.mailtool.cannot.logInAgain',
}

/** Why a test letter was not sent, in the words of the lists. */
const WHY_NOT_SENT: Readonly<Record<WhyNotSent, WordKey>> = {
  'no account': 'settingsPanel.mailtool.notSent.noAccount',
  'pick one': 'settingsPanel.mailtool.notSent.pickOne',
  'login refused': 'settingsPanel.mailtool.notSent.loginRefused',
  'server not reached': 'settingsPanel.mailtool.notSent.serverNotReached',
  'account or token': 'settingsPanel.mailtool.notSent.accountOrToken',
}

/** What became of one test letter, in the words of the lists. */
const A_LETTER: Readonly<Record<ALetter['outcome'], WordKey>> = {
  sent: 'settingsPanel.mailtool.test.letterSent',
  refused: 'settingsPanel.mailtool.test.letterRefused',
  later: 'settingsPanel.mailtool.test.letterLater',
}

/** Why a press waits while another runs, in the words of the lists: a disabled press always says why. */
const WAITS_FOR: Readonly<Record<'save' | 'pick' | 'test', WordKey>> = {
  save: 'settingsPanel.mailtool.addresses.saving',
  pick: 'settingsPanel.mailtool.from.picking',
  test: 'settingsPanel.mailtool.test.sending',
}

/** Why the office had no answer of the tool's to pass on, in the words of the lists. */
const NOT_READ: Readonly<Record<WhyTheToolWasNotRead, WordKey>> = {
  'no address': 'settingsPanel.mailtool.throughTheOffice.state.noAddress',
  'no answer': 'settingsPanel.mailtool.throughTheOffice.state.noAnswer',
  refused: 'settingsPanel.mailtool.throughTheOffice.state.refused',
  'not the tool': 'settingsPanel.mailtool.throughTheOffice.state.notTheTool',
}

/** How the settings are read: from the tool itself on its computer, or through the office on another device. */
export type HowTheToolIsAsked = { where: WhereTheToolIs } | { throughTheOffice: true }

type Read =
  | { status: 'loading' }
  | { status: 'error'; says: string }
  /** The office answered, and had no answer of the tool's to pass on. */
  | { status: 'not read'; because: WhyTheToolWasNotRead; says: string }
  /** The office's own door refused or could not be reached. */
  | { status: 'unread'; message: string; fault: ReturnType<typeof faultOf> }
  | { status: 'ready'; value: TheToolsState }

/** A press the tool answered itself, in the shape a press passed on through the office comes back in. */
function answered<Answer>(asked: Promise<Answer>): Promise<TheMailToolsChangeThroughTheOffice<Answer>> {
  return asked.then((answer) => ({ answered: true, answer }))
}

/** What an error said, for developer mode. */
function saidBy(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** What saving the list came to, in the words of the lists. */
function whatSavingDid(done: AddressesDone): string {
  if (done.saved) return t('settingsPanel.mailtool.addresses.saved')
  if (done.reason === 'not an address') return t('settingsPanel.mailtool.addresses.notSaved.notAnAddress', { which: content(done.which) })
  return t('settingsPanel.mailtool.addresses.notSaved.tooMany', { most: done.most, count: done.count })
}

export function MailToolSettings(asked: HowTheToolIsAsked) {
  useLanguage()
  const developer = useInspect()
  // WITH NO PLACE OF THE TOOL'S, this page is on another device: it reads, and presses, through the office.
  const origin = 'where' in asked ? asked.where.origin : null
  const secret = 'where' in asked ? asked.where.secret : null
  const where = origin !== null && secret !== null ? { origin, secret } : null
  const [read, setRead] = useState<Read>({ status: 'loading' })
  // THE LIST AS THEY TYPE IT: null until the tool has answered, then their own, which a later read does not overwrite.
  const [typed, setTyped] = useState<string | null>(null)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState<null | 'save' | 'pick' | 'test'>(null)
  const [saved, setSaved] = useState<AddressesDone | null>(null)
  const [picked, setPicked] = useState<boolean | null>(null)
  const [fault, setFault] = useState<string | null>(null)
  // AFTER A PRESS PASSED ON THROUGH THE OFFICE: why the office had no answer of the tool's, or the office's own refusal.
  const [notConfirmed, setNotConfirmed] = useState<{ because: WhyTheToolWasNotRead; says: string } | null>(null)
  const [officeRefused, setOfficeRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  const take = useCallback((state: TheToolsState) => {
    setRead({ status: 'ready', value: state })
    setTyped((before) => before ?? state.addresses.join('\n'))
    setChoice((before) => (before !== '' ? before : (state.sender?.account?.id ?? '')))
  }, [])

  const readAgain = useCallback(() => {
    setRead((before) => (before.status === 'ready' ? before : { status: 'loading' }))
    if (origin === null || secret === null) {
      api
        .theMailToolsState()
        .then((answer) => (answer.answered ? take(answer.state) : setRead({ status: 'not read', because: answer.because, says: answer.says })))
        .catch((err: unknown) => setRead({ status: 'unread', message: errorMessage(err), fault: faultOf(err) }))
      return
    }
    theTool
      .state({ origin, secret })
      .then(take)
      .catch((err: unknown) => setRead({ status: 'error', says: saidBy(err) }))
  }, [origin, secret, take])

  useEffect(() => {
    readAgain()
  }, [readAgain])

  /** One press: busy while it runs, the state after it taken, and what it did kept by `after`. */
  const pressing = <T,>(
    which: 'save' | 'pick' | 'test',
    ask: () => Promise<TheMailToolsChangeThroughTheOffice<{ done: T; state: TheToolsState }>>,
    after: (done: T) => void,
  ) => {
    setBusy(which)
    setFault(null)
    setNotConfirmed(null)
    setOfficeRefused(null)
    ask()
      .then((passed) => {
        if (!passed.answered) {
          setNotConfirmed({ because: passed.because, says: passed.says })
          return
        }
        take(passed.answer.state)
        after(passed.answer.done)
      })
      .catch((err: unknown) => (where === null ? setOfficeRefused({ message: errorMessage(err), fault: faultOf(err) }) : setFault(saidBy(err))))
      .finally(() => setBusy(null))
  }

  const save = () => {
    const list = typed ?? ''
    pressing('save', () => (where === null ? api.saveTheMailToolsAddresses(list) : answered(theTool.saveTheAddresses(where, list))), (done) => {
      setSaved(done)
      if (done.saved) setTyped(done.addresses.join('\n'))
    })
  }
  const pick = () => {
    pressing('pick', () => (where === null ? api.pickTheMailToolsAccount(choice) : answered(theTool.pickTheAccount(where, choice))), (done) => setPicked(done.picked))
  }
  const test = () => {
    pressing('test', () => (where === null ? api.sendTheMailToolsTest() : answered(theTool.sendATest(where))), () => undefined)
  }

  if (read.status === 'loading') return <Loading what={t('settingsPanel.mailtool.tool.loading')} rows={0} />
  if (read.status === 'unread') {
    return <ErrorNote message={read.message} fault={read.fault} label={t('settingsPanel.mailtool.throughTheOffice.unread')} retry={readAgain} />
  }
  if (read.status === 'not read') {
    return (
      <div className="mts">
        <style href="mole-office-mail-tool-settings" precedence="default">
          {MAIL_TOOL_SETTINGS_CSS}
        </style>
        <p className="mts-said" role="status">
          {t(NOT_READ[read.because])}
        </p>
        <ServerNote text={read.says} />
      </div>
    )
  }
  if (read.status === 'error') {
    return (
      <div className="mts">
        <ErrorNote message={t('settingsPanel.mailtool.tool.noAnswer')} retry={readAgain} />
        <ServerNote text={read.says} />
        {/* WHICH PAGE ASKED, in developer mode (problem cmlTxSP_m1rR): the tool answers only the pages the office serves,
            and its log names them when it starts, so a page it refused can tell whether it is one of them. */}
        {developer ? <p className="mts-said">{t('settingsPanel.mailtool.tool.pageOrigin', { origin: window.location.origin })}</p> : null}
      </div>
    )
  }
  const s = read.value
  const sender = s.sender
  const usable = s.accounts?.usable ?? []
  const unusable = s.accounts?.unusable ?? []
  const waits = busy === null ? undefined : t(WAITS_FOR[busy])
  const pickWaits =
    waits ??
    (choice === ''
      ? t('settingsPanel.mailtool.from.chooseFirst')
      : choice === (sender?.account?.id ?? '')
        ? t('settingsPanel.mailtool.from.alreadyIt')
        : undefined)

  return (
    <div className="mts">
      <style href="mole-office-mail-tool-settings" precedence="default">
        {MAIL_TOOL_SETTINGS_CSS}
      </style>

      {/* WHAT IT READS, AND WHAT IT LAST MAILED. */}
      {s.reading === 'none' ? <p className="mts-said">{t('settingsPanel.mailtool.reading.state.noKey')}</p> : null}
      {s.reading === 'refused' ? <p className="mts-said">{t('settingsPanel.mailtool.reading.state.keyRefused')}</p> : null}
      <ServerNote text={s.details.key} />
      {s.officeAnswers ? null : <p className="mts-said">{t('settingsPanel.mailtool.reading.state.officeSilent')}</p>}
      <ServerNote text={s.details.office} />
      <p className="mts-said">
        {s.lastMailed === null
          ? t('settingsPanel.mailtool.lastMailedNone')
          : t('settingsPanel.mailtool.lastMailed', { title: content(s.lastMailed.title), at: s.lastMailed.at })}
      </p>
      {s.lastSend !== null && s.lastSend.reason !== null ? <p className="mts-said">{t('settingsPanel.mailtool.lastSend.notSentYet')}</p> : null}
      <ServerNote text={s.details.lastSend} />

      {/* WHICH ACCOUNT IT SENDS FROM. */}
      <h4 className="mts-head">{t('settingsPanel.mailtool.from.head')}</h4>
      {s.accounts === null ? <p className="mts-said">{t('settingsState.notRead')}</p> : null}
      <ServerNote text={s.details.accounts} />
      {sender !== null && sender.account !== null ? (
        <p className="mts-said">
          {t('settingsPanel.mailtool.from.one', { address: content(sender.account.address), provider: content(sender.account.provider) })}
        </p>
      ) : null}
      <ServerNote text={s.details.server} />
      {sender !== null && sender.account === null && sender.reason === 'no account' ? (
        <p className="mts-said">{t('settingsPanel.mailtool.from.noAccount')}</p>
      ) : null}
      {sender !== null && sender.account === null && sender.reason === 'pick one' ? (
        <p className="mts-said">{t('settingsPanel.mailtool.from.pickOne', { count: sender.count })}</p>
      ) : null}
      {usable.length > 1 ? (
        <fieldset className="mts-choice" disabled={busy !== null}>
          <legend>{t('settingsPanel.mailtool.from.head')}</legend>
          {usable.map((one) => (
            <label key={one.id}>
              <input type="radio" name="mail-tool-account" value={one.id} checked={choice === one.id} onChange={() => setChoice(one.id)} />
              {t(settingsControlWord('settings.mailtool', 'settingsPanel.mailtool.from.choice'), { address: content(one.address), provider: content(one.provider) })}
            </label>
          ))}
          <Btn onClick={pick} disabled={pickWaits !== undefined} reason={pickWaits}>
            {t(settingsControlWord('settings.mailtool', 'settingsPanel.mailtool.from.pick'))}
          </Btn>
        </fieldset>
      ) : null}
      {picked === false ? <p className="mts-said">{t('settingsPanel.mailtool.from.notPicked')}</p> : null}
      {unusable.length > 0 ? (
        <>
          <p className="mts-said">{t('settingsPanel.mailtool.from.cannot')}</p>
          <ul className="mts-list">
            {unusable.map((one) => (
              <li key={`${one.name}-${one.provider}`}>
                {t('settingsPanel.mailtool.cannot.item', {
                  name: content(one.name),
                  provider: content(one.provider),
                  why: t(WHY_IT_CANNOT[one.reason]),
                })}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* THE LIST OF ADDRESSES, which stays with the tool. */}
      <Field label={t(settingsControlWord('settings.mailtool', 'settingsPanel.mailtool.addresses.label'))}>
        <TextArea
          value={typed ?? ''}
          onChange={(next) => {
            setTyped(next)
            setSaved(null)
          }}
          rows={4}
        />
      </Field>
      <Btn onClick={save} disabled={waits !== undefined} reason={waits}>
        {t(settingsControlWord('settings.mailtool', 'settingsPanel.mailtool.addresses.save'))}
      </Btn>
      {saved === null ? null : (
        <p className="mts-said" role="status">
          {whatSavingDid(saved)}
        </p>
      )}

      {/* A TEST LETTER, to every address on the list. */}
      <h4 className="mts-head">{t('settingsPanel.mailtool.test.head')}</h4>
      <Btn onClick={test} disabled={waits !== undefined} reason={waits}>
        {t(settingsControlWord('settings.mailtool', 'settingsPanel.mailtool.test.send'))}
      </Btn>
      {s.lastTest === null ? null : s.lastTest.outcome === 'empty list' ? (
        <p className="mts-said" role="status">
          {t('settingsPanel.mailtool.test.notSentEmpty')}
        </p>
      ) : s.lastTest.outcome === 'not sent' ? (
        <p className="mts-said" role="status">
          {t(s.lastTest.reason === null ? 'settingsPanel.mailtool.tool.noAnswer' : WHY_NOT_SENT[s.lastTest.reason])}
        </p>
      ) : (
        <div role="status">
          <p className="mts-said">{t('settingsPanel.mailtool.test.at', { at: s.lastTest.at })}</p>
          <ul className="mts-list">
            {s.lastTest.letters.map((one) => (
              <li key={one.to}>{t(A_LETTER[one.outcome], { to: content(one.to) })}</li>
            ))}
          </ul>
        </div>
      )}
      <ServerNote text={s.details.lastTest} />
      {s.details.letters.map((one) => (
        <ServerNote key={one.to} text={`${one.to}: ${one.says}`} />
      ))}

      {fault === null ? null : (
        <>
          <ErrorNote message={t('settingsPanel.mailtool.tool.noAnswer')} />
          <ServerNote text={fault} />
        </>
      )}
      {/* A PRESS THE OFFICE PASSED ON, AND THE TOOL DID NOT CONFIRM: a status, since the change may have been made. */}
      {notConfirmed === null ? null : (
        <>
          <div className="mts-not-confirmed" role="status">
            <p className="mts-said">{t('settingsPanel.mailtool.throughTheOffice.notConfirmed')}</p>
            <p className="mts-said">{t(NOT_READ[notConfirmed.because])}</p>
          </div>
          <ServerNote text={notConfirmed.says} />
        </>
      )}
      {officeRefused === null ? null : (
        <ErrorNote message={officeRefused.message} fault={officeRefused.fault} label={t('settingsPanel.mailtool.throughTheOffice.notConfirmed')} />
      )}
    </div>
  )
}

/** The component's own rules. Every value is a token, and there is no backtick anywhere in here. */
const MAIL_TOOL_SETTINGS_CSS = `
.mts { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); min-width: 0; width: 100%; }
.mts-head { margin: var(--pad) 0 0; font: 600 var(--fs-1)/var(--lh-read) var(--font-ui); color: var(--text); }
.mts-said { margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mts-not-confirmed { display: flex; flex-direction: column; gap: var(--pad); }
.mts-list { margin: 0; padding-left: var(--pad-lg); max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mts-choice { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); margin: 0; padding: 0; border: 0; min-width: 0; }
.mts-choice > legend { padding: 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); color: var(--text-2); }
.mts-choice > label { display: flex; align-items: baseline; gap: var(--pad); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mts .px-field { width: 100%; max-width: var(--measure-in-box); }
`
