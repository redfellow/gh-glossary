<img src="assets/logo.svg" width="64" alt="gh-glossary logo">

# gh-glossary

A Chrome extension that underlines the terms on GitHub pages and explains them. Hover a dotted term
for its definition, click to pin it, then click terms inside the box to follow them. Definitions are
written by Claude (the `claude` CLI on your machine, with your login) from the page, the repo's docs
and its code, and are stored locally.

| Page | What gets underlined |
|---|---|
| Repo home (README), rendered `.md` files | prose concepts and code names |
| Source files | code names and operators; comments are left plain |
| Issues and discussions | body and comments |
| Pull requests: Conversation | description and comments |
| Pull requests: Files changed | code names in the diff (prose too in `.md` files) |

On every PR page the tab title starts with `#<number>`, so the number survives narrow tabs.

## The panel

It starts as a small **gh-glossary** tab on the right edge of every repository page. Hover it and the
panel pops out; click it and the panel stays open.

- **Definitions** switch, with the number of known terms.
- **Define this page: Quick | Thorough** adds the terms on the page that qualify under
  [SPEC.md](SPEC.md) and are not defined yet (at most 60 per run; the panel says when the cap was hit,
  and clicking again continues).
  - **Quick** (Sonnet, medium; usually under a minute) defines from the page and the repo's docs.
  - **Thorough** (Opus, high; about 5 minutes) also checks every new term at its source, links related
    terms, and corrects existing definitions on the page that are wrong or too broad.
- **Regenerate**: tick it, then Quick or Thorough. Drops the terms first defined from this page and
  defines them again.
- **Select text to define it.** Select a word or phrase anywhere on the page (code view included). A
  **Define “…”** button appears and defines just that, in about 10 seconds. If it is already in the
  glossary, the button says **Show “…”** and opens it without a run.
- **Send to Claude** (pull requests and Markdown documents) opens a new Claude Code session in the
  Claude desktop app with the PR or document in the composer, ready to read with `gh`. You press Enter.
  The text and the folder per repo are set in the extension's options.
- **Docked** switch, or drag the panel until the pointer touches a screen edge, to fold it back into the
  tab. The tab shows the number of terms and a dot: blue pulsing while a run is going, red after an
  error. Drag the tab along the edge to move it.

### Which repos Claude runs on

Nothing is sent to Claude until you say so. The first Quick, Thorough or Define on a repo asks
**Allow &lt;repo&gt;** or **Allow all of &lt;owner&gt;**. Your answer is stored in `config.json` and listed
in the extension's options, where you can remove it. Stored glossaries stay readable either way.

## How it fits together

```
GitHub page ── content script ──▶ service worker ══ native messaging (stdio) ══▶ host/host.mjs ──▶ claude -p
     ▲                                                                              │
     └──────────────────────────── glossaries ◀──────────────────────── cache/data/ ┘
```

| Part | File | Job |
|---|---|---|
| Content script | `extension/content.js` | Panel, underlines, popover. Uses CSS Custom Highlights, so it does not rewrite GitHub's DOM. |
| Service worker | `extension/background.js` | Holds the one connection to the host and decides which requests each sender may make. Builds the Send to Claude link (`extension/link.js`). |
| Options | `extension/options.html` | Host status, allowlist, Send to Claude templates and folders. |
| Host | `host/host.mjs` | Checks out the right commit, gathers the page, runs Claude, stores results. Node + `gh`, no dependencies. |
| Guard | `host/guard.mjs` | A hook on every tool call Claude makes during a run (see Safety). |
| Spec | `SPEC.md` | What gets defined and how. Sent ahead of every run. |
| Skills | `.claude/skills/gh-glossary-{quick,thorough,select}/SKILL.md` | The steps of each operation. |
| Output contracts | `schema/{quick,thorough,select}.schema.json` | Structured output each run must return. |

## Setup

1. **Prerequisites:** macOS or Linux, Chrome (or Brave, Edge, Chromium, Arc), Node 22 or newer, `gh`
   logged in (`gh auth status`), and the `claude` CLI logged in. For **Send to Claude**: the Claude
   desktop app.
2. **Register the host** (tells Chrome how to start it, and that only this extension may):
   ```bash
   ~/Work/tools/gh-glossary/host/install.sh
   ```
   `host/install.sh status` shows where it is registered and `uninstall` removes it. Re-run `install`
   after moving node, gh, git or claude.
