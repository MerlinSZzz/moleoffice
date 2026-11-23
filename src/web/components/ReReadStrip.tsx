// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARKS THAT SAY A PAGE IS TAKING A NEWER ANSWER, AND WHAT HAPPENED WHEN ONE FAILED.
 *
 * Criterion E5: a page that re-reads keeps what it has on the screen until the new answer arrives,
 * and it must SAY so. Content that quietly goes old is worse than a blank, because the reader
 * cannot tell old from new. The hook (useAsync in ui.tsx) knows when it is keeping a previous
 * answer and when a newer answer failed; this file is where that is drawn.
 *
 * ONE MARK, DRAWN ONCE IN THE SHELL. There are 129 call sites of the hook in 58 files, and not one
 * of them should have to remember to draw a mark. The hook writes its state into a small store; the
 * shell draws this mark once. The store clears a read's marks when the read lands, when it fails,
 * or when the reader leaves the page — a fault clears when the reader leaves the page.
 *
 * IT DRAWS NOTHING WHEN THERE IS NOTHING TO SAY, which is every ordinary moment. That is the same
 * rule the wrong-world banner and the visiting strip follow.
 *
 * THE THREE THINGS IT SAYS, AND WHERE THEY ARE DRAWN:
 *
 *   Refreshing…            the page is taking a newer answer; what is on screen is the previous
 *                          one. A fact, not a fault: no alarm. The reader who can see the page
 *                          sees a thin ring turning around the person's picture at the sidebar's
 *                          foot, or around the press that opens the sidebar where it is a drawer.
 *                          The word itself is a visually hidden live status, so a screen reader
 *                          hears it, as it heard the bar this replaced. Nothing is drawn over the
 *                          foot's row: every press there works while a page refreshes.
 *   A newer read failed.   the newer answer did not arrive; what is on screen is still the previous
 *                          one, and this is why. Drawn with ErrorNote, the one component that turns
 *                          a fault into words, so it looks like every other failure in the product.
 *                          It sits at the foot of the page column, starting where the sidebar ends,
 *                          so it covers neither the foot's row nor the chat button's corner. It
 *                          carries no retry of its own: the press that led here is still on the
 *                          screen, because the content was kept.
 *   Reading <project>…     the project was switched, and the page still draws what it read for the
 *                          project just left until the chosen project's answer comes. The title
 *                          already names the chosen project, so without this a reader takes the old
 *                          project's rows for the new one's. The page column is dimmed and the strip
 *                          says which project is being read, at the same foot of the column as a
 *                          failed read and in the same look. It comes in the frame the new name comes
 *                          and goes in the frame the new rows come.
 */

