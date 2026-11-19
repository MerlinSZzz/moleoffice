// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESSES THAT INSTALL THE MAIL TOOL AND TURN IT OFF, AND THE TOOL'S OWN SETTINGS. The summons mail is a tool of
 * the person's own login (tools/mail-the-summonses.mjs), which their press here gives its personal tool key and
 * installs as a service that starts now and at each login. A press turns it off without
 * uninstalling it, and its settings fold open here, in its entry in the Tools category, with no page and no window of
 * its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * What the presses do, behind a fold, because they make the person's tool key and start and stop a service; the tool as it
 * stands; the presses; what a press did; and, while the tool runs, its own settings (MailToolSettings), which ask the
 * tool itself on this computer. Where it answers and its secret come from their own door's answer and are kept nowhere
 * else.
 *
 * ON ANOTHER DEVICE the tool cannot be reached, and the install presses act on the office's computer, so neither is
 * drawn. The panel says where the tool runs and draws its settings read through the office, with their own presses,
 * which the office passes on to the tool.
 *
 * EVERY WORD IS FROM THE WORD LISTS, IN THEIR LANGUAGE. The tool's state and what the press did are drawn from the reply's
 * fields, not from the server's sentence, because the panel is drawn in normal mode, where every word on Settings is
 * the lists'. The server's own sentence, which names what was
 * written and where, is drawn as well in developer mode, marked as English.
 *
 * AN AGENT THE PERSON'S GRANT DOES NOT CARRY HERE IS REFUSED BY THE DOOR, and this shows the refusal: it does not work
 * out a second answer about who may press.
 *
 * THE TOOL'S PAGE SAYS WHERE IT IS A MOMENT AFTER THE TOOL STARTS (problem SceBCWXSdyV2). The tool writes where its page
 * is once it listens, some milliseconds after systemd starts it. On 28 September 2026 the one read after their press came
 * 20 ms before that: the panel said the page had not said where it was, drew no link, did not read again, and they took
 * the install for stuck. So while the tool runs and its page has not said where it is, the panel looks again, a
 * bounded number of times.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useEffect, useRef, useState } from 'react'

import type { TheMailTool, TheMailToolDisabled, TheMailToolInstalled } from '@shared/summons.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { onTheToolsComputer, whereTheToolIs } from '../lib/the-mail-tool.ts'
import { MailToolSettings } from './MailToolSettings.tsx'
import { Btn, drawnDay, drawnDayWithTime, ErrorNote, Explain, Loading, parseStamp, useAsync } from './ui.tsx'

/**
 * HOW OFTEN AND HOW MANY TIMES THE PANEL LOOKS AGAIN FOR THE TOOL'S PAGE: every quarter of a second, twenty times, so
 * five seconds, where a start takes some milliseconds. A page that has not said where it is by then is not waited for:
 * the words stay the same, and opening Settings again reads it afresh.
 */
export const LOOK_FOR_THE_PAGE_EVERY_MS = 250
export const LOOK_FOR_THE_PAGE_AT_MOST = 20

/** The refusal title of the press that failed, so two presses that fail say different things. */
type TheFailedPress =
  | 'settingsPanel.mailtool.install.failed'
  | 'settingsPanel.mailtool.disable.failed'
  | 'settingsPanel.mailtool.key.takeBack.failed'

export function InstallTheMailTool() {
  useLanguage()
  return onTheToolsComputer() ? <OnTheToolsComputer /> : <FromAnotherDevice />
}

/** On another device: where the tool runs, and its settings as the office reads and changes them for them. */
function FromAnotherDevice() {
  return (
    <div className="imt-stack">
      <style href="mole-office-install-the-mail-tool" precedence="default">
        {INSTALL_THE_MAIL_TOOL_CSS}
      </style>
      <p className="imt-said">{t('settingsPanel.mailtool.throughTheOffice.lead')}</p>
      <MailToolSettings throughTheOffice />
    </div>
  )
}