3. **Load the extension:** `chrome://extensions` → **Developer mode** on → **Load unpacked** → pick the
   `extension` folder. Its ID is always `gmaheanekhfokcgeijckohbejbddipli` (fixed by the `key` in
   `manifest.json`), which is what the host registration allows.
4. Open a repository page, open the gh-glossary tab and click **Quick**.

After a `git pull`, click the reload icon on the extension in `chrome://extensions`; the host is
restarted with it.

## Configuration

`config.json` in this folder (not committed; created when you first allow a repo):

| Key | Default | Meaning |
|---|---|---|
| `allow` | `{ "owners": [], "repos": [] }` | Where Claude may run. Filled in by the allow prompt. |
| `modes.quick` | `sonnet` / `medium` | Model and effort for Quick. |
| `modes.thorough` | `opus` / `high` | Model and effort for Thorough. |
| `modes.select` | `sonnet` / `medium` | Model and effort for defining a selection. |
| `maxMinutes` | `30` | A run is stopped after this. |
| `maxBudgetUsd` | unset | Optional spend cap per run (API billing). |

The host reads `config.json` when it starts: reload the extension after editing it.

## What gets defined: SPEC.md

[SPEC.md](SPEC.md) is the rulebook: the six categories (`reference`, `domain`, `code`, `external`,
`library`, `acronym`) and when a term qualifies for each, what is never defined, the order used when
the cap is hit, layer and pattern rules, the definition format, and what each operation does. To
change what gets defined, change SPEC.md and bump its version.

## Glossaries

Two layers, both under `cache/data/` (not committed):

- **Repo**: what a term means in that repository. `cache/data/<owner>/<repo>/glossary.json`
- **Owner**: terms that mean the same across all repos of the organization or user.
  `cache/data/<owner>/_org/glossary.json`. Claude decides the layer; if both exist, the repo's meaning
  wins.

Each definition shows its category and layer, whether it was checked at its source, the page and
commit it came from, the model, and any later correction. To start a repo over, delete its folder
under `cache/data/<owner>/`.

## Safety

A GitHub page is text from the internet, so every run is treated as possibly prompt-injected.

- **No port, no token.** Chrome starts the host over native messaging, and the host registration
  allows only this extension's ID. The service worker accepts host requests only from the extension's
  own content script on `https://github.com/*` and from its options page, each limited to the requests
  it needs.
- **You choose the repos.** Runs start only for allowlisted repos or owners. Only a real click on the
  allow prompt adds to the list; a click faked by a page script is ignored.
- **Read-only, inside the checkout.** Claude runs with `--permission-mode dontAsk` and read-only tools
  (`Read`, `Grep`, `Glob`, `git log/show/diff/grep/blame/status/ls-files`, `gh pr view/diff/checks`,
  `gh issue view`). The guard hook (`host/guard.mjs`) also checks every call: files only inside the
  run's checkout and run folder (symlinks resolved), one plain command at a time (no pipes, `;`, `$()`,
  redirects or globs), no git options that write files, read outside the repository or start a program
  (`--output`, `--no-index`, `--contents`, `-O`, `--ext-diff` and the like, abbreviations included),
  and `gh` only on the page's own repository and never `--web`.
- Only your user settings are loaded, so hooks or settings committed in the repo do not run. MCP
  servers and Chrome are off for the run. Web tools, Write and Edit are off.
- The extension escapes everything Claude wrote before showing it, and only offers `https` links.
- One Claude run at a time; others queue.

## Tests

```bash
npm test
```

No dependencies. After editing `assets/logo.svg`, run `npm run icons` to regenerate the extension
icons.

## Files under `cache/` (not committed)

```
cache/data/<owner>/_org/glossary.json      owner layer
cache/data/<owner>/<repo>/glossary.json    repo layer
cache/data/<owner>/<repo>/pages.json       last run per page (when, model, terms added, cap hit)
cache/repos/<owner>/<repo>/                checkout used during runs
cache/runs/                                inputs handed to the last run of each page
cache/logs/                                host.log, plus one log and raw result per run
```

## Limits

- GitHub changes its page structure from time to time. The extension relies on `.markdown-body` for
  rendered Markdown and comments, `id="diff-…"` containers with `td.diff-text-cell` lines on Files
  changed, and `.react-file-line` lines on source pages. If underlines stop appearing, check these first.
- Directory READMEs (`/tree/<branch>/<dir>`) are not covered; the repo-root README is.
- A pattern that is too broad underlines unrelated words. Regenerate the page it came from (the
  definition box says which), or edit the glossary JSON by hand.
- Runs live in the host, which Chrome stops when it quits: a run going at that moment is lost.
