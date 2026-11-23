// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REMOTE ACCESS PANEL, AND IT IS DRAWN SAYING NO BEFORE IT CAN EVER SAY YES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PERSON READS HERE
 * ---------------------------------------------------------------------------------------
 *
 * Four facts: whether other computers can open this Mole Office, the address they open it at, which
 * computers have actually called, and where the decision about who may reach that address is made.
 * On an installation that has set no address the answers are *off*, *only this computer* and *none
 * yet*, which is the state every installation but the owner's is in.
 *
 * ---------------------------------------------------------------------------------------
 * IT USED TO SAY OFF WHILE TWO COMPUTERS WERE USING IT
 * ---------------------------------------------------------------------------------------
 *
 * Problem `XLES-b1vFBla`. The reading behind this panel knew about one of the two ways another
 * machine reaches Mole Office, so on the owner's own machine — where the other way is the one they set
 * up — it drew *Off*, *Only this computer* and *none yet* in the same minute the Runtime page named
 * their address and listed two machines with 2,414 requests between them. Nothing on the panel was
 * wrong to draw; everything it was given was false. It is given the Runtime page's own readings now.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY REACH THE ADDRESS IS NOT MOLE OFFICE'S DECISION, AND THE PANEL SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * A decision took the third option of proposal `cCbP6Lqb2WFW`: no list of trusted machines in
 * Mole Office until Mole Office has its own tokens. A second list of
 * trusted machines could disagree with the real one, and the real one is the private network's. So
 * the panel names Tailscale as the place that decision is made, in one sentence, and offers no
 * control that pretends otherwise.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT SHIPS BEFORE THE FEATURE
 * ---------------------------------------------------------------------------------------
 *
 * A panel first drawn on the day a feature arrives has never been seen saying no. *Off* is not the
 * edge case here — it is the state every installation is in and stays in unless somebody
 * deliberately changes it, so it is the state worth getting right first. Wave 15 turns the listener
 * on and this panel starts reading what is actually there; nothing about the drawing changes.
 *
 * ---------------------------------------------------------------------------------------
 * NO NETWORKING WORDS IN NORMAL MODE, AND THAT IS A RULE RATHER THAN A PREFERENCE
 * ---------------------------------------------------------------------------------------
 *
 * `bind`, `loopback`, `127.0.0.1`, `port`, `listener`, `tailnet` and `proxy` are all names of the
 * mechanism. In Normal mode this panel says *Only this computer can open Mole Office* and *No other
 * computer has opened this Mole Office*. The arrival address and the refused acts are in Developer
 * mode, where a reader has asked for the machinery — the same rule the Repositories panel beside it
 * follows.
 *
 * TWO WORDS ARE ON THE PANEL IN NORMAL MODE AND NEITHER BREAKS THAT RULE. *Tailscale* is the name
 * of a program the owner installed and opens; it is where they go to change who may reach this
 * computer, so leaving it out would be hiding the answer rather than simplifying it. The address is
 * the thing a person types into another computer's address bar. Neither is the name of a mechanism
 * this product implements; `tailnet`, which is, stays out.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER GUESSES, AND THE TWO KINDS OF NOTHING ARE DRAWN DIFFERENTLY
 * ---------------------------------------------------------------------------------------
 *
 * `machines` empty means *no other computer has been seen*. `refused` being null means *nobody has
 * looked*, which is what it is while nothing has ever been refused. The reply carries both shapes
 * on purpose and this panel draws them as different sentences, because the fifth engineering
 * invariant is that *nothing is there* and *nobody has looked* are different answers.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAVE 15 CHANGED HERE, AND WHAT IT DELIBERATELY DID NOT
 * ---------------------------------------------------------------------------------------
 *
 * The reading behind this panel now joins the guard registry, so *what another computer cannot do*
 * is the whole list rather than the half the route table could supply on its own — and the panel
 * stopped drawing the line that said the list was short, because it is not short any more. Each act
 * is drawn in a person's words with the reason under it, rather than as an operation key.
 *
 * WHAT DID NOT CHANGE: the drawing. Off is still the ordinary state, still takes body ink and a
 * word rather than a colour, and the Normal half still has no networking word in it. A panel that
 * had to be redrawn the day the feature arrived would be a panel that had never really said no.
 */
import type { ReactNode } from 'react'

import type { AccessReply } from '../../server/lib/access.ts'
import type { RefusedAct } from '../../shared/authority.ts'
import { content, t } from '@shared/i18n.ts'
import { en } from '@shared/words/en.ts'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { AddressForBrowsers } from './AddressForBrowsers.tsx'
import { Absence, Loading, Panel, useAsync } from './ui.tsx'

