// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINES THIS OFFICE TRUSTS. Criterion P73.
 *
 * ---------------------------------------------------------------------------------------
 * ONE COMPONENT, TWO PLACES, AND ONE OF THEM HAS NO PRESSES
 * ---------------------------------------------------------------------------------------
 *
 * The trusted machines and addresses could not be set in Settings or on the worlds page.
 * The secretary decided: the machines this office trusts belong to the installation and not to a
 * person's preferences, so the list is SET on the world's page and Settings SHOWS it with a link.
 *
 * Both draw this component. `presses` is what tells them apart, and it is a prop rather than two
 * components because a second read-only copy would be one list of machines drawn from two places,
 * drifting the first time somebody changed one — the ninth invariant.
 *
 * WHAT THE LIST DECIDES IS THE SERVER'S SENTENCE. `says` comes back in the reply and is drawn as it
 * arrived. A page that wrote its own would be a second answer to "what does trusting a machine do",
 * and this one is easy to get wrong in a way a reader cannot check: it refuses nothing today.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { TieredPress } from './TieredPress.tsx'
import { Absence, Btn, ErrorNote, TextArea } from './ui.tsx'
import { RouteLink, pathFor } from './router.tsx'
import type { HowAMachineIsTrusted, TrustedMachine, WhatTheOfficeTrusts } from '@shared/trustedmachines.ts'

/** Every word this component draws that is not read off the reply. */
export const TRUSTED_WORDS = {
  /** The panel's name, on both pages. */
  get title(): string { return t('settingsPanel.trusted.title') },
  /** Said where the list is empty. It is an answer, not a list still arriving. */
  get none(): string { return t('settingsPanel.trusted.none') },
  get noneSays(): string { return t('settingsPanel.trusted.noneSays') },
  /** The add form. */
  get add(): string { return t('settingsPanel.trusted.add') },
  get adding(): string { return t('settingsPanel.trusted.adding') },
  get address(): string { return t('settingsPanel.trusted.address') },
  get addressHint(): string { return t('settingsPanel.trusted.addressHint') },
  get note(): string { return t('settingsPanel.trusted.note') },
  get cancel(): string { return t('settingsPanel.trusted.cancel') },
  /** The remove press, the box beside it, and the question it asks. */
  get remove(): string { return t('settingsPanel.trusted.remove') },
  get removing(): string { return t('settingsPanel.trusted.removing') },
  get removeQuestion(): string { return t('settingsPanel.trusted.removeQuestion') },
  get removeWarning(): string { return t('settingsPanel.trusted.removeWarning') },
  get why(): string { return t('settingsPanel.trusted.why') },
  /** The labels on a row. Each is a label with a value, never a sentence. */
  get added(): string { return t('settingsPanel.trusted.added') },
  get by(): string { return t('settingsPanel.trusted.by') },
  get how(): string { return t('settingsPanel.trusted.how') },
  get removed(): string { return t('settingsPanel.trusted.removed') },
  /** How a row came to be here, in a reader's words rather than the stored token. */
  howWord: {
    get 'a press'(): string { return t('settingsPanel.trusted.how.press') },
    get 'a credential'(): string { return t('settingsPanel.trusted.how.credential') },
    get 'the environment'(): string { return t('settingsPanel.trusted.how.environment') },
  } satisfies Record<HowAMachineIsTrusted, string>,
  /** The list of ones somebody removed. */
  get onceTrusted(): string { return t('settingsPanel.trusted.onceTrusted') },
  /**
   * WHERE THE LIST IS SET, AS THE NAME OF THE PRESS THAT GOES THERE. Criterion P73.
   *
   * It was a sentence beside a link called Worlds — "The list is set on the Worlds page." — which is
   * the shape docs/UX-CONTRACT.md calls a failed fix: a paragraph explaining what the arrangement
   * should say by itself. The press says it now, and there is nothing left to explain.
   */
  get setOn(): string { return t(settingsControlWord('settings.trusted', 'settingsPanel.trusted.setOn')) },
  /** The address the environment named, said where one is. */
  get bound(): string { return t('settingsPanel.trusted.bound') },
}

