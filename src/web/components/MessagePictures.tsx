// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURES ONE MESSAGE CARRIES, drawn the way this browser asked for. Criterion M64.
 *
 * ---------------------------------------------------------------------------------------
 * ONE COMPONENT, FIVE PLACES
 * ---------------------------------------------------------------------------------------
 *
 * A message is drawn in the conversation with one participant, in a group, in what an unregistered
 * writer sent, in a conversation between two agents, and again as a row of the pool page. All five
 * draw this, so the three answers — the picture shown, the picture shown after a press, the path
 * alone — are decided in one place. Five copies of that rule is this repository's own named defect.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ANSWERS, AND WHAT EACH ONE ACTUALLY DOES
 * ---------------------------------------------------------------------------------------
 *
 *   Shown       The bytes are fetched and the picture is drawn.
 *   On a press  NOTHING IS FETCHED. A placeholder carries the alt text and one press; the press is
 *               what asks for the bytes. Fetching everything and then hiding it would be a setting
 *               about what is drawn rather than about what is done.
 *   Path only   The path, as text, and no request at all. What somebody who is going to open the
 *               file in another program came for.
 *
 * A press turns one picture on and it stays on for as long as the panel is open. It does not change
 * the setting: a person who asked for pictures on a press has asked for that on every message, and
 * one press changing every future message would be a setting moved by a gesture that never named it.
 *
 * ---------------------------------------------------------------------------------------
 * THE ALT TEXT IS THE PLACEHOLDER, AND IS NEVER A GREY BOX
 * ---------------------------------------------------------------------------------------
 *
 * A reader deciding whether to press has to be told what they would be pressing for. `alt` is
 * required on an `ImageBlock` for exactly that reason, and it is drawn as visible text here rather
 * than left in an attribute where only a screen reader would find it.
 *
 * ---------------------------------------------------------------------------------------
 * THE BYTES COME THROUGH THE SAME DOOR A REPORT'S PICTURE COMES THROUGH
 * ---------------------------------------------------------------------------------------
 *
 * `usePictureBytes` and `ImagePreview` are the report's own, imported rather than written again:
 * `GET /api/file` serves a path only while a live record in this project points at it, and the
 * message IS that record. The refusals — the file is missing, the door refused it, nothing
 * answered — are the ones already worded and tested there, so a picture that will not draw says
 * the same thing in a conversation as it says in a report.
 *
 * ---------------------------------------------------------------------------------------
 * A FILE THAT IS NOT A PICTURE IS OFFERED, NOT DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * A file sent in the chat once came through the picture's own request, which reads a file whole, so
 * an installer of 290 MB was refused and drawn as "refused", with no way to save it. Now
 * the headers come first, asked as a save so that a file of any size says what it is and how large,
 * and no byte is read for them. A picture the page can draw whole is then fetched and drawn, a film
 * plays from the door, and any other file gets its name, its size, and presses that open it and save it.
 * Both presses are addresses the browser fetches itself, streamed and of any size, so no byte of the file
 * passes through this page and no press leads to the door's 25 MB refusal.
 */

import { useState } from 'react'

import type { ImageBlock } from '@shared/types.ts'
import { sizeSaid } from '@shared/fileblocks.ts'
import { t } from '@shared/i18n.ts'
import { MESSAGE_PICTURE_PRESS } from '@shared/messagepictures.ts'
import { MAX_PREVIEW_BYTES } from '@shared/preview-limit.ts'
import {
  ImagePreview,
  isAPictureFile,
  isAVideo,
  SummaryStyle,
  usePictureBytes,
  whereALinkFetches,
  type PreviewOutcome,
} from './SummaryBlocks.tsx'
import { useMessagePictures } from '../lib/messagepictures.ts'
// EACH PICTURE SAYS WHICH PART OF ITS MESSAGE IT IS, so a right-click takes that picture. Problem
// DowO7yEioWp0. The id is spelled by the one writer the server's region tree also uses.
import { messagePictureRegionId } from '@shared/regions.ts'
import { theRegion } from './sections.ts'
import { nameAttributes } from './agent/pointing.ts'

/**
 * The target one picture carries, or nothing when the message is not a stored record. Its name is
 * what the sender wrote the picture shows, so the box a right-click opens says which picture it is.
 */
function whichPart(ofMessage: string | undefined, block: ImageBlock): Record<string, string> {
  if (ofMessage === undefined) return {}
  return { ...theRegion(ofMessage, messagePictureRegionId(block.id)), ...nameAttributes(block.alt) }
}

/**
 * One file of one message: a picture, a film, or any other file.
 *
 * `wanted` is false only under "On a press", and only until this reader presses. `usePictureBytes`
 * takes it and asks for nothing while it is false.
 */
