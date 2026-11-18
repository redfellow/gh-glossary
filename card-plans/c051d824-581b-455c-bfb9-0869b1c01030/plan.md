# Declare the Node version in package.json

## Why
The test script's quoted globs need Node 21+ and CI runs Node 22, but package.json does not say so.

## What Changes
- Add `"engines": { "node": ">=22" }` to `package.json`. No dependencies, lockfile or script changes.

## Acceptance
- `package.json` `engines.node` is `>=22`; `npm test` still passes.

## Citations
- `package.json` (scripts.test uses `node --test "…/*.test.mjs"` globs)

## Assumptions
- No `engine-strict` in `.npmrc`: npm only warns, as the card asks (ruled out: refusing installs).
