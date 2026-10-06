#!/usr/bin/env bash
# Assembles what the sector server's image is built from into deploy/server/context: the workspace's manifests and
# lockfile, every workspace project's package.json (so the lockfile installs as it is), and the sources and data of the
# server and the packages it runs on. Run from the repository's root; CI uploads the context to Railway.
set -euo pipefail
context=deploy/server/context
rm -rf "$context"
mkdir -p "$context"
cp package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc deploy/server/Dockerfile "$context"/
for manifest in apps/*/package.json packages/*/package.json; do
  mkdir -p "$context/$(dirname "$manifest")"
  cp "$manifest" "$context/$manifest"
done
# Each project the server runs on whole (its sources, data and sector files), but for anything installed or built.
for project in apps/server packages/map packages/net packages/sim; do
  for entry in "$project"/*; do
    case "$(basename "$entry")" in
      node_modules | dist | coverage) ;;
      *) cp -r "$entry" "$context/$project/" ;;
    esac
  done
done
# Tests aren't run in the image.
find "$context" -name "*.test.ts" -delete
