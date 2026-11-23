// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
import { useLanguage } from '../lib/language.ts'
/**
 * `Your card` — WHICH CARD A PERSON HOLDS, WHAT THEY DO, AND THE PICTURE ON IT. Criterion P52.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MISSING
 * ---------------------------------------------------------------------------------------
 *
 * On the profile page a person could not change their role card.
 *
 * The three doors have existed since the card work landed: `PATCH /api/participants/person/<id>`
 * takes `role`, `occupation` and `portrait`, and refuses anybody but the person themselves. Nothing
 * drew a control for any of them, so the only way to use their own card was a request by hand. This
 * is the control. It closes problem `sPNcAuBd0reg`.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS DRAWN ONLY ON YOUR OWN PAGE, AND THE RULE IS THE DOOR'S
 * ---------------------------------------------------------------------------------------
 *
 * `ProfilePage` already works out whether the reader is looking at themselves, for the name and
 * picture editor it draws on the same terms, and this takes the same answer. Drawing it on somebody
 * else's page would be offering a press that is always refused. What this file does NOT do is
 * repeat the rule: the server refuses with a sentence naming it, and that sentence is shown.
 *
 * ---------------------------------------------------------------------------------------
 * THE PICTURES ARE THE ROLE'S THREE AND THE PERSON'S OWN
 * ---------------------------------------------------------------------------------------
 *
 * A card's pictures live in `design/portraits/<role>/` and a person's own in
 * `data/portraits/custom/<who>/`, which is never committed and never leaves this machine. Both are
 * offered, both are labelled with which they are, and neither is invented: a folder with nothing in
 * it comes back empty and the panel says nobody has put a picture there.
 */

import { useState } from 'react'

import { api, errorMessage, faultOf, type Fault, type ProfileReply } from '../api.ts'
import { Absence, Btn, ErrorNote, Panel, useAsync } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { theCrossOriginOfALoad, whereRequestsGo } from '../lib/visiting.ts'
import { OpensLarge } from './PictureLarge.tsx'
import { smallPortrait, type PortraitOnOffer } from '@shared/portraits.ts'

/** Every word this panel draws that is not read off the server. */
export const YOUR_CARD_WORDS = {
  get title() { return t('g6b.yourCard.title') },
  get which() { return t('g6b.yourCard.which') },
  get occupation() { return t('g6b.yourCard.occupation') },
  /** The shape of an answer, in the box, rather than a sentence above it. See the new-card page. */
  get occupationShape() { return t('g6b.yourCard.occupationShape') },
  get portrait() { return t('g6b.yourCard.portrait') },
  get fromTheRole() { return t('g6b.yourCard.fromTheRole') },
  get yourOwn() { return t('g6b.yourCard.yourOwn') },
  get none() { return t('g6b.yourCard.none') },
  get save() { return t('g6b.yourCard.save') },
  get saving() { return t('g6b.yourCard.saving') },
  get saved() { return t('g6b.yourCard.saved') },
  /**
   * THE PRESS THAT OPENS THE FORM, and the one that closes it again.
   *
   * The page opens as reading. `tests/read-before-edit.test.ts` holds the rule that nothing on a
   * page you are reading can be typed into or chosen from, and the editor beside this one — the
   * name and picture on `YourAppearance` — already works this way for that reason. So this draws
   * the three values, and the boxes appear when somebody asks for them.
   */
  get change() { return t('g6b.yourCard.change') },
  get stop() { return t('g6b.yourCard.stop') },
  /** What is drawn where a value has not been written. */
  get notSaid() { return t('g6b.yourCard.notSaid') },
  /**
   * WHEN THERE IS NO PICTURE TO CHOOSE FROM AT ALL. Two folders were looked in and both were empty:
   * the role's own in `design/portraits/<role>/` and this person's in `data/portraits/custom/<who>/`.
   *
   * It goes through `Absence` at the told-apart tier, which is what this product draws for an
   * emptiness somebody LOOKED for: the word is what the reader sees and the sentence survives in the
   * mark's own detail. `must-act-on` would be wrong — nothing has gone missing, nobody has painted
   * anything — and `ordinary` would be a dash where the reader is choosing something.
   */
  get noPicturesWord() { return t('g6b.yourCard.noPicturesWord') },
  /** The three words for a value nobody has written, each said as its own fact. */
  get noCardSays() { return t('g6b.yourCard.noCardSays') },
  get noOccupationSays() { return t('g6b.yourCard.noOccupationSays') },
  get noPictureSays() { return t('g6b.yourCard.noPictureSays') },
  get noPicturesSays() { return t('g6b.yourCard.noPicturesSays') },
} as const

