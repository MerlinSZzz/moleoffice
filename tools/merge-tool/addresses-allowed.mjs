// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ADDRESSES THE ADDRESS GATE LETS THROUGH (tools/merge-tool/addresses.mjs), one entry for each place the repository
 * truly needs an IPv4 address written out that is not loopback, the unspecified address or in a documentation range: a
 * public resolver an isolation test tries to reach, for example. A made-up address is better built at run time than
 * listed here, unless a screen must see it as written, as in the tests of the private-network pattern; the owner's own
 * addresses are never listed.
 *
 * An entry covers a hit on a line of `file` when one occurrence of `text` on that line holds the whole address: a line
 * an entry adds, for the added-line screen, and any line of the tree, for the whole-tree scan. `key` names the entry in
 * the gate's log, and stays when an entry before it goes; `why` says why the address is written out. Each address in a
 * text is built from its four numbers by `dotted`, so this file holds none written out and the whole-tree scan reads it
 * clean. This module imports nothing but a-library-is-not-a-program.mjs, which does nothing when it is imported, so a
 * test reads it without starting a run.
 */
import './a-library-is-not-a-program.mjs'

/** @typedef {{ key: string, why: string, file: string, text: string }} AnAllowance */

/** An address from its four numbers. @param {...number} numbers */
const dotted = (...numbers) => numbers.join('.')

/** The ranges tools/sandbox.mjs shuts an isolated run out of, as it and two of its tests write them. */
const THE_INSIDE_RANGES = `['${dotted(10, 0, 0, 0)}/8', '${dotted(100, 64, 0, 0)}/10', '${dotted(172, 16, 0, 0)}/12', '${dotted(192, 168, 0, 0)}/16', '${dotted(169, 254, 0, 0)}/16']`
/** The public resolvers tools/sandbox.mjs gives an isolated run, as it and a test write them. */
const THE_PUBLIC_RESOLVERS = `['${dotted(1, 1, 1, 1)}', '${dotted(8, 8, 8, 8)}']`
/** The container address on docker's default bridge, as two recorded command lines in design/attention/ write it. */
const A_DOCKER_BRIDGE_ADDRESS = `-container-ip ${dotted(172, 17, 0, 4)} -container-port`

/** @type {readonly AnAllowance[]} */
export const ALLOWED = Object.freeze([
  {
    key: 'the tailnet range, in a comment',
    why: 'The comment names the range a tailnet gives its machines, beside the code that adds it. A range names no machine.',
    file: 'src/server/lib/reach.ts',
    text: `${dotted(100, 64, 0, 0)}/10`,
  },
  {
    key: 'the tailnet range, in code',
    why: 'The office tells a door on a tailnet apart by this range, so the code has to write it out. A range names no machine.',
    file: 'src/server/lib/reach.ts',
    text: `'${dotted(100, 64, 0, 0)}', 10`,
  },
  {
    key: 'the ranges an isolated run cannot reach',
    why: 'The private and special ranges a sandbox shuts an isolated run out of. Each is a whole range and names no machine.',
    file: 'tools/sandbox.mjs',
    text: THE_INSIDE_RANGES,
  },
  {
    key: 'the public resolvers of an isolated run',
    why: "The two public name servers an isolated run asks. They are public services and name nobody's own machine.",
    file: 'tools/sandbox.mjs',
    text: THE_PUBLIC_RESOLVERS,
  },
  {
    key: "docker's subnets, in a comment",
    why: 'The comment names the subnets docker gives its own networks, which the isolated gate splits in two. A range names no machine.',
    file: 'tools/isolated-gate.mjs',
    text: `${dotted(172, 17, 0, 0)}/16, ${dotted(172, 17, 0, 0)}/17 and ${dotted(172, 17, 128, 0)}/17`,
  },
  {
    key: 'the ranges an isolation test checks',
    why: 'The test checks that a sandbox shuts out exactly the ranges tools/sandbox.mjs names, so it writes them the same way.',
    file: 'tests/an-isolated-run-cannot-reach-the-office.test.ts',
    text: THE_INSIDE_RANGES,
  },
  {
    key: 'the resolvers an isolation test checks',
    why: 'The test checks that a sandbox gives an isolated run the two public name servers tools/sandbox.mjs names.',
    file: 'tests/an-isolated-run-cannot-reach-the-office.test.ts',
    text: THE_PUBLIC_RESOLVERS,
  },
  {
    key: 'the ranges a container test shuts out',
    why: 'The test runs the isolated gate in a real container with the ranges tools/sandbox.mjs names, so it writes them the same way.',
    file: 'tests/the-isolated-gate-in-a-real-container.test.ts',
    text: THE_INSIDE_RANGES,
  },
  {
    key: 'the resolvers a container test gives',
    why: 'The test starts a real container with the two public name servers tools/sandbox.mjs names, on each of its three command lines.',
    file: 'tests/the-isolated-gate-in-a-real-container.test.ts',
    text: `'--dns', '${dotted(1, 1, 1, 1)}', '--dns', '${dotted(8, 8, 8, 8)}'`,
  },
  {
    key: "the range and the invented peers the owner-content gate's test plants",
    why: "The test of the owner-content gate's private-network pattern needs addresses of that very shape: the shared range's own address and two peers on it. Both peers are invented and name no machine.",
    file: 'tests/the-owner-content-gate.test.ts',
    text: `['${dotted(100, 64, 0, 0)}', '${dotted(100, 101, 12, 34)}', '${dotted(100, 101, 12, 35)}']`,
  },
  {
    key: 'the invented peer a bundle test plants',
    why: "The bundle scanner's test of the private-network pattern needs an address of that very shape. The peer is invented and names no machine.",
    file: 'tests/a-bundle-carries-none-of-the-owners-content.test.ts',
    text: `'${dotted(100, 101, 12, 34)}'`,
  },
  {
    key: "a media player's version number",
    why: "A version number in a phone media player's user agent, which has the shape of an address. It names no machine.",
    file: 'tests/file-preview.test.ts',
    text: `AppleCoreMedia/${dotted(1, 0, 0, 22)}A3354`,
  },
])