/**
 * WHERE TRUST IS ARRANGED, AND MOLE OFFICE IS NOT IN IT.
 *
 * Mole Office decides what a caller may DO once it arrives; whether it may arrive at all is the
 * private network's decision, and the owner makes it in Tailscale. Saying
 * so is the whole of what this panel can honestly offer until Mole Office has tokens of its own —
 * problem 18's second part — and a control here would be a second list of trusted machines free
 * to disagree with the real one.
 *
 * IT IS A VALUE UNDER A LABEL AND NOT A SENTENCE ABOUT ONE. "Where you decide who may reach it"
 * asks the question and this answers it, which is the shape every other row on this panel has.
 * A sentence here would be `docs/UX-CONTRACT.md` §8.10 broken — a screen explained rather than
 * drawn.
 *
 * It is exported so the test reads the words the panel draws rather than a copy of them.
 */
export const TRUST_IS_ARRANGED_IN_TAILSCALE = en['settingsPanel.access.trustIn']

/** Whether remote access is on, in a reader's words. One word per state, and no jargon in any. */
const ON_OR_OFF = {
  off: 'settingsPanel.access.state.off',
  listening: 'settingsPanel.access.state.listening',
  development: 'settingsPanel.access.state.development',
  unknown: 'settingsPanel.access.state.unknown',
} as const

/**
 * WHAT OPENS BEHIND THE STATE, or null when the state word already says everything.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A FOLD AND NOT A LINE UNDER THE VALUE
 * ---------------------------------------------------------------------------------------
 *
 * `development` is the state a reader would otherwise misread, and it is not an edge case: it is
 * what `npm run dev` is, which is how Mole Office is usually run. Three facts hold at once — the setting
 * is on, Mole Office is listening, and another computer still cannot open it — and the third is the one
 * that surprises somebody.
 *
 * The first version of this drew all of that as a second line under the value. The sentence gate,
 * a test deleted on 12 November 2026, caught it, and was right: `docs/UX-CONTRACT.md` says a fix
 * that amounts to *add a sentence explaining it* is a failed fix. So the state word is the answer,
 * and the reason is behind a fold that names what it opens. A person who wants it presses once; a
 * person who does not reads three words. Contract 8.10.2 is what allows a fold's body to hold prose.
 *
 * NO NETWORKING WORD IN IT. "Comes from a different program" is what is actually happening and a
 * person can act on it; "the Vite dev server is not bound to the tailnet" is the same fact in words
 * nobody outside this repository can use.
 */
export function RemoteAccessPanel() {
  const reading = useAsync(() => api.access(), [])[0]
  const developer = useInspect()
  useLanguage()

  if (reading.status === 'loading') return <Loading label={t('settingsPanel.title.access')} rows={3} />
  if (reading.status === 'error') {
    return (
      <Panel titleIs="label" declares={{ surface: 'settings.access' }} title={t('settingsPanel.title.access')}>
        <p className="rax-fault" role="status">
          {reading.message}
        </p>
      </Panel>
    )
  }
  return (
    <AccessRead reply={reading.value} developer={developer}>
      <AddressForBrowsers />
    </AccessRead>
  )
}

