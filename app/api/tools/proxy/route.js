// app/api/tools/proxy/route.js
// FAL 미디어(오디오 등)를 브라우저로 그대로 전달 — ffmpeg.wasm 믹싱 시 CORS 회피용
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = ["fal.media", "v3.fal.media", "v3b.fal.media", "jamendo.com"];

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");
    if (!target) {
      return Response.json({ error: "url이 필요합니다." }, { status: 400 });
    }

    const u = new URL(target);
    const ok = ALLOWED_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith("." + h)
    );
    if (!ok) {
      return Response.json({ error: "허용되지 않은 호스트입니다." }, { status: 400 });
    }

    const upstream = await fetch(target);
    if (!upstream.ok) {
      return Response.json({ error: "원본 다운로드 실패" }, { status: 502 });
    }

    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return Response.json({ error: error.message || "프록시 실패" }, { status: 500 });
  }
}
