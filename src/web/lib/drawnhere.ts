// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH ELEMENT ON THIS PAGE IS THIS PART OF THIS RECORD. One question, asked here and nowhere else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A FILE AND NOT A FUNCTION IN THE FILE THAT FIRST NEEDED IT
 * ---------------------------------------------------------------------------------------
 *
 * It was answered in two places until 1 September 2026 and the two disagreed.
 *
 *   `elementDrawing`, then a private function of src/web/components/agent/MarkLayer.tsx, asked the
 *   map below and so found a block under whichever key the page really used.
 *
 *   `elementFor`, a private function of src/web/components/agent/original.ts, spelled the region key
 *   itself with `targetAttributeValue` and compared it against every `data-target` on the page. A
 *   block drawn under its older `reportBlock` word matched nothing.
 *
 * MEASURED ON THE OWNER'S OWN REPORT, OOOt4Kouc5dT, DRAWN AT "All of it", 1 September 2026: the
 * write door accepts 488 part ids; the exact-key compare found 122 of them and the map found 134.
 * The twelve are every top-level block of the report — the same twelve `whereEachIsDrawn` has to
 * re-spell for a mark to survive. So *View original* told a reader that twelve blocks in front of
 * their eyes were "not drawn on this page", which is worse than saying nothing: the product was
 * asserting something untrue about the page it was standing on.
 *
 * TWO READERS, ONE ANSWER, AND THAT IS THE WHOLE POINT OF THE FILE. A mark and a landing cannot
 * answer differently about the same part when there is only one answer to read. tests/
 * a-landing-and-a-mark-agree-about-one-page.test.ts fails if either grows a second one.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS THE DOCUMENT AND DERIVES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * Every key is read back through `targetFromAttributeValue`, the one reader of the attribute
 * grammar, and the older spellings are converted through `regionIdOfLegacyTarget`, the one
 * converter — the same one the server resolves both spellings with. So nothing here spells a key,
 * and nothing here holds a second opinion about what a key means.
 */

import { DRAWN_FROM_ATTRIBUTE, TARGET_ATTRIBUTE, targetFromAttributeValue, type Target } from '@shared/targets.ts'
import { regionIdOfLegacyTarget, type RegionId } from '@shared/regions.ts'
import { theReportDrawnHere, type ReportDrawn } from './drawnreport.ts'

/**
 * EVERY REGION OF ONE RECORD THIS PAGE IS CARRYING, AND THE ELEMENT CARRYING EACH, read off the
 * document.
 *
 * The values are read back through the one reader of a target attribute rather than cut out of the
 * string, so an element whose attribute cannot be read is skipped instead of being turned into an
 * id nothing has.
 *
 * A BLOCK DRAWN UNDER ITS OLDER WORD IS COUNTED AS DRAWN, AND THAT IS THE POINT OF THE SECOND ARM.
 * A block of a report's own list carries `reportBlock/<record>/<block>` and not a region — see the
 * note on `regionMark` in SummaryBlocks — so a search for region targets alone walks straight past
 * every top-level block on the page. Measured on 30 August 2026 over three reports: forty-eight
 * comments whose part is inside such a block were answered "nothing on this page holds it", while
 * the block holding them was on the screen. `regionIdOfLegacyTarget` is the one converter between
 * the two spellings and the server resolves both to the same part of the report, so reading it here
 * is the same fact read the same way rather than a second opinion about it.
 *
 * THE FIRST ELEMENT FOUND FOR AN ID KEEPS IT. A region drawn twice on one page is a fact about that
 * page and not something to choose between here; the mark layer's `look` lands on the first match
 * for a key, and answering differently would put the mark somewhere the ordinary press would not.
 */
export function regionsDrawnOn(
  recordId: string,
  blocksField: string | null,
): ReadonlyMap<RegionId, Element> {
  const out = new Map<RegionId, Element>()
  if (typeof document === 'undefined') return out
  const keep = (id: RegionId, element: Element): void => {
    if (!out.has(id)) out.set(id, element)
  }
  for (const element of document.querySelectorAll(`[${TARGET_ATTRIBUTE}]`)) {
    const read = targetFromAttributeValue(element.getAttribute(TARGET_ATTRIBUTE) ?? '')
    if ('problem' in read) continue
    const target = read.target
    if (!('recordId' in target) || target.recordId !== recordId) continue
    if (target.kind === 'region') {
      keep(target.regionId, element)
      continue
    }
    const older = regionIdOfLegacyTarget(target, blocksField)
    if (older !== null) keep(older, element)
  }
  // EVERY PICTURE OF AN IMAGE BLOCK OF THIS RECORD, held by its block's element. See `thePictureIn`.
  for (const figure of document.querySelectorAll(`${AN_IMAGE_BLOCK}[${DRAWN_FROM_ATTRIBUTE}]`)) {
    const picture = thePictureIn(figure)
    if (picture !== null && theRecordAround(figure) === recordId) keep(picture, figure)
  }
  return out
}

/** The element a report's image block is drawn as. A press on the picture inside it names the picture. */
export const AN_IMAGE_BLOCK = 'figure.sb-image'

/**
 * THE REGION THAT IS THE PICTURE OF ONE DRAWN IMAGE BLOCK, or null when the element does not say
 * which stored block it draws. It is the block's stored path and then `.path`.
 *
 * A right-click on a picture in a report names the picture rather than the block holding it
 * (src/web/components/agent/pointing.ts). Until 3 October 2026 that name was spelled there and
 * nowhere else, and no element on the page answered to it: the talk box opened about a picture said
 * it was "not on this page" while the picture was on the screen. The owner met it in a report
 * O_wVUc-0nhOy (problem T3yQblhc2A28). The press and `regionsDrawnOn` above now read this one
 * spelling. The lookup reads `data-drawn-from` and not the block's own target, because an image block
 * inside a section, a column or a tab carries no target of its own.
 */
