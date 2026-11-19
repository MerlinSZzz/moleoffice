// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PICKING A PICTURE FOR SOMEBODY, from the set this product offers.
 *
 * An agent draws the avatars, for example as SVG, and a second round added more of them:
 * animals, plants and other objects.
 * The pictures exist; this is the half that lets them use one. Criterion M30.
 *
 * ---------------------------------------------------------------------------------------
 * PRESSING A PICTURE SENDS IT THROUGH THE DOOR AN UPLOAD GOES THROUGH
 * ---------------------------------------------------------------------------------------
 *
 * The bytes are fetched from the API — through `api.avatarOnOfferBytes`, because every request the
 * browser makes is made in api.ts — and posted to `POST /api/participants/:kind/:id/avatar`, which
 * is exactly the request choosing a file from a disk makes. So there is ONE door and one set
 * of rules about who may change whose picture: a person may set any agent's picture and their own,
 * an agent may set only its own. A second door that took a picture's name instead of its bytes
 * would be a second place for those rules to be got wrong.
 *
 * ---------------------------------------------------------------------------------------
 * THE PICTURES COME FROM THE API AND NOT FROM VITE
 * ---------------------------------------------------------------------------------------
 *
 * Every address here goes through `whereRequestsGo`, for the reason written at length in
 * components/Avatar.tsx: `npm run dev` has no proxy, so a bare path asks Vite, and Vite answers the
 * app's own HTML with status 200 — a broken picture with no console error and no 4xx. That is a
 * measured defect, not a hypothetical one, and it broke every picture in the product once already.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT WITH NO PICTURE IS OFFERED ONE, AND IS NEVER GIVEN ONE
 * ---------------------------------------------------------------------------------------
 *
 * Everybody has a picture, because Mole Office draws one from the id. So "no picture" means nobody
 * has ever chosen one. The server says which participants those are and which drawn animal each is
 * offered — one rule, in src/server/lib/avatars.ts — and this marks that picture and says so above
 * the set. Pressing it is the same act as pressing any other.
 *
 * NOTHING IS WRITTEN UNTIL SOMEBODY PRESSES. Giving every agent a picture on sight would be a write
 * nobody asked for, made while a page was being read.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { avatarUrlFor, type ParticipantKind } from '@shared/participants.ts'
import { participantKey } from '@shared/messages.ts'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { whereRequestsGo } from '../lib/visiting.ts'
import { TieredPress } from './TieredPress.tsx'
import { Absence, ErrorNote, Loading, useAsync } from './ui.tsx'

/**
 * Every word this component draws, in one place, so a screen and a test read the same words.
 *
 * THEY ARE LABELS AND MARKS, NOT SENTENCES. `docs/UX-CONTRACT.md` section 8.10: a fix that
 * amounts to adding a sentence explaining the screen is a failed fix. So the state of a
 * participant's picture is a label with a value beside it, in the pattern the roster already uses,
 * and which picture is offered is a mark on that picture rather than a sentence naming it.
 */
