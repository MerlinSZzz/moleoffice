// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PICTURE IN A REPORT OPENS LARGE WHEN IT IS PRESSED. Problem T3yQblhc2A28.
 *
 * On 3 October 2026 the owner pressed a picture in report O_wVUc-0nhOy to look at it closely,
 * and the page had no answer for a press on a picture at all. This draws the picture over the page, as
 * large as the window allows, until Escape, the close button or a press outside the picture.
 *
 * TALKING ABOUT A PICTURE KEEPS ITS OWN GESTURES. A right-click on the picture, and a press while the
 * page is marking what can be talked about, still open the talk box about the picture
 * (src/web/components/agent/open.ts). The press that opens the picture large is an ordinary press, and
 * the marking mode takes a press in the capture phase before this button sees it.
 *
 * THE BYTES ARE THE ONES ALREADY ON THE PAGE. `src` is the address the small picture was drawn from,
 * so the large one is the same file and no second request is made for it. A role portrait is the one
 * exception: the page draws a small copy of it, and `src` is the whole picture, asked for on the press
 * (wave 13x round 10).
 *
 * IT IS DRAWN IN THE OVERLAY HOST, so no frozen column or clipped panel can paint over it, and a talk
 * box opened while it is up is drawn after it, on top.
 *
 * FULL SIZE, ONE PRESS AWAY (wave 13s round 12). Fitted to a phone, a wide picture opened no larger than
 * the report drew it: a measurement found 362 px in the page and 370 px open at 390. So when the picture has
 * more pixels than the window shows, "Full size" (or a press on the picture) draws it at its own pixels
 * and the view scrolls both ways, so the picture uses the screen in both directions. A press is the way
 * that works the same by mouse, keyboard and touch, and a test can hold it. Pinching is the browser's
 * own and is left alone: the page's viewport allows it and nothing here turns it off. It is not tested.
 *
 * THE CLOSED PICTURE SAYS IT OPENS. A quiet mark in its corner names the press in the page's language,
 * drawn all the time, because a touch screen has no hover to show a title on.
 *
 * ON A NARROW SCREEN ONE PRESS IS FULL SIZE (wave 13s round 13, the review of round 12's pictures,
 * report 8eIIwl4erxDt). Where the fitted view would draw the picture barely larger than the page
 * already does (640 px both times at 660, 362 to 370 px at 390), the first press opens straight at the
 * picture's own pixels; "Fit to the window" is still one press away. And where the picture is drawn
 * narrower than WORDS_FIT, the mark is the ⤢ alone: with its words it covered up to 47% of the
 * picture's bottom edge at 390, which is where a chart keeps its axis labels.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { InReachMark, useReach } from './InReach.tsx'
import { Overlay } from './ui.tsx'

/** The margins round a fitted picture: across, and down (the down one holds the row of buttons). */
const FITTED_ACROSS = 16
const FITTED_DOWN = 56
/** How much bigger the fitted view must draw a picture than the page does to be worth opening first. */
const WORTH_FITTING = 1.1
/** How wide a picture must be drawn for its mark to carry words; narrower, the mark is the ⤢ alone. */
const WORDS_FIT = 720

/**
 * WHETHER THE FIRST PRESS OPENS AT FULL SIZE: when the picture has more pixels than the fitted view can
 * show, and the fitted view would draw it less than a tenth larger than the page already does.
 */
export function opensAtFullSize(
  natural: { width: number; height: number },
  drawnWidth: number,
  window: { width: number; height: number },
): boolean {
  if (natural.width <= 0 || natural.height <= 0) return false
  const fitted = Math.min(
    natural.width,
    window.width - FITTED_ACROSS,
    ((window.height - FITTED_DOWN) * natural.width) / natural.height,
  )
  return natural.width > fitted + 1 && fitted < drawnWidth * WORTH_FITTING
}

