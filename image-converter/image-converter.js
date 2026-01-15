const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

async function convertWithPalette() {
  // define variables for input and output directories to read files of and write the full asset pack and index files to 
  const inputDir = path.join(__dirname, "../../assets/showdown/");
  const outputDir = path.join(__dirname, "../../assets/dist/");
  const MAX_POKEMON_ID = 1025;
  // make it if it doesn't exist
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  // read all .gif files from the input directory
  const allFiles = fs.readdirSync(inputDir).filter((f) => f.endsWith(".gif"));
  // define files to first map the file.name to an object containing the file and the the ID of the pokemon parsed from the file name 
  // then filter out .gifs that don't correspond to official pokemon IDs using the ID set in the map to compare against MAX_POKEMON_ID
  // finally map back to just the file names for processing
  const files = allFiles
    .map((f) => ({ f, id: parseInt(path.parse(f).name) }))
    .filter((x) => !isNaN(x.id) && x.id <= MAX_POKEMON_ID)
    .map((x) => x.f);
  // define paths for the output of the asset pack and index files
  const assetPackFile = path.join(outputDir, "pws.assets");
  const indexFile = path.join(outputDir, "pws.index");

  // Determine maximum ID from the files we will process to cover all IDs 
  // (each ID has 2 frames -> 2 entries of 8 bytes).
  const ids = files
    .map((f) => parseInt(path.parse(f).name))
    .filter((v) => !isNaN(v));
  const maxId = ids.length ? Math.max(...ids) : MAX_POKEMON_ID;
  const indexSize = (maxId + 1) * 2 * 8;
  const indexBuffer = Buffer.alloc(indexSize, 0);

  if (fs.existsSync(assetPackFile)) fs.unlinkSync(assetPackFile);
  let currentOffset = 0;

  for (const file of files) {
    const pokemonId = parseInt(path.parse(file).name);
    const fullInputPath = path.join(inputDir, file);

    try {
      const metadata = await sharp(fullInputPath).metadata();

      // Determine which pages to use for the two frames. Some GIFs have only
      // 1 or 2 frames; avoid asking for an out-of-range page index.
      const pages = metadata.pages || 1;
      const firstPage = 0;
      const secondPage = pages > 1 ? 1 : 0;

      const processFrame = async (idx) => {
        const pageIndex = idx === 0 ? firstPage : secondPage;
        const { data } = await sharp(fullInputPath, { page: pageIndex })
          .ensureAlpha()
          .resize(64, 64, { kernel: "nearest" })
          .raw()
          .toBuffer({ resolveWithObject: true });

        // 3-bit = 8 colors, need 1.5 bytes per 2 pixels (3 bits × 2 = 6 bits, round up)
        // For 64×64 = 4096 pixels, we need 4096 × 3 bits = 12288 bits = 1536 bytes
        let packed = Buffer.alloc(1536, 0);
        let bitOffset = 0;

        for (let i = 0; i < data.length / 4; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const a = data[i * 4 + 3];

          let colorIndex;

          // Transparency must be index 0
          if (a < 128) {
            colorIndex = 0;
          } else {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            // Map to 3-bit (0-7), but reserve 0 for transparent
            // Light areas -> low index (1), dark -> high index (7)
            colorIndex = 7 - Math.floor(lum / 37); // 255 / 7 ≈ 37
            if (colorIndex < 1) colorIndex = 1; // Reserve 0 for transparent
            if (colorIndex > 7) colorIndex = 7;
          }

          // Pack 3-bit values
          const byteIdx = Math.floor(bitOffset / 8);
          const bitPos = bitOffset % 8;
          
          // Write the 3-bit value at the current bit position
          if (bitPos <= 5) {
            // Fits in current byte
            packed[byteIdx] |= (colorIndex << (5 - bitPos));
          } else {
            // Spans two bytes
            const bitsInFirst = 8 - bitPos;
            const bitsInSecond = 3 - bitsInFirst;
            packed[byteIdx] |= (colorIndex >> bitsInSecond);
            packed[byteIdx + 1] |= (colorIndex << (8 - bitsInSecond));
          }
          
          bitOffset += 3;
        }
        
        // Header: width (64), height (64), bits per pixel (3)
        return Buffer.concat([Buffer.from([64, 64, 3]), packed]);
      };

      for (let f = 0; f < 2; f++) {
        const frameData = await processFrame(f);

        fs.appendFileSync(assetPackFile, frameData);

        const entryPos = (pokemonId * 2 + f) * 8;
        indexBuffer.writeUInt32LE(currentOffset, entryPos);
        indexBuffer.writeUInt32LE(frameData.length, entryPos + 4);

        currentOffset += frameData.length;
      }
      console.log(`✓ Indexed ${pokemonId}`);
    } catch (err) {
      console.error(`✗ Error ${file}: ${err.message}`);
    }
  }

  fs.writeFileSync(indexFile, indexBuffer);
  console.log(`\nFinal: Created assets and index.`);
}

convertWithPalette();