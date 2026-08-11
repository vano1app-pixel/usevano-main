# Ayush's Agents

Five specialist subagents for how this project actually gets shipped. They are
Claude Code **agents**, not skills: each runs in its own context window, does
the legwork (drives a browser, reads logs, runs the maths tests) and returns
only the verdict.

They complement the personal **skills** (`ayush-work-style`,
`ayush-design-taste`, `ayush-ship-playbook`, `vano-brand`, `vano-outreach`,
`vano-content`) — skills are the knowledge, these are the workers that use it.

| Agent | What it does | Reach for it when |
|---|---|---|
| `flow-guard` | Drives the flows-that-must-never-break end-to-end in a real browser, intercepting every write so no real booking or signup is created. | Before merging anything touching the quick-book sheet, checkout, `/join`, `/verify-helper`, the job screen, `/student-account`, `/bookings` or `/track`. |
| `money-check` | Audits the lock-stepped price tables and the money invariants — wage floor, suitable money, monotonic ticks, server-authoritative pricing. | Any change to prices, fees, the job builder, sizing, extra time, kit, travel or checkout. |
| `ship-doctor` | Read-only diagnosis across Vercel, Supabase, Railway, Twilio and DNS. Says "broken" or "expected" first, then one next step. | A deploy 404s, a service crash-loops, logs look red, notifications vanish. |
| `design-critic` | Screenshots the real render at phone and desktop widths, then judges it against the repo's design language and Ayush's taste. | After any UI change, or on "looks boring" / "looks AI" / "too much". |
| `growth-scout` | Writes outreach and marketing in the right voice, fact-checked against the code — including whether the site is currently in waitlist mode. | Cold DMs, emails, ads, reels, flyers, student recruitment. |

Three of them are deliberately constrained: `ship-doctor` cannot mutate
infrastructure, and `design-critic` / `growth-scout` cannot edit app source.
They report; you decide.

## Install

From the directory containing this repo:

```
/plugin marketplace add ./usevano-main
/plugin install ayush-agents@ayush
```

Then `/reload-plugins` if the install summary asks for it.

## Use

Claude delegates automatically when a task matches an agent's description, or
you can call one explicitly:

```
Use flow-guard to verify the booking sheet before I push
@ayush-agents:money-check does the new supplies add-on still pay the student properly?
```

## Editing

Agents are plain markdown with YAML frontmatter in `agents/`. Edit one, bump
`version` in `.claude-plugin/plugin.json`, and reload. Keep the descriptions
specific — they are what decides whether Claude delegates to the right agent.
