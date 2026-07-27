# Project Template

This folder is a copy-paste skeleton for bootstrapping a new project into the Claude memory system. See `OneDrive/Claude Memory/CONVENTIONS.md` §13 for the bootstrapping procedure.

## How to use

1. Copy `CLAUDE.md` from this folder to the root of your project (next to the code, NOT inside `.claude/`)
2. Copy `.claude/` from this folder into the root of your project
3. Replace `<PROJECT NAME>` and `<REPLACE: ...>` placeholders in each file
4. Update `OneDrive/Claude Memory/projects/REGISTRY.md` with a new entry for your project
5. Start tagging session checkpoints with your project slug

## What's in this template

At project root:
| File       | Purpose                                                                 |
|------------|-------------------------------------------------------------------------|
| CLAUDE.md  | Auto-loaded by Claude Code; points at `.claude/ROUTING.md`              |

Inside `.claude/`:
| File           | Mode        | Purpose                                                    |
|----------------|-------------|------------------------------------------------------------|
| ROUTING.md     | rare edit   | Inputs table — what files to load for what task types      |
| SNAPSHOT.md    | overwrite   | Current snapshot — where are we right now                  |
| VISION.md      | stable      | What this project is and why it exists                     |
| ROADMAP.md     | stable-ish  | Phased plan for future work                                |
| DECISIONS.md   | append-only | Permanent decision log with reasoning                      |
| INDEX.md       | append-only | Bookmark list back to central session summaries            |

See the live example at `C:\Users\Arath\OneDrive\Desktop\demo-weather-station\` for a fully populated version with realistic fake data.
