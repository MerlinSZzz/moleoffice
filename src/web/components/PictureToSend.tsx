// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
/**
 * CHOOSING FILES TO SEND IN A MESSAGE, AND REFUSING FILES OVER THE LIMIT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M65, written whole in
 * design/messages/ACCEPTANCE.md section 38: a screenshot taken on their other machine has to reach an
 * agent here through the chat, and not by being copied across by hand first.
 *
 * So the composer takes files — chosen or dropped — sends the bytes, and the message that follows
 * carries each path as an image block. Nothing here writes a message: `send` in Chat.tsx does that,
 * through the one write door, and this hands it the blocks to carry.
 *
 * ---------------------------------------------------------------------------------------
 * SEVERAL PICTURES, NOT ONE (M66), AND WHAT WENT WITH THAT
 * ---------------------------------------------------------------------------------------
 *
 * A second picture used to replace the first, so this held one picture and a multi-file drop was
 * refused in words. It now holds a list. Choosing or dropping another ADDS it; nothing is pushed
 * out; the whole list goes in one message.
 *
 * Three more of their sentences changed the same row:
 *
 *   M68  THE BOX ASKING WHAT A PICTURE SHOWS IS GONE. A picture is now pressed to open it in a
 *        floating window instead. The alt text a message carries is the file's own name, which is
 *        what an empty box already fell back to, so nothing is lost and nobody is asked twice.
 *   M69  NAME AND SIZE UNDER EACH PICTURE, on one line, with the pictures in a row across. A long
 *        name fades out at its end rather than wrapping.
 *   M70  A CLOSE MARK AT EACH PICTURE'S TOP-RIGHT takes that one out. The words "take it out" are
 *        gone with it.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIMIT IS READ FROM THE SERVER, so a file over it is refused with its size and the limit
 * before it is sent. The server checks again when a file is uploaded. While the read is pending,
 * a person may still choose a file; the server remains the final check.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ImageBlock } from '@shared/types.ts'
import { api, errorMessage } from '../api.ts'
import { Overlay, useCloseOnOutsidePress } from './ui.tsx'
// AND THE MARK THAT SAYS A BOX CARRIES ON PAST ITS EDGE. The row of chosen pictures scrolls
// sideways rather than wrapping, and a box that scrolls in silence is what that component exists
// to stop: on a platform whose scrollbar is 0px wide there is nothing at all to notice.
import { InReachBox, useReach } from './InReach.tsx'
import { AShapePress, AttachShape } from './chat/Shapes.tsx'

/** What a person reads here. Every one of them is a name or one plain sentence. */
export const PICTURE_WORDS = {
  get attach() { return t('chat.attachment.attach') },
  get takeOutShort() { return t('chat.attachment.takeOutShort') },
  get windowName() { return t('chat.attachment.windowName') },
  get wordsToo() { return t('chat.attachment.wordsToo') },
  get sending() { return t('chat.attachment.sending') },
  get closeTheWindow() { return t('chat.attachment.close') },
  takeOut: (name: string): string => t('chat.attachment.takeOut', { name }),
  openIt: (name: string): string => t('chat.attachment.openIt', { name }),
  tooBig: (name: string, size: string, limit: string): string => t('chat.attachment.tooBig', { name, size, limit }),
} as const

