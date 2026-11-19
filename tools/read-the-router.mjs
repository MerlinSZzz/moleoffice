// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READ FACTS OUT OF THE ROUTER, IN ONE PLACE, FOR EVERY TOOL THAT NEEDS THEM.
 *
 * ------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ------------------------------------------------------------------------------------------
 *
 * The address of a record page — `/r/<id>` — is written down once, in `recordPath` in
 * src/web/components/router.tsx, because that is the function every link in the app navigates
 * with. Three tools need the same address to drive a browser at a record page:
 * tools/legibility.mjs, tools/review.mjs and tools/accept.mjs. Each of them used to read it with
 * its own copy of the same regular expression.
 *
 * That is this repository's recurring defect: the same fact worked out in three places, with
 * nothing making the three agree. On 25 August 2026 it cost what the defect always costs.
 * Wave 5 step 3 (`c3b3b5d`) gave `recordPath` a second argument and a conditional body. All three
 * patterns stopped matching on the same day. Four tests went red in
 * tests/looked-at-every-screen.test.ts, `node tools/review.mjs` threw before it photographed
 * anything, and so THE FOUR-WIDTH SCREEN REVIEW DID NOT RUN FOR A WHOLE ROUND. Nobody looked at
 * 990 or 660 on any screen wave 5 or wave 6 built.
 *
 * There is one pattern now, and tests/the-tools-read-the-router.test.ts runs it against the real
 * router file, so the next change to `recordPath` fails a fast test instead of a browser tool.
 */

/**
 * The address prefix of a record page, from the router's own `recordPath`.
 *
 * ------------------------------------------------------------------------------------------
 * WHAT IT READS, AND WHY IT READS IT THAT WAY
 * ------------------------------------------------------------------------------------------
 *
 * `recordPath` builds the address in a template literal, and the characters before the first
 * `${` are the prefix — `/r/` today. The declaration is cut out first, from `export const
 * recordPath` to the blank line that ends it, and the first template head is read out of that.
 * The old pattern instead demanded the whole shape of the function in one expression: an argument
 * list, an arrow, and a backtick immediately after it. That made every part of the function's
 * shape into something this parser could break on, and a second argument broke it.
 *
 * IT FAILS RATHER THAN GUESSING. A router this cannot read throws, naming the file and saying to
 * teach the parser rather than to type `/r/` into a tool. An empty prefix throws too: `[^`$]*`
 * matches nothing happily, and a prefix read as `''` would send a browser to `#/<id>` and report
 * whatever that page said.
 *
 * @param {string} source  the text of router.tsx
 * @param {string} routerFile  where it was read from, for the error message
 * @returns {string} the prefix, without the leading `#` — the caller writes the hash
 */
export function recordPrefixFrom(source, routerFile) {
  const teach =
    `Teach this parser the new shape in tools/read-the-router.mjs -- do not hand-copy an ` +
    `address into a tool, which is how this broke last time.`
  const startsAt = source.indexOf('export const recordPath')
  if (startsAt === -1) {
    throw new Error(`Could not find \`recordPath\` in ${routerFile}, which is where the address of a record page lives. ${teach}`)
  }
  const rest = source.slice(startsAt)
  const endsAt = rest.indexOf('\n\n')
  const declaration = endsAt === -1 ? rest : rest.slice(0, endsAt)
  const found = declaration.match(/`([^`$]*)\$\{/)
  if (found === null) {
    throw new Error(`Could not read the record-page address out of \`recordPath\` in ${routerFile}: its declaration holds no address to read. ${teach}`)
  }
  if (found[1] === '') {
    throw new Error(`\`recordPath\` in ${routerFile} builds an address that starts with a value rather than with characters, so this parser cannot say what a record page's address begins with. ${teach}`)
  }
  return found[1]
}

/**
 * The address segment a page lives under, from the one declaration that holds it.
 *
 * ------------------------------------------------------------------------------------------
 * WHY IT IS NOT READ OUT OF THE ROUTER
 * ------------------------------------------------------------------------------------------
 *
 * The router builds an address such as `/${PROFILE_SEGMENT}/${kind}/${id}`, so its source holds the
 * shape and not the word. The word is declared once, as `export const <NAME>_SEGMENT = '<word>'`,
 * in src/shared, because the server's own sentences name the page too and the server may not import
 * the browser. This reads that declaration, so no tool types `who` or `message` into itself. It is
 * the only reader of such a declaration: tools/review.mjs and tools/legibility.mjs both call it.
 *
 * IT FAILS RATHER THAN GUESSING, like the reader above and for the same reason: a tool sent to
 * `#/undefined/agent/x` would report whatever the not-found page said and call it a profile. The
 * error names the page whose address could not be read, which the caller says in `page`.
 *
 * @param {string} source  the text of the file that declares the segment
 * @param {string} declaration  the constant's name, such as `PROFILE_SEGMENT`
 * @param {string} file  where the source was read from, for the error message
 * @param {string} page  whose address it is, in words, such as "a participant's page"
 * @returns {string} the segment, with no slashes — the caller writes those
 */
export function segmentFrom(source, declaration, file, page) {
  const found = source.match(new RegExp(`export const ${declaration} = '([^']+)'`))
  if (found === null || found[1] === undefined || found[1] === '') {
    throw new Error(
      `Could not read \`${declaration}\` out of ${file}, which is where the address of ${page} is ` +
        `declared. Teach this parser the new shape in tools/read-the-router.mjs -- do not hand-copy an ` +
        `address into a tool, which is how this broke last time.`,
    )
  }
  return found[1]
}

/** Where a visiting agent's credential page lives. See `segmentFrom`. */
export function visitorSegmentFrom(source, file) {
  return segmentFrom(source, 'VISITOR_SEGMENT', file, "a visiting agent's credential page")
}

/** Where a participant's page lives. See `segmentFrom`. */
export function profileSegmentFrom(source, file) {
  return segmentFrom(source, 'PROFILE_SEGMENT', file, "a participant's page")
}
