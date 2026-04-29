# Synthetic AI coding session — accidental key paste

<!-- Hand-written synthetic transcript for the Baton conformance
suite. The "secret" tokens below are FAKE values made up for the
test fixture; they are not valid credentials and have never been
provisioned. -->

## User

<!-- ts: 2026-04-26T17:00:00Z -->
I'm hitting a 401 on the test harness when calling the upstream API.
Here's the env block I'm using locally — can you spot what's wrong?

```
API_BASE=https://api.example.invalid
API_KEY=sk-test-1234567890abcdefghijklmnopqrstuvwxyz0123456789ABCD
TIMEOUT_MS=30000
```

## Assistant

<!-- ts: 2026-04-26T17:00:30Z -->
Stop — please rotate that key immediately. You pasted what looks
like a live secret into this transcript. Treat the value above as
compromised:
1. Revoke it in the upstream provider's dashboard.
2. Issue a new one and store it via your secret manager, not in a
   local `.env` checked into shell history.
3. Audit recent calls signed with the old key.

I will not echo the value back. After rotation, share only the
sanitized `API_BASE` and `TIMEOUT_MS`, plus the redacted shape of
the new key (e.g. last four characters), and we can resume the 401
investigation.

## User

Rotated. New key in the secrets manager. What's the next step on
the 401?

## Assistant

<!-- ts: 2026-04-26T17:02:00Z -->
Good. The most common 401 cause when the key is fresh is clock skew
on the test host — signature-based auth schemes reject requests
whose `Date` header is more than ~5 minutes off. Check
`timedatectl status` (or `systemsetup -getusingnetworktime` on
macOS) before making more requests.

Acceptance criteria:
- The leaked test key is revoked at the provider
- New key is loaded from the secrets manager, not from a checked-in
  file
- Test harness returns 200 against the staging endpoint