function OnePicture({
  block,
  choice,
  inProject,
  ofMessage,
}: {
  block: ImageBlock
  choice: 'shown' | 'pressed'
  inProject: string
  ofMessage: string | undefined
}) {
  const [pressed, setPressed] = useState(false)
  const wanted = choice === 'shown' || pressed
  // Ask for the type and length of a file of any size without reading its bytes.
  const head = usePictureBytes(block.path, wanted, inProject, true, true, ofMessage)
  const said = head.outcome.phase === 'shown' ? head.outcome : null
  // THEN THE WHOLE OF A PICTURE THE PAGE DRAWS, and of nothing else. A path the browser loads itself is left to it, as before.
  const drawnWhole =
    head.direct ||
    (said !== null && isAPictureFile(said.type) && said.bytes !== null && said.bytes <= MAX_PREVIEW_BYTES)
  const whole = usePictureBytes(block.path, wanted && drawnWhole, inProject, false, false, ofMessage)

  if (!wanted) {
    return (
      <button
        type="button"
        className="px-chat-pic-wait"
        {...whichPart(ofMessage, block)}
        onClick={() => {
          setPressed(true)
        }}
      >
        {/* WHAT THE PICTURE SHOWS, in the words whoever sent it wrote. It is the whole reason to
            press, so it is the biggest thing on the placeholder. */}
        <span className="px-chat-pic-alt">{block.alt}</span>
        <span className="px-chat-pic-press">{MESSAGE_PICTURE_PRESS.show}</span>
      </button>
    )
  }

  return (
    <div className="px-chat-pic sb-image" {...whichPart(ofMessage, block)}>
      {said === null ? (
        <>
          <ImagePreview block={block} outcome={head.outcome} />
          {/* WHERE THE FILE IS, for one the door would not serve: an older message, sent before the send was checked,
              or a file moved since. It can still be opened where it lives. */}
          {head.outcome.phase === 'refused' || head.outcome.phase === 'missing' ? (
            <code className="px-chat-file-path">{block.path}</code>
          ) : null}
        </>
      ) : isAVideo(said.type) ? (
        <ImagePreview block={block} outcome={said} />
      ) : drawnWhole ? (
        <>
          <ImagePreview block={block} outcome={whole.outcome} onFailed={whole.itWouldNotDraw} />
          {/* A PICTURE IS SAVED FROM THE DOOR, as a report's is: the one on screen is a copy in this page. A picture at a
              web address is the browser's own to save. */}
          {whole.outcome.phase === 'shown' && !head.direct ? (
            <a className="sb-picture-save" href={whereALinkFetches(block.path, true, inProject, ofMessage)} download>
              {t('sb.picture.save')}
            </a>
          ) : null}
          {/* BYTES THAT ARRIVED AND WOULD NOT DRAW are still a file, so it is offered as one beside the reason. */}
          {whole.outcome.phase === 'undecodable' ? <TheFile block={block} inProject={inProject} said={said} ofMessage={ofMessage} /> : null}
        </>
      ) : (
        <TheFile block={block} inProject={inProject} said={said} ofMessage={ofMessage} />
      )}
      {block.caption ? <p className="px-chat-pic-caption">{block.caption}</p> : null}
    </div>
  )
}

/** WHERE OPEN TAKES A FILE: the address a link fetches it at, with the door's open=1 (src/server/api/files.ts). */
function whereAFileOpens(path: string, inProject: string, record?: string): string {
  return `${whereALinkFetches(path, false, inProject, record)}&open=1`
}

/**
 * A FILE THE CHAT DOES NOT DRAW: what the sender wrote it is, its name and size, and the presses that reach it.
 *
 * Both presses are addresses the browser fetches itself, so no byte passes through this page. Open asks the door's
 * open=1, which streams the file into a new tab at any size; Save asks download=1, which streams it whole as an
 * attachment. A size the door did not say is drawn as not said, never as 0.
 */
function TheFile({
  block,
  inProject,
  said,
  ofMessage,
}: {
  block: ImageBlock
  inProject: string
  said: Extract<PreviewOutcome, { phase: 'shown' }> | null
  ofMessage?: string
}) {
  const bytes = said?.bytes ?? null
  return (
    <div className="sb-file-fetch px-chat-file">
      <span className="px-chat-pic-alt">{block.alt}</span>
      <dl className="sb-file-facts">
        <div>
          <dt>{t('sb.fileFacts.name')}</dt>
          <dd className="sb-file-name">{block.path.slice(block.path.lastIndexOf('/') + 1)}</dd>
        </div>
        <div>
          <dt>{t('sb.fileFacts.size')}</dt>
          <dd className="sb-file-size">{bytes === null ? t('chat.attachment.sizeUnknown') : sizeSaid(bytes)}</dd>
        </div>
      </dl>
      <p className="sb-file-address">
        <a className="sb-file-open" href={whereAFileOpens(block.path, inProject, ofMessage)} target="_blank" rel="noreferrer">
          {t('sb.file.open')}
        </a>
        <a className="sb-file-save" href={whereALinkFetches(block.path, true, inProject, ofMessage)} download>
          {t('sb.file.save')}
        </a>
      </p>
    </div>
  )
}

