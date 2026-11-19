// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP LABEL DRAWN ABOVE A PAGE, IN THE PAGE'S OWN FLOW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Several browser tests photograph a page holding made-up data, and a picture of made-up data
 * must say in the picture itself that the data is made up (invariant 3). Each test used to
 * write its own label into the page, fixed to the top of the window, so the label covered the
 * top of the page in the picture (round 11's office controls and roles pictures lost their top
 * 32 pixels). Where a label goes and how it is drawn is one fact, so it is written once, here
 * (invariant 9).
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE LABEL GOES, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * The label goes into the page's own flow, immediately above the block the picture shows. It
 * takes its own height and pushes nothing aside, so it covers no part of the page.
 *
 * IT IS NOT PUT AT THE TOP OF THE DOCUMENT. Most of these pictures are taken with the page
 * scrolled to the block they show, and a label at the document top would then be out of the
 * picture, which is a picture with no label (invariant 3). Above the block, the label is in
 * every picture and it names the block the picture is about.
 *
 * THE LABEL IS SCROLLED BELOW ANY BAR STUCK AT THE TOP OF THE WINDOW, by its own
 * scroll-margin-top, so the page's own sticky rows do not cover it. Only a bar that lies over the
 * label's own column counts: a list stuck in a column beside the label is not above it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHEN IT THROWS
 * ---------------------------------------------------------------------------------------
 *
 * Invariant 4: a broken assumption fails loudly.
 *
 *   - The block the picture shows must be in the page, or this throws and names the page.
 *   - After the label is in and scrolled to, its rectangle must not overlap any element of the
 *     page. One that does makes this throw, naming the page and the element that overlaps.
 *   - The block must start below the label, or this throws and names the page.
 *   - The label must be whole inside the window, or this throws and names the page: a picture
 *     whose label is cut off is a fault.
 *
 * THE OVERLAP CHECK COUNTS ONLY WHAT THE PAGE DRAWS WHERE THE LABEL IS. An element that answers
 * with a rectangle but is not drawn where the label is is not covered by the label. Three such
 * elements are left out: one the browser says is not visible, such as the content of a closed
 * fold, which still answers with the rectangle it had when it was last drawn; one whose rectangle
 * reaches under the label while a scrolling parent clips it away before it gets there; and
 * everything outside the label's own positioned layer, such as the page under a sidebar drawn as
 * a drawer over it, which the drawer covers whether or not a label is in it. That last one is left
 * out only while the label lies inside the layer's box; a label that reaches past the box is
 * checked against the whole page. Nothing here names a page's own classes, so a change on a page
 * cannot quietly stop the check from seeing it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PICTURE LOSES, WHICH IS SAID RATHER THAN HIDDEN
 * ---------------------------------------------------------------------------------------
 *
 * The label takes its own height above the block, and its 8 pixels of margin under it. Near the top
 * of a page the label may also be pushed down by a margin for the distance the window could not
 * scroll, and then the bottom of a whole-window picture loses that much too. In a picture of the
 * whole window, the bottom of the window therefore holds that much less of the page than it did
 * without the label. The block the picture is about is still whole: the label is above it and the
 * block is drawn from just under the label. The lost strip is the page below the block.
 *
 * WHICH PAGES LOSE WHAT, measured from the pictures. The label is about 34 pixels tall on the
 * pages in this round and taller at 390 where its words wrap. The pictures of the Messages, Words,
 * Office controls, Restart, Home, Working, Roles, Regulations and Dead letters pages show the
 * window, so the bottom strip that tall is not in them; the block each is about is whole. Nothing
 * is lost in the settings plugins pictures, which are a clip around the panel, nor in the two
 * whole-page pictures (the report page and the refused-saved block on Settings).
 *
 * ---------------------------------------------------------------------------------------
 * HOW A TEST USES IT
 * ---------------------------------------------------------------------------------------
 *
 *   const labelHeight = await putTheMadeUpLabelIn(page, 'Made-up test office — ...', block, 'the office controls page')
 *   ...take the picture...
 *   await takeTheMadeUpLabelOut(page)
 *
 * The label carries the marker `data-made-up-label` while it is in the page.
 *
 * A STRIP OUTSIDE THE PAGE. A picture of a report whose own blocks are the subject must not show
 * the label as a block among those blocks, because a reader cannot tell which box is the office's
 * writing and which is the note about the picture. `stripOutsideThePage` draws the label as a
 * full-width strip fixed along the top edge of the window instead, over the office's own chrome,
 * and scrolls the block below it. The strip takes no place in the report's flow, so it is outside
 * the page the picture is about. Its check is the same one that matters: it is whole in the window
 * and the block the picture shows starts below it. The overlap check is not made for it, because
 * covering the window's own bar is what an outside strip does.
 */

import type { Locator, Page } from 'playwright'

/** The marker the made-up label carries while it is in the page, and the one reader of it. */
export const THE_MADE_UP_LABEL_MARKER = '[data-made-up-label]'

