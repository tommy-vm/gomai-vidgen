// app/api/tools/shortform/route.js
// 긴 영상 자막 세그먼트 → 하이라이트 숏폼 클립 추천 (구간 + 제목 + 자막)
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request) {
  try {
    const { segments, target_count, max_len } = await request.json();

    if (!Array.isArray(segments) || !segments.length) {
      return Response.json({ error: "segments가 필요합니다." }, { status: 400 });
    }

    const count = Math.min(Math.max(target_count || 3, 1), 10);
    const maxLen = max_len || 60;

    // 인덱스 + 타임스탬프 + 텍스트
    const transcript = segments
      .map((s, i) => `[${i}] (${s.start?.toFixed(1)}~${s.end?.toFixed(1)}s) ${s.text}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: process.env.CUT_LLM_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a short-form video editor. From a timestamped transcript, pick the most engaging, " +
            "self-contained highlight clips suitable for shorts/reels. " +
            `Return up to ${count} clips, each ${"<="}${maxLen}s. ` +
            "Each clip must start/end on segment boundaries (use the given start/end times). " +
            "Respond ONLY as JSON: {\"clips\":[{\"start\":number,\"end\":number,\"title\":string,\"caption\":string}]}. " +
            "title: a punchy hook (same language as transcript). caption: 1-line summary. " +
            "Order clips by how compelling they are (best first). If transcript is too sparse, return fewer.",
        },
        { role: "user", content: `Target: up to ${count} clips, each <= ${maxLen}s.\n\nTranscript:\n${transcript}` },
      ],
    });

    let clips = [];
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      if (Array.isArray(parsed.clips)) {
        clips = parsed.clips
          .map((c) => ({
            start: Number(c.start),
            end: Number(c.end),
            title: String(c.title || "").slice(0, 120),
            caption: String(c.caption || "").slice(0, 200),
          }))
          .filter(
            (c) =>
              Number.isFinite(c.start) &&
              Number.isFinite(c.end) &&
              c.end > c.start
          )
          .slice(0, count);
      }
    } catch {
      /* noop */
    }

    return Response.json({ clips });
  } catch (error) {
    console.error("Shortform error:", error);
    return Response.json(
      { error: error.message || "숏폼 추천 실패" },
      { status: 500 }
    );
  }
}
