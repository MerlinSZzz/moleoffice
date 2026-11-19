// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useState } from 'react'

/**
 * WHETHER THIS ELEMENT HAS COME WITHIN A SCREEN OF THE WINDOW, and it stays true once it has.
 *
 * Round 19 of wave 13w: Home asks only for what it draws on the first screen. On an office of the owner's
 * size Needs you held 106 rows, each reading its record for the words at Home's length, and they were all
 * asked on load, ahead of the agent column's own reads; in Developer mode the sessions block at the foot of
 * Home read 1.7 MB of sessions. Each now reads when it comes within a screen of the window, and draws what
 * it drew while its read was out until then.
 *
 * Pass the first value as the element's `ref`.
 *
 * `armed` IS FALSE WHILE WHAT IS DRAWN ABOVE THE ELEMENT IS STILL A PLACEHOLDER. The observer's first look is
 * at the page as it is then: on the office of the owner's size the sessions block sat at 900 pixels while Needs
 * you was still loading, and at 7,300 once its 106 rows were drawn, so it was asked for a second after the
 * address was opened. The place is watched only once the caller says the page above it has its size.
 */
export function useNearTheScreen(armed: boolean = true): [(element: Element | null) => void, boolean] {
  const [near, setNear] = useState(false)
  const [element, setElement] = useState<Element | null>(null)
  useEffect(() => {
    if (near || !armed || element === null) return
    const watch = new IntersectionObserver(
      (seen) => {
        if (seen.some((one) => one.isIntersecting)) setNear(true)
      },
      { rootMargin: '100% 0px' },
    )
    watch.observe(element)
    return () => watch.disconnect()
  }, [near, armed, element])
  return [setElement, near]
}