/** Megabytes, to one decimal place, for a person rather than for a machine. */
export function inMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1)} MB`
}

/** A picture, or any other file, a person has chosen and not yet sent. */
export interface PictureChosen {
  /**
   * This browser's own name for this one picture, so a list of them can be drawn and taken apart.
   *
   * NOT THE FILE'S NAME: a person may choose the same screenshot twice, and two rows sharing a name
   * are one row that flickers. It is never sent anywhere.
   */
  key: string
  file: File
  /**
   * A url for this browser's own copy of the bytes, so the preview needs no server at all. NULL FOR A FILE THAT IS
   * NOT A PICTURE: it is held by its name alone and goes through the file door.
   */
  preview: string | null
}

/** What the limits read answered, or why it could not be read. */
type Limits =
  | { known: 'not yet' }
  | { known: 'no'; why: string }
  | { known: 'yes'; maxBytes: number; types: string[]; said: string }

/** What a box being dragged over takes, so a composer becomes a drop target in one line. */
export interface DropTarget {
  onDragOver(event: React.DragEvent): void
  onDragLeave(): void
  onDrop(event: React.DragEvent): void
  'data-dropping': 'yes' | 'no'
}

/** Everything the composer needs to choose, draw, send and clear the pictures of one message. */
export interface PictureToSend {
  /** Every picture waiting to go, in the order they were chosen. Criterion M66. */
  chosen: readonly PictureChosen[]
  fault: string | null
  sending: boolean
  limits: Limits
  /** Spread onto the box a file may be dropped on. Criterion M65: chosen or dropped. */
  dropOn: DropTarget
  /** Take files a person chose or dropped, adding them. Refuses in words what cannot be sent. */
  take(files: readonly File[]): void
  /** Take one picture out of the row. Criterion M70. */
  takeOut(key: string): void
  /**
   * Take out the pictures a finished send carried, and only those. A picture added while the send was uploading
   * was not in it, so it stays in the row to go with the next send (problem BfvfcYSCa7nW).
   */
  sent(these: readonly PictureChosen[]): void
  /**
   * The pictures waiting to go as they are at this moment, which a press handled by an older render
   * reads to learn whether the row changed since (src/web/components/AKeyQuestion.tsx).
   */
  chosenNow(): readonly PictureChosen[]
  /**
   * Send the bytes of these pictures and hand back the blocks a message carries, or an empty list
   * because there are none. The caller names the pictures, so a send held by a question sends the
   * pictures it was asked about. It throws with the server's own sentence when a send is refused,
   * and the caller shows that where it shows every other fault.
   */
  store(these: readonly PictureChosen[], workspaceId?: string): Promise<readonly ImageBlock[]>
  /** Ask for the limits, once. The row calls it when it is drawn, so a page with no composer open asks nothing. */
  askTheLimits(): void
}

/** A name for one chosen picture in this browser. Never sent, never stored, never read back. */
let nextKey = 0
function aKey(): string {
  nextKey += 1
  return `pic-${String(nextKey)}`
}

/**
 * Hold the pictures on their way into one message.
 *
 * THE PREVIEW IS THIS BROWSER'S OWN COPY OF THE BYTES and is never a request. A picture that has
 * not been sent is not on the server, and `GET /api/file` would rightly refuse it: nothing points
 * at it yet. `URL.createObjectURL` draws the file the person just chose, which is the honest thing
 * to show them, and it is revoked when that picture is taken out or the panel goes.
 */
export function usePictureToSend(): PictureToSend {
  const [chosen, setChosen] = useState<readonly PictureChosen[]>([])
  const [fault, setFault] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [limits, setLimits] = useState<Limits>({ known: 'not yet' })
  const [over, setOver] = useState(false)
  // WHETHER A ROW HAS BEEN DRAWN THAT NEEDS THE LIMITS. The chat holds this hook on every page, open or closed, and the
  // limits are drawn only in a conversation's composer: it asked GET /api/messages/pictures on every page before (wave
  // 13x round 13).
  const [wanted, setWanted] = useState(false)
  const askTheLimits = useCallback(() => setWanted(true), [])
  // EVERY OBJECT URL THIS PANEL EVER MADE AND HAS NOT RELEASED, so the unmount can release all of
  // them. A ref rather than the state above, because the cleanup runs after the last render.
  const held = useRef<string[]>([])
  // WHAT THE ROW HOLDS AT THIS RENDER, for a press whose handler was made by an earlier one.
  const chosenNow = useRef(chosen)
  chosenNow.current = chosen

  useEffect(() => {
    if (!wanted) return
    let live = true
    api.whatAPictureMayBe().then(
      (said) => {
        if (live) setLimits({ known: 'yes', ...said.picture })
      },
      (err: unknown) => {
        if (!live) return
        setLimits({ known: 'no', why: errorMessage(err) })
        // AND IT IS SAID WHERE EVERY OTHER FAULT HERE IS SAID, in the words the failure gave. A
        // composer that quietly knew nothing about the limits would let somebody choose a file and
        // find out from the server, which is the thing this criterion is about.
        setFault(errorMessage(err))
      },
    )
    return () => {
      live = false
    }
  }, [wanted])

  // A FILE CHOSEN BEFORE THE TYPES WERE READ IS DECIDED AGAIN ONCE THEY ARE. One the browser calls a picture door's
  // type is drawn and goes through that door, as it would have if chosen a moment later. The rest stay files.
  useEffect(() => {
    if (limits.known !== 'yes') return
    const early = chosenNow.current.filter((one) => one.preview === null && limits.types.includes(one.file.type))
    if (early.length === 0) return
    const drawn = new Map(early.map((one) => [one.key, URL.createObjectURL(one.file)]))
    held.current = [...held.current, ...drawn.values()]
    setChosen((was) => was.map((one) => (one.preview !== null ? one : { ...one, preview: drawn.get(one.key) ?? null })))
  }, [limits])

  // THE OBJECT URLS ARE RELEASED WHEN THE PANEL GOES. Without this the bytes of every picture ever
  // chosen and not sent stay in this tab until it is closed.
  useEffect(
    () => () => {
      for (const url of held.current) URL.revokeObjectURL(url)
      held.current = []
    },
    [],
  )

  const forget = (url: string | null): void => {
    if (url === null) return
    URL.revokeObjectURL(url)
    held.current = held.current.filter((one) => one !== url)
  }

  /**
   * TAKE WHAT CAN BE SENT AND REFUSE THE REST BY NAME.
   *
   * A drop of four files where one is past the limit adds the three and says which one it would not
   * take. Refusing the whole drop would throw away three good files over one bad one; taking the big
   * one silently would be the silent fallback this repository forbids.
   */
  const take = (files: readonly File[]): void => {
    const taken: PictureChosen[] = []
    let refused: string | null = null
    for (const file of files) {
      if (limits.known === 'yes' && file.size > limits.maxBytes) {
        refused ??= PICTURE_WORDS.tooBig(file.name, inMegabytes(file.size), inMegabytes(limits.maxBytes))
        continue
      }
      // WHAT THE BROWSER SAID EACH FILE IS, which is a claim about a name and not about the bytes. A file it calls one
      // of the picture door's types is drawn and sent there, and that door reads the bytes again; a file that lies
      // about itself is refused there rather than drawn. A file chosen before the types are read is held as a file until
      // they are, and decided again then.
      const picture = limits.known === 'yes' && limits.types.includes(file.type)
      const preview = picture ? URL.createObjectURL(file) : null
      if (preview !== null) held.current = [...held.current, preview]
      taken.push({ key: aKey(), file, preview })
    }
    setFault(refused)
    if (taken.length > 0) setChosen((was) => [...was, ...taken])
  }

  return {
    chosen,
    fault,
    sending,
    limits,
    askTheLimits,
    dropOn: {
      // WITHOUT `preventDefault` HERE THE BROWSER NEVER OFFERS THE DROP AT ALL, and the page then
      // navigates to the file when it lands. Both halves are needed for one drop to work.
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault()
        setOver(true)
      },
      onDragLeave: () => {
        setOver(false)
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault()
        setOver(false)
        // ALL OF THEM, IN THE ORDER THEY WERE DROPPED. A message carried one picture until M66, so
        // this used to refuse a multiple drop in words rather than lose the rest of it.
        take(Array.from(event.dataTransfer.files))
      },
      'data-dropping': over ? 'yes' : 'no',
    },
    take,
    takeOut: (key: string) => {
      setChosen((was) => {
        const going = was.find((one) => one.key === key)
        if (going !== undefined) forget(going.preview)
        return was.filter((one) => one.key !== key)
      })
      setFault(null)
    },
    sent: (these) => {
      const went = new Set(these.map((one) => one.key))
      setChosen((was) => {
        for (const one of was) if (went.has(one.key)) forget(one.preview)
        return was.filter((one) => !went.has(one.key))
      })
      setFault(null)
    },
    chosenNow: () => chosenNow.current,
    store: async (these, workspaceId) => {
      if (these.length === 0) return []
      setSending(true)
      try {
        const blocks: ImageBlock[] = []
        // ONE AT A TIME AND IN ORDER, so the blocks a message carries are in the order the row
        // showed them. Each door takes one file per call: a picture goes through the picture door, and
        // any other file through the file door, under its own name.
        for (const one of these) {
          const bytes = await asBase64(one.file)
          const path =
            one.preview === null
              ? (await api.sendAFile(bytes, one.file.name, workspaceId)).file.path
              : (await api.sendAPicture(bytes, workspaceId)).picture.path
          blocks.push({
            id: one.key,
            type: 'image' as const,
            // THE FILE'S OWN NAME IS THE ALT TEXT. Nobody is asked what a picture shows any more
            // (M68), and the name is a real description rather than a stand-in for one: a
            // screenshot called clamp-at-setting-12.png tells a reader more than an empty string
            // does, and `alt` may not be empty.
            path,
            alt: one.file.name,
          })
        }
        return blocks
      } finally {
        setSending(false)
      }
    },
  }
}

/**
 * THE ONE ATTACH PRESS, at the left end of the row of presses beneath the writing box, and the chooser it opens.
 *
 * It replaced a picture press on the row above the box. The quote press, beside it, was read as the
 * attach press, and it does nothing while nothing is selected.
 */
export function AttachPress({ held }: { held: PictureToSend }) {
  useLanguage()
  const file = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <style href="mole-office-picture-to-send" precedence="default">
        {PICTURE_TO_SEND_CSS}
      </style>
      <AShapePress
        className="px-chat-attach-add"
        words={PICTURE_WORDS.attach}
        onPress={() => {
          file.current?.click()
        }}
      >
        <AttachShape />
      </AShapePress>
      {/* THE CHOOSER ITSELF, OUT OF SIGHT. A bare file input cannot be given this product's own
          look, so the press opens it, from inside its own click, which every browser allows. It names
          no type, so the chooser offers every file. `multiple` is M66: several may be picked in one
          visit to the chooser. */}
      <input
        ref={file}
        type="file"
        multiple
        className="px-chat-attach-file"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length > 0) held.take(picked)
          // THE INPUT IS EMPTIED so that choosing the same file twice in a row is two events. A file
          // input that still holds a name fires nothing the second time, which reads as a press that
          // did nothing.
          e.target.value = ''
        }}
      />
    </>
  )
}

/**
 * THE ATTACHMENTS HALF OF THE COMPOSER: the files held and any refusal.
 *
 * It sits above the box somebody types in, because a file is chosen before the line about it is
 * written, and because the row underneath is where Send is.
 */
export function PictureToSendRow({ held, words }: { held: PictureToSend; words: string }) {
  useLanguage()
  // WHICH PICTURE IS OPEN IN THE FLOATING WINDOW, by this browser's own name for it (M68). Held by
  // key rather than by the object, so a picture taken out while its window is open takes the window
  // with it instead of leaving a window over bytes that were released.
  const [open, setOpen] = useState<string | null>(null)
  // THE SHAPE THIS IS MEASURED AGAINST is how many pictures are in the row: taking one out or
  // adding one is what changes whether the row carries on past its edge.
  const reach = useReach(String(held.chosen.length))
  const showing = held.chosen.find((one) => one.key === open) ?? null
  const askTheLimits = held.askTheLimits
  useEffect(() => askTheLimits(), [askTheLimits])

  return (
    <div className="px-chat-attach">
      <style href="mole-office-picture-to-send" precedence="default">
        {PICTURE_TO_SEND_CSS}
      </style>

      {/* A file is sent with a line, so say why Send waits while there are no words. */}
      {held.chosen.length > 0 && words.trim() === '' ? (
        <div className="px-chat-attach-offer">
          <span className="px-chat-attach-need">{PICTURE_WORDS.wordsToo}</span>
        </div>
      ) : null}

      {/* THE CHOSEN PICTURES, IN A ROW ACROSS (M69). The row scrolls sideways rather than wrapping,
          because the composer sits at the bottom of a panel and a wrapping row would push the box
          somebody is typing in off the screen. */}
      {held.chosen.length === 0 ? null : (
        <InReachBox reach={reach} box="px-chat-attach-row" name={t('chat.attachment.files')} className="px-chat-attach-reach">
          {held.chosen.map((one) => (
            <div className="px-chat-attach-held" key={one.key}>
              {/* THIS BROWSER'S OWN COPY OF THE BYTES. Nothing has been sent yet, so there is
                  nothing on the server to ask for, and asking would be refused for the right
                  reason. */}
              {/* A FILE THAT IS NOT A PICTURE HAS NOTHING TO DRAW, so it is held by its name and size alone. */}
              {one.preview === null ? null : (
                <button
                  type="button"
                  className="px-chat-attach-press"
                  title={one.file.name}
                  aria-label={PICTURE_WORDS.openIt(one.file.name)}
                  onClick={() => {
                    setOpen(one.key)
                  }}
                >
                  <img className="px-chat-attach-shot" src={one.preview} alt={one.file.name} />
                </button>
              )}
              {/* M70: the close mark, at this picture's top-right, taking this one out. */}
              <button
                type="button"
                className="px-chat-attach-out"
                title={PICTURE_WORDS.takeOutShort}
                aria-label={PICTURE_WORDS.takeOut(one.file.name)}
                onClick={() => {
                  held.takeOut(one.key)
                }}
              >
                {'×'}
              </button>
              {/* M69: the name and the size on ONE line under the picture. The name fades out at
                  its end when it is too long, and never wraps. */}
              <span className="px-chat-attach-says">
                <span className="px-chat-attach-name">{one.file.name}</span>
                <span className="px-chat-attach-size">{inMegabytes(one.file.size)}</span>
              </span>
            </div>
          ))}
        </InReachBox>
      )}

      {held.fault === null ? null : <p className="px-chat-attach-fault">{held.fault}</p>}

      {showing === null || showing.preview === null ? null : (
        <PictureWindow
          picture={showing}
          preview={showing.preview}
          onClose={() => {
            setOpen(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * ONE CHOSEN PICTURE, LARGER, IN A FLOATING WINDOW (M68).
 *
 * Pressing the picture shows a floating window. It replaces the
 * box that used to ask what the picture shows, which was not needed.
 *
 * IT IS DRAWN IN THE OVERLAY HOST, not inside the composer: the composer is inside a panel that
 * clips and scrolls, and a window drawn there would be cut off by it. Escape shuts it, a press
 * outside shuts it, and the close mark shuts it — three ways because a person tries the one they
 * know.
 */
function PictureWindow({ picture, preview, onClose }: { picture: PictureChosen; preview: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useCloseOnOutsidePress(box, onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <Overlay>
      <div className="px-chat-pic-window-behind">
        <div className="px-chat-pic-window" ref={box} role="dialog" aria-modal="true" aria-label={PICTURE_WORDS.windowName}>
          <div className="px-chat-pic-window-top">
            <span className="px-chat-pic-window-name">{picture.file.name}</span>
            <button type="button" className="px-chat-pic-window-shut" onClick={onClose}>
              {PICTURE_WORDS.closeTheWindow}
            </button>
          </div>
          <img className="px-chat-pic-window-shot" src={preview} alt={picture.file.name} />
        </div>
      </div>
    </Overlay>
  )
}

/**
 * The composer's picture rules. Every value is a token, so a preset swap reaches them.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const PICTURE_TO_SEND_CSS = `
