// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURE BESIDE A NAME. One drawing, used wherever a participant is shown.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES WHEN THE PICTURE WILL NOT LOAD, AND WHY IT SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * A participant always has a picture: Mole Office draws one from the id when nobody has chosen
 * another, and that drawing needs no file. So the usual way an address fails here is an uploaded
 * picture whose file is gone — which really happens, because an archive carries the row and never
 * the file.
 *
 * WHEN THAT HAPPENS THIS ASKS FOR THE CHOSEN PICTURE ONE MORE TIME, AT AN ADDRESS NEW FOR THIS PAGE
 * LOAD. A picture is served as unchanging, so a broken copy is kept until the address expires and
 * asking the same address again gives the same broken copy. The second address carries a value that
 * is fixed for this page load and is shared by every picture, so a broken copy is not asked for by
 * the same value on the next page load either.
 *
 * IF THE SECOND ASK FAILS TOO THIS FALLS BACK TO THE DRAWN ONE AND SAYS SO IN ITS OWN LABEL.
 * Falling back silently would put a different picture under the same name with nothing telling the
 * reader, which is a breach of the principle at the top of USER.md, "Never silently substitute
 * semantics". The label a screen reader gets, and the words on hover, both change.
 *
 * ---------------------------------------------------------------------------------------
 * THERE ARE THREE STATES, NOT TWO, AND THE LABEL ONLY EVER CLAIMS THE ONE THAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * The label used to have two states: the chosen picture, or "drawn by Mole Office because the chosen
 * picture could not be loaded". That second sentence was said in two cases where it was not true.
 *
 * The chosen picture is often the drawn one already — the server hands back the drawing whenever
 * nobody uploaded anything — so when it failed there was no other picture to put in its place, and
 * the label announced a swap that had not happened. And when a real upload failed and the drawing
 * failed too, the label still said a drawing was there when nothing was. Both were measured on
 * 4 September 2026, when every picture in `npm run dev` failed at once. Problem `YY3ryy7FEpK2`.
 *
 * So this tracks which of three things is on the screen — the chosen picture, the drawn one, or
 * nothing — and the label says that and nothing more.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS AN IMAGE AND NOT A BACKGROUND
 * ---------------------------------------------------------------------------------------
 *
 * `<img>` with an `alt`, so the name reaches a reader who cannot see it. A background image has no
 * alternative text and no load failure to catch, which is exactly the two things this needs.
 *
 * ---------------------------------------------------------------------------------------
 * THE ADDRESS GOES WHERE EVERY OTHER REQUEST GOES
 * ---------------------------------------------------------------------------------------
 *
 * Asking for a picture is a request, so its address is worked out by the one function that works out
 * where a request goes: `whereRequestsGo` in src/web/lib/visiting.ts. That is the page's own origin
 * in a build, the API's own door under `npm run dev`, and the visited world's address while the page
 * is visiting one — which is right, because the picture belongs to that world.
 *
 * IT USED TO BE A BARE PATH, AND THAT BROKE EVERY PICTURE IN DEVELOPMENT. The server hands back
 * `/api/assets/<id>`, a path with no host, and a browser resolves a bare path against the page's own
 * origin. While Vite proxied `/api/` to the API that worked. Commit 52e3745 deleted the proxy and
 * moved every `fetch` onto the API's own door, but an `<img src>` is not a `fetch` and was not
 * moved. Every picture then asked Vite, and Vite answered the app's own HTML with status 200: no
 * console error, no 4xx, and a broken image everywhere a person or an agent is shown.
 */

import { useState } from 'react'
import { avatarUrlFor, defaultAvatarAssetId, type ParticipantKind } from '@shared/participants.ts'
import { whereRequestsGo } from '../lib/visiting.ts'

/**
 * WHEN THIS PAGE LOAD STARTED, as the value the second ask carries.
 *
 * IT IS TAKEN ONCE, WHEN THIS MODULE LOADS, AND EVERY PICTURE SHARES IT. A value per picture would
 * be a value per request: hundreds of faces share a few dozen addresses and a portrait is about a
 * megabyte, so a restart could start hundreds of megabytes of downloads. One value per page load
 * costs at most one more download for each address, and the next page load asks at a different one.
 */
export const THIS_LOAD = String(Date.now())

/**
 * The address of the chosen picture, asked for once more at a value fixed for this page load.
 *
 * A query is appended, so a value already in the address stays. The doors that serve a picture read
 * only their path and ignore a query, so the bytes are the same bytes.
 */
export function askedAgain(address: string, load: string = THIS_LOAD): string {
  const joiner = address.includes('?') ? '&' : '?'
  return `${address}${joiner}again=${load}`
}

/**
 * WHICH PICTURE IS ON THE SCREEN.
 *
 * `chosen` is the address the server gave. `drawn` is the picture Mole Office makes from the id,
 * shown because the chosen one failed and was a different address. `none` is both of them having
 * failed, or the chosen one having failed when it was the drawn one already.
 */
