const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "../../../assets/dist");
const indexFile = path.join(distDir, "pws.index");
const assetsFile = path.join(distDir, "pws.assets");

if (!fs.existsSync(indexFile) || !fs.existsSync(assetsFile)) {
  console.error("Missing pws.index or pws.assets under", distDir);
  process.exit(1);
}

const args = process.argv.slice(2);
const parts = args[0] ? Math.max(1, parseInt(args[0], 10)) : 4;

const indexBuf = fs.readFileSync(indexFile);
const assetsBuf = fs.readFileSync(assetsFile);
const entryCount = Math.floor(indexBuf.length / 8);
const idCount = Math.floor(entryCount / 2);

console.log(
  "Entries:",
  entryCount,
  "IDs:",
  idCount,
  "Splitting into",
  parts,
  "parts"
);

const idsPerPart = Math.ceil(idCount / parts);

for (let p = 0; p < parts; p++) {
  const partIndexBuf = Buffer.alloc(indexBuf.length, 0);
  const partAssets = [];
  let currentOffset = 0;

  const startId = p * idsPerPart;
  const endId = Math.min(idCount - 1, (p + 1) * idsPerPart - 1);
  for (let entry = 0; entry < entryCount; entry++) {
    const id = Math.floor(entry / 2);
    const frame = entry % 2;
    const origOff = indexBuf.readUInt32LE(entry * 8);
    const origLen = indexBuf.readUInt32LE(entry * 8 + 4);
    if (origLen === 0) continue;
    if (id >= startId && id <= endId) {
      // copy the slice into this part
      const slice = assetsBuf.slice(origOff, origOff + origLen);
      partAssets.push(slice);
      partIndexBuf.writeUInt32LE(currentOffset, entry * 8);
      partIndexBuf.writeUInt32LE(origLen, entry * 8 + 4);
      currentOffset += slice.length;
    } else {
      // leave zeros for entries outside this part
    }
  }

  const partAssetsBuf = Buffer.concat(partAssets);
  const outAssets = path.join(distDir, `pws.part${p}.assets`);
  const outIndex = path.join(distDir, `pws.part${p}.index`);
  fs.writeFileSync(outAssets, partAssetsBuf);
  fs.writeFileSync(outIndex, partIndexBuf);
  console.log(
    `Wrote part ${p}: IDs ${startId}-${endId} -> ${outAssets} (${partAssetsBuf.length} bytes)`
  );
}

console.log("Done.");
