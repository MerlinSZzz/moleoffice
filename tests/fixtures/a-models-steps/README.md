# One saved OpenCode output

`opencode-output.jsonl` is what `opencode run --format json` printed for one run, cut down to what
tests/a-check-records-the-models-steps.test.ts reads. Item 3p4 of wave 13n's round AK cut it.

The run was a worker in sandbox w13n, run B0bhNRQqpStD, on 17 October 2026 from 16:08 to 16:17 UTC. It was not a
check. A check runs the same command, `opencode run --format json`, and its tool prints what OpenCode printed on the
INSPECTION-MODEL-OUTPUT line, so the events are the same kind. No check's output was kept in this sandbox. The log
of the run does not say which version of OpenCode it was.

What was changed:

- The 16 `text` events were left out. They are what the model wrote, and the test does not read them.
- In each `tool_use` event, `output`, `metadata` and `title` were left out of `part.state`. They are what the tool
  printed, and the test does not read them.
- The home folder at the start of each path is written as `~`, as the office's masking writes it, so the copy names
  nobody's home.
- Where the report text the run sent named the live office's port by its number, it says "the live office's server"
  instead. The test does not read that text either.

Nothing else was changed. Every event that is left is in the order OpenCode printed it: 76 `step_start`, 92 `tool_use`
and 76 `step_finish`. Of the 92 tool steps, one ended with the status `error` (a `grep`), and 14 started before the step
printed just before them had ended.
