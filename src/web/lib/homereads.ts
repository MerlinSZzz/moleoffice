// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READS THE HOME PAGE'S BANDS DRAW, STARTED WHEN THE PAGE OPENS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On the owner's live page on 13 September 2026 one home load sent its `/api` requests in three waves, each
 * waiting for the one before it. The first wave started at 0.4 s; the second did not start until
 * 3.3 s, because the bands that make those requests are only mounted once the page's first two big
 * reads — `/api/records?shape=home` and `/api/attention?machine=omit` — have both answered. The
 * third wave started at 4.2 s and the Waiting and Today bands did not appear until 7.1 s. The page
 * asks `/api/records?shape=home` for no kind now: Late or stuck asks
 * `/api/pipelines/standing-still` in `HomePage.tsx` (wave 13s round 281).
 *
 * NOTHING ABOUT THE DOORS WAS SLOW. Alone, each answered in a fraction of a second. The delay was
 * the ORDER: a band's read could not be asked for until the page it lives on had finished reading
 * something else.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIX: THE PAGE STARTS THE READS, AND THE BANDS JOIN THEM
 * ---------------------------------------------------------------------------------------
 *
 * `startHomeReads` below asks every door a band draws from at the moment the page mounts, before the
 * page's own two big reads are issued. Each door is a `OneRead` slot (see oneread.ts): the first
 * caller starts the request and every later caller — the band, when it finally mounts — joins the
 * same reply instead of starting a second one. So a band is never waiting on another band's wave,
 * and asking early costs no extra requests.
 *
 * NOT A CACHE WITH A SHELF LIFE. A slot holds the answer for the project being read, it never hands
 * back one project's answer under another's name, and `.again()` is how a caller that has just
 * written something asks afresh. `useSharedRead` is how a band consumes a slot that the page has
 * already started: the first run of its effect takes the started read, and a later run (a reload
 * press, a project change) asks again.
 */

import { useRef, useSyncExternalStore, type DependencyList } from 'react'
import { api, type ClaimsReply } from '../api.ts'
import type { ForksReply } from '../../server/api/forks.ts'
import type { WhatHasBeenSaid } from '../../server/lib/communication.ts'
import { useAsync, type AsyncState } from '../components/ui.tsx'
import { oneRead, type OneRead } from './oneread.ts'
import { subscribeWorkspace } from './workspace.ts'

/**
 * The forks waiting on a person, and the decisions made beside them. No workspace: a fork waiting on
 * you does not stop waiting because you are reading another project.
 */
export const readForksOnce: OneRead<ForksReply> = oneRead(() => api.forks(), () => 'every project')

/** What has been said in this project, once. */
export const readSaidOnce: OneRead<WhatHasBeenSaid> = oneRead(() => api.whatHasBeenSaid())

/**
 * The live work claims in this project, once.
 *
 * Home reads this itself and hands the answer down, because the claims band also draws the title of
 * each record a claim names, and that second read is derived from this one. Starting the titles read
 * from the page — as soon as this answer arrives — is what keeps `POST /api/short-forms/rows` out of
 * a later wave; see `readClaimTitles` in HomePage.tsx.
 */
export const readClaimsOnce: OneRead<ClaimsReply> = oneRead(() => api.claims())

/**
 * Consume a read the page has already started.
 *
 * The FIRST run of this hook's effect takes the started read (the in-flight reply, or the answer if
 * it has already arrived). A LATER run — a reload press changes the dependencies, a switch of project
 * changes the project the read is keyed by — asks again through `.again()`. Without the split, either
 * the band would start a duplicate request on mount or a reload press would draw the answer it
 * already had. A read keyed by 'every project', such as `readForksOnce`, is not read again on a switch.
 *
 * `startFromHeld` draws the answer the read already holds in this page load at once (`.held()`), so a
 * band mounted again draws no loading state first. A page load that holds none still draws loading,
 * and a failed first read still draws its error.
 */
export function useSharedRead<T>(read: OneRead<T>, deps: DependencyList, options: { startFromHeld?: boolean } = {}): [AsyncState<T>, () => void] {
  const first = useRef(true)
  const project = useSyncExternalStore(subscribeWorkspace, read.projectKey, read.projectKey)
  return useAsync(() => {
    if (first.current) {
      first.current = false
      return read()
    }
    return read.again()
  }, [...deps, project], { startFrom: options.startFromHeld === true ? read.held() : undefined, project })
}