/**
 * THE PANEL'S BODY. The two pages wrap it in their own `Panel`, each naming its own surface.
 *
 * WHY THE PANEL IS NOT HERE. A test read each surface id out of the source until
 * it was deleted on 12 November 2026, so the id is a literal at the place it is drawn: a ternary here named two
 * surfaces that test could not see. The two pages each write their own, which is also what keeps their two names distinct — one chip
 * reading the same as another leaves a person unable to say which they commented on.
 */
export function TrustedMachines({
  said,
  presses,
  onChanged,
}: {
  said: WhatTheOfficeTrusts
  /** True on the world's page, where the list is set. False in Settings, which shows it. */
  presses: boolean
  onChanged: () => void
}) {
  useLanguage()
  return (
    <>
      <style href="mole-office-trusted-machines" precedence="default">
        {TRUSTED_CSS}
      </style>
      <p className="tm-says">{t('settingsPanel.trusted.says')}</p>
      {said.boundByTheEnvironment === null ? null : (
        <p className="tm-bound">
          <span className="tm-key">{TRUSTED_WORDS.bound}</span>
          <span className="tm-value">{content(said.boundByTheEnvironment)}</span>
        </p>
      )}
      {/* WHERE THE PRESSES ARE, said on the page that has none. A reader looking in Settings is not
          told nothing: they are told where to go and taken there in one press. */}
      {presses ? null : (
        <p className="tm-elsewhere">
          <RouteLink to={pathFor('worlds')}>{TRUSTED_WORDS.setOn}</RouteLink>
        </p>
      )}

      {said.machines.length === 0 ? (
        <p className="tm-none">
          <Absence tier="told-apart" looked word={TRUSTED_WORDS.none} title={TRUSTED_WORDS.noneSays} />
        </p>
      ) : (
        <ul className="tm-list">
          {said.machines.map((one) => (
            <Row key={one.id} machine={one} presses={presses} onChanged={onChanged} />
          ))}
        </ul>
      )}

      {presses ? <AddOne onChanged={onChanged} /> : null}

      {/* THE ONES THEY STOPPED TRUSTING. The office does not delete the record of who it once let in,
          and an empty list here is drawn as nothing at all rather than as a heading over a gap. */}
      {said.removed.length === 0 ? null : (
        <div className="tm-gone">
          <h3 className="tm-gone-name">{TRUSTED_WORDS.onceTrusted}</h3>
          <ul className="tm-list">
            {said.removed.map((one) => (
              <Row key={one.id} machine={one} presses={false} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/** One machine, with the press that stops trusting it where the page carries presses. */
function Row({
  machine,
  presses,
  onChanged,
}: {
  machine: TrustedMachine
  presses: boolean
  onChanged: () => void
}) {
  useLanguage()
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState('')

  // STOPPING ASKS FIRST, after the reason step. A refusal is thrown to the
  // question, which draws the server's own sentence and stays open.
  const remove = async (): Promise<void> => {
    await api.stopTrustingAMachine(machine.id, why.trim() === '' ? null : why.trim())
    setAsking(false)
    onChanged()
  }

  return (
    <li className="tm-row">
      <div className="tm-facts">
        <span className="tm-address">{content(machine.address)}</span>
        <span className="tm-key">{TRUSTED_WORDS.how}</span>
        <span className="tm-value">{TRUSTED_WORDS.howWord[machine.how]}</span>
        <span className="tm-key">{TRUSTED_WORDS.added}</span>
        <span className="tm-value">{content(machine.addedAt)}</span>
        {machine.addedBy === null ? null : (
          <>
            <span className="tm-key">{TRUSTED_WORDS.by}</span>
            <span className="tm-value">{content(machine.addedBy.id)}</span>
          </>
        )}
        {machine.removedAt === null ? null : (
          <>
            <span className="tm-key">{TRUSTED_WORDS.removed}</span>
            <span className="tm-value">{content(machine.removedAt)}</span>
          </>
        )}
      </div>
      {machine.note === null ? null : <p className="tm-note">{content(machine.note)}</p>}
      {machine.removedBecause === null ? null : <p className="tm-note">{content(machine.removedBecause)}</p>}
      {/* THE PRESS IS DRAWN ONLY WHERE THE ROW MAY BE REMOVED. `mayBeRemoved` is the server's own
          reading, the same one the route refuses with, so this page cannot offer a press the door
          would always refuse. */}
      {!presses || !machine.mayBeRemoved ? null : asking ? (
        <div className="tm-asking">
          <div className="tm-why">
            <TextArea value={why} onChange={setWhy} rows={2} placeholder={TRUSTED_WORDS.why} aria-label={TRUSTED_WORDS.why} />
          </div>
          <TieredPress tier="confirm" press={TRUSTED_WORDS.remove} pending={TRUSTED_WORDS.removing}
            question={TRUSTED_WORDS.removeQuestion} quote={content(machine.address)}
            warning={TRUSTED_WORDS.removeWarning} cancel={TRUSTED_WORDS.cancel} onPress={remove} />
          <Btn variant="ghost" onClick={() => setAsking(false)}>
            {TRUSTED_WORDS.cancel}
          </Btn>
        </div>
      ) : (
        <Btn variant="ghost" onClick={() => setAsking(true)}>
          {TRUSTED_WORDS.remove}
        </Btn>
      )}
    </li>
  )
}

/**
 * THE PRESS THAT ADDS ONE.
 *
 * AT REST IT IS A PRESS AND NOT A FORM. `tests/read-before-edit.test.ts` holds the rule that nothing
 * on a page you are reading can be typed into, and every other add in this product works that way.
 */
function AddOne({ onChanged }: { onChanged: () => void }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  if (!open) {
    return (
      <Btn variant="ghost" onClick={() => setOpen(true)}>
        {TRUSTED_WORDS.add}
      </Btn>
    )
  }

  const save = (): void => {
    setFault(null)
    setBusy(true)
    void api
      .trustAMachine(address.trim(), note.trim() === '' ? null : note.trim())
      .then(() => {
        setBusy(false)
        setOpen(false)
        setAddress('')
        setNote('')
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  return (
    <div className="tm-add">
      <label className="tm-field">
        <span className="tm-key">{TRUSTED_WORDS.address}</span>
        <input
          className="px-input"
          value={address}
          placeholder={TRUSTED_WORDS.addressHint}
          onChange={(e) => setAddress(e.target.value)}
        />
      </label>
      <label className="tm-field">
        <span className="tm-key">{TRUSTED_WORDS.note}</span>
        <TextArea value={note} onChange={setNote} rows={2} />
      </label>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <div className="tm-acts">
        <Btn onClick={save} disabled={busy} reason={busy ? TRUSTED_WORDS.adding : undefined}>
          {TRUSTED_WORDS.add}
        </Btn>
        <Btn variant="ghost" onClick={() => setOpen(false)}>
          {TRUSTED_WORDS.cancel}
        </Btn>
      </div>
    </div>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const TRUSTED_CSS = `
.tm-says { margin: 0 0 var(--pad); color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.tm-bound, .tm-elsewhere { margin: 0 0 var(--pad); font-size: var(--fs-1); color: var(--text-2); }
.tm-list { list-style: none; margin: 0 0 var(--pad); padding: 0; display: grid; gap: var(--pad); }
.tm-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--gut); min-width: 0;
  padding: var(--pad) 0; border-top: 1px solid var(--border);
}
.tm-facts { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--pad); min-width: 0; flex: 1 1 16rem; }
.tm-address { color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.tm-key {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.tm-value { color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
/* A note or a reason may run over several lines, so its line breaks are kept. */
.tm-note { flex: 1 1 100%; margin: 0; color: var(--text-2); font-size: var(--fs-1); white-space: pre-wrap; }
.tm-asking, .tm-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.tm-why { flex: 1 1 12rem; min-width: 0; max-width: 22rem; }
.tm-add { display: grid; gap: var(--pad); }
.tm-field { display: grid; gap: 2px; min-width: 0; max-width: 26rem; }
.tm-gone { margin-top: var(--gut); }
.tm-gone-name { margin: 0 0 var(--pad); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-3); }
.tm-none { margin: 0 0 var(--pad); }
`
