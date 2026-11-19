// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE PLACE A RECORD'S ID IS DRAWN.
 *
 * An agent writes `Report OOOt4Kouc5dT — Round ten` and the owner reads a page headed `Round ten`
 * with no `OOOt4Kouc5dT` on it anywhere. Both are talking about the same stored thing and neither
 * can point at it. Measured on 27 August 2026 at 1440: that report's own page drew its kind, its
 * reading family, its title, its summary line and its two dates, and nowhere did it draw its id;
 * the home queue drew 27 items and not one id. The owner's rule, section 9 of the round eleven
 * brief:
 *
 *   Human-facing references should be identity + meaning, never identity alone and never meaning
 *   alone. Stable ID is identity. Title is presentation. Both are needed to connect human and
 *   Agent work.
 *
 * WHY ONE COMPONENT AND NOT A CLASS NAME EACH SURFACE COPIES. Six surfaces will want this. Six
 * copies of "monospace, small, quiet, bottom right" is six things that drift, and the drift is
 * invisible — nothing fails when one card puts the id top-left in the body face. So the placement
 * is decided HERE, by the `where` word, and a caller cannot pass a class or a style to move it.
 *
 * WHAT THIS COMPONENT WILL NOT DO. It never draws the id on its own. Identity alone is the half of
 * the owner's rule that is easy to build and useless to read: `OOOt4Kouc5dT` in an empty box tells
 * nobody what it names. Every placement below sits inside something that already carries the title
 * — a card, or the header of the record's own page — and that is the contract a caller is taking
 * on. There is no `where` for "just the id, nowhere in particular", on purpose.
 */

// FROM lib AND NOT FROM SessionPanel.tsx, WHICH IS WHERE THIS HOOK USED TO LIVE. ui.tsx draws an id
// on every list row now, so ui.tsx imports this file; SessionPanel.tsx imports ui.tsx; and this
// file importing SessionPanel.tsx would close that into a loop whose failure is a value that is
// undefined for no reason a reader of any of the three files can see.
import { t } from '@shared/i18n.ts'
import { useCopy } from '../lib/copy.ts'

/**
 * Where the id is being drawn, which is the whole of what decides how it looks and where it sits.
 *
 * - `card` — bottom right of a card in a list. Quiet, no label, no button. The card carries the
 *   title above it, so the pair reads as identity and meaning together.
 * - `page` — the record's own page, on the line of metadata under the title. Labelled `id`, with a
 *   button that copies it, because this is the page somebody is on when they want to quote the
 *   thing to an agent.
 * - `inline` — inside a sentence, where prose already says what the id names. No placement of its
 *   own: it goes exactly where the sentence puts it.
 */
export type IdPlacement = 'card' | 'page' | 'inline'

export interface RecordIdProps {
  id: string
  where: IdPlacement
}

/**
 * The id itself. Real text in every placement — never an image, never a `::before`, never only a
 * `title` — because the browser's own Ctrl+F must find it, and Ctrl+F reads text.
 */
function IdText({ id }: { id: string }) {
  return (
    <code className="rid-text" title={t('sheet.id.detail')}>
      {id}
    </code>
  )
}

/**
 * A record's stable id, drawn the same way everywhere and placed by the `where` word.
 *
 * Low visual weight on purpose. Colour in this product means "you have to do something about
 * this", and nobody has to do anything about an id, so this spends none: the mono face, one step
 * down in size, the quiet ink, and a flat chip to hold it together.
 */
export function RecordId({ id, where }: RecordIdProps) {
  return (
    <>
      <style href="mole-office-record-id" precedence="default">
        {RECORD_ID_CSS}
      </style>
      {where === 'card' ? (
        // BOTTOM RIGHT, AND THE COMPONENT PUTS IT THERE. margin-top auto drops it to the floor of a
        // card laid out as a column; justify-content pushes it to the right wall. Neither asks the
        // card for a position property, so a card that was never written with this in mind still
        // gets the same corner.
        <div className="rid-card">
          <IdText id={id} />
        </div>
      ) : where === 'page' ? (
        <PageId id={id} />
      ) : (
        <IdText id={id} />
      )}
    </>
  )
}

/**
 * The id on the record's own page, with the one button that puts it on the clipboard.
 *
 * THE COPY SAYS WHAT HAPPENED, INCLUDING WHEN IT DID NOT. `navigator.clipboard` is undefined
 * outside a secure origin and the write can be refused by permissions. A button that appears to
 * work and copied nothing is worse here than almost anywhere: the person pastes their previous
 * clipboard entry into an agent and asks it about the wrong record.
 *
 * AND IT SAYS IT WITHOUT A SENTENCE. The button's own word changes, and the way out is the id
 * itself: it sits beside the button as selectable text, so a reader who sees the copy did not
 * happen selects it. A paragraph saying "select the id and copy it by hand" was written here first
 * and taken out — docs/UX-CONTRACT.md has said since round three that a fix amounting to adding
 * a sentence is a failed fix.
 */