export const PICKER_WORDS = {
  get heading() { return t('settingsPanel.avatar.heading') },
  get drawn() { return t('settingsPanel.avatar.drawn') },
  get generated() { return t('settingsPanel.avatar.generated') },
  /** The label whose value says whether anybody has chosen a picture for this participant. */
  get chosenLabel() { return t('settingsPanel.avatar.chosenLabel') },
  /** Its value when nobody has. Everybody has a picture; this says nobody picked it. */
  get noneChosen() { return t('settingsPanel.avatar.noneChosen') },
  /** The mark on the one picture being offered. */
  get offeredMark() { return t('settingsPanel.avatar.offeredMark') },
  get loading() { return t('settingsPanel.avatar.loading') },
  /** The value under the heading when this checkout offers no pictures at all. */
  get noneOnOffer() { return t('settingsPanel.avatar.noneOnOffer') },
  get stored() { return t('settingsPanel.avatar.stored') },
  /** What a picture is called for a reader who cannot see it. */
  labelFor: (picture: string, set: string) => t(settingsControlWord('settings.appearance', 'settingsPanel.avatar.labelFor'), { picture: content(picture), set: set.toLowerCase() }),
  /**
   * THE PRESS THAT SENDS A PICTURE FROM THIS COMPUTER, criterion M37.
   *
   * It used to sit on the settings page beside a second press called "Use the drawn one". Both
   * left that page, and this is where the first one went, because it is one of the ways of
   * choosing a picture and this is where they now all are. Losing it would have taken away sending
   * their own picture, which was never meant to go.
   */
  get fromThisComputer() { return t(settingsControlWord('settings.appearance', 'settingsPanel.avatar.fromThisComputer')) },
  /**
   * THE PRESS THAT PUTS THE ROW BACK TO NOBODY HAVING CHOSEN A PICTURE, and why it is here.
   *
   * "Use the drawn one" was taken off the settings page as not needed:
   * somebody who does not want to change their
   * picture will not press it. That is true of a press standing under a picture nobody has chosen.
   * It stopped being true once a picture HAD been chosen: unchoosing was then impossible, and
   * putting the row back to holding nothing is a different act from choosing a drawn animal. So it
   * is here, inside the choosing, and only while there is something to put
   * back.
   *
   * IT USED TO SAY *Back to the one Mole Office drew* AND THAT STOPPED BEING TRUE ON 6 SEPTEMBER.
   * Criterion M53 makes chill-bee the picture anybody with none is given, so the press no longer
   * ends at a drawing. It names the act it does — putting the choice back — rather than an outcome
   * it cannot promise.
   */
  get backToNoneChosen() { return t(settingsControlWord('settings.appearance', 'settingsPanel.avatar.backToNoneChosen')) },
  /** What that press did, in the shape "Picture stored." above is: what happened, in two words. */
  get backAgain() { return t('settingsPanel.avatar.backAgain') },
} as const

/**
 * What `sending` holds while the picture is being put back, which no set-and-name pair can equal.
 *
 * `sending` otherwise holds `<set>/<picture>`, and every press is disabled while it is not null. A
 * slash cannot appear in a set name or a picture name, so this cannot collide with one.
 */
const BACK_TO_DRAWN = 'back to no picture chosen'

/**
 * How long the undo is offered after the picture is put back, a decision's
 * window.
 */
const PUT_BACK_UNDO_MS = 10_000

/**
 * The picker.
 *
 * `onStored` is called after a picture has been stored, so the page that draws the participant can
 * read them again. `busy` and the fault are held here rather than by the page, because pressing a
 * picture is this component's own act from beginning to end.
 */
