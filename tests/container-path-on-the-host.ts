// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A STAND-IN DOCKER FINDS ON THIS MACHINE A PATH THAT A CONTAINER SEES (problem grSlyQ6l89I4). Written once here,
 * because four stand-ins need it (USER.md, invariant 9): the check view's (tests/check-view-stand-ins.ts), the inspector
 * fixture's probe (tests/inspector-tool-fixture.ts), and the two in the inspector's sandbox tests.
 *
 * As Docker does, a path is mapped by the mount with the longest destination it lies in, and it is mapped once. A
 * destination is matched only as whole path parts: not after a letter, digit, `.`, `_` or `-`, and not before one.
 *
 * Until 18 October 2026 each stand-in mapped the text through every mount in turn, with split and join. A path that one
 * mount had just written was then mapped again by a later mount. With TMPDIR /check/tmp, which is the check's own, the
 * source of the /work mount lies under /check/tmp, so the /check/tmp mount mapped it a second time. The stand-in then
 * started its command in a folder that did not exist, and the test failed with "spawn … ENOENT".
 *
 * The text is the source of a function `(text, pairs) => string`, where pairs is `[inside the container, on this
 * machine][]`. A stand-in puts it into its own source; tests/a-stand-in-maps-a-container-path-once.test.ts runs it alone.
 */
export const FROM_THE_CONTAINER_TO_THE_HOST = String.raw`(text, pairs) => {
  const outside = new Map(pairs.filter(([inside]) => inside))
  if (outside.size === 0) return text
  const longestFirst = [...outside.keys()].sort((a, b) => b.length - a.length)
  const escaped = longestFirst.map(inside => inside.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&'))
  const anyInside = new RegExp('(?<![A-Za-z0-9._-])(?:' + escaped.join('|') + ')(?![A-Za-z0-9._-])', 'g')
  return text.replace(anyInside, inside => outside.get(inside))
}`