/** The picture, pressable, with its quiet mark, and the large view it opens. */
export function OpensLarge({ src, alt, children }: { src: string; alt: string; children: ReactNode }) {
  const [open, setOpen] = useState<'no' | 'fitted' | 'full'>('no')
  const opener = useRef<HTMLButtonElement>(null)
  // HOW WIDE THE PICTURE IS DRAWN decides whether its mark carries words, measured again as it changes.
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = opener.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => {
      setNarrow(el.getBoundingClientRect().width < WORDS_FIT)
    })
    watch.observe(el)
    return () => {
      watch.disconnect()
    }
  }, [])
  return (
    <>
      <style href="mole-office-picture-large" precedence="default">
        {PICTURE_LARGE_CSS}
      </style>
      <button
        ref={opener}
        type="button"
        className="sb-image-opens"
        data-narrow={narrow ? '1' : undefined}
        title={t('sb.picture.openLarge')}
        aria-label={`${t('sb.picture.openLarge')}: ${alt}`}
        onClick={() => {
          const img = opener.current?.querySelector('img') ?? null
          const full =
            img !== null &&
            opensAtFullSize(
              { width: img.naturalWidth, height: img.naturalHeight },
              img.getBoundingClientRect().width,
              { width: window.innerWidth, height: window.innerHeight },
            )
          setOpen(full ? 'full' : 'fitted')
        }}
      >
        {children}
        <span className="sb-image-hint" aria-hidden="true">
          <span className="sb-image-hint-mark">⤢</span>
          <span className="sb-image-hint-word">{t('sb.picture.openLarge')}</span>
        </span>
      </button>
      {open !== 'no' ? (
        <PictureLarge
          src={src}
          alt={alt}
          startsFull={open === 'full'}
          onClose={() => {
            setOpen('no')
            opener.current?.focus()
          }}
        />
      ) : null}
    </>
  )
}

/**
 * The picture over the page. Escape, the close button and a press outside the picture close it.
 * "Full size" and a press on the picture switch between fitted to the window and the picture's own pixels.
 */
function PictureLarge({ src, alt, startsFull, onClose }: { src: string; alt: string; startsFull: boolean; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const picture = useRef<HTMLImageElement>(null)
  const [full, setFull] = useState(startsFull)
  // AT FULL SIZE THE VIEW SCROLLS BOTH WAYS, and it marks the edges the picture carries on past with
  // the shared marks every scrolling box in the product uses.
  const reach = useReach(full ? 'full' : 'fitted', view)
  // WHETHER THE WINDOW SHOWS FEWER PIXELS THAN THE PICTURE HAS. Only then is there a full size to see,
  // and only then is the press offered; a small picture is already drawn at its own size.
  // Opened at full size, it is: that was decided because the picture has more pixels than the window.
  const [bigger, setBigger] = useState(startsFull)
  const measure = (): void => {
    const img = picture.current
    if (img === null || full) return
    setBigger(img.naturalWidth > img.clientWidth + 1 || img.naturalHeight > img.clientHeight + 1)
  }
  // AND AGAIN WHEN THE WINDOW CHANGES SIZE, so a window made wider or narrower is asked the same question.
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  })
  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])
  // AT FULL SIZE THE VIEW OPENS ON THE MIDDLE OF THE PICTURE, which is where a fitted picture's
  // middle was, rather than on its top-left corner.
  useLayoutEffect(() => {
    const el = view.current
    if (el === null || !full) return
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
  }, [full])
  const toggle = (): void => {
    if (full || bigger) setFull(!full)
  }
  return (
    <Overlay>
      <InReachMark reach={reach} className="sb-picture-large-holder">
        <div
          ref={view}
          className="sb-picture-large"
          data-size={full ? 'full' : 'fitted'}
          // AT FULL SIZE THE KEYBOARD CAN SCROLL IT: the view takes a Tab, and the arrow keys move it.
          tabIndex={full ? 0 : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={(e) => {
            // A PRESS OUTSIDE THE PICTURE is a press on this backdrop itself. A press on the picture
            // switches its size, and closes nothing.
            if (e.target === e.currentTarget) onClose()
          }}
          // ITS KEYS ARE ITS OWN. React hands a key pressed in this portal up through the report that drew
          // the picture, and the report's walk takes the arrow keys, so at full size they did not scroll
          // the picture. Escape is read by the listener above, which this does not stop.
          onKeyDown={(e) => {
            e.stopPropagation()
          }}
        >
          <img
            ref={picture}
            src={src}
            alt={alt}
            data-press={full ? 'fit' : bigger ? 'full' : 'none'}
            onLoad={measure}
            onClick={toggle}
          />
          <div className="sb-picture-large-bar">
            {full || bigger ? (
              <button type="button" className="px-btn sb-picture-large-size" onClick={toggle}>
                {full ? t('sb.picture.fitWindow') : t('sb.picture.fullSize')}
              </button>
            ) : null}
            <button ref={close} type="button" className="px-btn sb-picture-large-close" onClick={onClose}>
              {t('talk.close')}
            </button>
          </div>
        </div>
      </InReachMark>
    </Overlay>
  )
}

