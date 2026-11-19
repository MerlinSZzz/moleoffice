# Real excerpts of two files that bounced on 15 October 2026

These files are not invented. Each is cut from a real commit of this repository. The test
tests/the-merge-tool-joins-add-only-conflicts-tier-1.test.ts joins them.

- `messages.*.txt`: src/server/lib/messages.ts from merge entry wxxhqYe3kPDu, at the commit b0741320b43f where the
  rebase onto main dd4ecf4686d8 stopped. The ancestor is that commit's parent, main is dd4ecf4686d8 and the entry is
  b0741320b43f. The cut runs from the first line to `import { sayInEnglish }`, so the conflict is at line 40, as in the
  real file.
- `zh-made-from.*.txt`: src/shared/words/zh-made-from.ts from merge entry igosHDrHgqv5, at the commit 9988e05d1838 where
  the rebase onto main 8f37b85e1710 stopped. The ancestor is that commit's parent, main is 8f37b85e1710 and the entry is
  9988e05d1838. The cut runs from `  translated: {`, line 10653 of each side, to the end, so the conflict at line 10718
  of the real file is at line 66 here. The whole file is about 514 kB.
