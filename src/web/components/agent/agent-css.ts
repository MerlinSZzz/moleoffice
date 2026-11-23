// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * How talking to an agent is drawn. One stylesheet for the whole agent directory.
 *
 * IT IS A TEMPLATE LITERAL, SO IT MUST NOT CONTAIN A BACKTICK — not even inside a comment, where a
 * backtick is the natural way to quote a class name. One anywhere in here closes the string and
 * turns the rest of the module into nonsense, and the error it produces points at a line of prose
 * and says a semicolon is missing. Class names are quoted with plain words below. CLAUDE.md records
 * three separate occurrences of this in one session.
 *
 * EVERY VALUE IS A TOKEN. No colour and no size is written out, so a theme, a density or a radius
 * preset re-skins all of this without a line here changing. The edge of a control is
 * --border-strong, which is the token held to a contrast floor; --border is a decorative hairline
 * and is not used on anything a person presses.
 *
 * React de-duplicates a style element by its href, so every component in this directory can render
 * this and the browser holds one copy.
 */

export const AGENT_CSS = `
/* ---------------------------------------------------------------- the handle on an object
   AT REST, NOT ON HOVER. Somebody scanning a page never hovers, and a control that appears only
   under the pointer does not exist for the person deciding whether this product can do the thing
   they want. It is small, and it is always there. */
.px-talk-handle-wrap { position: relative; display: inline-flex; align-items: center; gap: 6px; }

.px-talk-handle {
  display: inline-flex; align-items: center; gap: 4px;
  min-height: 24px; padding: 0 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  font-weight: 600;
  cursor: pointer;
}
.px-talk-handle:hover { background: var(--hover); color: var(--text); }

/* A COMMENT IS WAITING ON THIS. Weight, not hue: the review is not an alarm and not a fault. */
.px-talk-mark {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 0 6px; min-height: 20px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--panel-3);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  font-weight: 700;
}
.px-talk-mark-n { font-variant-numeric: tabular-nums; }

/* The offer that used to be drawn beside selected words had its rules here, and they are gone with
   it (20 August 2026). Nothing may be drawn because a person selected something: selection
   identifies context, it does not imply intent. What invokes Mole Office is the right-click. */

/* ---------------------------------------------------------------- the box
   FIXED TO THE WINDOW, not to the row. The object it belongs to can sit inside a list that scrolls
   or a panel that clips, and a box drawn inside one of those is cut off by it. The component places
   it under the handle, or at the pointer for a right-click, and pulls it back inside the window.
   It scrolls inside itself rather than growing past the bottom of the screen.

   IT CARRIES NO Z-INDEX OF ITS OWN ANY MORE. It is drawn in the overlay host, which is the layer,
   and a number here was a second opinion about how high the composer sits — one that lost to a
   frozen table cell, because a cell with a z-index ranks everything inside it as one thing. */
.px-talk {
  position: fixed; top: 0; left: 0;
  width: min(24rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--gut);
  padding: var(--pad-lg);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--elev-2);
  text-align: left;
}
/* ON A PHONE, A SHEET FROM THE BOTTOM (wave 13s round 13): the whole width, as tall as what it holds, so
   the thing it is about sits in the room above it when it opens. It keeps the box's own height limit:
   capped lower, it hid Send below the window once More and the contact list were open (the case in
   tests/the-right-click-panel-opens-with-six-things.test.ts). */
.px-talk[data-sheet] {
  top: auto; left: 0; right: 0; bottom: 0;
  width: auto;
  border-radius: var(--radius) var(--radius) 0 0;
  border-bottom: 0;
}
.px-talk-head { display: flex; align-items: flex-start; gap: var(--gut); }
/* THE QUOTE BAR IN THE HEAD ROW, beside ✕. It takes the row's width, and its
   look is the chat's quote block (chat/Quotes.tsx); only its place in this row is set here. */
.px-talk-quote-holder { flex: 1 1 auto; min-width: 0; }
/* COPY, BESIDE THE QUOTE, KEEPS ITS WORD ON ONE LINE. A press in this box may wrap its words (the rule
   on presses below), and in this row that let Copy shrink until its word broke in two beside a quote of
   about eight words. It does not shrink here, and the quote wraps narrower instead. */
.px-talk-head > .px-btn { flex: none; }
.px-talk-quote { margin: 0; }
.px-talk-away { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin-top: 2px; }
.px-talk-title { font-size: var(--fs-2); font-weight: 700; color: var(--text); }
.px-talk-close {
  margin-left: auto;
  min-width: 24px; min-height: 24px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  cursor: pointer;
}
.px-talk-close:hover { background: var(--hover); color: var(--text); }
/* THE PIN, BESIDE ✕ (decided on 8 November 2026). Pressed, the box stays open while the
   person clicks elsewhere or selects and copies text from the page. It is a toggle, so its pressed state is drawn as
   one: the same shape as the close control, with the chosen background when it is on. */
.px-talk-pin {
  min-width: 24px; min-height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  cursor: pointer;
}
.px-talk-pin:hover { background: var(--hover); color: var(--text); }
.px-talk-pin[aria-pressed="true"] { background: var(--chosen-bg); border-color: var(--chosen-edge); color: var(--chosen-ink); }
/* A HALF-WRITTEN COMMENT DOES NOT LOOK LIKE A SENT ONE. The edge is dashed and the box carries its own word, the same
   distinction the mark in the page draws. The words themselves are untouched. */
.px-talk[data-unsent="1"] { border-style: dashed; }
.px-talk-unsent {
  margin: 0;
  align-self: flex-start;
  padding: 2px 6px;
  border: var(--border-w) dashed var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1); font-weight: 600; color: var(--text-2);
}
.px-talk-unsent::before { content: "✎ "; }

.px-talk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
/* THE CHIP WRAPS ONTO A SECOND LINE, because the word in front of the name is a sentence now.
   It used to be one short noun — Block of a report — so the two halves always fit side by side and
   the chip was laid out as one unwrappable line. A part of a report says which part it is, of how
   many, and at which reading length, which is about ten words. The kind half was told never to
   wrap, so it kept its whole width; the name half is allowed to break between any two letters, so
   flexbox shrank it to the width of one letter and it drew the part's heading as a column of single
   characters, 12 pixels wide and 716 tall, filling the window. Measured 3 September 2026.
   Letting the chip wrap puts the sentence on its own line and gives the name the
   chip's whole width, which is what the drawing needed all along. */
.px-talk-chip {
  display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 6px;
  max-width: 100%;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--panel-3);
  font-size: var(--fs-1);
}
/* AND NO nowrap HERE, which is the other half of the same assumption. A sentence too long for one
   line has to go somewhere: allowed to wrap it takes a second line, and forbidden to wrap it runs
   past the edge of the composer. Measured: either this or the wrap above, on its own, is enough to
   stop the column of letters. Both are kept because they answer two different lengths of sentence —
   one that fits a line and one that does not. */
.px-talk-chip-kind { color: var(--text-3); font-weight: 700; }
/* BREAKING BETWEEN LETTERS IS FOR A STORED ID WITH NO SPACES IN IT, the one thing on a chip that
   cannot break any other way. It is also what let flexbox squeeze this to one letter wide, and what
   stops that is the wrap above rather than a floor written here. */
.px-talk-chip-what { color: var(--text); overflow-wrap: anywhere; }
/* THE CHIP SAYS WHEN IT IS NOT SHOWING EVERYTHING, in a word rather than in a character. */
.px-talk-chip-cut { color: var(--text-3); font-size: var(--fs-1); white-space: nowrap; }

/* WHERE THE WRITER MET THE THING, when they met it inside another record's page. It is drawn
   quieter than the subject beside it, because the subject is what the comment is ABOUT and this is
   only where it was read. No hue: the difference is weight, as everywhere else in this box. */
.px-talk-drawn { color: var(--text-2); }

/* THE THING THIS BOX IS ABOUT IS NOT ON THIS PAGE, and the press that goes to it.
   The dashed edge is the mark COMPOSER_STATES.notOnThisPage declares in src/shared/states.ts, and
   it is the same edge every weaker-than-exact state in this product draws. No hue carries any of
   it. The press beside it is a chip too, so the pair reads as one thing: the word and the way back. */
.px-talk-chip-away {
  background: none;
  border: var(--border-w) dashed var(--border-strong);
  color: var(--text-2);
  white-space: nowrap;
}
.px-talk-show {
  background: none;
  border: var(--border-w) dashed var(--border-strong);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: var(--fs-1);
  white-space: nowrap;
}
.px-talk-show:hover { background: var(--hover); }

/* A STATE OF THIS BOX, SAID IN ITS WORD FROM src/shared/states.ts AND NOT IN A SENTENCE.
   It is drawn where a sentence used to be, so it takes the note's size and colour, and it is
   enclosed so a reader tells it from the person's own words above it before reading either. */
.px-talk-state {
  display: inline-block;
  align-self: start;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1);
  color: var(--text-2);
}

/* NOTHING INSIDE THIS BOX IS WIDER THAN THE BOX.
   A button label does not wrap anywhere else in this app, and that is right for "Save" and wrong
   here: the things named in this box are the titles agent runs are given, which are sentences. One
   of them was drawn wider than the box and ran off both edges of it at 1440 on 18 August 2026. */
.px-talk .px-btn { white-space: normal; overflow-wrap: anywhere; }

.px-talk-intents { display: flex; flex-wrap: wrap; gap: 4px; }
.px-talk-intent {
  min-height: 26px; padding: 0 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  font-weight: 600;
  cursor: pointer;
}
.px-talk-intent:hover { background: var(--hover); }
/* WHICH ONE YOU PICKED is one of the accent's two jobs, and position carries it as well. */
.px-talk-intent[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.px-talk-to { display: flex; align-items: center; gap: var(--gut); }
.px-talk-to-label { font-size: var(--fs-1); color: var(--text-3); font-weight: 700; }
.px-talk-to-btn, .px-talk-note-btn {
  flex: 1 1 auto; min-width: 0;
  min-height: var(--row-h); padding: 0 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  text-align: left;
  cursor: pointer;
}
.px-talk-to-btn:hover, .px-talk-note-btn:hover { background: var(--hover); }
/* WHAT SEND GOES TO, a contact or a note: two presses joined, the chosen one in the accent, as a picked chip is. */
.px-talk-send-to { display: inline-flex; flex: 0 0 auto; }
.px-talk-send-to-one {
  min-height: var(--row-h); padding: 0 10px;
  border: var(--border-w) solid var(--border-strong);
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-ui); font-size: var(--fs-2); font-weight: 600;
  cursor: pointer;
}
.px-talk-send-to-one:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.px-talk-send-to-one:last-child { border-left: 0; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.px-talk-send-to-one:hover { background: var(--hover); }
.px-talk-send-to-one[aria-checked="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }

.px-talk-suggest { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
/* THE AGENT'S NAME, ABOVE THE PRESS RATHER THAN ON IT. A run's title is a sentence, and it wraps
   here, which is the whole reason it is not the button's label. */
.px-talk-suggest-who {
  margin: 0;
  font-size: var(--fs-2); font-weight: 600; color: var(--text);
  line-height: var(--lh-body);
  overflow-wrap: anywhere;
}
.px-talk-suggest-why { margin: 0; font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); }
.px-talk-warn { margin: 0; font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); }
/* A RUN THAT NEEDS A NEW AGENT IS NOT AN ALARM, and it used to be drawn in the product's alarm red
   on every row. Measured on the owner's corpus on 19 August 2026: all 19 candidates the picker
   offered carried alarm red, because a hand-filed session with no transcript is this corpus's
   normal condition rather than a fault. design/UX-CONTRACT.md keeps the urgency inks for a fault, a
   missed agreed date or a person at risk, at most one per row, and says a mark on everything marks
   nothing. So this is weight and full-strength ink, not hue: it reads as the strongest line in the
   three without claiming something has gone wrong. */
.px-talk-warn[data-bad="1"] { color: var(--text); font-weight: 600; }
/* THE ONE PLACE IN THIS BOX THAT DOES EARN ALARM INK: the words on the screen are not the words
   that are stored, so a comment written now would be about text nobody holds. It is one line for
   the whole box rather than one per row, which is what the contract's at-most-one rule protects. */
.px-talk-warn[data-alarm="1"] { color: var(--st-failed); font-weight: 600; }
.px-talk-choices { display: flex; flex-wrap: wrap; gap: 6px; }
/* AT LEAST ONE PRESS HIGH, so the row keeps its height while it waits to be drawn. */
.px-talk-do { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; min-height: var(--row-h); }
/* WHY THE PRESS BESIDE IT IS OFF. Full ink and a little weight, because it is the sentence that
   says what to do next; no hue, because a control asking for something it has not been given is not
   a fault. It takes the whole row so it reads as a line under the presses rather than as a third
   one. */
.px-talk-refusal {
  flex-basis: 100%;
  font-size: var(--fs-1); color: var(--text); font-weight: 600; line-height: var(--lh-body);
}
/* THE BUTTON'S OWN PRESS-TO-REVEAL IS OFF IN THIS ROW ONLY, and nothing is lost by it: the same
   sentence is already drawn above by px-talk-refusal, in the same box, with the same live region
   role, from the moment the press is refused rather than after somebody has pressed it. Without
   this the reader would be shown one sentence twice. It is scoped to this one row, so the reason on
   every other refusing button in the product -- including the one inside the recipient picker -- is
   still the only copy of itself and is still drawn. */
.px-talk-do .px-why { display: none; }
.px-talk-note { font-size: var(--fs-1); color: var(--text-3); }
/* A LINE UNDER THE PRESSES, such as where Send put the words, takes the whole row. */
.px-talk-line { flex-basis: 100%; }

/* ---------------------------------------------------------------- More, and the short contact list
   MORE SITS AT THE END OF THE SEND ROW, and what it holds opens under that row inside the panel, so
   the panel grows and is placed again rather than a second popup opening. */
.px-talk-more-btn { margin-left: auto; }
.px-talk-more {
  display: flex; flex-direction: column; gap: 6px;
  padding: 6px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
}
.px-talk-more-row { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; }
.px-talk-more-line {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--gut);
  width: 100%;
  min-height: var(--row-h); padding: 0 10px;
  border: 0; border-top: var(--border-w) solid var(--border);
  background: none;
  color: var(--text);
  font-family: var(--font-ui); font-size: var(--fs-2);
  text-align: left;
  cursor: pointer;
}
.px-talk-more-line:hover { background: var(--hover); }
.px-talk-more-count { color: var(--text-3); font-size: var(--fs-1); white-space: nowrap; }
/* THE CONTACTS, ONE ROW EACH, WITH THEIR OWN SCROLL AT ABOUT TWELVE ROWS (option B). */
.px-talk-chooser { display: flex; flex-direction: column; gap: 6px; }
.px-talk-filter { width: 100%; box-sizing: border-box; }
.px-talk-contacts, .px-talk-notes-list {
  list-style: none; margin: 0; padding: 0;
  max-height: calc(12 * var(--row-h)); overflow-y: auto;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
}
.px-talk-contact, .px-talk-notes-one {
  display: flex; align-items: center; gap: 8px;
  width: 100%;
  min-height: var(--row-h); padding: 0 10px;
  border: 0;
  background: none;
  color: var(--text);
  font-family: var(--font-ui); font-size: var(--fs-2);
  text-align: left;
  cursor: pointer;
}
.px-talk-contact:hover, .px-talk-notes-one:hover { background: var(--hover); }
.px-talk-contact[aria-selected="true"], .px-talk-notes-one[aria-selected="true"] { font-weight: 700; }
.px-talk-contact-name, .px-talk-notes-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* HOW A PINNED CONTACT STANDS TO WHAT THE BOX IS ABOUT, at the row's end. A neutral ink: the words are to read, not a
   state to act on. */
.px-talk-contact-relation { flex: 0 0 auto; margin-left: auto; font-size: var(--fs-1); font-weight: 400; color: var(--text-3); white-space: nowrap; }
.px-talk-contacts-none { margin: 0; }
/* THE NOTES SEND CAN GO INTO, drawn as the contacts are, with the line about older notes under them. */
.px-talk-notes { display: flex; flex-direction: column; gap: 6px; }
.px-talk-notes-left { margin: 0; font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-body); }
/* THE NEW NOTE MARK: a plus in a circle in the accent colour before New note, and a line under New note in the list. */
.px-talk-new-note { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.px-talk-note-sign {
  flex: 0 0 auto; width: 16px; height: 16px;
  fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}
.px-talk-new-note .px-talk-note-sign { color: var(--accent); }
.px-talk-notes-new { border-bottom: var(--border-w) solid var(--border-strong); }
.px-talk-said { margin: 0; font-size: var(--fs-2); color: var(--text); line-height: var(--lh-body); }
/* WHO WROTE THE FORM THIS BOX IS ABOUT, AND WHEN. A note under the sentence rather than a second
   sentence: smaller and quieter, at the weight the record page gives the same phrase beside a
   stored form. */
.px-talk-wrote { margin: 0; font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-body); }
.px-talk-link { font-size: var(--fs-2); }

/* ---------------------------------------------------------------- who it is for */
.px-pick {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 22rem; overflow-y: auto;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}
.px-pick-head {
  margin: 0;
  font-size: var(--fs-1); font-weight: 700; color: var(--text-3);
  line-height: var(--lh-body);
}
.px-pick-one {
  display: flex; flex-direction: column; gap: 2px;
  width: 100%; padding: 6px 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  text-align: left;
  cursor: pointer;
}
.px-pick-one:hover { background: var(--hover); }
.px-pick-name { font-size: var(--fs-2); font-weight: 600; color: var(--text); }
.px-pick-why, .px-pick-also, .px-pick-none, .px-pick-rule {
  margin: 0;
  font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body);
}
.px-pick-also, .px-pick-rule { color: var(--text-3); }
.px-pick-warn { margin: 0; font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); }
/* The same argument as the composer's line just above: this is on every row of the list, and a
   corpus nobody has swept makes it true of every row. Weight, not hue. */
.px-pick-warn[data-bad="1"] { color: var(--text); font-weight: 600; }
.px-pick-say { display: flex; flex-direction: column; gap: 6px; }
.px-pick-say-row { display: flex; gap: 6px; align-items: center; }
.px-pick-answer { display: flex; flex-direction: column; gap: 6px; }
.px-pick-matched, .px-pick-refused {
  margin: 0;
  font-size: var(--fs-1); color: var(--text); line-height: var(--lh-body);
}
.px-pick-refused { font-weight: 600; }

/* ---------------------------------------------------------------- pointing at something
   HOW ANYBODY FINDS OUT THIS IS POSSIBLE. One control, at rest, in the frame, on every page at
   every width. It is drawn exactly like the review switch beside it, because the two are the same
   kind of thing: a product-wide act that belongs to the frame rather than to a page. */
.px-point-switch {
  display: flex; align-items: center; gap: 8px;
  width: 100%; min-height: var(--row-h);
  margin-bottom: 6px;
  padding: 0 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.px-point-switch:hover { background: var(--hover); color: var(--text); }
.px-point-switch[aria-pressed="true"] {
  background: var(--panel-3);
  border-color: var(--text-2);
  color: var(--text);
}

/* WHAT CAN BE TALKED ABOUT, SHOWN ON THE PAGE ITSELF while the control above is pressed. This is
   the answer to "how would anybody know", and it is a drawing rather than a sentence.

   IT MARKS THE PAGE AND NOT THE WINDOW. The rail, the top bar, the review column and the host every
   popup is drawn in are outside "#main", they keep their presses while the mode is on, and marking
   something a press will not take is the same lie as taking a press on something unmarked.

   THE EMIT RULE: THE OUTLINE FOLLOWS THE POINTER AND THE FOCUS, NOT THE WHOLE PAGE.

   This is a different rule from the one that decides what a right-click resolves to, and the two
   were the same thing until wave 5. The resolution rule says which elements carry a target: the
   nearest one above the pointer wins, and src/shared/regions.ts decides which parts of a report
   carry one at all. The emit rule says how many of those are DRAWN at once, and the answer is one.

   IT HAD TO CHANGE BECAUSE THE NUMBER CHANGED. Until wave 5 a report carried a handful of targets
   — one per block — so outlining every one of them under "#main" drew a handful of boxes. A report
   now carries one per paragraph, bullet, heading, table and fenced block: measured on one long
   report, 276 regions. Outlining all of them draws hundreds of nested boxes over the
   writing, which answers nobody's question and hides the words underneath.

   TWO CHANNELS, AND NEITHER OF THEM IS COLOUR. The thing a press would land on is SOLID. Everything
   holding it, up to the page, is DASHED. Line style survives greyscale and forced colours.

   THE INNERMOST ONE IS THE SOLID ONE, and the not-has clause below is what SAYS so. The pointer
   hovers every element it is inside, so a bare hover rule would claim a press lands on all of them.
   Measured: taking the clause out does not change the drawing, because the dashed rule that follows
   is more specific than a bare hover rule and wins on the holders anyway. The clause is kept
   because that is an argument about specificity arithmetic, and a rule a reader has to work out is
   a rule the next edit breaks. It is stated, not relied on. */
html[data-pointing="1"] #main [data-target]:hover:not(:has([data-target]:hover)),
html[data-pointing="1"] #main [data-target]:focus-visible:not(:has([data-target]:focus-visible)) {
  outline: 1px solid var(--text-2);
  outline-offset: 1px;
  background: var(--hover);
}
html[data-pointing="1"] #main [data-target]:has([data-target]:hover),
html[data-pointing="1"] #main [data-target]:has([data-target]:focus-visible) {
  outline: 1px dashed var(--text-3);
  outline-offset: 1px;
}

/* THE WORDS A WAITING COMMENT QUOTED. A light transparent wash and nothing else -- no border, no
   icon in the paragraph. The mark that says a comment exists is the small quote mark the mark
   layer draws on the object; this says WHICH WORDS. Painted by the browser's own highlight
   registry, so not one character of the document is changed to draw it. */
::highlight(mole-office-noted) {
  background-color: color-mix(in srgb, var(--text) 12%, transparent);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--text-3);
}

/* THE PART A READER WAS TAKEN TO BY "View original". Two channels, never colour alone: a rule
   down the left of the part and a wash behind it, so it is visible without either. It is taken off
   again by a clock, because a mark that stays is a mark that stops meaning "here, just now". */
.px-talk-stands {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px var(--pad);
  margin: var(--pad) 0 0;
}

.px-original-here {
  border-left: 3px solid var(--text-2);
  padding-left: 8px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  scroll-margin-top: var(--pad-lg);
}

/* ---------------------------------------------------------------- starting a review
   It sits at the top of the sidebar, which is what "top right" means on a desktop in this app. */
.px-review-switch {
  display: flex; align-items: center; gap: 8px;
  width: 100%; min-height: var(--row-h);
  margin-bottom: var(--pad);
  padding: 0 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.px-review-switch:hover { background: var(--hover); color: var(--text); }
.px-review-switch[aria-pressed="true"] {
  background: var(--panel-3);
  border-color: var(--text-2);
  color: var(--text);
}
.px-review-dot[data-on="1"] circle { fill: currentColor; }

/* ---------------------------------------------------------------- the review strip

   WHAT REPLACED WHAT. A block here used to describe a full-width bar as, in its own words, only
   there while a review is on and then unmissable. No component drew it. What a review being on
   actually changed was 88 of 1,296,000 pixels at 1440 and 0 of 351,000 at 390: one dot, ten pixels
   across, in the rail. This is the element those words were written for.

   THREE CHANNELS AND NOT ONE. A ring on the four edges of the content region, a hatch along the
   strip, and the words. No state in this product is carried by hue alone, and this one least of
   all: it is the state that says what a keystroke will do next.

   THE TOKENS FOR IT ARE DECLARED HERE AND BELONG IN tokens.css. They are here because that file
   belongs to somebody else this week, and moving them is a one-line change with no behaviour in
   it. Every one of them resolves to an existing token, so a theme still re-skins all of this.

   THE ACCENT IS A TINT AND NEVER THE SIGNAL. Whichever of the four is chosen the ring is still
   drawn, which is why the accent may safely be a preference.

   THE TWO PROPERTIES THAT PAINTED THE BAND ARE GONE WITH IT: --rev-bg and --rev-hatch. The band across the top of
   every page was removed on 5 September 2026, and
   nothing else ever read either of them. */
:root {
  --rev: var(--text);
  --rev-line: var(--text-2);
}
/* THE FOUR ACCENTS. Each is a hue this product already holds to a measured contrast, taken from
   the family rails, so none of them is a new colour and none of them can fail the floor. */
html[data-review-accent="blue"] { --rev: var(--family-structure); --rev-line: var(--family-structure); }
html[data-review-accent="green"] { --rev: var(--family-work); --rev-line: var(--family-work); }
html[data-review-accent="plum"] { --rev: var(--family-decisions); --rev-line: var(--family-decisions); }

/* THE RING ON THE CONTENT REGION.

   THE CLASS IS STILL CALLED px-strip-ring AND THERE IS NO STRIP. The band this ring was named
   after was removed on 5 September 2026; the name is kept because nine measurement scripts under
   design/round-nine and design/round-ten query it by that name, and a rename would leave each of
   them reading nothing and saying nothing about it.

   Viewport-fixed and inset to the region, so it is on all four
   edges of the screen at every scroll depth. An inset shadow on the box the page is drawn in would
   be a shadow on a box seventeen thousand pixels tall: two vertical lines at the sides and nothing
   top or bottom unless the reader happens to be at one end of the document.

   THE RAIL IS NOT INSIDE IT. The rail is the application's own chrome and has to go on working;
   framing it would say the frame is what changed rather than what is being read.

   THE FOUR NUMBERS ARE MEASURED AND WRITTEN ON THE ELEMENT, because the region's left edge is what
   a flex layout gave the content this frame, and no CSS length says it. */
.px-strip-ring {
  position: fixed;
  z-index: var(--z-mark);
  box-sizing: border-box;
  pointer-events: none;
  border: 3px solid var(--rev);
  transition: border-color 200ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .px-strip-ring { transition: none; }
}
html[data-review-motion="still"] .px-strip-ring { transition: none; }
/* EDGE OFF TAKES THE RING. The rule used to be that this setting could not take the word and the
   glyph, because those were in the band. There is no band, so what is left is the lit dot on the
   sidebar's Reviews control, which asks Mole Office through the same read as the ring.
   Nothing in the product can set this today; ReviewBar.tsx says so beside
   REVIEW_EDGES.

   THERE WAS A THIRD VALUE, called band, and it hid the ring and kept the band. With the band gone it
   would have been a second word for this same rule. It is out of REVIEW_EDGES, in ReviewBar.tsx. */
html[data-review-edge="off"] .px-strip-ring { display: none; }

.px-review-panel {
  display: flex; flex-direction: column; gap: var(--gut);
  padding: var(--pad-lg);
  border-bottom: var(--border-w) solid var(--border-strong);
  background: var(--panel-2);
}
.px-review-list { display: flex; flex-direction: column; gap: var(--gut); max-height: 26rem; overflow-y: auto; }
.px-review-item {
  display: flex; flex-direction: column; gap: 6px;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}
.px-review-item[data-named="1"] { border-color: var(--st-failed); }
.px-review-about { font-size: var(--fs-1); color: var(--text-3); }
/* THE WORDS A COMMENT WAS MADE ON. Quoted, so it reads as somebody else's text and not as a label,
   and it takes the same colour as the reading beside it when those words have moved or gone. */
.px-review-quote {
  font-size: var(--fs-1); color: var(--text); line-height: var(--lh-body);
  overflow-wrap: anywhere;
}
.px-review-quote[data-state="changed"], .px-review-quote[data-state="gone"] { color: var(--st-failed); }
.px-review-quote-cut { color: var(--text-3); }
.px-review-item-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.px-review-intent {
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  background: var(--panel-3);
  font-size: var(--fs-1); font-weight: 700; color: var(--text-2);
}
.px-review-to { font-size: var(--fs-1); color: var(--text-2); }
.px-review-item-acts { display: flex; gap: 6px; margin-left: auto; }
/* Both of these hold text a person or an agent wrote, and both keep the line breaks it was written
   with. So both break a long unbroken word, for the reason given over the message body above. */
.px-review-body { margin: 0; font-size: var(--fs-2); color: var(--text); line-height: var(--lh-body); white-space: pre-wrap; overflow-wrap: anywhere; }
.px-review-said { margin: 0; font-size: var(--fs-2); color: var(--text); line-height: var(--lh-body); white-space: pre-wrap; overflow-wrap: anywhere; }
.px-review-note { margin: 0; font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); }
/* The link to Agent runs, inside the sentence that says the runs are not on this list. */
.px-ag-link { color: var(--link); text-decoration: underline; }
/* THE WORK YOU CAN TALK ABOUT, AND THE SENTENCE THAT COUNTS IT. On this page the list does not
   scroll inside a box of its own. It did, 24rem high, and the box cut the last card it showed in half
   with the count sitting straight under the cut, so the count read as part of that card: at 390 it
   sat over the list (wave 13q's pictures), and at 1440 it did the same. The
   list holds at most twelve cards, so the page scrolls instead, and the count sits one step under
   the last whole card. The talk box keeps its own scrolling list; this rule is this page's alone. */
.px-talk-scroller.px-ag-sources { max-height: none; overflow-y: visible; }
.px-ag-count { margin-top: var(--pad); }

/* ---------------------------------------------------------------- the page */
.px-ag-title {
  margin: 0;
  font-size: var(--fs-6);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
}
/* THE READING COLUMN, and it is the shared one.
   This page is where a person reads what was said to an agent and what came back, so it is the
   longest continuous reading in this directory. --measure-read is declared in tokens.css and is
   the one number for a column somebody sits and reads; --measure is the wider cap for the one- and
   two-sentence captions the rest of the product is made of. It is a cap on the space this element
   is given, not a width, so a side pane that takes horizontal space narrows the text rather than
   pushing the page sideways. */
.px-ag-lead {
  margin: 4px 0 var(--pad-lg);
  max-width: var(--measure-read);
  font-size: var(--fs-3);
  color: var(--text-2);
  line-height: var(--lh-read);
}

/* ---------------------------------------------------------------- conversations */
.px-thread-list { display: flex; flex-direction: column; gap: 6px; }
.px-thread-row {
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
  width: 100%; padding: 8px 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  text-align: left;
  cursor: pointer;
}
.px-thread-row:hover { background: var(--hover); }
.px-thread-row[aria-pressed="true"] { background: var(--sel); }
.px-thread-name { font-size: var(--fs-2); font-weight: 600; color: var(--text); }
.px-thread-meta { font-size: var(--fs-1); color: var(--text-3); margin-left: auto; }

.px-msg {
  display: flex; flex-direction: column; gap: 4px;
  padding: var(--pad);
  border-left: var(--rail) solid var(--border-strong);
  background: var(--panel-2);
  border-radius: var(--radius-sm);
}
.px-msg-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
/* WHAT SOMEBODY SAID, AT A READING WIDTH. It had none, so a five-sentence message ran the whole
   width of a 1440 panel and the eye lost the start of the next line. See --measure-read. */
/* A LONG UNBROKEN WORD BREAKS RATHER THAN PUSHING THE PAGE SIDEWAYS.
   pre-wrap keeps the line breaks somebody typed and only ever breaks a line at a space, so one
   long token with no spaces in it is as wide as it is. Measured in Chromium on 19 August 2026 with
   one agent answer holding a 674-character path: the document scrolled to 5382px inside a 1440px
   window and to 5140px inside a 390px one, which is the one thing design/UX-CONTRACT.md says must
   never happen at either width. It matters now because Phase 9 puts agent-written text — paths,
   addresses, stack traces, resume commands — into this element for the first time. */
.px-msg-body {
  margin: 0; max-width: var(--measure-read);
  font-size: var(--fs-2); color: var(--text); line-height: var(--lh-body); white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.px-msg-about { font-size: var(--fs-1); color: var(--text-2); }
/* A COMMENT DISPATCH HELD BACK, drawn so it cannot be mistaken for one that went. Weight and a
   word, no hue: the reader has to do something about it -- correct who it is for and send again --
   but nothing has broken and the sentence under it says what is missing. */
.px-msg-waiting {
  padding: 1px 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1); font-weight: 700; color: var(--text);
}

/* ---------------------------------------------------------------- answering the answer
   IT IS PART OF THE CONVERSATION, not a panel beside it, so it carries the same left rail as the
   messages above and sits at the foot of them where somebody who has just finished reading is. */
.px-reply {
  display: flex; flex-direction: column; gap: var(--gut);
  margin-top: var(--pad);
  padding: var(--pad);
  border-left: var(--rail) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}
.px-reply-to {
  margin: 0; max-width: var(--measure-read);
  font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); overflow-wrap: anywhere;
}
.px-msg-about[data-state="changed"], .px-msg-about[data-state="gone"] { color: var(--st-failed); }

.px-run {
  display: flex; flex-direction: column; gap: 6px;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}
.px-run-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.px-run-state { font-size: var(--fs-2); font-weight: 700; color: var(--text); }
.px-run-says { margin: 0; font-size: var(--fs-1); color: var(--text-2); line-height: var(--lh-body); }
/* The agent's answer is the other half of the same conversation, so it reads at the same width and
   breaks a long unbroken word for the same reason the message body above does. */
.px-run-answer {
  margin: 0; max-width: var(--measure-read);
  font-size: var(--fs-2); color: var(--text); line-height: var(--lh-body); white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.px-run-focus { display: flex; flex-direction: column; gap: 4px; }

.px-talk-source {
  display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap;
  padding: 8px 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}
.px-talk-source-title { font-size: var(--fs-2); color: var(--text); }
.px-talk-source-acts { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.px-talk-scroller { display: flex; flex-direction: column; gap: 6px; max-height: 24rem; overflow-y: auto; }

@media (max-width: 480px) {
  .px-talk { width: calc(100vw - 2rem); }
  .px-review-acts { margin-left: 0; }
}
`
