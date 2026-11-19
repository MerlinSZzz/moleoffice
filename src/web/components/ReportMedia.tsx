// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SOUND OR A FILM A REPORT PLAYS IN THE PAGE.
 *
 * A person can hear voice samples of about twenty seconds, in Chinese and in English, inside a
 * report, as they see a picture there; and the studio's sample films follow. An `audio` block and a
 * `video` block each name a file the office keeps, by the four facts POST /api/report-files hands
 * back, and this file draws them.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PLAYBACK, NOT A SECOND ONE
 * ---------------------------------------------------------------------------------------
 *
 * A report's video already plays from the file door. `usePictureBytes` asks
 * the door what the file is and, for a player, stops at the headers and hands the player the door's
 * own address, which the player asks a stretch at a time with Range. Beside it is a link that saves
 * the whole file. This file uses exactly that:
 *
 *   - a `video` block is drawn by `ImagePreview`, the same player an image block that holds a video
 *     draws, with its own save link;
 *   - an `audio` block is drawn as `ImagePreview` draws a video, with `<audio>` in place of `<video>`:
 *     the same address, `controls`, `preload="metadata"`, the alt text as its accessible name, and
 *     the same save link. `ImagePreview` draws `<video>` or `<img>` and nothing else, and a `<video>`
 *     given sound alone draws an empty black frame, so the sound element is written here.
 *
 * The person's choice of whether media load (criterion U5) is applied by the same hook every report
 * figure uses, and a file not loaded is drawn by the same drawing. Both belong to
 * SummaryBlocks.tsx and are handed in by its one case for each block, so this file holds no second
 * copy of the rule. The caption is drawn there too, where the report's region marks are.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS SHOWN
 * ---------------------------------------------------------------------------------------
 *
 * The file's name, size and short sha256, as a file block shows them; then the player, or the reason
 * there is none; then the caption. If the door serves the file as something other than the block's
 * kind, the page says so and plays nothing, rather than handing a player bytes it was not told about.
 */

import type { ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import type { MediaLoadChoice } from '@shared/mediaload.ts'
import { playerForType } from '@shared/reportmedia.ts'
import type { AudioBlock, FileBlock, ImageBlock, VideoBlock } from '@shared/types.ts'
import { FileFacts, ImagePreview, usePictureBytes, type BlockMark } from './SummaryBlocks.tsx'

/** What the person's media choice says for one figure. The shape `useMediaChoice` in SummaryBlocks.tsx returns. */
export interface MediaChoice {
  inForce: MediaLoadChoice
  rowWasRead: boolean
  wanted: boolean
  onPress: () => void
}

/** What SummaryBlocks.tsx hands in: the block, its marks, its caption, and its two media-choice pieces. */
export interface PlayedProps<B extends AudioBlock | VideoBlock> {
  block: B
  mark: BlockMark
  /** The caption, already drawn with its region mark, or null when the block has none. */
  caption: ReactNode
  /** `useMediaChoice` from SummaryBlocks.tsx. A hook, called once on every render of this figure. */
  useChoice: () => MediaChoice
  /** The record this figure is drawn in, so the door checks it rather than searching the project. */
  record?: string
  /** `MediaNotLoaded` from SummaryBlocks.tsx: what a figure draws when its media are not loaded. */
  Held: (props: {
    block: Pick<ImageBlock, 'alt'> & { size?: number }
    choice: MediaLoadChoice
    rowWasRead: boolean
    onPress: () => void
  }) => ReactNode
}

/** An `audio` block: the voice sample, played in the page. */
export function ReportAudio(props: PlayedProps<AudioBlock>) {
  return <PlayedFigure {...props} />
}

/** A `video` block: the sample film, played in the page. */
export function ReportVideo(props: PlayedProps<VideoBlock>) {
  return <PlayedFigure {...props} />
}

function PlayedFigure({ block, mark, caption, useChoice, Held, record }: PlayedProps<AudioBlock | VideoBlock>) {
  const { inForce, rowWasRead, wanted, onPress } = useChoice()
  // The door says what the bytes are before the player asks for them. Nothing is requested
  // until the person's choice lets it. Video metadata can be kept by the browser.
  const { outcome } = usePictureBytes(block.path, wanted, undefined, true, block.type === 'video', record)
  const facts: FileBlock = { id: block.id, type: 'file', path: block.path, name: block.name, size: block.size, hash: block.hash }
  return (
    <figure className="sb-block sb-file rm-media" data-media={block.type} {...mark}>
      <style href="mole-office-report-media" precedence="default">{REPORT_MEDIA_CSS}</style>
      <FileFacts block={facts} />
      {wanted ? (
        <Player block={block} outcome={outcome} />
      ) : (
        <Held block={{ alt: block.alt, size: block.size }} choice={inForce} rowWasRead={rowWasRead} onPress={onPress} />
      )}
      {caption}
    </figure>
  )
}

/**
 * THE PLAYER, OR THE REASON THERE IS NONE. Exported so a `path` block whose kind is video plays on this
 * same player (problem Od74zEnc5kU9); it reads only the four facts named here, which a path block has.
 */
export function Player({ block, outcome }: {
  block: Pick<AudioBlock | VideoBlock, 'id' | 'type' | 'path' | 'alt'>
  outcome: ReturnType<typeof usePictureBytes>['outcome']
}) {
  const picture: ImageBlock = { id: block.id, type: 'image', path: block.path, alt: block.alt }
  if (outcome.phase !== 'shown') return <ImagePreview block={picture} outcome={outcome} />
  if (playerForType(outcome.type) !== block.type) {
    return (
      <div className="sb-image-stand" data-preview="not-played">
        <p>{t(block.type === 'audio' ? 'reportMedia.audio.notPlayed' : 'reportMedia.video.notPlayed')}</p>
      </div>
    )
  }
  if (block.type === 'video') return <ImagePreview block={picture} outcome={outcome} />
  return (
    <>
      <audio src={outcome.src} controls preload="metadata" aria-label={block.alt} />
      {outcome.saveAt === undefined ? null : (
        <a className="sb-video-save" href={outcome.saveAt} download>
          {t('reportMedia.saveWholeAudio')}
        </a>
      )}
    </>
  )
}

/**
 * THE PLAYERS' WIDTHS. A player is never wider than the column it stands in, so a phone at 390
 * pixels does not scroll sideways; a sound player takes the column's width, up to a reading line.
 */
const REPORT_MEDIA_CSS = `
.rm-media video { display:block; max-width:100%; height:auto; border-radius: var(--radius); }
.rm-media audio { display:block; width:100%; max-width:40rem; }
.rm-media .sb-image-stand[data-preview="not-played"] { border-style: solid; }
`
