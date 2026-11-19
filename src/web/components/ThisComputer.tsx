// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR FACTS ABOUT THIS INSTALLATION A PERSON NEEDS, ON THE PAGE THEY ALREADY OPENED, AND ONE
 * SETTING OF THE MESSAGE DOOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE
 * ---------------------------------------------------------------------------------------
 *
 * A decision, the middle rung of proposal `Kyze9wsagppk`: the Settings page gets the person's
 * settings and this machine's, and the second of those is *read-only*. In the
 * proposal's own words, they do not need to change the database file from a settings page; they need
 * not to be told something false about their own installation. The Runtime page has drawn all of this
 * since it was built, and nothing on the Settings page said the Runtime page existed.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READING, DRAWN TWICE, AND THAT IS NOT THE DEFECT CLAUDE.MD NAMES
 * ---------------------------------------------------------------------------------------
 *
 * Every value here comes from `GET /api/runtime`, which is the one place these facts are worked
 * out; this panel and the Runtime page are two views of one reading, and neither computes anything.
 * The defect is the same fact WORKED OUT twice, and the test for it is whether changing one can
 * leave the other wrong with nothing failing. Change the runtime record and both move together.
 *
 * WHAT IS NOT COPIED HERE. The Runtime page holds fifty-odd facts — ports, the commit, who started
 * the process, what it is listening on, how fresh the code is. Four are on this panel because four
 * are what a person opening Settings is asking about; the rest are one press away and the press
 * says so. A fifth line is one setting: whether the message door refuses a message to an agent
 * that is offline or inactive. Normal mode shows the same line in its own panel, `MessageDoorPanel`
 * below, because the refusal sentence sends the person there.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROJECT IS THIS BROWSER'S, AND IT IS THE ONLY VALUE HERE THAT IS NOT THE SERVER'S
 * ---------------------------------------------------------------------------------------
 *
 * Which project you are in is a fact about this browser, kept where the picker in the rail keeps
 * it, and it is read from that same store rather than copied. The row is drawn because "which
 * project" is one of the questions the decision names, and because a person reading three facts
 * about the server would otherwise have to work out whether the fourth was one too.
 */
import { settingsControlWord } from '@shared/settings-declaration.ts'
import type React from 'react'
import { useSyncExternalStore } from 'react'
import { content, t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
// THE ONE MACHINE READING FOR THE PAGE, shared with the wrong-world check and the Runtime page.
// This panel draws it and never asks the door for itself; the read time it draws is the server's
// own `readAt`, so a reader can tell a fresh reading from an old one. Problem XKsVmmINput5.
import { useTheMachineState } from '../lib/onemachine.ts'
import { Absence, Loading, Panel } from './ui.tsx'
import { pathFor, RouteLink } from './router.tsx'
import { SETTINGS_NARROW } from './SettingsFolds.tsx'

/** Every word this panel draws, in one place, so a screen and a test read the same words. */
export const THIS_COMPUTER_WORDS = {
  get title(): string { return t('settingsPanel.title.thiscomputer') },
  /** The four labels, each a question a person arrives with, in a person's words. */
  get database(): string { return t('settingsPanel.computer.database') },
  get checkout(): string { return t('settingsPanel.computer.checkout') },
  get project(): string { return t('settingsPanel.computer.project') },
  get address(): string { return t('settingsPanel.computer.address') },
  /** The plain name of the setting that refuses a message to an agent that is offline or inactive. The
      server's refusal sentence reads the same word key in English, so both name it the same way. */
  get refuseUnanswered(): string { return t('settingsPanel.computer.refuseUnanswered') },
  /** What the press at the foot of the panel opens, said as what is there rather than as a name. */
  get more(): string { return t(settingsControlWord('settings.thiscomputer', 'settingsPanel.computer.more')) },
}

export function ThisComputerPanel() {
  useLanguage()
  const machine = useTheMachineState()
  const reading = machine.value
  // THE PICKER'S OWN STORE, so the row and the rail cannot say different projects.
  const project = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.thiscomputer' }} title={THIS_COMPUTER_WORDS.title}>
      <style href="mole-office-this-computer" precedence="default">
        {THIS_COMPUTER_CSS}
      </style>
      {reading === null && !machine.settled ? <Loading what={t('settingsPanel.computer.what')} rows={3} /> : null}
      {reading === null && machine.failed !== null ? (
        <p className="tcp-fault" role="status">
          {machine.failed.message}
        </p>
      ) : null}
      {reading === null ? null : (
        <>
          <dl className="tcp">
            <Fact label={THIS_COMPUTER_WORDS.database} value={content(reading.database.path)} mono />
            <Fact label={THIS_COMPUTER_WORDS.checkout} value={content(reading.repository.path)} mono />
            <Fact label={THIS_COMPUTER_WORDS.project} value={content(project)} />
            <Fact
              label={THIS_COMPUTER_WORDS.address}
              value={content(reading.addresses.forOtherMachines?.web ?? null)}
              absent={<Absence tier="ordinary" word={t('settingsPanel.computer.addressNone')} />}
              mono
            />
            {/* THE SETTING THAT REFUSES A MESSAGE TO AN OFFLINE OR INACTIVE AGENT, read-only. Answer 8
                of 2 October 2026. The same line the normal-mode panel below draws. */}
            <MessageDoorLine door={reading.messageDoor} />
          </dl>
          {/* WHEN THIS READING WAS TAKEN, in the server's own words. It is the one shared reading,
              read again only when the server says something it shows changed, so a reader has to be
              able to tell a fresh answer from an old one. Criterion U7: the door's answer says when it was read. */}
          <p className="tcp-read">
            <span className="tcp-read-key">{t('settingsPanel.computer.readAt')}</span> {content(reading.readAt)}
          </p>
        </>
      )}
      {/* WHERE THE REST IS. It is a press and not a rail row, for the reason the component sheet's
          press on this page is one: the Runtime page is a thing a person opens when they have a
          question, not a place they navigate to. */}
      <RouteLink to={pathFor('runtime')} className="tcp-more">
        {THIS_COMPUTER_WORDS.more}
      </RouteLink>
    </Panel>
  )
}

