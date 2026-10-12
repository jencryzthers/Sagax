#!/usr/bin/env python3
"""Fail when a PR title, branch name, changed path, or added diff line contains
a forbidden term. Terms come from the FORBIDDEN_TERMS environment variable
(newline-separated, read from an Actions secret) and are matched
case-insensitively. A hit prints only where it was found (title, branch,
file:line), never the term itself. No terms configured means failure (fail closed).

Usage: term-guard.py DIFF_FILE   (PR_TITLE and PR_BRANCH come from the environment)
"""
import os
import re
import sys


def load_terms():
    raw = os.environ.get("FORBIDDEN_TERMS", "")
    terms = [t.strip().lower() for t in raw.splitlines() if t.strip() and not t.strip().startswith("#")]
    return sorted(set(terms), key=len, reverse=True)


def hit(text, terms):
    low = text.lower()
    return any(t in low for t in terms)


def scan_diff(lines, terms):
    found = []
    path, new_line, index = None, 0, 0
    for raw in lines:
        line = raw.rstrip("\n")
        if line.startswith("diff --git "):
            index += 1
            path, new_line = None, 0
            if hit(line, terms):
                found.append(f"file #{index} path")
            continue
        if line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else line[4:]
            if hit(path, terms):
                path = f"file #{index}"
            continue
        if line.startswith("--- "):
            continue
        if line.startswith("rename ") or line.startswith("copy "):
            if hit(line, terms):
                found.append(f"file #{index} rename/copy path")
            continue
        m = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
        if m:
            new_line = int(m.group(1))
            continue
        if line.startswith("+"):
            if hit(line[1:], terms):
                found.append(f"{path or '?'}:{new_line}")
            new_line += 1
        elif line.startswith(" "):
            new_line += 1
    return found


def main(argv):
    terms = load_terms()
    if not terms:
        print("::error::FORBIDDEN_TERMS is empty or unavailable; failing closed.")
        return 2
    found = []
    if hit(os.environ.get("PR_TITLE", ""), terms):
        found.append("title")
    if hit(os.environ.get("PR_BRANCH", ""), terms):
        found.append("branch")
    if len(argv) > 1:
        with open(argv[1], encoding="utf-8", errors="replace") as fh:
            found += scan_diff(fh, terms)
    if found:
        for where in found:
            print(f"::error::Forbidden term found in {where}")
        print(f"{len(found)} location(s) contain a forbidden term. The term is not shown; check the locations above.")
        return 1
    print(f"No forbidden terms in title, branch, or diff ({len(terms)} terms checked).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
