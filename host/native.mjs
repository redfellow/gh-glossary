// Chrome native messaging framing: each message is a 4-byte little-endian length followed by UTF-8 JSON.
// Chrome refuses host-to-extension messages over 1 MB, so larger replies are sent as numbered parts
// ({ id, part, parts, chunk }) that the extension joins back together.

export const MAX_OUT = 1024 * 1024;
const CHUNK = 512 * 1024; // characters per part: stays under MAX_OUT even if every character is 2 bytes

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
  return (data) => {
    buf = Buffer.concat([buf, data]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (len > maxIn) { onError(new Error(`message of ${len} bytes is over the limit`)); buf = Buffer.alloc(0); return; }
      if (buf.length < 4 + len) return;
      const body = buf.subarray(4, 4 + len);
      buf = buf.subarray(4 + len);
      let msg;
      try { msg = JSON.parse(body.toString('utf8')); } catch (e) { onError(e); continue; }
      onMessage(msg);
    }
  };
}
