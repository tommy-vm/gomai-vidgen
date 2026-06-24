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

    // fuzzytags 는 태그를 AND 로 매칭 → 3개 이상이면 결과 0인 경우가 많음.
    // 태그 수를 점진적으로 줄이며 결과가 나올 때까지 재시도.
    const tagList = tags
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, ""))
      .filter(Boolean);

    const query = async (tagSet) => {
      const url = new URL("https://api.jamendo.com/v3.0/tracks/");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("fuzzytags", tagSet.join(","));
      url.searchParams.set("order", "popularity_total");
      url.searchParams.set("audioformat", "mp32");
      url.searchParams.set("include", "musicinfo licenses");
      // 상업적 이용 가능 트랙만: NC(비상업)·ND(변경금지=믹스 시 문제) 제외 → BY / BY-SA / CC0
      url.searchParams.set("ccnc", "false");
      url.searchParams.set("ccnd", "false");
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("Jamendo 검색 실패");
      return r.json();
    };

    let data = { results: [] };
    // 2개 → 1개 순으로 시도 (2개가 관련성/결과수 균형이 좋음)
    for (const k of [Math.min(2, tagList.length), 1]) {
      if (k < 1) break;
      data = await query(tagList.slice(0, k));
      if (data?.results?.length) break;
    }

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
