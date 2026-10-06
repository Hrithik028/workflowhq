import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Documentation-only tool. Install sharp separately; FFmpeg must be on PATH or supplied.
// Source screenshots come from browser capture, never synthetic application renders.
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "docs/media/demo-manifest.json"), "utf8"));
const ffmpegIndex = process.argv.indexOf("--ffmpeg");
if (ffmpegIndex !== -1 && !process.argv[ffmpegIndex + 1]) {
  throw new Error("--ffmpeg requires an executable path");
}
const encoder = ffmpegIndex === -1 ? "ffmpeg" : process.argv[ffmpegIndex + 1];
const staging = mkdtempSync(join(tmpdir(), "workflowhq-showcase-"));
const output = join(root, "docs/media");
const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const width = 1440;
const height = 960;
mkdirSync(output, { recursive: true });

try {
  const clips = [];
  for (const [index, scene] of manifest.scenes.entries()) {
    if (!Number.isInteger(scene.seconds) || scene.seconds < 1 || scene.seconds > 30) {
      throw new Error("Scene duration must be between 1 and 30 seconds");
    }
    const source = resolve(root, scene.image);
    if (!source.startsWith(root + "/") && !source.startsWith(root + "\\")) {
      throw new Error("Scene sources must remain inside the repository");
    }
    const ui = await sharp(source)
      .resize(1336, 726, {
        fit: "inside",
        withoutEnlargement: false,
        background: "#f5f2e9"
      })
      .png()
      .toBuffer();
    const size = await sharp(ui).metadata();
    const chrome = Buffer.from(`<svg width="1440" height="960" xmlns="http://www.w3.org/2000/svg">
      <rect width="1440" height="960" fill="#101f29"/>
      <text x="52" y="40" font-family="Arial" font-size="13" font-weight="700"
        letter-spacing="2" fill="#d7c29c">WORKFLOWHQ / CAPTIONED PRODUCT WALKTHROUGH</text>
      <text x="52" y="84" font-family="Arial" font-size="31" font-weight="700"
        fill="#f4f1e9">${escapeXml(scene.title)}</text>
      <rect x="52" y="114" width="1336" height="726" rx="12" fill="#f5f2e9"/>
      <text x="52" y="882" font-family="Arial" font-size="23"
        fill="#f4f1e9">${escapeXml(scene.subtitle)}</text>
      <text x="52" y="922" font-family="Arial" font-size="16"
        fill="#bcc9ce">Actual demo UI • Sample data and illustrative GitHub signals • No production actions recorded</text>
      <text x="1388" y="922" text-anchor="end" font-family="Arial" font-size="16"
        fill="#d7c29c">${String(index + 1).padStart(2, "0")} / ${manifest.scenes.length}</text>
    </svg>`);
    const frame = join(staging, `scene-${index}.png`);
    await sharp(chrome)
      .composite([
        {
          input: ui,
          left: Math.round((width - size.width) / 2),
          top: 114 + Math.round((726 - size.height) / 2)
        }
      ])
      .png()
      .toFile(frame);
    if (index === 1) {
      const play = Buffer.from(`<svg width="1440" height="960" xmlns="http://www.w3.org/2000/svg">
        <rect x="478" y="384" width="484" height="174" rx="20" fill="#101f29" opacity=".95"/>
        <circle cx="555" cy="459" r="37" fill="#d7c29c"/>
        <path d="M545 438 L545 480 L576 459 Z" fill="#101f29"/>
        <text x="615" y="454" font-family="Arial" font-size="27" font-weight="700"
          fill="#f4f1e9">Watch the product tour</text>
        <text x="615" y="491" font-family="Arial" font-size="20" fill="#d7c29c">72 seconds • Captioned • Sample data</text>
      </svg>`);
      const poster = await sharp(frame)
        .composite([{ input: play }])
        .png()
        .toBuffer();
      await sharp(poster).resize(1200).png().toFile(join(output, "demo-poster.png"));
    }
    const clip = join(staging, `scene-${index}.mp4`);
    execFileSync(
      encoder,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-loop",
        "1",
        "-framerate",
        "24",
        "-i",
        frame,
        "-t",
        String(scene.seconds),
        "-vf",
        `fade=t=in:st=0:d=0.3,fade=t=out:st=${scene.seconds - 0.3}:d=0.3`,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-tune",
        "stillimage",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-an",
        clip
      ],
      { stdio: "inherit" }
    );
    clips.push(clip);
    console.log(`Rendered ${index + 1}/${manifest.scenes.length}: ${scene.title}`);
  }
  const concatList = join(staging, "scenes.txt");
  // Generated temp paths contain no user text. Use forward slashes for concat portability.
  writeFileSync(
    concatList,
    clips.map((clip) => `file '${clip.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`).join("\n")
  );
  const video = join(output, "workflowhq-demo.mp4");
  execFileSync(
    encoder,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatList,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      video
    ],
    { stdio: "inherit" }
  );
  if (statSync(video).size > 5 * 1024 * 1024) {
    throw new Error(
      "Demo exceeds the repository 5 MiB file limit; lower quality or duration before publishing"
    );
  }
  let elapsed = 0;
  const time = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23);
  const cues = manifest.scenes.map((scene, index) => {
    const start = elapsed;
    elapsed += scene.seconds;
    return `${index + 1}\n${time(start)} --> ${time(elapsed)}\n${scene.title}\n${scene.subtitle}\n`;
  });
  writeFileSync(join(output, "workflowhq-demo.vtt"), "WEBVTT\n\n" + cues.join("\n"));
  console.log(`SHOWCASE_MEDIA_OK ${elapsed}s ${width}x${height} ${statSync(video).size} bytes`);
} finally {
  // Only remove the exact OS-generated directory this process created, never repo/source paths.
  rmSync(staging, { recursive: true, force: true });
}
