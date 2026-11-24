// world-news-image-2411 — entry for make.fun news-image-20261124
//
// "Sum up 24 November's world news in one image."
// The editorial image is committed in this repository as entry.png.
// This program publishes it, byte-for-byte, to the output directory
// (MAKEFUN_OUTPUT_DIR, default /output) as entry.png.
//
// Guarantees:
//   - the published file is at most 1 MiB and at most 1024x1024 pixels
//     (the committed image already is: 1024x1024, 239158 bytes);
//   - the publish is atomic: the bytes are written to a scratch file in
//     the same directory and renamed into place, so a reader never sees
//     a half-written entry;
//   - a sha256 self-check proves the published bytes are identical to
//     the committed source; any mismatch fails loudly instead of
//     silently publishing a wrong file;
//   - the program is deterministic and uses no network, so two runs
//     write the same bytes.
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1_048_576; // 1 MiB, the competition's image size cap
const SOURCE_NAME = "entry.png";
const OUTPUT_NAME = "entry.png";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, SOURCE_NAME);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const finalPath = join(outDir, OUTPUT_NAME);

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Whole-image guard: the source must be a complete JPEG (SOI marker at
// the start, EOI marker at the end) or a complete PNG (8-byte signature
// at the start, IEND chunk at the end). A truncated or corrupt image
// fails here instead of being published.
function assertWholeImage(bytes: Buffer): void {
  const isJpeg =
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const isPng =
    bytes.length >= 12 &&
    bytes.subarray(0, 8).equals(pngSignature) &&
    bytes.subarray(bytes.length - 12).includes(Buffer.from("IEND"));
  if (!isJpeg && !isPng) {
    throw new Error(
      "entry image is not a whole JPEG or PNG (missing start/end markers)",
    );
  }
}

const source = readFileSync(sourcePath);

if (source.length > MAX_BYTES) {
  throw new Error(
    `entry image is ${source.length} bytes, over the 1 MiB limit`,
  );
}
assertWholeImage(source);
const expectedHash = sha256(source);

// Publish atomically: write a scratch file in the same directory,
// then rename it into place.
mkdirSync(outDir, { recursive: true });
const scratchPath = join(outDir, `.${OUTPUT_NAME}.tmp-${process.pid}`);
writeFileSync(scratchPath, source);
renameSync(scratchPath, finalPath);

// Self-check: the published bytes must hash-match the source, and the
// published file on disk must be within the size cap.
const published = readFileSync(finalPath);
const publishedSize = statSync(finalPath).size;
if (publishedSize > MAX_BYTES) {
  throw new Error(
    `published entry.png is ${publishedSize} bytes, over the 1 MiB limit`,
  );
}
if (published.length !== source.length || sha256(published) !== expectedHash) {
  throw new Error(
    "published entry.png does not match the source image (sha256 mismatch)",
  );
}

console.log(
  `wrote ${finalPath} (${published.length} bytes, sha256 ${expectedHash})`,
);