export type WhichPicture = 'chosen' | 'drawn' | 'none'

/**
 * WHICH PICTURE IS ON THE SCREEN, AND WHETHER THE CHOSEN ONE HAS BEEN ASKED FOR AGAIN.
 *
 * `forAddress` is the chosen address this state was made for. A different address starts the state
 * again, so a picture that fails is not left wearing the last picture's retry or fallback.
 */
interface PictureState {
  forAddress: string
  which: WhichPicture
  /** True once the chosen picture has been asked for again at this page load's value. */
  again: boolean
}

export function Avatar({
  kind,
  id,
  name,
  url,
  size = 28,
  className = 'avatar',
  asksAgain = true,
}: {
  kind: ParticipantKind
  /** The registry id, which is what the drawn picture is worked out from. */
  id: string
  /** Whose picture this is, for the label a reader who cannot see it gets. */
  name: string
  /** The address the server gave for this participant's picture. */
  url: string
  /** How wide and tall, in pixels. The rows this sits in are small; a page may ask for bigger. */
  size?: number
  /**
   * THE PICTURE'S OWN MARK, which is `avatar` everywhere except the sidebar's foot. A part of the
   * page that is not the one a test or a tool is looking for must not answer to its selector, so
   * the foot's small copy carries a mark of its own.
   */
  className?: string
  /**
   * WHETHER A FAILED CHOSEN PICTURE IS ASKED FOR ONCE MORE. True everywhere the picture is the
   * subject. False for the copy in the shell's chrome: the page's own picture makes that second
   * ask, and a small copy beside a name must not ask the office for the same broken file again.
   */
  asksAgain?: boolean
}) {
  const chosen = whereRequestsGo(url)
  const drawn = whereRequestsGo(avatarUrlFor(defaultAvatarAssetId({ kind, id })))
  const [state, setState] = useState<PictureState>(() => ({
    forAddress: chosen,
    which: 'chosen',
    again: false,
  }))

  // A DIFFERENT ADDRESS STARTS AGAIN. Setting the state while this render runs makes React draw
  // again at once, and the second pass finds the address it was just handed.
  if (state.forAddress !== chosen) {
    setState({ forAddress: chosen, which: 'chosen', again: false })
  }

  const askingAgain = state.which === 'chosen' && state.again
  const showing = state.which === 'chosen' ? (state.again ? askedAgain(chosen) : chosen) : drawn
  const label = avatarLabel(name, state.which)

  return (
    <>
      <style href="mole-office-avatar" precedence="default">
        {CSS}
      </style>
      <img
        className={className}
        src={showing}
        alt={label}
        title={label}
        width={size}
        height={size}
        // ONLY A PICTURE ON SCREEN IS FETCHED AND DECODED. Round 18 of wave 13w:
        // the chat drew a picture on each of some 250 rows and the browser asked for every one at once.
        loading="lazy"
        decoding="async"
        style={{ width: `${String(size)}px`, height: `${String(size)}px` }}
        data-picture={state.which}
        data-asked-again={askingAgain ? 'yes' : undefined}
        onError={() => {
          setState((was) => {
            // The state may belong to a different address than the one that just failed, so it
            // starts again rather than deciding for the picture now on the screen.
            if (was.forAddress !== chosen) return { forAddress: chosen, which: 'chosen', again: false }
            // THE FIRST FAILURE ASKS THE CHOSEN PICTURE ONCE MORE, at this page load's value. A
            // picture that may not ask again falls back at once, as it did before the retry.
            if (was.which === 'chosen' && !was.again) {
              if (!asksAgain) return { forAddress: chosen, which: chosen !== drawn ? 'drawn' : 'none', again: false }
              return { forAddress: chosen, which: 'chosen', again: true }
            }
            // THE DRAWN ONE IS ONLY WORTH TRYING IF IT IS A DIFFERENT ADDRESS. When the server
            // already gave the drawing, retrying it would ask for an address that just failed and
            // would say a swap had happened when none had.
            if (was.which === 'chosen' && chosen !== drawn) return { forAddress: chosen, which: 'drawn', again: false }
            return { forAddress: chosen, which: 'none', again: false }
          })
        }}
      />
    </>
  )
}

/**
 * What a reader is told this picture is.
 *
 * THE THREE WORDINGS LIVE IN ONE PLACE, SO EACH CAN BE READ AND PROVED. A string render of this
 * function checks every state, including the two that say a picture is gone. A browser test proves
 * how the retry behaves, and the words for what is on the screen stay here.
 */
export function avatarLabel(name: string, which: WhichPicture): string {
  if (which === 'chosen') return name
  if (which === 'drawn') return `${name}, drawn by Mole Office because the chosen picture could not be loaded`
  return `${name}; the picture could not be loaded`
}

const CSS = `
.avatar, .sbp-disc-picture {
  flex: none;
  border-radius: 50%;
  border: var(--border-w) solid var(--border-strong);
  background: var(--panel);
  object-fit: cover;
}
`
