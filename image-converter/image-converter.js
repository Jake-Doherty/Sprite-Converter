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

  // --- ASSET PACK PREPARATION ---
  const assetPackFile = path.join(outputDir, "pws.assets");
  const manifestFile = path.join(outputDir, "pws.json");
  const manifest = {};
  let currentOffset = 0;

  // Clear previous asset pack if it exists
  if (fs.existsSync(assetPackFile)) fs.unlinkSync(assetPackFile);
  // ------------------------------

  for (const file of files) {
    const fileName = path.parse(file).name;
    const fullInputPath = path.join(inputDir, file);

    try {
      const metadata = await sharp(fullInputPath).metadata();

      const processFrame = async (idx) => {
        return await sharp(fullInputPath, { page: idx })
          .ensureAlpha()
          .resize(64, 64, { kernel: "nearest" })
          .raw()
          .toBuffer({ resolveWithObject: true });
      };

      const { data: d0 } = await processFrame(0);
      let secondFrameIndex = Math.min(FRAME_GAP, metadata.pages - 1);
      if (secondFrameIndex < 0) secondFrameIndex = 0;
      const { data: d1 } = await processFrame(secondFrameIndex);

      const atlasRaw = Buffer.concat([d0, d1]);
      const packed = Buffer.alloc(atlasRaw.length / 8);

      for (let i = 0; i < atlasRaw.length / 4; i++) {
        const r = atlasRaw[i * 4];
        const g = atlasRaw[i * 4 + 1];
        const b = atlasRaw[i * 4 + 2];
        const a = atlasRaw[i * 4 + 3];

        let colorIndex;
        if (a < 128) {
          colorIndex = 0;
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

      const header = Buffer.from([64, 128, 4]);
      const fullImageData = Buffer.concat([header, packed]);

      // --- ASSET PACK APPENDING ---
      // Append this sprite's bytes to the single large file
      fs.appendFileSync(assetPackFile, fullImageData);

      // Record the location in our manifest
      manifest[fileName] = {
        o: currentOffset, // Offset in bytes
        l: fullImageData.length, // Length in bytes
      };

      currentOffset += fullImageData.length;
      console.log(`✓ Bundled ${fileName} into pws.assets`);
      // ----------------------------
    } catch (err) {
      console.error(`✗ Error processing ${file}: ${err.message}`);
    }
  }

  // Save the manifest map to the watch
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  console.log(
    `\nFinal: Created pws.assets and pws.json mapping ${
      Object.keys(manifest).length
    } sprites.`
  );
}

convertWithPalette();