/**
 * THE ONE LINE FOR THE SETTING THAT REFUSES A MESSAGE TO AN OFFLINE OR INACTIVE AGENT, read-only.
 *
 * Drawn by this panel for a developer and by `MessageDoorPanel` in normal mode, so the two places cannot draw it two
 * ways. It is set in the office's .env file. The variable's name is the line's hover text, and the refusal sentence
 * (`theCannotReceiveLine` in src/shared/cannot-receive.ts) names the line by its label.
 */
function MessageDoorLine({ door }: { door: { variable: string; state: 'on' | 'off' | 'not set' } }) {
  return <Fact label={THIS_COMPUTER_WORDS.refuseUnanswered} value={STATE_WORD[door.state]()} setting={door.variable} />
}

/**
 * THE SAME SETTING IN NORMAL MODE, in the Chat and messages category (w13n round 32, the secretary's choice A in
 * message 4TXyQKeEyRTI). The refusal sentence a person reads in the picker sends them here, so a person who is not in
 * developer mode can find the setting it names. It reads the one machine reading this panel reads.
 */
export function MessageDoorPanel() {
  useLanguage()
  const machine = useTheMachineState()
  const reading = machine.value
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.messagedoor' }} title={t('settingsPanel.title.messagedoor')}>
      <style href="mole-office-this-computer" precedence="default">
        {THIS_COMPUTER_CSS}
      </style>
      {reading === null && !machine.settled ? <Loading what={t('settingsPanel.messageDoor.what')} rows={1} /> : null}
      {reading === null && machine.failed !== null ? (
        <p className="tcp-fault" role="status">
          {machine.failed.message}
        </p>
      ) : null}
      {reading === null ? null : (
        <dl className="tcp">
          <MessageDoorLine door={reading.messageDoor} />
        </dl>
      )}
      <p className="tcp-read">{t('settingsPanel.messageDoor.meaning')}</p>
    </Panel>
  )
}

/**
 * HOW LONG A PERSON'S MESSAGE HANDED TO AN AGENT MAY GO WITHOUT A REPLY before the agent is reminded once, read-only
 * (wave 13y round 11). It is set in the office's .env file as MOLE_OFFICE_REPLY_REMINDER_MINUTES, the variable is the
 * line's hover text, and the minutes are the ones src/server/lib/reply-reminder.ts reads. It reads the one machine
 * reading the panel above reads.
 */
