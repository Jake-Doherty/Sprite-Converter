const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

async function extract(id, frame) {
  const indexPath = path.join(__dirname, "../../../assets/dist/pws.index");
  const assetsPath = path.join(__dirname, "../../../assets/dist/pws.assets");

  if (!fs.existsSync(indexPath) || !fs.existsSync(assetsPath)) {
    console.error("Missing pws.index or pws.assets in assets/dist");
    process.exit(2);
  }

  const indexBuf = fs.readFileSync(indexPath);
  const entryPos = (id * 2 + frame) * 8;
  if (entryPos + 8 > indexBuf.length) {
    console.error("Index out of range for id/frame", id, frame);
    process.exit(2);
  }
  const off = indexBuf.readUInt32LE(entryPos);
  const len = indexBuf.readUInt32LE(entryPos + 4);
  console.log(`ID ${id} f${frame}: off=${off} len=${len}`);

  const assetsBuf = fs.readFileSync(assetsPath);
  if (off + len > assetsBuf.length) {
    console.error("Asset slice out of range: off+len > assets file size");
    process.exit(2);
  }

  const slice = assetsBuf.slice(off, off + len);
  const hdr = [slice[0], slice[1], slice[2]];
  console.log("header=", hdr);

  const packed = slice.slice(3);
  const expectedPixels = 64 * 64;
  if (packed.length < Math.ceil(expectedPixels / 2)) {
    console.warn("Packed buffer smaller than expected", packed.length);
  }

  const out = Buffer.alloc(expectedPixels * 4);
  for (let i = 0; i < expectedPixels; i++) {
    const b = packed[Math.floor(i / 2)];
    const nibble = i % 2 === 0 ? (b >> 4) & 0x0f : b & 0x0f;
    const pxOff = i * 4;
    if (nibble === 0) {
      out[pxOff] = 0;
      out[pxOff + 1] = 0;
      out[pxOff + 2] = 0;
      out[pxOff + 3] = 0;
    } else {
      const gray = Math.round((nibble / 15) * 255);
      out[pxOff] = gray;
      out[pxOff + 1] = gray;
      out[pxOff + 2] = gray;
      out[pxOff + 3] = 255;
    }
  }

  const outPath = path.join(__dirname, `frame_${id}_f${frame}.png`);
  await sharp(out, { raw: { width: 64, height: 64, channels: 4 } })
    .png()
    .toFile(outPath);
  console.log("Wrote", outPath);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.log("Usage: node extract_frame.js <id> <frame(0|1)>");
    process.exit(1);
  }
  const id = parseInt(argv[0], 10);
  const frame = parseInt(argv[1], 10);
  await extract(id, frame);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