const PICTURE_LARGE_CSS = `
.sb-image-opens { position:relative; display:block; width:fit-content; max-width:100%; padding:0; margin:0;
  border:0; background:none; font:inherit; color:inherit; text-align:left; cursor:zoom-in; }
.sb-image-opens:focus-visible { outline: var(--focus-w) solid var(--accent); outline-offset: 2px; }
/* THE QUIET MARK: always drawn, because a touch screen has no hover; brighter under the mouse and the
   keyboard. On a file's small picture it is the mark alone. */
.sb-image-hint { position:absolute; right:8px; bottom:8px; display:inline-flex; gap:4px; align-items:center;
  padding:2px 8px; border-radius: var(--radius); font-size: var(--fs-1); line-height: var(--lh-body);
  color: var(--text-2); background: color-mix(in srgb, var(--panel) 85%, transparent);
  border: var(--border-w) solid var(--border); opacity:.85; pointer-events:none; }
.sb-image-opens:hover .sb-image-hint, .sb-image-opens:focus-visible .sb-image-hint { opacity:1; color: var(--text); }
.sb-file-preview .sb-image-hint { right:4px; bottom:4px; padding:0 5px; }
.sb-file-preview .sb-image-hint-word { display:none; }
.sb-image-opens[data-narrow] .sb-image-hint { padding:0 6px; }
.sb-image-opens[data-narrow] .sb-image-hint-word { display:none; }
.px-reach.sb-picture-large-holder { position:fixed; inset:0; }
.sb-picture-large { position:absolute; inset:0; display:grid; place-items:center;
  background: color-mix(in srgb, var(--bg) 88%, transparent); cursor:zoom-out; }
/* FITTED: as large as the window allows, and never larger than the picture's own pixels. 48px at the
   top is the row of buttons. */
.sb-picture-large img { display:block; width:auto; height:auto;
  max-width: calc(100vw - ${String(FITTED_ACROSS)}px); max-height: calc(100dvh - ${String(FITTED_DOWN)}px);
  margin-top: ${String(FITTED_DOWN - FITTED_ACROSS)}px;
  border-radius: var(--radius); border: var(--border-w) solid var(--border); background: var(--panel-2);
  cursor:default; box-sizing:border-box; }
.sb-picture-large img[data-press="full"] { cursor:zoom-in; }
.sb-picture-large img[data-press="fit"] { cursor:zoom-out; }
/* FULL SIZE: the picture at its own pixels, and the view scrolls both ways. */
.sb-picture-large[data-size="full"] { display:block; overflow:auto; overscroll-behavior:contain; }
.sb-picture-large[data-size="full"] img { max-width:none; max-height:none; margin: 48px auto 8px; }
/* The buttons stay where they are while the picture scrolls under them. */
.sb-picture-large-bar { position:fixed; top:8px; right:8px; display:flex; gap:8px; }
`
