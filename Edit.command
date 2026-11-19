#!/bin/sh
cd "$(dirname "$0")" || exit 1
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)' >/dev/null 2>&1; then
  echo "The editor needs Node.js 20 or later, which is not installed on this computer."
  echo "Install it from https://nodejs.org, then open this file again."
  printf "Press Return to close this window. "
  read -r _
  exit 1
fi
node theme/edit.mjs "$@" || {
  printf "The edit command stopped with an error. Press Return to close this window. "
  read -r _
}
