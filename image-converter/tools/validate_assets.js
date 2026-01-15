const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "../../assets/dist");
const indexFile = path.join(distDir, "pws.index");
const assetsFile = path.join(distDir, "pws.assets");

if (!fs.existsSync(indexFile) || !fs.existsSync(assetsFile)) {
  console.error("Missing pws.index or pws.assets under", distDir);
  process.exit(1);
}

const indexBuf = fs.readFileSync(indexFile);
const assetsBuf = fs.readFileSync(assetsFile);

const entryCount = Math.floor(indexBuf.length / 8);
console.log("Index entries:", entryCount);

function readLEU32(buf, off) {
  return buf.readUInt32LE(off);
}

for (let id = 0; id < Math.min(50, Math.floor(entryCount / 2)); id++) {
  for (let f = 0; f < 2; f++) {
    const entry = id * 2 + f;
    const off = entry * 8;
    const offset = readLEU32(indexBuf, off);
    const length = readLEU32(indexBuf, off + 4);
    if (length === 0) continue;
    if (offset + length > assetsBuf.length) {
      console.log(
        `ID ${id} frame ${f}: INVALID offset/length -> offset ${offset} + length ${length} > assets size ${assetsBuf.length}`
      );
      continue;
    }
    const header0 = assetsBuf[offset];
    const header1 = assetsBuf[offset + 1];
    const header2 = assetsBuf[offset + 2];
    const sample = assetsBuf
      .slice(offset, Math.min(offset + 32, offset + length))
      .toString("hex");
    // count non-zero bytes in payload (excluding 3-byte header)
    let nonzero = 0;
    for (let i = offset + 3; i < offset + length; i++)
      if (assetsBuf[i] !== 0) nonzero++;
    console.log(
      `ID ${id} f${f}: off=${offset} len=${length} hdr=[${header0},${header1},${header2}] nonzero_payload=${nonzero} sample=${sample}`
    );
  }
}

console.log("\nQuick summary of distinct headers in asset pack:");
const headers = new Map();
for (let off = 0; off + 3 <= assetsBuf.length; ) {
  const h0 = assetsBuf[off];
  const h1 = assetsBuf[off + 1];
  const h2 = assetsBuf[off + 2];
  const key = `${h0}-${h1}-${h2}`;
  headers.set(key, (headers.get(key) || 0) + 1);
  // Heuristic: if header matches 64,64,4 then jump by 3+2048, else try to find next reasonable header
  if (h0 === 64 && h1 === 64 && h2 === 4) off += 3 + 2048;
  else off += 1;
}
for (const [k, v] of headers) console.log(k, "count=", v);

console.log("\nDone.");