export function YourCard({ said, onChanged }: { said: ProfileReply; onChanged: () => void }) {
  useLanguage()
  const who = said.participant
  const held = who.role ?? ''
  const heldOccupation = who.occupation ?? ''
  const heldPortrait = who.portrait ?? null

  const [roles] = useProjectAsync(() => api.roles(), [])
  // THE ROLE'S OWN THREE, AND THE ONES THIS PERSON KEEPS FOR THEMSELVES. Two reads because they are
  // two folders with two different rules about who they belong to, and the panel says which is which.
  const [theRoles] = useAsync(() => api.portraitsIn('role', held === '' ? 'administrator' : held), [held])
  const [theirs] = useAsync(() => api.portraitsIn('custom', who.id), [who.id])

  const [role, setRole] = useState(held)
  const [occupation, setOccupation] = useState(heldOccupation)
  const [portrait, setPortrait] = useState<string | null>(heldPortrait)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [done, setDone] = useState(false)

  const save = (): void => {
    setFault(null)
    setDone(false)
    setBusy(true)
    void api
      .changeParticipant('person', who.id, {
        ...(role === held ? {} : { role }),
        occupation,
        // AN EMPTY STRING IS HOW A PERSON TAKES THEIR CHOICE BACK, and the door says so: it nulls
        // the column, and the card's own picture is drawn again. Sending nothing would leave the
        // old choice in place, which is a different act.
        portrait: portrait ?? '',
      })
      .then(() => {
        setBusy(false)
        setDone(true)
        setEditing(false)
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  const offered: { one: PortraitOnOffer; where: string }[] = [
    ...(theRoles.status === 'ready' ? theRoles.value.portraits.map((one) => ({ one, where: YOUR_CARD_WORDS.fromTheRole })) : []),
    ...(theirs.status === 'ready' ? theirs.value.portraits.map((one) => ({ one, where: YOUR_CARD_WORDS.yourOwn })) : []),
  ]

  // AT REST: the three values and one press. The boxes are drawn only once somebody asks for them,
  // which is the rule this page already keeps for the name and the picture beside it.
  if (!editing) {
    return (
      <Panel declares={{ surface: 'profile.yourcard' }} titleIs="label" title={YOUR_CARD_WORDS.title}>
        <style href="mole-office-your-card" precedence="default">
          {YOUR_CARD_CSS}
        </style>
        <dl className="yc-facts">
          <div className="yc-fact">
            <dt className="yc-label">{YOUR_CARD_WORDS.which}</dt>
            <dd className="yc-value">{held === '' ? <Absence say title={YOUR_CARD_WORDS.noCardSays} /> : held}</dd>
          </div>
          <div className="yc-fact">
            <dt className="yc-label">{YOUR_CARD_WORDS.occupation}</dt>
            <dd className="yc-value">
              {heldOccupation === '' ? (
                <Absence say title={YOUR_CARD_WORDS.noOccupationSays} />
              ) : (
                heldOccupation
              )}
            </dd>
          </div>
          <div className="yc-fact">
            <dt className="yc-label">{YOUR_CARD_WORDS.portrait}</dt>
            <dd className="yc-value">
              {heldPortrait === null ? (
                <Absence say title={YOUR_CARD_WORDS.noPictureSays} />
              ) : (
                // A SMALL COPY IS DRAWN, AND A PRESS OPENS THE WHOLE PICTURE.
                <OpensLarge src={whereRequestsGo(heldPortrait)} crossOrigin={theCrossOriginOfALoad()} alt={YOUR_CARD_WORDS.portrait}>
                  <img className="yc-shown" src={whereRequestsGo(smallPortrait(heldPortrait))} crossOrigin={theCrossOriginOfALoad()} alt={YOUR_CARD_WORDS.portrait} />
                </OpensLarge>
              )}
            </dd>
          </div>
        </dl>
        <Btn onClick={() => setEditing(true)}>{YOUR_CARD_WORDS.change}</Btn>
      </Panel>
    )
  }

  return (
    <Panel declares={{ surface: 'profile.yourcard' }} titleIs="label" title={YOUR_CARD_WORDS.title}>
      <style href="mole-office-your-card" precedence="default">
        {YOUR_CARD_CSS}
      </style>

      <div className="yc-field">
        <label className="yc-label" htmlFor="mole-office-your-card-role">
          {YOUR_CARD_WORDS.which}
        </label>
        <select
          id="mole-office-your-card-role"
          className="px-select yc-pick"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {/* THE CARDS A PERSON MAY HOLD, AND ONLY THOSE. `personCards` is its own list in the
              declaration, and nothing reads across: a role an agent holds is never offered here. */}
          {(roles.status === 'ready' ? roles.value.personCards : []).map((card) => (
            <option key={card.name} value={card.name}>
              {cardWord(card.name)}
            </option>
          ))}
        </select>
      </div>

      <div className="yc-field">
        <label className="yc-label" htmlFor="mole-office-your-card-occupation">
          {YOUR_CARD_WORDS.occupation}
        </label>
        <input
          id="mole-office-your-card-occupation"
          className="px-input yc-line"
          value={occupation}
          placeholder={YOUR_CARD_WORDS.occupationShape}
          onChange={(e) => setOccupation(e.target.value)}
        />
      </div>

      <div className="yc-field yc-pics-field">
        <span className="yc-label">{YOUR_CARD_WORDS.portrait}</span>
        {offered.length === 0 ? (
          <Absence say title={YOUR_CARD_WORDS.noPicturesSays} />
        ) : (
          <ul className="yc-pics">
            <li>
              <button
                type="button"
                className="yc-pic yc-pic-none"
                data-chosen={portrait === null ? 'yes' : 'no'}
                onClick={() => setPortrait(null)}
              >
                {YOUR_CARD_WORDS.none}
              </button>
            </li>
            {offered.map(({ one, where }) => (
              <li key={one.address}>
                <button
                  type="button"
                  className="yc-pic"
                  data-chosen={portrait === one.address ? 'yes' : 'no'}
                  onClick={() => setPortrait(one.address)}
                  title={`${one.of} ${one.name} — ${where}`}
                >
                  {/* A small copy. The press here chooses the picture, so it does not open it. */}
                  <img className="yc-pic-img" src={whereRequestsGo(smallPortrait(one.address))} crossOrigin={theCrossOriginOfALoad()} alt={`${one.of} ${one.name}`} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <div className="yc-acts">
        <Btn onClick={save} disabled={busy} reason={busy ? YOUR_CARD_WORDS.saving : undefined}>
          {YOUR_CARD_WORDS.save}
        </Btn>
        <Btn variant="ghost" onClick={() => setEditing(false)}>
          {YOUR_CARD_WORDS.stop}
        </Btn>
        {done ? <span className="yc-done">{YOUR_CARD_WORDS.saved}</span> : null}
      </div>
    </Panel>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const YOUR_CARD_CSS = `
.yc-facts { margin: 0 0 var(--pad); display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.yc-fact { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--gut); min-width: 0; }
.yc-value { margin: 0; color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.yc-value .sb-image-hint { right: 1px; bottom: 1px; padding: 0 2px; font-size: 10px; line-height: 1; }
.yc-shown { display: block; width: 48px; height: 48px; object-fit: cover; border-radius: var(--radius-sm); }
.yc-field { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--gut); min-width: 0; margin-bottom: var(--pad); }
.yc-label { flex: none; min-width: 11rem; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.yc-pick, .yc-line { flex: 1 1 16rem; min-width: 0; max-width: 24rem; }
.yc-says { margin: 0 0 var(--pad); max-width: var(--measure); color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.yc-pics-field { align-items: flex-start; }
.yc-pics { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--pad); min-width: 0; }
.yc-pic {
  width: 64px; height: 64px;
  display: flex; align-items: center; justify-content: center;
  padding: 0; overflow: hidden;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text-2);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  cursor: pointer;
}
/* THE CHOSEN PICTURE, IN EACH LOOK'S OWN CHOSEN VALUES (tokens.css). In the light look F the edge
   this used to draw was the same as every other picture's, so the chosen one could not be told
   apart. Every other card choice in the product reads the same four values. */
.yc-pic[data-chosen="yes"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); border-width: 2px; }
.yc-pic:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.yc-pic-img { width: 100%; height: 100%; object-fit: cover; }
.yc-pic-none { text-align: center; }
.yc-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.yc-done { color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
@media (max-width: 40rem) {
  .yc-label { flex: 1 1 100%; min-width: 0; }
}
`