export function AccessRead({ reply, developer, children }: { reply: AccessReply; developer: boolean; children?: ReactNode }) {
  useLanguage()
  const { machine, caller } = reply
  const on = t(Object.hasOwn(ON_OR_OFF, machine.remoteAccess) ? ON_OR_OFF[machine.remoteAccess] : ON_OR_OFF.unknown)

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.access' }} title={t('settingsPanel.title.access')}>
      <style href="mole-office-remote-access" precedence="default">
        {ACCESS_CSS}
      </style>
      <dl className="rax">
        <div className="rax-pair">
          <dt className="rax-key">{t('settingsPanel.access.canOpen')}</dt>
          <dd className="rax-val" data-on={machine.remoteAccess === 'listening' ? 'yes' : 'no'}>
            {on}
          </dd>
        </div>
        <div className="rax-pair">
          <dt className="rax-key">{t('settingsPanel.access.whoCanReach')}</dt>
          <dd className="rax-val">
            {machine.answersOn === 'this machine only'
              ? t('settingsPanel.access.onlyThisComputer')
              : (content(machine.networkName) ?? t('settingsPanel.access.oneNetwork'))}
          </dd>
        </div>
        {/* THE ADDRESS, WHICH IS THE ONE THING A PERSON HAS TO TYPE. It is not machinery: it is
            what they put in the address bar of the other computer. It is drawn only when there is
            one, because a row saying "no address" under a panel already saying Off is the same
            answer twice. */}
        {machine.addressForOtherMachines === null ? null : (
          <div className="rax-pair">
            <dt className="rax-key">{t('settingsPanel.access.address')}</dt>
            <dd className="rax-val rax-mono">{content(machine.addressForOtherMachines)}</dd>
          </div>
        )}
        <div className="rax-pair">
          <dt className="rax-key">{t('settingsPanel.access.openedIt')}</dt>
          <dd className="rax-val">
            {machine.machines.length === 0 ? (
              <Absence tier="ordinary" word={t('settingsPanel.access.noneYet')} />
            ) : (
              <MachinesSeen machines={machine.machines} />
            )}
          </dd>
        </div>
        {/* WHERE THE DECISION IS MADE, AND IT IS NOT MADE HERE. The
            sentence is drawn whether the answer is on or off, because a person who has not set this
            up needs the same answer as one who has: it is arranged in Tailscale. */}
        <div className="rax-pair">
          <dt className="rax-key">{t('settingsPanel.access.whereDecide')}</dt>
          <dd className="rax-val">{t('settingsPanel.access.trustIn')}</dd>
        </div>
        <div className="rax-pair">
          <dt className="rax-key">{t('settingsPanel.access.projects')}</dt>
          {/* STATED RATHER THAN STORED, in remote-access.md 6.6's own words, so the owner can read
              it instead of it being a default nobody wrote down. A stored value that can only hold
              one thing is the same fact in two places with nothing making them agree. */}
          <dd className="rax-val">{machine.everyProject ? t('settingsPanel.access.everyProject') : t('settingsPanel.access.someProjects')}</dd>
        </div>
      </dl>

      {developer ? (
        <div className="rax-dev">
          <p className="rax-devhead">{t('settingsPanel.access.machinery')}</p>
          <dl className="rax">
            <div className="rax-pair">
              <dt className="rax-key">{t('settingsPanel.access.arrivedAt')}</dt>
              <dd className="rax-val rax-mono">
                {content(machine.hostAndPort) ?? (
                  <Absence tier="ordinary" word={t('settingsPanel.access.noAddress')} />
                )}
              </dd>
            </div>
            <div className="rax-pair">
              <dt className="rax-key">{t('settingsPanel.access.cameFrom')}</dt>
              <dd className="rax-val">
                {caller.from === 'another machine' ? t('settingsPanel.access.from.anotherMachine') : t('settingsPanel.access.from.thisMachine')}
              </dd>
            </div>
            <div className="rax-pair">
              <dt className="rax-key">{t('settingsPanel.access.refusedActs')}</dt>
              <dd className="rax-val">
                {caller.refusedHere.length === 0 ? (
                  <Absence tier="ordinary" word={t('settingsPanel.access.nothingFromHere')} />
                ) : (
                  <RefusedList acts={caller.refusedHere} />
                )}
              </dd>
            </div>
            <div className="rax-pair">
              <dt className="rax-key">{t('settingsPanel.access.refusalsRecorded')}</dt>
              <dd className="rax-val">
                {machine.refused === null ? (
                  <Absence tier="ordinary" word={t('settingsPanel.access.nobodyLooked')} />
                ) : (
                  machine.refused.map((one) => `${one.reason} ${one.count}`).join(', ')
                )}
              </dd>
            </div>
            {caller.governanceHalfJoined ? null : (
              <div className="rax-pair">
                <dt className="rax-key">{t('settingsPanel.access.shortList')}</dt>
                <dd className="rax-val">
                  {/* Kept, and it draws nothing today. The field says the acts reserved to the
                      person are joined in; a reader who has to know whether a short list is short
                      cannot learn that from the list, and this is where they would find out if the
                      join were ever taken apart again. */}
                  {t('settingsPanel.access.shortListSays')}
                </dd>
              </div>
            )}
          </dl>
        </div>
      ) : null}
      {children}
    </Panel>
  )
}

