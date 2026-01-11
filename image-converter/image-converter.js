const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Your 16-color palette (RGB)
const paletteRGB = [
  [196, 207, 180],
  [184, 195, 169],
  [171, 183, 158],
  [161, 171, 147],
  [142, 153, 131],
  [126, 136, 117],
  [111, 120, 104],
  [96, 104, 90],
  [81, 89, 77],
  [68, 75, 65],
  [55, 61, 53],
  [43, 48, 42],
  [30, 33, 29],
  [21, 24, 20],
  [13, 15, 13],
  [5, 5, 5],
];

function getClosestIndex(pixelValue) {
  return Math.floor((255 - pixelValue) / 16);
}

async function convertWithPalette() {
  const inputDir = path.join(__dirname, "../../assets/showdown/");
  const outputDir = path.join(__dirname, "../../assets/dist/");
  const FRAME_GAP = 4;

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const files = fs.readdirSync(inputDir).filter((f) => f.endsWith(".gif"));

  const assetPackFile = path.join(outputDir, "pws.assets");
  const manifestFile = path.join(outputDir, "pws.json");
  const manifest = {};
  let currentOffset = 0;

  if (fs.existsSync(assetPackFile)) fs.unlinkSync(assetPackFile);

  for (const file of files) {
    const fileName = path.parse(file).name;
    const fullInputPath = path.join(inputDir, file);

    try {
      const metadata = await sharp(fullInputPath).metadata();

      const processFrame = async (idx) => {
        const { data } = await sharp(fullInputPath, { page: idx })
          .ensureAlpha()
          .resize(64, 64, { kernel: "nearest" })
          .raw()
          .toBuffer({ resolveWithObject: true });

        // --- 4-BIT PACKING LOGIC ---
        // 64x64 pixels / 2 = 2048 bytes
        let packed = Buffer.alloc(2048, 0);

        for (let i = 0; i < data.length / 4; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const a = data[i * 4 + 3];

          let colorIndex;
          if (a < 128) {
            colorIndex = 0; // Transparent
          } else {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            colorIndex = getClosestIndex(lum);
            if (colorIndex === 0) colorIndex = 1;
          }

          const byteIdx = Math.floor(i / 2);
          if (i % 2 === 0) {
            packed[byteIdx] = colorIndex << 4;
          } else {
            packed[byteIdx] |= colorIndex & 0x0f;
          }
        }

        const header = Buffer.from([64, 64, 4]);
        return Buffer.concat([header, packed]);
      };

      // Handle Frame 0
      const frame0Data = await processFrame(0);
      fs.appendFileSync(assetPackFile, frame0Data);
      manifest[`${fileName}_0`] = { o: currentOffset, l: frame0Data.length };
      currentOffset += frame0Data.length;

      // Handle Frame 1 (Walking animation)
      let secondIdx = Math.min(FRAME_GAP, metadata.pages - 1);
      if (secondIdx < 0) secondIdx = 0;

      const frame1Data = await processFrame(secondIdx);
      fs.appendFileSync(assetPackFile, frame1Data);
      manifest[`${fileName}_1`] = { o: currentOffset, l: frame1Data.length };
      currentOffset += frame1Data.length;

      console.log(`✓ Bundled 2 frames for ${fileName}`);
    } catch (err) {
      console.error(`✗ Error processing ${file}: ${err.message}`);
    }
  }

  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  console.log(
    `\nFinal: Created asset pack with ${Object.keys(manifest).length} entries.`
  );
}

convertWithPalette();