function OnTheToolsComputer() {
  const developer = useInspect()
  // IT ASKS FOR THE REFRESHING FLAG, because the look below waits for a re-read to finish (ui.tsx, useAsync).
  const [state, readAgain] = useAsync(() => api.theMailTool(), [], { saysRefreshing: true })
  // WHICH PRESS IS RUNNING, so a press that waits says for which.
  const [busy, setBusy] = useState<null | 'install' | 'disable' | 'take-back'>(null)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf>; title: TheFailedPress } | null>(null)
  const [said, setSaid] = useState<TheMailToolInstalled | null>(null)
  const [keyTakenBack, setKeyTakenBack] = useState(false)
  const [turnedOff, setTurnedOff] = useState<TheMailToolDisabled | null>(null)

  // LOOK AGAIN WHILE THE TOOL RUNS AND ITS PAGE HAS NOT SAID WHERE IT IS (problem SceBCWXSdyV2). Each answer schedules
  // the next look and a look in flight schedules none, so there is one at a time. The press starts the count again,
  // because it may have just started the tool.
  const looked = useRef(0)
  const waitingForThePage =
    state.status === 'ready' && state.refreshing !== true && theWordFor(state.value) === 'settingsPanel.mailtool.state.noPageYet'
  useEffect(() => {
    if (!waitingForThePage || looked.current >= LOOK_FOR_THE_PAGE_AT_MOST) return undefined
    const timer = setTimeout(() => {
      looked.current += 1
      readAgain()
    }, LOOK_FOR_THE_PAGE_EVERY_MS)
    return () => clearTimeout(timer)
  }, [waitingForThePage, state, readAgain])

  const press = (): void => {
    looked.current = 0
    setFault(null)
    setKeyTakenBack(false)
    setTurnedOff(null)
    setBusy('install')
    void api
      .installTheMailTool()
      .then((answer) => {
        setBusy(null)
        setSaid(answer)
        readAgain()
      })
      .catch((err: unknown) => {
        setBusy(null)
        setFault({ message: errorMessage(err), fault: faultOf(err), title: 'settingsPanel.mailtool.install.failed' })
      })
  }

  // THEIR PRESS THAT TURNS IT OFF: it stops now and does not start at their login, and stays
  // installed, so the install press turns it back on.
  const turnOff = (): void => {
    setFault(null)
    setSaid(null)
    setBusy('disable')
    void api
      .disableTheMailTool()
      .then((answer) => {
        setBusy(null)
        setTurnedOff(answer)
        readAgain()
      })
      .catch((err: unknown) => {
        setBusy(null)
        setFault({ message: errorMessage(err), fault: faultOf(err), title: 'settingsPanel.mailtool.disable.failed' })
      })
  }

  // Their key is theirs to take back here, without stopping the tool or moving its place. Their next
  // install gives it a new one. A decision is changed. Two decisions and
  // H-forI_Vk5H7 change it.
  const takeBack = (): void => {
    setFault(null)
    setSaid(null)
    setTurnedOff(null)
    setBusy('take-back')
    void api.takeBackTheMailToolsKey().then(() => {
      setBusy(null)
      setKeyTakenBack(true)
      readAgain()
    }).catch((err: unknown) => {
      setBusy(null)
      setFault({ message: errorMessage(err), fault: faultOf(err), title: 'settingsPanel.mailtool.key.takeBack.failed' })
    })
  }

  const tool = state.status === 'ready' ? state.value : null
  const where = tool !== null && tool.running === true ? whereTheToolIs(tool.page) : null
  const madeOn = tool?.key == null ? null : parseStamp(tool.key.madeAt)

  return (
    <div className="imt-stack">
      <style href="mole-office-install-the-mail-tool" precedence="default">
        {INSTALL_THE_MAIL_TOOL_CSS}
      </style>
      {/* WHAT THE PRESS DOES, BEHIND A FOLD: the panel itself is the tool's state, the press and the way to its page, and
          the words about it are there for whoever opens them (docs/UX-CONTRACT.md 8.10). */}
      <Explain declares={{ surface: null }} meaning={t('settingsPanel.mailtool.meaning')} opens={t('settingsPanel.mailtool.opens')}>
        <p className="imt-what">{t('settingsPanel.mailtool.what')}</p>
      </Explain>
      {state.status === 'loading' ? (
        <Loading what={t('settingsPanel.mailtool.loading')} />
      ) : state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault ?? null} label={t('settingsPanel.mailtool.unread')} />
      ) : (
        <p className="imt-said">{t(theWordFor(state.value))}</p>
      )}
      {tool?.key == null ? null : (
        <p className="imt-said imt-key">{t('settingsPanel.mailtool.key', {
          made: madeOn === null ? tool.key.madeAt : drawnDay(madeOn),
          used: tool.key.lastUsedAt === null ? t('settingsPanel.mailtool.key.noUseRecorded') : drawnDayWithTime(tool.key.lastUsedAt),
        })}</p>
      )}
      <div className="imt-presses">
        <Btn onClick={press} disabled={busy !== null} reason={busyWords(busy)}>
          {t(settingsControlWord('settings.mailtool', 'settingsPanel.mailtool.install'))}
        </Btn>
        {tool !== null && tool.unit === 'installed' ? (
          <Btn onClick={turnOff} disabled={busy !== null} reason={busyWords(busy)}>
            {t(settingsControlWord('settings.mailtool', 'settingsPanel.mailtool.disable'))}
          </Btn>
        ) : null}
        {tool?.key == null ? null : (
          <Btn onClick={takeBack} disabled={busy !== null} reason={busyWords(busy)}>
            {t(settingsControlWord('settings.mailtool', 'settingsPanel.mailtool.key.takeBack'))}
          </Btn>
        )}
      </div>
      {keyTakenBack ? <p className="imt-said">{t('settingsPanel.mailtool.key.takenBack')}</p> : null}
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} label={t(fault.title)} />}
      {said === null ? null : <p className="imt-said">{t(whatThePressDid(said))}</p>}
      {said !== null && developer ? (
        <p className="imt-said" lang="en">
          {said.says}
        </p>
      ) : null}
      {turnedOff === null ? null : (
        <p className="imt-said">
          {t(turnedOff.service === 'turned off' ? 'settingsPanel.mailtool.done.turnedOff' : 'settingsPanel.mailtool.done.alreadyOff')}
        </p>
      )}
      {turnedOff !== null && developer ? (
        <p className="imt-said" lang="en">
          {turnedOff.says}
        </p>
      ) : null}
      {where === null ? null : <MailToolSettings where={where} />}
    </div>
  )
}