import { useSyncExternalStore } from 'react'
import { content, t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { ErrorNote, subscribeReReadMarks, theReReadMarks } from './ui.tsx'

/** `project` is the chosen project's name as the switcher shows it, for the sign that the page still
 *  draws the project just left. */
export function ReReadStrip({ project }: { project: string }) {
  useLanguage()
  const marks = useSyncExternalStore(subscribeReReadMarks, theReReadMarks, theReReadMarks)
  const another = marks.anotherProject > 0
  if (marks.refreshing === 0 && marks.errors.length === 0 && !another) return null
  const failed = marks.errors.length > 0
  return (
    <>
      <style href="mole-office-reread-strip" precedence="default">
        {REREAD_CSS}
      </style>
      <div className="px-reread" data-says={failed ? 'failed' : 'refreshing'} data-another-project={another ? '' : undefined}>
        {another ? (
          <p className="px-reread-another">
            <strong>{t('frameFiles.reread.anotherProject', { project: content(project) })}</strong>
          </p>
        ) : null}
        {marks.refreshing > 0 ? (
          <span className="px-reread-what sr-only" role="status" aria-live="polite">{t('frameFiles.reread.refreshing')}</span>
        ) : null}
        {marks.errors.map((one, i) => (
          <ErrorNote key={i} label={t('frameFiles.reread.failed')} message={one.message} fault={one.fault ?? null} />
        ))}
      </div>
    </>
  )
}

// NO BACKTICK ANYWHERE IN THIS TEMPLATE LITERAL: a backtick inside it, even in a comment, closes
// the string and turns the rest of the file into nonsense. The variables are the page's own, so the
// strip reads the same in both themes and holds together at every width.
//
// AT THE FOOT OF THE PAGE COLUMN, and why: the mark has to be where the reader is looking, and the
// reader who pressed Recheck may be deep in a long page. Every other strip and bar in the shell is
// pinned to the top, so the bottom is the one place this can sit without covering or being covered
// by one. It starts where the sidebar ends, measured by the shell's --sidebar-w, so it never covers
// the foot's row; where the sidebar is a drawer that value is zero and the page column is the
// window's width.
//
// EXCEPT THE CHAT BUTTON, which sits in the bottom right corner over everything. The strip keeps
// the button's room free on the right, with the same tokens the button is placed by.
//
// IT TAKES NO PRESS. While a page refreshes the strip holds only the hidden live status, so it has
// no height and nothing to press. When a fault is shown, or the sign that the page still draws the
// project just left, its words are read and its own sentence is plain text; the strip still lets no
// press through to nothing behind it, and the foot's row lies outside its box.
//
// THE DIMMED PAGE. While the sign is up, everything in the page column but the strip's own holder is
// drawn at a lower opacity, so the rows of the project just left look like what they are. The title
// with the chosen project's name is outside the column and stays at full strength.
const REREAD_CSS = `
.px-reread {
  position: fixed;
  bottom: 0;
  left: var(--sidebar-w, 0px);
  right: 0;
  z-index: var(--z-bar);
  display: flex;
  flex-direction: column;
  gap: var(--pad);
  padding: 0 calc(var(--fab-size) + 2 * var(--fab-inset)) 0 0;
  pointer-events: none;
}
.px-reread[data-says="failed"],
.px-reread[data-another-project] {
  padding: var(--pad) calc(var(--fab-size) + 2 * var(--fab-inset)) var(--pad) var(--pad-lg);
  border-top: var(--border-w) solid var(--border);
  background: var(--panel-2);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  color: var(--text-2);
  pointer-events: auto;
}
.px-reread .px-error { flex: 1 1 100%; }
.px-reread-another { margin: 0; }
.px-reread-another strong { color: var(--text); }
#main:has(.px-reread[data-another-project]) > :not(:has(.px-reread)) { opacity: .45; }
/* THE STRIP KEEPS CLEAR OF A CHAT SPLIT ON THE RIGHT, reading the width the chat wrote on the root,
   so a failed re-read's sentence is not drawn under the chat. */
:root[data-chat-split='right'] .px-reread { right: var(--chat-split-w, 0px); }
/* ON THE LEFT it begins where the chat ends, for the same reason the review tray does: the shell's
   column moved right by the chat's width, and a strip still pinned to the rail began under it. */
:root[data-chat-split='left'] .px-reread { left: calc(var(--sidebar-w, 0px) + var(--chat-split-w, 0px)); }

/* THE RING THAT SAYS A READ IS IN FLIGHT. It is a pseudo-element, so it takes no room in the foot
   and cannot push the name or the presses onto a second line. It turns with the page's own accent
   in both themes, and it stands still when reduced motion is asked for.

   THE DISC'S RING TURNS AS A SHAPE: a circle with two of its four sides in the accent, turning.
   THE MENU PRESS'S RING KEEPS ITS ROUNDED-RECTANGLE SHAPE and turns the light around inside it; a
   rectangle turned as a shape would swing outside the press and across what is beside it. */
.sbp-disc[data-refreshing] { position: relative; }
.sbp-disc[data-refreshing]::after {
  content: '';
  position: absolute;
  inset: -2px;
  pointer-events: none;
  border: 2px solid transparent;
  border-top-color: var(--accent);
  border-right-color: var(--accent);
  border-radius: 50%;
  animation: px-reread-turn 900ms linear infinite;
}
@property --px-reread-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.shell-menu[data-refreshing] { position: relative; }
.shell-menu[data-refreshing]::after {
  content: '';
  position: absolute;
  inset: -1px;
  pointer-events: none;
  border-radius: calc(var(--radius-sm) + 1px);
  padding: 2px;
  background: conic-gradient(from var(--px-reread-angle), transparent 0deg 270deg, var(--accent) 330deg 360deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: px-reread-turn-angle 900ms linear infinite;
}
@keyframes px-reread-turn { to { transform: rotate(360deg); } }
@keyframes px-reread-turn-angle { to { --px-reread-angle: 360deg; } }
@media (prefers-reduced-motion: reduce) {
  .sbp-disc[data-refreshing]::after,
  .shell-menu[data-refreshing]::after { animation: none; }
}
`
