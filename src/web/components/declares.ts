// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A REGION OF THE SCREEN SAYS IT IS, AND THE ONE WAY IT SAYS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A person points at something by right-clicking it. The browser walks up from the pixel they
 * pressed until it finds an element that says what it is. Before this file, almost nothing said,
 * so the walk ran past every panel and every fold and stopped at the whole page.
 *
 * `Panel`, `Explain`, `NavRow` and `Band` now take one required prop, of the type below. A region
 * cannot be added to this product without answering the question.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ANSWERS, AND WHY THERE ARE EXACTLY THREE
 * ---------------------------------------------------------------------------------------
 *
 *   `{ surface: id }`   This is a part of Mole Office itself, and here is its name. The name comes
 *                       from src/shared/surfaces.ts, so a name nobody wrote down is a compile
 *                       error rather than a comment saved against nothing.
 *
 *   `{ about: target }` This container is drawn for one thing — a record, a block, a plan line —
 *                       and it declares that thing. A panel whose heading is a record's title
 *                       answers this and never the one above, or a comment left on somebody's
 *                       report would be filed against Mole Office's own interface.
 *
 *   `{ surface: null }` This container is see-through: it holds no identity of its own and the
 *                       walk carries on past it to whatever encloses it. Two honest cases. A
 *                       container repeated down a list, where each row already says what it is.
 *                       And a panel drawn inside a record's own page, where the record around it
 *                       is the better answer and stays the answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `{ surface: null }` IS NOT A LOOPHOLE
 * ---------------------------------------------------------------------------------------
 *
 * It emits nothing, so it looks from the outside exactly like the silence this step removed. What
 * makes it different is that it is written at the call site, on purpose, and a person reading the
 * diff sees it. A test counted them until it was deleted on 12 November 2026.
 */
import { targetAttributes, type Target } from '@shared/targets.ts'
import type { SurfaceId } from '@shared/surfaces.ts'

/**
 * What one region of the screen says it is. Read the file header for the three cases; the type is
 * a union rather than three optional props so that a call site cannot claim two of them at once.
 */
export type Declares = { surface: SurfaceId } | { about: Target } | { surface: null }

/**
 * The attributes this declaration puts on the element, which is `data-target` or nothing at all.
 *
 * ONE FUNCTION, so the rule about what a see-through container emits is written once. Three
 * components spread the result of this and none of them decides anything for itself.
 */
export function declaredAttributes(declares: Declares): Record<string, string> {
  if ('about' in declares) return targetAttributes(declares.about)
  if (declares.surface === null) return {}
  return targetAttributes({ kind: 'uiSurface', surfaceId: declares.surface })
}

/**
 * Does this declaration put the region on the map at all?
 *
 * The one caller that needs to know is the heading mark below: a see-through container must not
 * mark its own heading, because the mark would then name whatever encloses it after this
 * container's words. That is the hazard `nameSaidBy` carries — see agent/pointing.ts.
 */
export function declaresSomething(declares: Declares): boolean {
  return 'about' in declares || declares.surface !== null
}
