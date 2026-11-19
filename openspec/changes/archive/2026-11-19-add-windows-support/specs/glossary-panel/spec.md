# Spec Delta

## MODIFIED Requirements

### Requirement: Host not reachable
When the host cannot be reached, the panel SHALL say so, name the install script to run, and offer
no page data. When the extension was reloaded under an open page, it tells the reader to reload the
page.

#### Scenario: Host not installed
- **WHEN** the host is not registered
- **THEN** the panel says the host is not reachable and to run `host/install.sh`, or
  `host\install.cmd` on Windows
