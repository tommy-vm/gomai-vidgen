// app/api/tools/select-cuts/route.js
// 내용 기반 스마트 컷 — whisper 자막 세그먼트 + 자연어 지시 → 지울 세그먼트 인덱스 선택
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request) {
  try {
    const { segments, instruction } = await request.json();

    if (!Array.isArray(segments) || !segments.length) {
      return Response.json({ error: "segments가 필요합니다." }, { status: 400 });
    }
    if (!instruction?.trim()) {
      return Response.json({ error: "지시문이 필요합니다." }, { status: 400 });
    }

    // 모델에 넘길 자막 목록 (인덱스 + 텍스트)
    const transcript = segments
      .map((s, i) => `[${i}] ${s.text}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: process.env.CUT_LLM_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a video editor assistant. Given a numbered transcript and a user's instruction about which parts to REMOVE, return the indices of the segments that should be cut. Respond ONLY with JSON: {\"remove\": [<indices>]}. Include a segment index only if it clearly matches the instruction. If nothing matches, return an empty array.",
        },
        {
          role: "user",
          content: `Instruction: ${instruction}\n\nTranscript:\n${transcript}`,
        },
      ],
    });

    let remove = [];
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      if (Array.isArray(parsed.remove)) {
        remove = parsed.remove
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < segments.length);
      }
    } catch {
      // 파싱 실패 시 빈 배열
    }

    return Response.json({ remove });
  } catch (error) {
    console.error("Select cuts error:", error);
    return Response.json(
      { error: error.message || "구간 선택 실패" },
      { status: 500 }
    );
  }
}
