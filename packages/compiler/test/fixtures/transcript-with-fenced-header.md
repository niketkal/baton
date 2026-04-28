# Session export with embedded markdown

## User

Here's an example of a transcript that someone pasted into the chat:

```markdown
## Assistant

This is a literal example inside a fenced code block. It should NOT be
treated as a separate role header by the transcript parser.

## User

Same here — a literal user header inside fences is just content.
```

What do you think?

## Assistant

Right — those headers are inside a fenced block, so they're content,
not transcript structure. The parser should track fence depth.
