# Issue tracker: GitHub

Issues for this repo live as GitHub issues on [Ibrahim-Ahidar/the-Ring](https://github.com/Ibrahim-Ahidar/the-Ring). Use the `gh` CLI for all operations.

Specs are not issues. Each feature spec lives in `.scratch/<feature>/spec.md`, and the parallel work map is `.scratch/README.md`. Implementation tickets are GitHub issues labelled `ready-for-agent`. Each one links to its spec.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Blocking

Blocking edges use GitHub's native issue dependencies. A ticket is unblocked when every issue it is blocked by is closed. Each ticket body also repeats the edges in a `Blocked by` section.

- Add an edge: `gh api --method POST repos/Ibrahim-Ahidar/the-Ring/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is `gh api repos/Ibrahim-Ahidar/the-Ring/issues/<n> --jq .id`.
- Frontier: open `ready-for-agent` issues with `issue_dependencies_summary.blocked_by == 0` and no assignee.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
