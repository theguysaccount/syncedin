import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const videos = JSON.parse(fs.readFileSync("verification/social-video-manifest.json", "utf8"));
for (const video of videos) {
  const file = "public" + video.urlPath;
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
  assert.equal(info.streams.length, 1, video.path + ": single silent video stream");
  const stream = info.streams[0];
  assert.deepEqual([stream.codec_name, stream.pix_fmt, stream.width, stream.height, stream.r_frame_rate, stream.avg_frame_rate],
    ["h264", "yuv420p", video.width, video.height, "24/1", "24/1"], video.path);
  assert.equal(Number(info.format.duration), video.duration);
  assert.equal(Number(stream.nb_frames), video.duration * 24);
  // Compare luminance on the locked headline area and lower moving diagram.
  // Compression can slightly change pixels even when source typography is fixed.
  const size = 300 * 158;
  const frames = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "scale=300:158,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 8_000_000 });
  const frameCount = video.duration * 24;
  assert.equal(frames.length, frameCount * size);
  const meanDifference = (a, b, start, end) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += Math.abs(frames[a * size + i] - frames[b * size + i]);
    return sum / (end - start);
  };
  let largestMotion = 0;
  for (let n = 1; n < frameCount; n++) {
    assert(meanDifference(0, n, 0, 105 * 300) < 0.15, video.path + ": poster text must stay locked");
    largestMotion = Math.max(largestMotion, meanDifference(0, n, 108 * 300, 134 * 300));
  }
  assert(largestMotion > 0.1, video.path + ": diagram must visibly change");
  assert(meanDifference(0, frameCount - 1, 108 * 300, 134 * 300) < Math.min(0.2, largestMotion * 0.12),
    video.path + ": loop seam should be below compression tolerance and far smaller than the actual animation");
}
console.log(`Decoded all ${videos.length} silent previews at constant 24 fps; locked poster, diagram motion and loop joins verified.`);
