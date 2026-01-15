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
      const secondPage = pages > 1 ? 1 : 0; // use page 1 if it exists, else repeat 0

      const processFrame = async (idx) => {
        const pageIndex = idx === 0 ? firstPage : secondPage;
        const { data } = await sharp(fullInputPath, { page: pageIndex })
          .ensureAlpha()
          .resize(64, 64, { kernel: "nearest" })
          .raw()
          .toBuffer({ resolveWithObject: true });

        let packed = Buffer.alloc(2048, 0);
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

            // Map luminance so light areas -> low index, dark -> high index
            colorIndex = 15 - Math.floor(lum / 17);
            if (colorIndex < 1) colorIndex = 1; // Reserve 0 for transparent
            if (colorIndex > 15) colorIndex = 15;
          }

          const byteIdx = Math.floor(i / 2);
          if (i % 2 === 0) packed[byteIdx] = colorIndex << 4;
          else packed[byteIdx] |= colorIndex & 0x0f;
        }
        return Buffer.concat([Buffer.from([64, 64, 4]), packed]);
      };
      for (let f = 0; f < 2; f++) {
        const frameData = await processFrame(f);

        // Append actual data
        fs.appendFileSync(assetPackFile, frameData);

        // Calculate index position for THIS specific ID and Frame
        const entryPos = (pokemonId * 2 + f) * 8;

        // Write the START offset and actual LENGTH of this block
        indexBuffer.writeUInt32LE(currentOffset, entryPos);
        indexBuffer.writeUInt32LE(frameData.length, entryPos + 4);

        // Increment by the actual appended length to keep offsets valid
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