/**
 * WHAT ANOTHER COMPUTER CANNOT DO, ONE ACT PER ROW, IN WORDS AND THEN IN MACHINERY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ROUTES ARE ON IT
 * ---------------------------------------------------------------------------------------
 *
 * §9.3's rule is that a control a caller may not use is not drawn at all, rather than drawn and
 * then refused, so this list is what a browser somewhere else would act on. Acting on it needs the
 * routes: the operation `plan.write` is declared on two acts kept here and on sixteen ordinary plan
 * writes, so a reader matching on the key alone would hide sixteen controls that work. The rows say
 * both, and the routes are Developer machinery beside words anybody can read.
 *
 * The reason under each act comes from `WHY_REFUSED_MEANS`, which is the one place those three
 * sentences are written. The server sends a key; this is where it becomes English.
 */
/**
 * THE COMPUTERS THAT HAVE ACTUALLY CALLED, ONE PER ROW, WITH HOW MUCH AND WHEN.
 *
 * Three facts per machine and they are three different questions, so they are not run together into
 * a comma-separated line. The address is the machine's name here because nothing yet knows a better
 * one: problem 18's second part is where a machine gets a name, and until then an address said
 * plainly beats a friendly name nobody wrote.
 *
 * IT IS A READING OF THE CALL LOG, NOT A LIST OF ADMITTED MACHINES. A row means this computer
 * called; it does not mean anybody approved it, and the sentence under the panel says who did.
 */
function MachinesSeen({ machines }: { machines: AccessReply['machine']['machines'] }) {
  useLanguage()
  return (
    <ul className="rax-machines">
      {machines.map((one) => (
        <li key={one.name} className="rax-machine">
          <span className="rax-mono rax-machine-name">{content(one.name)}</span>
          <span className="rax-machine-when">
            {t('settingsPanel.access.requests', { n: one.requests, at: content(one.lastSeen) })}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RefusedList({ acts }: { acts: RefusedAct[] }) {
  useLanguage()
  return (
    <ul className="rax-refused">
      {acts.map((one) => (
        <li key={one.act} className="rax-refused-row">
          <span className="rax-refused-act">{one.inWords}</span>
          <span className="rax-refused-why">{t(`settingsPanel.access.why.${one.because}`)}</span>
          <span className="rax-mono rax-refused-routes">{content(one.routes.join(' · '))}</span>
        </li>
      ))}
    </ul>
  )
}

const ACCESS_CSS = `
.rax { margin: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.rax-pair { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad) var(--gut); min-width: 0; }
.rax-key { flex: none; min-width: 14rem; margin: 0; font-size: var(--fs-2); color: var(--text-2); }
.rax-val { margin: 0; font-size: var(--fs-3); color: var(--text); overflow-wrap: anywhere; min-width: 0; }
/* OFF IS NOT A FAULT AND IS NOT DRAWN AS ONE. It is the ordinary state, so it takes body ink and a
   word. On takes weight, because it is the state a person would want to notice at a glance. */
.rax-val[data-on='yes'] { font-weight: 700; }
/* THE SECOND LINE IS NOT AN AFTERTHOUGHT AND IS NOT A WARNING. It is the rest of a true sentence,
   so it takes the ordinary secondary ink and no hue: nothing here is a fault to be fixed. */
.rax-dev { margin: var(--gut) 0 0; padding: var(--pad-lg) 0 0; border-top: var(--border-w) solid var(--border); }
.rax-devhead { margin: 0 0 var(--pad); font-size: var(--fs-1); font-weight: 600; letter-spacing: .04em; color: var(--text-3); }
.rax-mono { font-family: var(--font-mono); font-size: var(--fs-1); }
/* ONE ACT PER ROW, and the words first. A comma-separated line of operation keys is a list nobody
   reads to the end; the act, why, and where are three different questions and take three lines. */
.rax-refused { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--pad); }
.rax-refused-row { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rax-refused-act { font-size: var(--fs-3); color: var(--text); }
.rax-refused-why { font-size: var(--fs-1); color: var(--text-2); }
.rax-refused-routes { color: var(--text-3); overflow-wrap: anywhere; }
/* ONE MACHINE PER ROW, for the reason the refused list above takes one act per row: how much it
   called and when it last did are two questions, and a line of commas answers neither. */
.rax-machines { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--pad); }
.rax-machine { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rax-machine-name { color: var(--text); overflow-wrap: anywhere; }
.rax-machine-when { font-size: var(--fs-1); color: var(--text-2); }
.rax-fault {
  margin: 0; font-size: var(--fs-1); color: var(--st-failed);
  background: var(--st-failed-row); border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm); padding: 4px var(--pad); font-weight: var(--st-failed-weight);
}
@media (max-width: 40rem) {
  .rax-key { min-width: 0; flex: 1 1 100%; }
}
`
