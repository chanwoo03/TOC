import { copyFile, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const require = createRequire(import.meta.url);
const destination = new URL("../public/ocr/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const language of ["kor", "eng"]) {
  const packageRoot = dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
  const file = language + ".traineddata.gz";
  await copyFile(join(packageRoot, "4.0.0_best_int", file), new URL(file, destination));
}
await pipeline(
  createReadStream(new URL("../public/data/easy-drug.json", import.meta.url)),
  createGzip({ level: 9 }),
  createWriteStream(new URL("../public/data/easy-drug.json.gz", import.meta.url)),
);
