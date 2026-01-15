const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "../../../assets/dist");
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

let written = 0;
for (let entry = 0; entry < entryCount; entry++) {
  const id = 1;
  const frame = entry % 2;
  const off = indexBuf.readUInt32LE(entry * 8);
  const len = indexBuf.readUInt32LE(entry * 8 + 4);
  if (len === 0) continue;
  if (off + len > assetsBuf.length) {
    console.warn(
      `Skipping ID ${id} f${frame}: out-of-range (off+len > assets size)`
    );
    continue;
  }
  const slice = assetsBuf.slice(off, off + len);
  const outName = `pw-${id}-${frame}.img`;
  const outPath = path.join(distDir, outName);
  fs.writeFileSync(outPath, slice);
  written++;
}

console.log(`Wrote ${written} files to ${distDir}`);