export function thePictureIn(figure: Element): RegionId | null {
  const block = figure.getAttribute(DRAWN_FROM_ATTRIBUTE)
  if (block === null || !block.startsWith('data.blocks[')) return null
  return `${block}.path`
}

/**
 * THE RECORD THE NEAREST READABLE TARGET AROUND AN ELEMENT NAMES, the element itself included, or null.
 * An image block's own figure may carry no target, and the block or report around it says whose it is.
 */
function theRecordAround(element: Element): string | null {
  let at = element.closest(`[${TARGET_ATTRIBUTE}]`)
  while (at !== null) {
    const read = targetFromAttributeValue(at.getAttribute(TARGET_ATTRIBUTE) ?? '')
    if ('target' in read) return 'recordId' in read.target ? read.target.recordId : null
    at = at.parentElement?.closest(`[${TARGET_ATTRIBUTE}]`) ?? null
  }
  return null
}

/**
 * THE ELEMENT ON THIS PAGE THAT IS ONE PART OF ONE RECORD, or null because this page is not drawing
 * that part.
 *
 * A comment on a block, a row or a cell of a report is STORED as the region it names — the write
 * path spells it that way so that a stored context cannot stop the server coming up, and the whole
 * argument is on `theRegionItNames` in src/server/lib/targets.ts. The ELEMENT drawing that block
 * still carries `reportBlock/<record>/<block>`. The two strings are different, so every selector
 * built from the stored key finds nothing on exactly those, and it fails the silent way: no mark on
 * a block, no wash on the words in a table, no landing for *View original*, and no error anywhere.
 *
 * NULL MEANS THIS PAGE IS NOT DRAWING THE PART. It does not mean the record has not got it, and it
 * does not mean nothing on the page holds it — `regionsDrawnOnHere` below is what a caller asks to
 * find the holder, and both of this product's callers do ask.
 */
export function elementDrawing(target: Target): Element | null {
  if (target.kind !== 'region' && target.kind !== 'reportBlock') return null
  const drawn = theReportDrawnHere()
  if (drawn !== null && drawn.recordId === target.recordId) {
    // A BLOCK STORED UNDER ITS OLDER NAME is read through the one converter, so pressing a quote
    // written before the region name landed finds the block in front of the reader.
    const regionId = target.kind === 'region' ? target.regionId : regionIdOfLegacyTarget(target, drawn.blocksField)
    const here = regionId === null ? undefined : regionsDrawnOn(drawn.recordId, drawn.blocksField).get(regionId)
    if (here !== undefined) return here
  }
  // A DRAWING DRAWS THE WHOLE RECORD ON ONE CARD, AND THE CARD IS THE ANSWER FOR EVERY PART OF IT.
  // Criterion D23: see `theCardDrawnFor` below for what went wrong without this.
  return theCardDrawnFor(target.recordId)
}

/**
 * THE CARD ON A DRAWING THAT HOLDS THIS RECORD, or null when no drawing on this page holds it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A CARD ANSWERS FOR A PART OF A RECORD — CRITERION D23
 * ---------------------------------------------------------------------------------------
 *
 * A card on a drawing draws the record's parts only at levels 4, 5 and 6, which is only when its
 * detail tick is on. So a comment written on one of those parts had an element to be marked on
 * while the tick was on and none at all when it was off.
 *
 * MEASURED ON THE OWNER'S OWN PIPELINE on an isolated copy of the owner's database, 6 September 2026: a
 * comment left on a part of the ZED 2i card drew a count of 1 while the card was at level 5, and the
 * count disappeared the moment the tick came off and the card fell back to level 3. The comment
 * itself showed and hid as the detail tick changed, which a comment should never do.
 *
 * THE CARD IS THE THING THE PART IS DRAWN INSIDE, so it is the honest place for the count: it is
 * where the reader would look, and it is where the part reappears when the card grows. The count is
 * then the same before and after the tick.
 *
 * NOTHING HERE SPELLS A KEY. Every card's own `data-target` is read back through
 * `targetFromAttributeValue`, the one reader of the attribute grammar, exactly as `regionsDrawnOn`
 * above does — so this cannot invent a key that no element carries.
 */
export function theCardDrawnFor(recordId: string): Element | null {
  for (const el of document.querySelectorAll(`[${TARGET_ATTRIBUTE}]`)) {
    // A CARD ON A DRAWING AND NOT ANY ELEMENT THAT NAMES THE RECORD. A record page's own heading
    // names it too, and a circle put there would be a comment about a part drawn on the record's
    // title. The drawing's own classes are what say this is a card.
    if (!el.classList.contains('gx-card') && !el.classList.contains('gx-group')) continue
    const said = el.getAttribute(TARGET_ATTRIBUTE)
    if (said === null) continue
    const read = targetFromAttributeValue(said)
    if ('problem' in read) continue
    if (read.target.kind === 'record' && read.target.recordId === recordId) return el
  }
  return null
}

/**
 * THE SAME MAP AS `regionsDrawnOn`, FOR THE REPORT THIS PAGE HAPPENS TO BE DRAWING, or null when it
 * is drawing none of that record.
 *
 * The two callers that walk UP the tree — the mark layer looking for the nearest drawn holder, and
 * *View original* doing the same — need the map and the derived tree together, and reading the page
 * twice for them would be the two-readings defect this file exists to end.
 */
export function regionsDrawnOnHere(
  recordId: string,
): { drawn: ReadonlyMap<RegionId, Element>; report: ReportDrawn } | null {
  const report = theReportDrawnHere()
  if (report === null || report.recordId !== recordId) return null
  return { drawn: regionsDrawnOn(report.recordId, report.blocksField), report }
}
