#!/usr/bin/env bash
# Updates the vendored skills in .agents/skills without losing our edits to them.
#
# `npx skills update` replaces a changed skill's files wholesale, so it never
# runs on our branches. The `skills-upstream` branch holds the skills exactly as
# upstream ships them: this script runs the update there, in a temporary
# worktree, commits it, and merges that branch into the current one. Git's
# three-way merge then keeps our edits and stops on any real conflict.
#
# Usage: scripts/update-skills.sh [--no-push] [skill...]
#   skill...   update only these skills (default: all)
#   --no-push  leave skills-upstream unpushed (it is pushed by default, so
#              every clone merges from the same base)
set -euo pipefail

UPSTREAM=skills-upstream
SKILLS_CLI=skills@1.7.4
PUSH=1
if [[ "${1:-}" == "--no-push" ]]; then PUSH=0; shift; fi

cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The working tree is dirty; commit or stash first." >&2
  exit 1
fi

git fetch -q origin "$UPSTREAM" 2>/dev/null || true
if ! git rev-parse -q --verify "refs/heads/$UPSTREAM" >/dev/null; then
  if git rev-parse -q --verify "refs/remotes/origin/$UPSTREAM" >/dev/null; then
    git branch -q "$UPSTREAM" "origin/$UPSTREAM"
  else
    echo "No $UPSTREAM branch, locally or on origin." >&2
    exit 1
  fi
elif git rev-parse -q --verify "refs/remotes/origin/$UPSTREAM" >/dev/null; then
  git merge-base --is-ancestor "origin/$UPSTREAM" "$UPSTREAM" ||
    git branch -f "$UPSTREAM" "origin/$UPSTREAM"
fi

WORKTREE="$(mktemp -d)"
trap 'git worktree remove --force "$WORKTREE" 2>/dev/null || true' EXIT
git worktree add -q "$WORKTREE" "$UPSTREAM"

(
  cd "$WORKTREE"
  npx -y "$SKILLS_CLI" update -p -y "$@"
  stray="$(git status --porcelain -- . ':!.agents' ':!.claude' ':!skills-lock.json')"
  if [[ -n "$stray" ]]; then
    echo "The update touched files outside the skills:" >&2
    echo "$stray" >&2
    exit 1
  fi
  git add -A .agents .claude skills-lock.json
  if git diff --cached --quiet; then
    echo "Skills are already up to date."
    exit 0
  fi
  git commit -q -m "Update skills from upstream"
)

if ((PUSH)); then git push -q origin "$UPSTREAM"; fi

git merge --no-ff --no-edit "$UPSTREAM" -m "Merge upstream skill updates" || {
  echo >&2
  echo "Conflicts above are between upstream changes and our edits to those skills." >&2
  echo "Resolve them, then commit." >&2
  exit 1
}
