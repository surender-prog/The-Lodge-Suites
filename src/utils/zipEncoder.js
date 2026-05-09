// zipEncoder.js — minimal STORE-method (uncompressed) ZIP encoder for the
// browser. Used by the membership .pkpass generator and the press kit
// downloads. Zero external deps.
//
// Format reference: https://en.wikipedia.org/wiki/ZIP_(file_format)
//
// Why STORE-only? Real DEFLATE would need a compression library (or pako).
// For mocked-pipeline assets that ship as text/SVG/JSON files plus a few
// image binaries, "store" produces a ZIP that opens cleanly in every OS
// and stays small enough to download without a backend.

// ---------------------------------------------------------------------------
// CRC-32 — used by every ZIP file header
// ---------------------------------------------------------------------------
let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[i] = c;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---------------------------------------------------------------------------
// SHA-1 (Web Crypto API). Used by the .pkpass manifest; exported here so
// callers don't have to re-import crypto everywhere.
// ---------------------------------------------------------------------------
export async function sha1Hex(bytes) {
  const buf = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// encodeZip — accepts an array of `{ name, data }` where `data` is a
// Uint8Array, returns a Blob with the right MIME type. Pass `mime` to
// override the default `application/zip` (e.g. for `.pkpass`).
// ---------------------------------------------------------------------------
export function encodeZip(files, { mime = "application/zip" } = {}) {
  const enc = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const data = file.data;
    const crc = crc32(data);
    const size = data.length;

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length + size);
    const dvL = new DataView(local.buffer);
    dvL.setUint32(0,  0x04034b50, true);   // signature
    dvL.setUint16(4,  20,         true);   // version needed
    dvL.setUint16(6,  0,          true);   // general flag
    dvL.setUint16(8,  0,          true);   // compression: STORED
    dvL.setUint16(10, 0,          true);   // mod time
    dvL.setUint16(12, 0,          true);   // mod date
    dvL.setUint32(14, crc,        true);
    dvL.setUint32(18, size,       true);   // compressed
    dvL.setUint32(22, size,       true);   // uncompressed
    dvL.setUint16(26, nameBytes.length, true);
    dvL.setUint16(28, 0,          true);   // extra
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localChunks.push(local);

    // Central directory entry
    const central = new Uint8Array(46 + nameBytes.length);
    const dvC = new DataView(central.buffer);
    dvC.setUint32(0,  0x02014b50, true);
    dvC.setUint16(4,  20,         true);
    dvC.setUint16(6,  20,         true);
    dvC.setUint16(8,  0,          true);
    dvC.setUint16(10, 0,          true);
    dvC.setUint16(12, 0,          true);
    dvC.setUint16(14, 0,          true);
    dvC.setUint32(16, crc,        true);
    dvC.setUint32(20, size,       true);
    dvC.setUint32(24, size,       true);
    dvC.setUint16(28, nameBytes.length, true);
    dvC.setUint16(30, 0,          true);
    dvC.setUint16(32, 0,          true);
    dvC.setUint16(34, 0,          true);
    dvC.setUint16(36, 0,          true);
    dvC.setUint32(38, 0,          true);
    dvC.setUint32(42, offset,     true);
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  centralChunks.forEach((c) => { centralSize += c.length; });

  // End-of-central-directory
  const end = new Uint8Array(22);
  const dvE = new DataView(end.buffer);
  dvE.setUint32(0,  0x06054b50, true);
  dvE.setUint16(4,  0,          true);
  dvE.setUint16(6,  0,          true);
  dvE.setUint16(8,  files.length, true);
  dvE.setUint16(10, files.length, true);
  dvE.setUint32(12, centralSize, true);
  dvE.setUint32(16, centralStart, true);
  dvE.setUint16(20, 0,          true);

  return new Blob([...localChunks, ...centralChunks, end], { type: mime });
}

// Convenience: trigger a Blob download with the given filename.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
