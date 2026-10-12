# PR term guard

`.github/workflows/term-guard.yml` fails a pull request whose title, branch
name, changed paths or added lines contain a forbidden term. The list is not
in this repository; it is the `FORBIDDEN_TERMS` Actions secret
(newline-separated, `#` lines ignored, case-insensitive substring match).

- A hit prints only the location (`title`, `branch`, `path:line` or `file #N`),
  never the term; every term is also registered with `::add-mask::`.
- Missing or empty secret: the job fails (fail closed).
- Runs on `pull_request_target` so fork PRs are covered; it checks out only the
  base branch's `scripts/ci/term-guard.py` and reads the PR as data through the
  API. It never checks out or executes pull-request code.

Tests: `python3 scripts/ci/term-guard.test.py`.
