// app/api/tools/mux/route.js
// 원본 영상 위에 음악을 깔아 mp4 반환 (서버사이드 네이티브 ffmpeg)
// 영상 스트림은 copy(회전·화질 보존), 원본 음성은 유지하고 음악만 볼륨↓로 믹스.
// ⚠️ Vercel 등 ffmpeg 바이너리 없는 서버리스에선 동작 안 함(로컬/자체호스팅 전용).
//    곰 앱은 동일 ffmpeg 로직을 네이티브로 구현.
import { spawn } from "child_process";
import { writeFile, readFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("ffmpeg exit " + code + "\n" + err.slice(-800)))
    );
  });
}

export async function POST(request) {
  let dir;
  try {
    const form = await request.formData();
    const video = form.get("video");
    const musicUrl = form.get("music_url");
    const volume = parseFloat(form.get("volume") || "0.35");
    if (!video || !musicUrl) {
      return Response.json({ error: "video와 music_url이 필요합니다." }, { status: 400 });
    }

    dir = await mkdtemp(join(tmpdir(), "gommux-"));
    const inPath = join(dir, "in.mp4");
    const musicPath = join(dir, "music.mp3");
    const outPath = join(dir, "out.mp4");

    await writeFile(inPath, Buffer.from(await video.arrayBuffer()));
    const musicRes = await fetch(musicUrl);
    if (!musicRes.ok) throw new Error("음악 다운로드 실패");
    await writeFile(musicPath, Buffer.from(await musicRes.arrayBuffer()));

    // 원본 음성 + 음악(볼륨↓) 믹스. 원본 음성 normalize=0 으로 유지. 영상은 copy.
    const mix = [
      "-y", "-i", inPath, "-i", musicPath,
      "-filter_complex",
      `[1:a]volume=${volume}[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`,
      "-map", "0:v", "-map", "[a]",
      "-c:v", "copy", "-c:a", "aac", "-shortest", outPath,
    ];
    try {
      await runFfmpeg(mix);
    } catch {
      // 원본에 오디오 트랙이 없으면 음악만 입히기로 폴백
      await runFfmpeg([
        "-y", "-i", inPath, "-i", musicPath,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-shortest", outPath,
      ]);
    }

    const out = await readFile(outPath);
    return new Response(out, {
      headers: { "Content-Type": "video/mp4", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Mux error:", error);
    return Response.json({ error: error.message || "믹스 실패" }, { status: 500 });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
