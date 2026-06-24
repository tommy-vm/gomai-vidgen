// app/api/tools/music-library/route.js
// 라이선스 프리(Creative Commons) 음악 라이브러리 검색 — Jamendo API
// 분위기/장르 태그로 검색해 매칭 트랙 목록을 반환한다.
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const clientId = process.env.JAMENDO_CLIENT_ID;
    if (!clientId) {
      return Response.json(
        { error: "JAMENDO_CLIENT_ID 미설정 — https://devportal.jamendo.com 에서 무료 발급 후 .env에 추가하세요." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const tags = (searchParams.get("tags") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "6", 10), 12);
    if (!tags) {
      return Response.json({ error: "tags가 필요합니다." }, { status: 400 });
    }

    const url = new URL("https://api.jamendo.com/v3.0/tracks/");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("fuzzytags", tags.replace(/\s+/g, ""));
    url.searchParams.set("vocalinstrumental", "instrumental"); // BGM은 보컬 없는 곡
    url.searchParams.set("order", "popularity_total");
    url.searchParams.set("audioformat", "mp32");
    url.searchParams.set("include", "musicinfo licenses");
    url.searchParams.set("audiodlallowed", "true"); // 다운로드 허용 트랙만

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return Response.json({ error: "Jamendo 검색 실패" }, { status: 502 });
    }
    const data = await res.json();

    const tracks = (data?.results || []).map((t) => {
      const lic = t.license_ccurl || "";
      // 상업적 이용 안전: CC0 / CC BY / CC BY-SA (NC/ND 는 비상업·변경금지)
      const commercialSafe = !/(nc|nd)/i.test(lic);
      return {
        id: t.id,
        title: t.name,
        artist: t.artist_name,
        duration: t.duration,
        url: t.audio || t.audiodownload,
        download: t.audiodownload,
        license_url: lic,
        commercial_safe: commercialSafe,
        attribution: `${t.name} by ${t.artist_name} (Jamendo)`,
        share: t.shareurl,
      };
    });

    return Response.json({ tracks });
  } catch (error) {
    console.error("Music library error:", error);
    return Response.json(
      { error: error.message || "음악 라이브러리 검색 실패" },
      { status: 500 }
    );
  }
}
