// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER'S OWN LOAD OF A FILE GOES BY A TICKET, ON A PAIRED PAGE AT HOME. SEC-2, item 3.
 *
 * A video, a sound, a frame and a link that opens or saves a file are loaded by the browser and not by the page, so
 * they carry the cookie half of the device key and never the header half. One half alone proves nothing. So the page
 * asks the ticket door, POST /api/file/ticket, with both halves, and hands the address it answers to the browser
 * (src/server/lib/file-tickets.ts has what a ticket is bound to).
 *
 * WHEN NO TICKET IS ASKED. A page on a trip loads from the visited world, with no cookie and no half, by the plain
 * address. A page that keeps no header half is not paired, and it loads by the plain address as it always has. Both
 * are `aLoadGoesHomePaired` in src/web/lib/visiting.ts.
 *
 * ONE ASK FOR EACH FILE, KEPT 25 MINUTES. A ticket ends 30 minutes after its last use, so an address kept 25 minutes
 * is asked again before it can have ended unused. A load refused all the same, as after a restart of the office, asks
 * once more. A second refusal is said in the block, and nothing asks a third time.
 *
 * A LINK ASKS WHEN IT IS PRESSED. Its own address is the record's page, so a ticket is never written into the page,
 * and a link copied out of it opens the record and not the file.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react'
import { moleOfficeRequest } from '../api.ts'
import { recordPath } from '../components/router.tsx'
import { aLoadGoesHomePaired, whereRequestsGo } from './visiting.ts'

/** One file a browser's own load opens: its path, the record the page is drawing, and the project the request names. */
export interface AFileToOpen {
  path: string
  record: string | undefined
  project: string
}

/** An address a ticket gave is asked for again after this long, before the ticket can have ended unused. */
const A_TICKET_IS_ASKED_AGAIN_AFTER_MS = 25 * 60 * 1000

/** The asks out and answered, by the file they are for. */
const asked = new Map<string, { address: Promise<string>; at: number }>()

function theNameOf(file: AFileToOpen): string {
  return JSON.stringify([file.path, file.record ?? null, file.project])
}

/** A ticketed address for one file: the one asked for in the last 25 minutes, or a new one. */
export function aTicketedAddress(file: AFileToOpen): Promise<string> {
  const held = asked.get(theNameOf(file))
  if (held !== undefined && Date.now() - held.at < A_TICKET_IS_ASKED_AGAIN_AFTER_MS) return held.address
  return aNewTicketedAddress(file)
}

/** A new ticketed address for one file, asked for now, after a load by the last one was refused. */
export function aNewTicketedAddress(file: AFileToOpen): Promise<string> {
  const name = theNameOf(file)
  const address = moleOfficeRequest<{ address: string }>('/api/file/ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: file.path,
      ...(file.record === undefined ? {} : { record: file.record }),
      workspace: file.project,
    }),
  }).then((answer) => whereRequestsGo(answer.address))
  asked.set(name, { address, at: Date.now() })
  // AN ASK THAT FAILED IS NOT KEPT, so the next load asks again rather than being handed the same failure.
  address.catch(() => {
    if (asked.get(name)?.address === address) asked.delete(name)
  })
  return address
}

/** What a video, a sound or a frame is handed: its address, whether it was not loaded, and what it says on an event. */
export interface ALoadByTicket {
  /** The address, or undefined while the ticket is asked for. */
  src: string | undefined
  /** Two loads were refused, or the ask was: the block says not loaded. */
  notLoaded: boolean
  onError: (event: SyntheticEvent<HTMLMediaElement>) => void
  onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => void
}

const NOTHING_TO_DO = (): void => undefined

/**
 * THE ADDRESS ONE VIDEO, SOUND OR FRAME LOADS FROM. `plain` is the address with no ticket, `whereALinkFetches` in
 * src/web/components/SummaryBlocks.tsx, and it is what a load that needs no ticket is handed. `extra` is added after
 * a ticketed address, as `&open=1&shown=1` is for a frame.
 *
 * A REFUSED LOAD ASKS ONCE MORE, and a played video goes on from the time it had reached. A load that succeeds lets a
 * later refusal ask once more again. A frame hears no refusal, so it asks once.
 */
export function useALoadByTicket(file: AFileToOpen | undefined, plain: string, extra = ''): ALoadByTicket {
  const ticketed = file !== undefined && aLoadGoesHomePaired()
  const name = file === undefined ? '' : theNameOf(file)
  const [src, setSrc] = useState<string | undefined>(undefined)
  const [notLoaded, setNotLoaded] = useState(false)
  const askedAgain = useRef(false)
  const reached = useRef(0)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    if (!ticketed || file === undefined) return undefined
    setSrc(undefined)
    setNotLoaded(false)
    askedAgain.current = false
    aTicketedAddress(file).then(
      (address) => {
        if (live.current) setSrc(`${address}${extra}`)
      },
      () => {
        if (live.current) setNotLoaded(true)
      },
    )
    return () => {
      live.current = false
    }
    // `name` is the file, by value; the object is made anew on every draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketed, name, extra])
  if (!ticketed || file === undefined) return { src: plain, notLoaded: false, onError: NOTHING_TO_DO, onLoadedMetadata: NOTHING_TO_DO }
  return {
    src,
    notLoaded,
    onError: (event) => {
      reached.current = event.currentTarget.currentTime
      if (askedAgain.current) {
        setNotLoaded(true)
        return
      }
      askedAgain.current = true
      aNewTicketedAddress(file).then(
        (address) => {
          if (live.current) setSrc(`${address}${extra}`)
        },
        () => {
          if (live.current) setNotLoaded(true)
        },
      )
    },
    onLoadedMetadata: (event) => {
      askedAgain.current = false
      if (reached.current > 0) event.currentTarget.currentTime = reached.current
      reached.current = 0
    },
  }
}

/**
 * A LINK THAT OPENS OR SAVES ONE FILE. `plain` is the address with no ticket, and a page that needs no ticket draws it
 * exactly as before: a save with `download`, an open in a new tab with no referrer.
 *
 * ON A PAIRED PAGE AT HOME the link's own address is the record's page, and a press asks for a ticketed address and
 * hands it to the browser: a save by a link made for the press, an open in a new tab with no referrer. The ticket is
 * never written into the page. `extra` is added after a ticketed address, as `&open=1` is for the chat's Open.
 */
export function AFileLink({ file, plain, saves, extra = '', className, children }: {
  file: AFileToOpen
  plain: string
  saves: boolean
  extra?: string
  className: string
  children: ReactNode
}) {
  if (!aLoadGoesHomePaired()) {
    return saves ? (
      <a className={className} href={plain} download>
        {children}
      </a>
    ) : (
      <a className={className} href={plain} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }
  const press = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault()
    void aTicketedAddress(file).then((address) => {
      const link = document.createElement('a')
      link.href = `${address}${saves ? '&download=1' : ''}${extra}`
      link.rel = 'noreferrer'
      if (saves) link.download = ''
      else link.target = '_blank'
      document.body.append(link)
      link.click()
      link.remove()
    })
  }
  return (
    <a className={className} href={file.record === undefined ? window.location.hash || '#' : `#${recordPath(file.record)}`} onClick={press}>
      {children}
    </a>
  )
}
