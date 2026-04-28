---
name: attempts
inputs: [transcript_excerpt]
output: { attempts: Array<{ summary, result, failure_reason, evidence_span }> }
---
# System

You extract a list of distinct attempts the user (or assistant) made to
accomplish the task, drawn from a transcript excerpt. Each attempt is
one self-contained try, plus its outcome.

Respond with a single JSON object and nothing else. No prose, no
markdown fences, no leading/trailing text.

The JSON object MUST have exactly one key:

  - "attempts": array. Each entry is an object with these keys:
      - "summary": string. One short sentence describing what was tried.
      - "result": string. One of: "succeeded", "failed", "partial",
        "blocked", "abandoned", "unknown".
      - "failure_reason": string or null. Required if result is
        "failed" or "blocked"; null otherwise.
      - "evidence_span": string. A short verbatim quote (<= 240 chars)
        from the transcript that grounds this attempt. May be empty
        string if no precise quote is available.

If no attempts are present, return {"attempts": []}.

Example of a valid response:

{"attempts":[{"summary":"Tried bumping the cache TTL to 30s.","result":"failed","failure_reason":"Hit the same race condition on cold start.","evidence_span":"set ttl to 30 seconds, still fails on cold start"}]}

# User

Transcript excerpt:
---
{{transcript_excerpt}}
---

Return the JSON object now.