/** What the browser answers after the label is in: its height, or why the page refused it. */
interface Drawn {
  height: number
  overlap: string[]
  blockAboveLabel: boolean
  labelOutsideTheWindow: boolean
}

/**
 * Puts the made-up label into the page's own flow immediately above `above`, scrolls the label
 * below any bar stuck at the top of the window, and proves the label covers no part of the page.
 * Returns the label's height, for a caller that has to leave room for it. `called` names the page
 * or the picture in every throw. Throws rather than photographing a broken page.
 */
export interface MadeUpLabelPlacement {
  /** Draw the label as a strip along the window's top edge, outside the page's own flow. */
  stripOutsideThePage?: boolean
}

/** The attribute a block carries while a strip's scroll margin is set on it. */
const SCROLLED_BY_A_STRIP = '[data-made-up-label-scrolled]'

export async function putTheMadeUpLabelIn(
  page: Page,
  words: string,
  above: Locator,
  called: string,
  placement: MadeUpLabelPlacement = {},
): Promise<number> {
  const block = above.first()
  if ((await block.count()) === 0) throw new Error(`putTheMadeUpLabelIn(${called}): the block the picture shows is not in the page, so no picture was taken`)
  const strip = placement.stripOutsideThePage === true
  const drawn = (await block.evaluate(
    (node, [words, marker, strip]) => {
      for (const old of document.querySelectorAll(marker)) old.remove()
      const label = document.createElement('p')
      label.setAttribute('data-made-up-label', '')
      label.textContent = words
      label.style.cssText =
        'margin:0 0 8px;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--panel);color:var(--text);font:14px sans-serif'
      if (strip) {
        // A STRIP ALONG THE WINDOW'S TOP EDGE, over the office's own bar and outside the page's flow.
        label.style.cssText =
          'position:fixed;left:0;right:0;top:0;margin:0;padding:8px;border:0;border-bottom:1px solid var(--border);border-radius:0;background:var(--panel);color:var(--text);font:14px sans-serif;z-index:2147483647;box-sizing:border-box'
        document.body.append(label)
        const height = Math.ceil(label.getBoundingClientRect().height)
        node.setAttribute('data-made-up-label-scrolled', '')
        node.style.scrollMarginTop = `${String(height + 8)}px`
        node.scrollIntoView({ block: 'start' })
        const box = label.getBoundingClientRect()
        return {
          height: box.height,
          overlap: [],
          blockAboveLabel: node.getBoundingClientRect().top >= box.bottom - 0.5,
          labelOutsideTheWindow: box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth,
        }
      }
      node.before(label)
      // A BLOCK INSIDE A ROW OR A GRID GETS ITS OWN LINE. A label inserted into a row of buttons or
      // a grid of cards would be a cell beside the block rather than a line above it, so it is given
      // the whole line and the block is pushed down, which is where a label above the page belongs.
      const parent = node.parentElement
      if (parent !== null) {
        const style = getComputedStyle(parent)
        if (style.display.includes('flex') && !style.flexDirection.startsWith('column')) label.style.flex = '0 0 100%'
        if (style.display.includes('grid')) label.style.gridColumn = '1 / -1'
      }
      // THE BARS AND CORNER WIDGETS ALREADY AT THE TOP OF THE WINDOW. The label is scrolled below
      // them, so a page's own sticky row, or a fixed round button in a corner, does not cover it.
      // They are read before the scroll, when they are where the reader last put them. A bar counts
      // only where it lies over the label's own column: the chapter list stuck in the right-hand
      // column on the Regulations page is 430 pixels tall, and a label in the middle column has
      // nothing above it. The label's own box is its place in the page before the scroll.
      // A STICKY ELEMENT IS A BAR ONLY WHILE IT IS STUCK, that is while its top is its computed top,
      // within a pixel. On the Checklists page at 1440 the open checklist is a sticky panel in the
      // page's flow below the label; counted as a bar, it pushed the label down and left a blank
      // band of about 380 pixels above it. A fixed element is always where it is drawn.
      const labelPlace = label.getBoundingClientRect()
      const bars = [...document.querySelectorAll('body *')].filter((one) => {
        const style = getComputedStyle(one)
        if (!['sticky', 'fixed'].includes(style.position)) return false
        if (style.position === 'sticky' && !(Math.abs(one.getBoundingClientRect().top - parseFloat(style.top)) <= 1)) return false
        if (one instanceof HTMLElement) return one.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        return true
      })
      const stuck = bars
        .map((one) => one.getBoundingClientRect())
        .filter(
          (box) =>
            box.top < innerHeight / 3 &&
            box.height > 0 &&
            box.height < innerHeight / 2 &&
            box.left < labelPlace.right &&
            box.right > labelPlace.left,
        )
      const under = Math.max(0, ...stuck.map((box) => box.bottom))
      // THE SCROLL MARGIN KEEPS THE LABEL CLEAR OF THE BARS AFTER THE SCROLL. Near the top of a page
      // the window cannot scroll any further, so the label is pushed down by a margin only for the
      // distance the scroll could not make. A margin at every page would leave an empty band above
      // the label that the page does not draw.
      label.style.scrollMarginTop = `${String(Math.ceil(under + 8))}px`
      label.scrollIntoView({ block: 'start' })
      const short = Math.ceil(under + 8 - label.getBoundingClientRect().top)
      if (short > 0) {
        label.style.marginTop = `${String(short)}px`
        label.scrollIntoView({ block: 'start' })
      }
      const box = label.getBoundingClientRect()
      const describe = (element: Element): string => {
        const name = element.tagName.toLowerCase()
        const id = element.id === '' ? '' : `#${element.id}`
        const classes = [...element.classList].slice(0, 2).map((one) => `.${one}`).join('')
        const said = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)
        return `<${name}${id}${classes}>${said === '' ? '' : ` "${said}"`}`
      }
      const overlap: string[] = []
      // WHAT A PAGE REALLY DRAWS WHERE THE LABEL IS. An element's rectangle can reach under the
      // label while its own scrolling parent clips it away: the sidebar's list is taller than the
      // sidebar and reaches under its foot. Such a box is not drawn where the label is, so the
      // rectangle is clipped by every ancestor that clips before it is read as an overlap.
      const clippedBox = (element: Element): { left: number; top: number; right: number; bottom: number } => {
        const box = element.getBoundingClientRect()
        const out = { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
        for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          if (style.overflow === 'visible' && style.overflowX === 'visible' && style.overflowY === 'visible') continue
          const parentBox = parent.getBoundingClientRect()
          const left = parentBox.left + parent.clientLeft
          const top = parentBox.top + parent.clientTop
          out.left = Math.max(out.left, left)
          out.top = Math.max(out.top, top)
          out.right = Math.min(out.right, left + parent.clientWidth)
          out.bottom = Math.min(out.bottom, top + parent.clientHeight)
        }
        return out
      }
      // THE LABEL'S OWN LAYER. When the label sits inside a positioned box, such as a sidebar drawn
      // over the page, the page behind that box is part of the box's own picture and is not covered
      // by the label: the box was already over it. Only elements inside the label's layer can be
      // covered by the label, so everything outside the layer is left out of the check, but only
      // while the label lies inside the layer's own box. A label that reaches past that box is over
      // the page outside the layer too: a label fixed across the top of the window, inside the
      // Settings panel's positioned section, lay over the sidebar and was not seen.
      const layer = (() => {
        for (let parent = label.parentElement; parent !== null; parent = parent.parentElement) {
          if (getComputedStyle(parent).position !== 'static') return parent
        }
        return null
      })()
      const layerBox = layer?.getBoundingClientRect()
      const insideItsLayer =
        layerBox !== undefined &&
        box.left >= layerBox.left &&
        box.right <= layerBox.right &&
        box.top >= layerBox.top &&
        box.bottom <= layerBox.bottom
      for (const element of document.querySelectorAll('body *')) {
        if (element === label || element.contains(label) || label.contains(element)) continue
        if (layer !== null && insideItsLayer && !layer.contains(element)) continue
        // ONLY WHAT THE BROWSER SAYS IS DRAWN COUNTS. A closed details' own content still answers
        // with the rectangle it had when it was last drawn, and a label is not over what is not
        // drawn.
        if (element instanceof HTMLElement && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
        if (element instanceof HTMLElement && (element.hidden || getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden')) continue
        const rect = clippedBox(element)
        if (rect.right <= rect.left || rect.bottom <= rect.top) continue
        if (rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top) overlap.push(describe(element))
      }
      return {
        height: box.height,
        overlap: overlap.slice(0, 3),
        blockAboveLabel: node.getBoundingClientRect().top >= box.bottom - 0.5,
        labelOutsideTheWindow: box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth,
      }
    },
    [words, THE_MADE_UP_LABEL_MARKER, strip] as const,
  )) as Drawn
  if (drawn.overlap.length > 0) {
    throw new Error(`putTheMadeUpLabelIn(${called}): the made-up label "${words}" covers the page, over ${drawn.overlap.join(', ')}`)
  }
  if (!drawn.blockAboveLabel) throw new Error(`putTheMadeUpLabelIn(${called}): the made-up label "${words}" is not above the block the picture shows`)
  if (drawn.labelOutsideTheWindow) throw new Error(`putTheMadeUpLabelIn(${called}): the made-up label "${words}" is cut off by the window, so the picture would not hold it whole`)
  return drawn.height
}

/** Takes every made-up label out of the page, so it is there only while the pictures are taken. */
export async function takeTheMadeUpLabelOut(page: Page): Promise<void> {
  await page.evaluate(([marker, scrolled]) => {
    for (const label of document.querySelectorAll(marker)) label.remove()
    for (const node of document.querySelectorAll(scrolled)) {
      node.removeAttribute('data-made-up-label-scrolled')
      if (node instanceof HTMLElement) node.style.scrollMarginTop = ''
    }
  }, [THE_MADE_UP_LABEL_MARKER, SCROLLED_BY_A_STRIP] as const)
}