export function AvatarPicker({
  kind,
  id,
  name,
  onStored,
  onFile,
}: {
  kind: ParticipantKind
  /** The registry id of whoever the picture is for. */
  id: string
  /** Their name, for the sentence saying they are offered one. */
  name: string
  onStored: () => void
  /**
   * WHAT TO DO WITH A PICTURE CHOSEN FROM THIS COMPUTER, or nothing because this caller offers none.
   *
   * IT IS HANDED THE FILE AND NOT ITS BYTES. Whose picture it is, how the bytes are read and how the
   * page reads itself again afterwards all belong to the caller — and reading the bytes here as well
   * would be a second copy of `asBase64`, which the panel that opens this picker already has.
   * Criterion M37.
   */
  onFile?: (file: Blob) => void
}) {
  useLanguage()
  const who = participantKey({ kind, id })
  const [reply, reload] = useAsync(() => api.avatarsOnOffer(who), [who])
  const [sending, setSending] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [fault, setFault] = useState<string | null>(null)

  const press = (set: string, picture: string, url: string): void => {
    setFault(null)
    setSaid(null)
    setSending(`${set}/${picture}`)
    void api
      .avatarOnOfferBytes(url, picture)
      .then((bytes) => api.sendAvatar(kind, id, { bytes }))
      .then(() => {
        setSending(null)
        setSaid(PICKER_WORDS.stored)
        // THE SET IS READ AGAIN TOO, because which picture is offered depends on whether anybody
        // has chosen one — and somebody just has.
        reload()
        onStored()
      })
      .catch((err: unknown) => {
        setSending(null)
        setFault(errorMessage(err))
      })

  }

  /**
   * PUT THE ROW BACK TO NOBODY HAVING CHOSEN A PICTURE, WITH AN UNDO FOR A TIME.
   *
   * The same door and the same read afterwards as pressing a picture, and a different act: this
   * sends `{reset: true}`, which puts the row back to holding no picture at all. Choosing a drawn
   * animal stores that animal, which is a picture somebody chose. What is then shown is whatever a
   * participant with none is given, which since criterion M53 is chill-bee.
   *
   * THE UNDO SENDS THE SAME PICTURE BACK, AND IT IS A NEW CHOICE. A decision puts this press in
   * the undo tier. The door takes bytes and never an asset id, so the
   * bytes of the chosen picture are read BEFORE the row is cleared, and the undo posts them
   * through the door every other choice goes through. The row then holds the same picture under a
   * new asset row, and the words under the press say so. Only the address of a stored
   * picture (`avatarUrlFor`) is read: any other address is a picture the server works out for this
   * row, and sending that back would be a different choice. Then no undo is offered, rather than a
   * wrong one.
   */
  const putItBack = async (): Promise<{ remainingMs: number; undo: () => Promise<void> }> => {
    setFault(null)
    setSaid(null)
    setSending(BACK_TO_DRAWN)
    try {
      const everyone = await api.participants()
      const row = (kind === 'person' ? everyone.people : everyone.agents).find((one) => one.id === id)
      const kept =
        row !== undefined && row.avatarUrl.startsWith(avatarUrlFor(''))
          ? await api.avatarOnOfferBytes(row.avatarUrl, content(name))
          : null
      await api.sendAvatar(kind, id, { reset: true })
      if (kept === null) setSaid(PICKER_WORDS.backAgain)
      reload()
      onStored()
      return {
        remainingMs: kept === null ? 0 : PUT_BACK_UNDO_MS,
        undo: async () => {
          if (kept === null) return
          await api.sendAvatar(kind, id, { bytes: kept })
          setSaid(PICKER_WORDS.stored)
          reload()
          onStored()
        },
      }
    } finally {
      setSending(null)
    }
  }

  /** Somebody has chosen a picture, which is what `offered` being null means. */
  const somethingChosen = reply.status === 'ready' && reply.value.offered === null

  return (
    <div className="avp">
      <style href="mole-office-avatar-picker" precedence="default">
        {CSS}
      </style>
      <h4 className="avp-heading">{PICKER_WORDS.heading}</h4>
      {/* AND ONE OF THEIR OWN, criterion M37. It sits with the rest of the choosing rather than as a
          press on the page above. */}
      {onFile === undefined ? null : (
        <label className="avp-file">
          <span>{PICKER_WORDS.fromThisComputer}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file === undefined) return
              onFile(file)
            }}
          />
        </label>
      )}
      {/* PUTTING IT BACK. Drawn outside the read below and hidden rather than removed when there is
          nothing to put back, so the undo it offers is not taken away by the read that follows it.
          The press is only there while somebody has chosen a picture -- which is what `offered`
          being null means -- because a press offering to undo what never happened is the press they
          had taken off this panel. */}
      <span
        className={somethingChosen ? 'avp-back' : undefined}
        title={somethingChosen ? t('settingsPanel.avatar.backExplained') : undefined}
      >
        <TieredPress
          tier="undo"
          size="sm"
          press={PICKER_WORDS.backToNoneChosen}
          pending={t('settingsPanel.avatar.puttingBack')}
          disabled={sending !== null}
          available={somethingChosen}
          windowMs={PUT_BACK_UNDO_MS}
          done={t('settingsPanel.avatar.backAgainUndo')}
          undo={(seconds) => t('settingsPanel.avatar.undo', { n: seconds })}
          undoing={t('settingsPanel.avatar.undoing')}
          onPress={putItBack}
        />
      </span>
      {reply.status === 'loading' ? <Loading what={PICKER_WORDS.loading} /> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {reply.status !== 'ready' ? null : (
        <>
          {/* WHETHER ANYBODY HAS CHOSEN A PICTURE FOR THIS ONE, as a label and a value — the
              pattern the roster uses for every other fact about an agent. The picture being
              offered is marked in the set below rather than named in a sentence here. */}
          {reply.value.offered === null ? null : (
            <p className="avp-state" data-for={name}>
              <span className="avp-state-label">{PICKER_WORDS.chosenLabel}</span>{' '}
              <Absence
                tier="told-apart"
                looked
                word={PICKER_WORDS.noneChosen}
                title={t('settingsPanel.avatar.noneChosenExplained')}
              />
            </p>
          )}
          {reply.value.avatars.length === 0 ? (
            <p className="avp-state">
              <Absence
                tier="told-apart"
                looked
                word={PICKER_WORDS.noneOnOffer}
                title={t('settingsPanel.avatar.noneOnOfferExplained')}
              />
            </p>
          ) : null}
          {SETS.map((set) => {
            const inThisSet = reply.value.avatars.filter((one) => one.set === set.key)
            if (inThisSet.length === 0) return null
            return (
              <section key={set.key} className="avp-set">
                <h5 className="avp-set-name">{set.words}</h5>
                <ul className="avp-grid">
                  {inThisSet.map((one) => {
                    const offered =
                      reply.value.offered !== null &&
                      reply.value.offered.set === one.set &&
                      reply.value.offered.name === one.name
                    return (
                      <li key={`${one.set}/${one.name}`}>
                        <button
                          type="button"
                          className="avp-one"
                          data-offered={offered ? 'yes' : undefined}
                          data-picture={`${one.set}/${one.name}`}
                          disabled={sending !== null}
                          title={content(one.name)}
                          onClick={() => {
                            press(one.set, one.name, one.url)
                          }}
                        >
                          <img
                            className="avp-img"
                            src={whereRequestsGo(one.url)}
                            alt={PICKER_WORDS.labelFor(one.name, set.words)}
                            width={56}
                            height={56}
                            loading="lazy"
                          />
                          <span className="avp-name">{content(one.name)}</span>
                          {offered ? <span className="avp-offered">{PICKER_WORDS.offeredMark}</span> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </>
      )}
      {said === null ? null : (
        <p className="avp-said" role="status">
          {said}
        </p>
      )}
      {fault === null ? null : (
        <p className="avp-fault" role="status">
          {fault}
        </p>
      )}
    </div>
  )
}

/** The two sets, in the order they are drawn, with the words a reader sees for each. */
const SETS = [
  { key: 'drawn', get words() { return PICKER_WORDS.drawn } },
  { key: 'generated', get words() { return PICKER_WORDS.generated } },
] as const

const CSS = `
.avp { display: flex; flex-direction: column; gap: var(--pad); align-items: stretch; text-align: left; }

/* SENDING ONE FROM THIS COMPUTER, criterion M37. A label wrapping a hidden file input, which is how
   a file chooser is drawn as a press; it was this shape on the settings page before it moved here. */
.avp-file {
  min-height: 30px;
  padding: 0 var(--pad);
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  font-size: var(--fs-1);
  font-weight: 600;
  cursor: pointer;
}
.avp-file:hover { background: var(--hover); }
.avp-file input[type="file"] { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.avp-back { align-self: flex-start; }

.avp-heading {
  margin: 0;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}

.avp-state, .avp-said {
  margin: 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text-2);
}

.avp-state-label {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
}

.avp-fault {
  margin: 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--st-failed);
}

.avp-set { display: flex; flex-direction: column; gap: 4px; }

.avp-set-name {
  margin: 0;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
}

.avp-grid {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: 4px;
}

.avp-one {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  font-size: var(--fs-1);
  cursor: pointer;
}
.avp-one:hover { background: var(--hover); border-color: var(--border-strong); }
.avp-one:disabled { cursor: progress; opacity: .6; }

/* THE ONE BEING OFFERED, marked by a ring and by the word under it. A ring alone would say
   nothing to a reader who cannot see it, and the word alone is easy to miss in a grid of fifty. */
.avp-one[data-offered="yes"] {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent);
}

.avp-img { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; background: var(--panel); }

/* THE NAME WRAPS OVER TWO LINES RATHER THAN BEING CUT AFTER ONE. Nine of these pictures begin
   "candidate-", so one line of them all read "candidat..." and a reader could not tell them apart
   at all. The whole name is still on the button's title and in the picture's alternative text. */
.avp-name {
  max-width: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  text-align: center;
}

.avp-offered { font-weight: 600; color: var(--accent); }
`
