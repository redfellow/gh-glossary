#!/bin/sh
# Registers host/host.mjs as the native messaging host of the gh-glossary extension, so Chrome can
# start it (and only that extension can talk to it).
#
#   host/install.sh             write the launcher and the host manifest for Chrome (plus Chromium,
#                               Brave, Edge and Arc when they are installed)
#   host/install.sh uninstall   remove them
#   host/install.sh status      show where it is registered
#
# Chrome starts the host with a bare PATH, so the launcher (host/.launcher.sh, not committed) records
# where node, gh, git and claude live on this machine. Re-run after moving any of them.
set -eu

NAME=io.github.redfellow.gh_glossary
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LAUNCHER="$ROOT/host/.launcher.sh"
EXT_ID=$(tr -d ' \n' < "$ROOT/extension/EXTENSION_ID")

case "$(uname -s)" in
  Darwin) BASES="$HOME/Library/Application Support/Google/Chrome|$HOME/Library/Application Support/Chromium|$HOME/Library/Application Support/BraveSoftware/Brave-Browser|$HOME/Library/Application Support/Microsoft Edge|$HOME/Library/Application Support/Arc/User Data" ;;
  Linux) BASES="$HOME/.config/google-chrome|$HOME/.config/chromium|$HOME/.config/BraveSoftware/Brave-Browser|$HOME/.config/microsoft-edge" ;;
  *) echo "unsupported system: $(uname -s)" >&2; exit 1 ;;
esac
CHROME_BASE=${BASES%%|*}

need() { command -v "$1" >/dev/null 2>&1 || { echo "$1 not found on PATH" >&2; exit 1; }; }
each_base() { # calls $1 with each browser folder that exists (Chrome's is created)
  old_ifs=$IFS; IFS='|'
  for b in $BASES; do
    IFS=$old_ifs
    if [ "$b" = "$CHROME_BASE" ] || [ -d "$b" ]; then "$1" "$b"; fi
    IFS='|'
  done
  IFS=$old_ifs
}

write_manifest() {
  mkdir -p "$1/NativeMessagingHosts"
  cat > "$1/NativeMessagingHosts/$NAME.json" <<EOF
{
  "name": "$NAME",
  "description": "GitHub Glossary host: runs Claude to define terms on GitHub pages",
  "path": "$LAUNCHER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
  echo "registered for $1"
}
remove_manifest() { f="$1/NativeMessagingHosts/$NAME.json"; if [ -f "$f" ]; then rm "$f"; echo "removed $f"; fi; }
show_manifest() { f="$1/NativeMessagingHosts/$NAME.json"; if [ -f "$f" ]; then echo "registered: $f"; fi; }

case "${1:-install}" in
  install)
    for c in node gh git claude; do need "$c"; done
    case "$ROOT" in *"'"*) echo "the folder path must not contain a single quote" >&2; exit 1 ;; esac
    NODE=$(command -v node)
    TOOLPATH=$(for c in node gh git claude; do dirname "$(command -v "$c")"; done | awk '!seen[$0]++' | paste -sd: -)
    cat > "$LAUNCHER" <<EOF
#!/bin/sh
# Written by host/install.sh. Chrome starts this with a bare environment.
PATH='$TOOLPATH':/usr/bin:/bin:/usr/sbin:/sbin
export PATH
exec '$NODE' '$ROOT/host/host.mjs' "\$@"
EOF
    chmod 755 "$LAUNCHER"
    each_base write_manifest
    echo "extension id: $EXT_ID"
    echo "Load $ROOT/extension in chrome://extensions (Developer mode → Load unpacked), or reload it there."
    ;;
  uninstall) each_base remove_manifest; rm -f "$LAUNCHER" ;;
  status) each_base show_manifest; if [ -x "$LAUNCHER" ]; then echo "launcher: $LAUNCHER"; else echo "launcher missing: run host/install.sh"; fi ;;
  *) echo "usage: host/install.sh [install|uninstall|status]" >&2; exit 2 ;;
esac
