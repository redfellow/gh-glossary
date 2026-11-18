# Tasks

## 1. Host and guard

- [x] 1.1 Remove the Bash rules from `--allowedTools` and have the guard print `allow` for each command it checked; verify with a test and headless runs with the guard on and hooks off
- [x] 1.2 Refuse network and device paths before touching the file system and resolve only paths lexically under a root; verify that no outside path reaches `realpath`
- [x] 1.3 Refuse `..` anywhere in a Glob pattern and check its leading folder through symlinks; verify with tests
- [x] 1.4 Run git with an empty global config, no system config and no git program variables; verify that a reader's text converter does not run

## 2. Store

- [x] 2.1 Count `?` and alternative groups per top-level alternative and time each pattern on probe texts; verify the 22-part chain is refused and none of the 908 stored patterns is
- [x] 2.2 Cap a run at 200 terms and 200 corrections and cap field lengths; verify with tests

## 3. Extension

- [x] 3.1 Show a link's whole address and drop paths over 120 characters; verify with tests
- [x] 3.2 Allow content-script reads only for the repository of the sender's tab; verify with tests