/**
 * Every picture one message carries, or nothing at all because it carries none.
 *
 * NOTHING IS DRAWN FOR A MESSAGE WITH NO PICTURES — not an empty box, not a line saying there are
 * none. Most messages carry none and a word about that on every one of them would say nothing.
 */
export function MessagePictures({
  pictures,
  inProject,
  ofMessage,
}: {
  pictures: readonly ImageBlock[]
  /**
   * WHICH PROJECT THE MESSAGE CARRYING THESE LIVES IN, and it is not always the one on screen.
   *
   * The chat is the person's in every project (criterion M55), so a message written in one project
   * is drawn while the reader is standing in another. The preview door serves a file on the
   * authority of a record in the project being asked about, so asking in the project on screen gets
   * an honest refusal naming the right project and no picture. Measured on 7 September 2026 against
   * a copy of their corpus: every picture in a message from another project drew the refusal.
   */
  inProject: string
  /**
   * THE STORED MESSAGE THESE PICTURES BELONG TO, when there is one. Each picture then says which
   * part of that message it is. Left out for a message that is not stored yet.
   */
  ofMessage?: string
}) {
  const choice = useMessagePictures()
  if (pictures.length === 0) return null

  return (
    <div className="px-chat-pics" data-pictures={choice}>
      {/* THE REPORT'S OWN STYLESHEET, because the picture and every one of its refusals are the
          report's own components. React de-duplicates it by href, so a page already drawing a
          report gets one copy and not two. */}
      <SummaryStyle />
      <style href="mole-office-message-pictures" precedence="default">
        {MESSAGE_PICTURES_CSS}
      </style>
      {pictures.map((block) =>
        choice === 'path' ? (
          // THE PATH AND NOTHING ELSE, and no request made. The words are still there, because a
          // path with nothing saying what is at the end of it is a string rather than a picture.
          <p key={block.id} className="px-chat-pic-path" {...whichPart(ofMessage, block)}>
            <span className="px-chat-pic-alt">{block.alt}</span>
            <code>{block.path}</code>
          </p>
        ) : (
          <OnePicture key={block.id} block={block} choice={choice} inProject={inProject} ofMessage={ofMessage} />
        ),
      )}
    </div>
  )
}

/**
 * The rules for a picture inside a bubble. Every value is a token, so a preset swap reaches it.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const MESSAGE_PICTURES_CSS = `
.px-chat-pics { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; min-width: 0; }
/* A CONVERSATION IS SCROLLED AND A REPORT IS READ, so a picture in a bubble is capped in height as
   well as in width. Without the cap one screenshot of a whole screen fills the panel and the words
   under it are a scroll away. The number is in the viewport's own units so it stays a share of the
   panel at every one of the four widths. */
/* AND IT IS NEVER BLOWN UP. A picture in a flex column stretches to the column's width by default,
   so a small screenshot was drawn several times its own size and read as a blurred one. Starting it
   at the leading edge draws it at its own size, and max-width still fits a big one to the bubble. */
.px-chat-pic img, .px-chat-pic video { max-height: 40vh; object-fit: contain; align-self: flex-start; }
/* THE PICTURE'S OWN BOX IS AS WIDE AS THE PICTURE, not as the bubble. A right-click on it takes the
   picture, and the frame drawn round what was taken is this box. */
.px-chat-pic { align-self: flex-start; max-width: 100%; min-width: 0; }
.px-chat-pic-caption {
  margin: 0; color: var(--text-3);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
/* THE PLACEHOLDER SOMEBODY PRESSES. Dashed while there is nothing there yet, which is the same
   non-text channel the report's own stand uses for the same meaning. */
.px-chat-pic-wait {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  width: 100%; min-height: var(--row-h); padding: var(--pad);
  text-align: start;
  background: var(--panel-2); color: var(--text-2);
  border: var(--border-w) dashed var(--border-strong); border-radius: var(--radius);
  cursor: pointer;
}
.px-chat-pic-wait:hover { background: var(--hover); }
.px-chat-pic-wait:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.px-chat-pic-alt { font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.px-chat-pic-press { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-3); }
.px-chat-pic-path {
  display: flex; flex-direction: column; gap: 3px; margin: 0; min-width: 0;
}
/* A FILE THAT IS NOT DRAWN fills the bubble's width, so its name and its presses wrap inside it at 390. */
.px-chat-pic:has(> .px-chat-file) { align-self: stretch; }
.px-chat-file { min-width: 0; }
.px-chat-pic > .sb-picture-save { align-self: flex-start; }
/* user-select all, because the path is the whole point of this answer: one press of the mouse takes
   the lot instead of asking somebody to drag across a line that wraps. */
.px-chat-pic-path code, .px-chat-file-path {
  font: var(--fs-1)/var(--lh-tight) var(--font-mono); color: var(--text-2);
  background: var(--panel-2); border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm); padding: 2px 5px;
  overflow-wrap: anywhere; user-select: all;
}
`
