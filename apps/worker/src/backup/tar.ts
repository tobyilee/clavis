// Minimal POSIX tar (ustar + PAX) writer. Produces an uncompressed archive as Blob
// parts, so file contents are never copied into one large buffer.

const BLOCK = 512;
const enc = new TextEncoder();

export interface TarEntry {
  path: string;
  content: string | Uint8Array;
  mtime?: Date;
}

export function createTar(entries: Iterable<TarEntry>): Blob {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    const data = typeof entry.content === 'string' ? enc.encode(entry.content) : entry.content;
    const mtime = Math.floor((entry.mtime ?? new Date()).getTime() / 1000);
    const pathBytes = enc.encode(entry.path);
    // ustar name fields are 100 bytes of ASCII in practice; Korean titles need PAX.
    const needsPax = pathBytes.length > 100 || /[^\x20-\x7e]/.test(entry.path);
    if (needsPax) {
      const pax = paxRecord('path', entry.path);
      parts.push(
        header(`PaxHeader/${asciiFallback(entry.path)}`, pax.length, mtime, 'x'),
        pax,
        pad(pax.length),
      );
    }
    parts.push(header(needsPax ? asciiFallback(entry.path) : entry.path, data.length, mtime, '0'));
    parts.push(data, pad(data.length));
  }
  parts.push(new Uint8Array(BLOCK * 2)); // end-of-archive marker
  return new Blob(parts, { type: 'application/x-tar' });
}

/** "<len> <key>=<value>\n" where <len> counts the whole record, including itself. */
function paxRecord(key: string, value: string): Uint8Array {
  const body = ` ${key}=${value}\n`;
  const bodyLen = enc.encode(body).length;
  let len = bodyLen;
  // Adding the length's own digits can add a digit (e.g. 98 -> 100), so iterate to a fixed point.
  while (bodyLen + String(len).length !== len) len = bodyLen + String(len).length;
  return enc.encode(`${len}${body}`);
}

function asciiFallback(path: string): string {
  return path.replace(/[^\x20-\x7e]/g, '_').slice(-99);
}

function header(name: string, size: number, mtime: number, type: '0' | 'x'): Uint8Array {
  const h = new Uint8Array(BLOCK);
  writeStr(h, 0, 100, name);
  writeStr(h, 100, 8, '0000644');
  writeStr(h, 108, 8, '0000000');
  writeStr(h, 116, 8, '0000000');
  writeStr(h, 124, 12, size.toString(8).padStart(11, '0'));
  writeStr(h, 136, 12, mtime.toString(8).padStart(11, '0'));
  h.fill(0x20, 148, 156); // checksum is computed with this field as spaces
  writeStr(h, 156, 1, type);
  writeStr(h, 257, 6, 'ustar');
  writeStr(h, 263, 2, '00');
  let sum = 0;
  for (const b of h) sum += b;
  writeStr(h, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
  return h;
}

function writeStr(buf: Uint8Array, offset: number, length: number, s: string) {
  buf.set(enc.encode(s).subarray(0, length), offset);
}

function pad(size: number): Uint8Array {
  const rest = size % BLOCK;
  return new Uint8Array(rest === 0 ? 0 : BLOCK - rest);
}
