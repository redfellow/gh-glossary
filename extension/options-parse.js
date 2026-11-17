// "owner/repo = /path" lines <-> { "owner/repo": "/path" }. The path is absolute: /x on macOS and
// Linux, C:\x (or C:/x) or \\server\share on Windows.
export function parseFolders(text) {
  const out = {}, bad = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = /^([A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100})\s*=\s*((?:\/|[A-Za-z]:[\\/]|\\\\[^\\\/]).*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim(); else bad.push(line);
  }
  return { folders: out, bad };
}
