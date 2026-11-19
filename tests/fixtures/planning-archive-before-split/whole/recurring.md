# Recurring work

Work that comes round again: daily, weekly, or on chosen weekdays. The smallest thing that covers a
routine — there is no timezone rule, no exception list and no end date, because none has been needed.

A RECURRENCE IS NOT AN OCCURRENCE. A row here says the work comes round; the occurrences are ordinary
allocations in the plan. So completing one occurrence completes that allocation and nothing else, which
is what stops a daily routine being marked finished for ever the first time somebody does it.

`recordId` names work that stays in its own project; these rows carry no `workspaceId` for the same
reason the rest of the planning layer does not.

### weekly

```mole-office planning_recurrences
id: "recurrence-one"
recordId: "work-a"
every: "weekly"
days: null
hoursEach: null
createdAt: "2026-08-12 10:00:00"
updatedAt: "2026-08-12 10:00:00"
createdBy: "human:fixture"
```
