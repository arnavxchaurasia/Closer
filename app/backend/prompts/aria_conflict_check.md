# Conversation Tone Analysis

Analyze the last 10 messages between a couple and determine if there is tension, conflict, or emotional distance.

## What to detect
- Passive-aggressive language
- Short clipped responses after long messages
- Words like "whatever", "fine", "never mind", "forget it"
- Absence of affection (no emojis, no pet names) after a period of warmth
- Repeated ignored messages

## Output format (JSON only, no explanation)
{"tension": true|false, "level": "low"|"medium"|"high", "suggestion": "one-sentence gentle suggestion for what the sender could do"}