.px-chat-attach { display: flex; flex-direction: column; gap: 4px; padding: 0 0.7rem; min-width: 0; }
/* THE SEND BOX AND THE KEY QUESTION STAY WHOLE: in a chat panel too short for the question, the pictures held and the
   box, this row gives up height and scrolls. BUT THE MESSAGE LIST GIVES UP HEIGHT BEFORE IT. A
   panel with no set height (the corner window at a phone's width) shares its overflow by size times this weight, and at
   1 the row lost a quarter of its height while the list still had hundreds of pixels to give, which cut the row and the
   button beside Send in half (wave 13n round 50). At 0.001 the row gives up height only once the list has none left. */
.px-chat-attach { flex: 0 0.001 auto; min-height: 0; overflow-y: auto; }
.px-chat-attach-file { display: none; }
.px-chat-attach-offer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; min-height: var(--row-h); }
.px-chat-attach-need { color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
/* M69: the pictures stand in a row across, and the row scrolls sideways rather than wrapping. */
.px-chat-attach-row {
  display: flex; gap: 6px; margin: 0; padding: 0 0 2px 0;
  overflow-x: auto; overflow-y: hidden; min-width: 0;
}
.px-chat-attach-held {
  position: relative; flex: none; width: 124px; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--pad); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius); background: var(--panel-2);
}
.px-chat-attach-press {
  display: block; padding: 0; border: 0; background: none; cursor: pointer; min-width: 0;
}
.px-chat-attach-shot {
  display: block; width: 100%; height: 62px; object-fit: cover;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); background: var(--panel);
}
/* M70: the close mark, at the picture's own top-right corner. */
.px-chat-attach-out {
  position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  font: 600 var(--fs-1)/1 var(--font-ui); color: var(--text-2);
  background: var(--panel); border: var(--border-w) solid var(--border-strong);
  border-radius: 50%; cursor: pointer;
}
.px-chat-attach-out:hover { background: var(--hover); color: var(--text); }
/* M69: name and size on ONE line, the name fading out at its end rather than wrapping. */
.px-chat-attach-says {
  display: flex; align-items: baseline; gap: 4px; min-width: 0;
  white-space: nowrap; overflow: hidden;
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.px-chat-attach-name {
  min-width: 0; flex: 0 1 auto; overflow: hidden; white-space: nowrap; color: var(--text);
  mask-image: linear-gradient(to right, #000 calc(100% - 12px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 12px), transparent 100%);
}
.px-chat-attach-size { flex: none; color: var(--text-3); white-space: nowrap; }
.px-chat-attach-reach { min-width: 0; }
.px-chat-attach-fault {
  margin: 0; padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere;
}
/* M68: the floating window one chosen picture opens in. */
.px-chat-pic-window-behind {
  position: fixed; inset: 0; z-index: var(--z-overlay);
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
}
.px-chat-pic-window {
  display: flex; flex-direction: column; gap: 6px; max-width: min(92vw, 900px); max-height: 88vh;
  padding: var(--pad-lg); background: var(--panel-3);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  box-shadow: var(--elev-2);
}
.px-chat-pic-window-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.px-chat-pic-window-name {
  flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text);
}
.px-chat-pic-window-shut {
  flex: none; font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2);
  background: var(--panel-2); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); padding: 2px 8px; min-height: var(--row-h); cursor: pointer;
}
.px-chat-pic-window-shut:hover { background: var(--hover); }
.px-chat-pic-window-shot {
  display: block; min-height: 0; max-width: 100%; max-height: 78vh; object-fit: contain;
  border-radius: var(--radius-sm); background: var(--panel-2);
}
/* THE BOX SAYS IT WOULD TAKE THE FILE, while one is being dragged over it. Without it a drop target
   is invisible and a person finds out by trying. */
.px-chat-write[data-dropping="yes"] { outline: var(--focus-w) dashed var(--focus); outline-offset: -2px; }
`

/**
 * The file's bytes as base64, without the `data:...;base64,` the reader puts in front.
 *
 * The same two lines `Appearance.tsx` uses for an avatar, and for the same reason: this server has
 * no multipart parser, so a picture travels as base64 inside JSON.
 */
export async function asBase64(file: File): Promise<string> {
  const read = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(String(reader.result))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error(t('chat.attachment.readFailed')))
    }
    reader.readAsDataURL(file)
  })
  const at = read.indexOf(',')
  return at === -1 ? read : read.slice(at + 1)
}
