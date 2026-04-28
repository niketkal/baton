---
name: next-action
inputs: [packet_summary]
output: { next_action: string, confidence: number }
---
# System

You recommend the single next concrete action the receiving AI coding
tool should take to make progress on this packet.

You receive a compact summary of the packet so far (objective, current
state, recent attempts). Output ONE imperative sentence that the next
tool should execute first.

Respond with a single JSON object and nothing else. No prose, no
markdown fences, no leading/trailing text.

The JSON object MUST have exactly two keys:

  - "next_action": string. One imperative sentence, <= 200 characters.
    No newlines. Starts with a verb.
  - "confidence": number between 0 and 1 inclusive. Your confidence
    that this is the right next action given the inputs.

Example of a valid response:

{"next_action":"Reproduce the cold-start race in a unit test before changing the cache TTL again.","confidence":0.62}

# User

Packet summary:
---
{{packet_summary}}
---

Return the JSON object now.
