const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

async function convertWithPalette() {
  const inputDir = path.join(__dirname, "../../assets/showdown/");
  const outputDir = path.join(__dirname, "../../assets/dist/");
  const FRAME_GAP = 4;
  const MAX_POKEMON_ID = 1025; // National Dex Limit

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Filter for official National Dex IDs only
  const files = fs.readdirSync(inputDir).filter((f) => {
    const id = parseInt(path.parse(f).name);
    return f.endsWith(".gif") && !isNaN(id) && id <= MAX_POKEMON_ID;
  });

  const assetPackFile = path.join(outputDir, "pws.assets");
  const indexFile = path.join(outputDir, "pws.index");

  // Pre-allocate binary index: (MAX_ID + 1) * 2 frames * 8 bytes
  // Using +1 so we can use the ID as a direct index (e.g., index 25 for Pikachu)
  const indexSize = (MAX_POKEMON_ID + 1) * 2 * 8;
  const indexBuffer = Buffer.alloc(indexSize, 0);

  if (fs.existsSync(assetPackFile)) fs.unlinkSync(assetPackFile);
  let currentOffset = 0;

  for (const file of files) {
    const pokemonId = parseInt(path.parse(file).name);
    const fullInputPath = path.join(inputDir, file);

    try {
      const metadata = await sharp(fullInputPath).metadata();

      const processFrame = async (idx) => {
        const { data } = await sharp(fullInputPath, { page: idx })
          .ensureAlpha()
          .resize(64, 64, { kernel: "nearest" })
          .raw()
          .toBuffer({ resolveWithObject: true });

        let packed = Buffer.alloc(2048, 0);
        for (let i = 0; i < data.length / 4; i++) {
          const a = data[i * 4 + 3];
          let colorIndex = 0;
          if (a >= 128) {
            const lum =
              0.299 * data[i * 4] +
              0.587 * data[i * 4 + 1] +
              0.114 * data[i * 4 + 2];
            colorIndex = Math.max(1, Math.floor((255 - lum) / 16));
          }
          const byteIdx = Math.floor(i / 2);
          if (i % 2 === 0) packed[byteIdx] = colorIndex << 4;
          else packed[byteIdx] |= colorIndex & 0x0f;
        }
        return Buffer.concat([Buffer.from([64, 64, 4]), packed]);
      };

      // Process and index Frame 0 & Frame 1
      for (let f = 0; f < 2; f++) {
        const frameIdx = f === 0 ? 0 : Math.min(FRAME_GAP, metadata.pages - 1);
        const frameData = await processFrame(frameIdx);

        fs.appendFileSync(assetPackFile, frameData);

        // Calculate position in the BINARY index: (ID * 2 frames + current_frame) * 8 bytes
        const entryPos = (pokemonId * 2 + f) * 8;
        indexBuffer.writeUInt32LE(currentOffset, entryPos); // Offset
        indexBuffer.writeUInt32LE(frameData.length, entryPos + 4); // Length

        currentOffset += frameData.length;
      }
      console.log(`✓ Indexed ${pokemonId}`);
    } catch (err) {
      console.error(`✗ Error ${file}: ${err.message}`);
    }
  }

  fs.writeFileSync(indexFile, indexBuffer);
  console.log(
    `\nFinal: Created pws.assets and binary pws.index for ${MAX_POKEMON_ID} species.`
  );
}

convertWithPalette();