export function ReplyReminderPanel() {
  useLanguage()
  const machine = useTheMachineState()
  const reading = machine.value
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.replyreminder' }} title={t('settingsPanel.title.replyreminder')}>
      <style href="mole-office-this-computer" precedence="default">
        {THIS_COMPUTER_CSS}
      </style>
      {reading === null && !machine.settled ? <Loading what={t('settingsPanel.replyReminder.what')} rows={1} /> : null}
      {reading === null && machine.failed !== null ? (
        <p className="tcp-fault" role="status">
          {machine.failed.message}
        </p>
      ) : null}
      {reading === null ? null : reading.replyReminder.minutes === null ? (
        <p className="tcp-fault" role="status">
          {reading.replyReminder.problem}
        </p>
      ) : (
        <dl className="tcp">
          <Fact label={t('settingsPanel.replyReminder.label')} value={replyReminderWords(reading.replyReminder.minutes, reading.replyReminder.set)} setting={reading.replyReminder.variable} />
        </dl>
      )}
      <p className="tcp-read">{t('settingsPanel.replyReminder.meaning')}</p>
    </Panel>
  )
}

/** The minutes in words, saying so when nobody set them and they are the built-in value. */
function replyReminderWords(minutes: number, set: boolean): string {
  const said = t('settingsPanel.replyReminder.minutes', { n: minutes })
  return set ? said : t('settingsPanel.replyReminder.builtIn', { minutes: said })
}

/** What each state of the setting reads as, in the page language. Not set reads as off, and says so. */
const STATE_WORD: Record<'on' | 'off' | 'not set', () => string> = {
  on: () => t('settingsPanel.computer.refuseUnanswered.on'),
  off: () => t('settingsPanel.computer.refuseUnanswered.off'),
  'not set': () => t('settingsPanel.computer.refuseUnanswered.notSet'),
}

/**
 * One labelled fact.
 *
 * A NULL VALUE IS DRAWN AS THE SENTENCE ITS CALLER GIVES, never as an empty row. Only the address
 * can be missing here and its absence has a meaning — nothing is served to another machine — which
 * is a reading rather than a gap, so it takes the ordinary absence mark and its own words.
 */
function Fact({
  label,
  value,
  absent,
  mono,
  setting,
}: {
  label: string
  value: string | null
  /** What to draw instead when there is no value. The caller builds it, so the words it says sit
      inside the `Absence` that draws them -- which is what tests/absence-weight.test.ts asks. */
  absent?: React.ReactNode
  mono?: boolean
  /** The variable a setting's line shows. It is the line's hover text, and marks the line. */
  setting?: string
}) {
  useLanguage()
  return (
    <div className="tcp-pair" title={setting} data-setting={setting}>
      <dt className="tcp-key">{label}</dt>
      <dd className={mono === true && value !== null ? 'tcp-val tcp-mono' : 'tcp-val'}>
        {value ?? absent ?? <Absence tier="ordinary" word={t('settingsPanel.computer.notRecorded')} />}
      </dd>
    </div>
  )
}

const THIS_COMPUTER_CSS = `
.tcp { margin: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.tcp-pair { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad) var(--gut); min-width: 0; }
.tcp-key { flex: 0 1 auto; min-width: min(14rem, 100%); margin: 0; font-size: var(--fs-2); color: var(--text-2); text-wrap: pretty; }
.tcp-val { margin: 0; font-size: var(--fs-3); color: var(--text); overflow-wrap: anywhere; min-width: 0; }
.tcp-mono { font-family: var(--font-mono); font-size: var(--fs-1); }
.tcp-read { margin: var(--pad) 0 0; font-size: var(--fs-1); color: var(--text-2); }
.tcp-read-key {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-right: 4px;
}
.tcp-more {
  align-self: flex-start;
  margin-top: var(--pad);
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
  text-decoration: none;
}
.tcp-more:hover { background: var(--hover); }
.tcp-fault {
  margin: 0; font-size: var(--fs-1); color: var(--st-failed);
  background: var(--st-failed-row); border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm); padding: 4px var(--pad); font-weight: var(--st-failed-weight);
}
${SETTINGS_NARROW} {
  .tcp-key { min-width: 0; flex: 1 1 100%; }
}
`
