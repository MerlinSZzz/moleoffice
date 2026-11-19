# Counters

Every addition, firing and held-back firing of every counter in this archive, one block each. The counters
themselves are records and are in the records region with everything else; what is here is what they counted.

THE COUNT IS NOT STORED ANYWHERE. A counter's count and amount are added up from its rows since its last
firing, every time they are read, so these rows ARE the count. `what` is `addition`, `firing` or `held back`.
On an addition, `count` and `amount` are what it added and `because` is the caller's own sentence or the
words of the office event that added. On a firing they are what was reset, `which_trigger` is the position of
the trigger that held, and `answer` is what the action said — the message ids, the task id, or what the job
runner reported. On a held-back row they are what the counter stood at when the firing was held back, which is
not what it stands at now, and `because` says why the limit held it.

`by` is who added, as `<kind>:<id>`, and it is empty on a row the office wrote itself. `event_kind`,
`event_id` and `event_at` name the office event that added, and are empty on an addition somebody made by
hand. `at` is when the row was written and `event_at` is when the event happened, which are different
moments: the counters read the office events once a minute. `at_instant` is the moment of `at` with its offset,
so the two 01:30s of the night the clocks go back are told apart; it is empty on a row written before migration 0299.

No counter has counted anything.