/** The tool as it stands, in the words of the lists: the same order of questions the server's own sentence asks. */
export function theWordFor(tool: TheMailTool): WordKey {
  if (tool.unit === 'not the press’s') return 'settingsPanel.mailtool.state.notOurs'
  if (tool.unit === 'not installed') return 'settingsPanel.mailtool.state.notInstalled'
  // TURNED OFF BY THEIR PRESS: stopped, and not started at their login.
  if (tool.enabled === false && tool.running !== true) return 'settingsPanel.mailtool.state.off'
  if (tool.keyWorks !== true) return 'settingsPanel.mailtool.state.keyBroken'
  if (tool.running !== true) return 'settingsPanel.mailtool.state.stopped'
  return tool.page === null ? 'settingsPanel.mailtool.state.noPageYet' : 'settingsPanel.mailtool.state.running'
}

/** Which press is running, in the words of the lists: a press waits while the other runs, and says why. */
function busyWords(busy: null | 'install' | 'disable' | 'take-back'): string | undefined {
  if (busy === null) return undefined
  return t(busy === 'install' ? 'settingsPanel.mailtool.installing' : busy === 'disable' ? 'settingsPanel.mailtool.disabling' : 'settingsPanel.mailtool.key.takingBack')
}

/** What their press did, in the words of the lists. */
function whatThePressDid(done: TheMailToolInstalled): WordKey {
  if (done.keyMade) return 'settingsPanel.mailtool.done.installed'
  if (done.service === 'started') return 'settingsPanel.mailtool.done.started'
  return done.service === 'restarted' ? 'settingsPanel.mailtool.done.restarted' : 'settingsPanel.mailtool.done.nothing'
}

/** The component's own rules. Every value is a token, and there is no backtick anywhere in here. */
const INSTALL_THE_MAIL_TOOL_CSS = `
.imt-stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); min-width: 0; }
.imt-what {
  margin: 0;
  max-width: var(--measure-in-box);
  color: var(--text-2);
  font: var(--fs-1)/var(--lh-read) var(--font-ui);
}
.imt-said {
  margin: 0;
  max-width: var(--measure-in-box);
  color: var(--text);
  font: var(--fs-1)/var(--lh-read) var(--font-ui);
  overflow-wrap: anywhere;
}
.imt-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
`