function PageId({ id }: { id: string }) {
  const { state, copy } = useCopy()
  /** The word on the button, which is also the whole of what it says about the last press. */
  const said = state === 'copied' ? t('sheet.id.copied') : state === 'failed' ? t('sheet.id.failed') : t('sheet.id.copy')
  return (
    <span className="rid-page">
      {/* The word, because a twelve-character pill on a line reading "in Mole Office, created, updated"
          is otherwise the one item on it that does not say what it is. */}
      <span className="rid-word">{t('sheet.id.label')}</span>
      <IdText id={id} />
      <button
        type="button"
        className={state === 'failed' ? 'rid-copy rid-copy-blocked' : 'rid-copy'}
        onClick={() => copy(id)}
        title={t('sheet.id.clipboard', { id })}
        // THE STATE IS IN THE NAME AND NOT ONLY IN THE COLOUR. An accessible name replaces the
        // button's own text for a screen reader, so a name that always said "copy" would leave
        // somebody who cannot see the red glyph believing every press worked.
        aria-label={t('sheet.id.copyLabel', { said, id })}
      >
        {said}
      </button>
    </span>
  )
}

// ============================================================================ styles

/**
 * Its own stylesheet, carried by the component, so that a surface consuming it needs no CSS of its
 * own. React 19 hoists a style with an href into the head and de-duplicates by that href, so
 * thirty cards on a page put one copy of this in the document.
 *
 * NO BACKTICK ANYWHERE INSIDE THIS STRING, including in a comment — it ends the template literal
 * and turns the rest of this file into nonsense. Quote class names with plain words.
 */
const RECORD_ID_CSS = `
/* The id itself, in every placement. One declaration, so there is one answer to what an id looks
   like. user-select all so a click takes the whole of it rather than half.

   WHY rp-id IS IN THIS SELECTOR. Three elements on the record page still write the pill by hand:
   two ids inside prose in the deadline panel, and the project id on the metadata line in Developer
   mode. Their markup is asserted, character for character, by tests/deadline-panel.test.ts, which
   has another owner this wave, so their elements are left exactly as they were. Their LOOK is
   taken from here rather than from a second copy of these eight lines on that page, because a
   second copy is the thing somebody changes one of. When those three call this component, delete
   the selector and nothing else has to move. */
.rid-text, .rp-id {
  font-family: var(--font-mono);
  /* ASK THE FACE FOR ITS SLASHED ZERO. Some mono faces draw a plain oval zero by default and keep a
     marked one as an option; this is how the option is taken. It does nothing on a face that has no
     such option, which is why the face itself was changed as well — see the note on --font-mono in
     tokens.css, and the pictures under design/round-eleven/repairs/shots. A person copying an id by
     sight has to be able to tell which character they are looking at. */
  font-variant-numeric: slashed-zero;
  font-size: var(--fs-1);
  line-height: 1.4;
  color: var(--text-3);
  background: var(--panel-2);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  user-select: all;
}
/* ONE ID PER PILL NEVER WRAPS. The alphabet an id is built from includes the hyphen, and a browser
   will happily break a line after one, so an id can arrive split across two lines with a reader
   left to guess whether the hyphen is part of it. Only the pills this component draws hold exactly
   one id; the rp-id above can hold a comma-separated list, which should wrap. */
.rid-text { white-space: nowrap; }

/* ON A CARD: the floor, then the right wall. margin-top auto only bites in a column-flex card and
   is harmless in every other kind, which is why it is safe to apply from in here.

   margin-left auto IS THE SAME SENTENCE FOR A CARD LAID OUT AS A ROW, and it is here rather than in
   the surfaces because the corner is this component's decision. Without it the id sat bottom right
   at 1440 and bottom LEFT at 390 on every list row in the product: below 400px a row gives its
   right-hand cell the whole width and lines its contents up from the left, so the id went with
   them. Photographed on Modules at both widths on 27 August 2026. One corner at every width is
   the requirement: placed consistently, for example bottom-right. */
.rid-card {
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  margin-top: auto;
  margin-left: auto;
  padding-top: 2px;
  min-width: 0;
}

/* ON THE RECORD'S OWN PAGE: one run of items on the metadata line, wrapping as a unit at 390 so
   the label, the id and the button never end up on three different lines. */
.rid-page {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.rid-word { color: var(--text-3); }

/* THE COPY BUTTON, at the weight of the line it sits on. No border and no fill: a control that
   looked like a button here would be the loudest thing in a header whose job is the title. */
.rid-copy {
  appearance: none;
  border: 0;
  background: none;
  padding: 0 2px;
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text-3);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: var(--border);
}
.rid-copy:hover { color: var(--text); text-decoration-color: currentColor; }
.rid-copy:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--radius-sm); }

/* A copy that did not happen. This is the one place the id line spends any colour, and it spends
   it on the only thing here somebody has to do something about. */
.rid-copy-blocked, .rid-copy-blocked:hover { color: var(--st-failed); }
`
