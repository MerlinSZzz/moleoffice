// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE SENTENCE ABOVE THE LIST OF TRUSTED MACHINES, in a file that imports nothing.
 *
 * It lives here and not in trustedmachines.ts because the English word list reads it, and
 * trustedmachines.ts loads visitors.ts, which reads the word lists while it loads. Importing it from
 * there into en.ts closed a loop that read the lists before they existed. trustedmachines.ts
 * re-exports it, so the server and the page still read one sentence.
 */
/*
 * What the list decides, in the words every screen and the API reply draw.
 *
 * IT IS SHORT BECAUSE IT SITS ABOVE THE LIST. The first draft ran five sentences over two rows, and
 * in the handback picture the explanation outweighed the thing it explained. What is left is the two
 * facts a reader cannot work out from the rows: that nothing is refused for being off the list, and
 * that the address this server bound is in it. And it does not shout: the capitals this codebase
 * uses to head a comment had been copied into a sentence a person reads.
 */
export const WHAT_THE_LIST_DECIDES =
  'These are the machines this office trusts. Confirming a visitor credential adds the machine it was confirmed ' +
  'for, and every visiting agent request is marked with whether it came from one of these. Nothing is refused ' +
  'today for being off the list; whether it should be is still yours to answer. The address this server bound ' +
  'when it started is in the list too, so the list says what door the office actually opened.'
