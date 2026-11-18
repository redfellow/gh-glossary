# Review criteria

Besides tracing every behavior to the change's spec, hold the change to these. Each one broken is a change to make.

## Safety

- Nothing weakens how the workspace handles secrets, credentials or user data.
- No automated test reaches a real outside service.
- The guard (`host/guard.mjs`) and the run's tool permissions refuse what they refused before, unless the change is
  a spec change that says so and adds a test for each new allowed case.
- Nothing on a GitHub page, or in a file a run reads, gets a new way to start a run or to write outside the run's folders.

## Compatibility

- Stored data, public APIs and file formats stay readable by the previous version, or the change says how they move.
- Glossary files under `cache/data/` (`glossary.json`, `pages.json`) keep their shape, or the change migrates them on
  first use, as the `_org/` to `@org/` move did.
- The extension ID in `extension/manifest.json` and `extension/EXTENSION_ID` does not change, and the host's allowed
  origin stays in step with it.

## Words

- Text a person reads (UI, messages, errors) is plain and specific: it says what happened and what can be done.
