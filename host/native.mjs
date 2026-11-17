// Chrome native messaging framing: each message is a 4-byte little-endian length followed by UTF-8 JSON.
// Chrome refuses host-to-extension messages over 1 MB, so larger replies are sent as numbered parts
// ({ id, part, parts, chunk }) that the extension joins back together.

export const MAX_OUT = 1024 * 1024;
// Characters (UTF-16 units) per part. One unit is at most 3 bytes in UTF-8 (CJK), and a part is the
// slice JSON-encoded again, which turns a quote or backslash into 2 bytes and leaves the rest as they
// are, so 3 bytes per unit plus the part's own fields stays under MAX_OUT. (A surrogate pair cut at a
// part boundary is escaped as \uXXXX, 6 bytes, at most twice per part: the 1 KB margin covers it.)
const CHUNK = Math.floor((MAX_OUT - 1024) / 3);

export function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

// One reply as one or more frames.
export function frames(reply) {
  const whole = frame(reply);
  if (whole.length <= MAX_OUT) return [whole];
  const text = JSON.stringify(reply);
  const parts = Math.ceil(text.length / CHUNK);
  const out = [];
  for (let i = 0; i < parts; i++) out.push(frame({ id: reply.id, part: i, parts, chunk: text.slice(i * CHUNK, (i + 1) * CHUNK) }));
  return out;
}

// Feeds bytes in, calls onMessage(obj) for each complete message. Messages over maxIn bytes end the stream.
export function reader(onMessage, { maxIn = 4 * 1024 * 1024, onError = () => {} } = {}) {
  let buf = Buffer.alloc(0);
  let skip = 0; // bytes still to drop of a message that was over the limit
  return (data) => {
    if (skip) { const n = Math.min(skip, data.length); skip -= n; data = data.subarray(n); if (!data.length) return; }
    buf = Buffer.concat([buf, data]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (len > maxIn) {
        onError(new Error(`message of ${len} bytes is over the limit`));
        const have = buf.length - 4;
        if (have >= len) { buf = buf.subarray(4 + len); continue; }
        skip = len - have; buf = Buffer.alloc(0); return;
      }
      if (buf.length < 4 + len) return;
      const body = buf.subarray(4, 4 + len);
      buf = buf.subarray(4 + len);
      let msg;
      try { msg = JSON.parse(body.toString('utf8')); } catch (e) { onError(e); continue; }
      onMessage(msg);
    }
  };
}
