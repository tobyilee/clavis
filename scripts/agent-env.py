#!/usr/bin/env python3
"""Emits `export KEY=...` lines for .agent.env, tolerating spaces, quotes and header-name prefixes.

Usage (never prints the values to the terminal):
    eval "$(python3 scripts/agent-env.py)"

Sourcing .agent.env directly is unsafe: a line like `KEY= value` makes the shell run `value`
as a command and print it in the error message.
"""
import pathlib
import re
import shlex
import sys

path = pathlib.Path(__file__).resolve().parent.parent / ".agent.env"
if not path.exists():
    sys.exit(f"missing {path}")
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = (part.strip() for part in line.split("=", 1))
    if not re.fullmatch(r"[A-Z_][A-Z0-9_]*", key):
        continue
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    # Cloudflare shows service tokens as header lines; accept "CF-Access-Client-Id: <value>" too.
    value = re.sub(r"^[A-Za-z][A-Za-z0-9-]*:\s*", "", value)
    print(f"export {key}={shlex.quote(value)}")
