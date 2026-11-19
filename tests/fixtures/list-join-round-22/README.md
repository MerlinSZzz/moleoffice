# Real excerpts of list files that bounced

These files are not invented. Each is cut from a real commit of this repository, from one line before a line all three
sides share to the end of the file. The test tests/the-merge-tool-joins-list-files-round-22.test.ts joins them.
The refusal-codes excerpts differ from those commits in one way: three record ids are taken out of their comments.

- `refusal-codes-13n.*.txt`: src/shared/refusal-codes.ts from wave 13n's merge entry Oe7JZFCHpJly, which bounced on a
  conflict. The ancestor is from commit b95de295, main from 4c2d37e354f9 and the entry from a5bef51adf11. The cut starts
  one line before `  planWrittenOutsideItsDoors: {},`.
- `notices-13j.*.txt`: src/server/lib/notices.ts from wave 13j's merge entry zTUTOBuAPziR, at the commit f3723027ef47 where
  the replay onto main 9ccc2a22000d stopped. The three sides are the stages git wrote for that stop. The cut starts at
  `  aNotebookHasNotChanged:`.
