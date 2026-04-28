# Synthetic AI coding session — partial context handoff

<!-- Hand-written synthetic transcript for the Baton conformance
suite. Not derived from any real user or AI tool conversation. -->

## User

<!-- ts: 2026-04-26T15:00:00Z -->
I've got an intermittent 502 from the staging deploy of the billing
service. Picking this up from the previous session — see notes in
`docs/runbook-billing.md`.

## Assistant

<!-- ts: 2026-04-26T15:00:20Z -->
The runbook reference is a good lead but I don't have access to that
file in this session. Could you paste the relevant section, or share
a snippet from the previous session's transcript? I'll proceed with
what I have.

## User

Can't right now — laptop's about to die. Just do what you can.

## Assistant

<!-- ts: 2026-04-26T15:01:00Z -->
Acknowledged. I'll capture the current state and open questions so
the next session can pick up cleanly.

Current state: 502 errors observed on the staging deploy of the
billing service. No reproduction steps yet, no log excerpts attached,
and the referenced runbook is not in this session's context.

Open questions:
- Which endpoint is returning 502? (suspect upstream timeouts)
- Were there recent deploys to billing or its dependencies?
- What's in docs/runbook-billing.md "Known 502s" section?

Next action: re-engage with the runbook attached, plus the last
~30 minutes of staging logs from the load balancer.
