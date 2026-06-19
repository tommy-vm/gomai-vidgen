// app/api/tools/music-prompt/route.js
// 영상 프레임 → 화면 분위기 분석 → 저작권 프리 BGM 생성용 음악 프롬프트 생성
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request) {
  try {
    const { frames } = await request.json();

    if (!Array.isArray(frames) || !frames.length) {
      return Response.json({ error: "frames(이미지)가 필요합니다." }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.CUT_LLM_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You analyze video frames and design a fitting instrumental background music brief. " +
            "Return ONLY JSON: {\"prompt\": string, \"mood\": string}. " +
            "The 'prompt' must be a concise English instrumental music description suitable for a text-to-music model " +
            "(genre, mood, instruments, tempo/BPM, energy). No lyrics, no copyrighted artist/song names.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "다음 영상 프레임들에 어울리는 배경음악 브리프를 만들어줘.",
            },
            ...frames.slice(0, 4).map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        },
      ],
    });

    let prompt = "";
    let mood = "";
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
      mood = typeof parsed.mood === "string" ? parsed.mood : "";
    } catch {
      /* noop */
    }
    if (!prompt) prompt = "calm cinematic ambient background music, soft piano and strings, slow tempo";

    return Response.json({ prompt, mood });
  } catch (error) {
    console.error("Music prompt error:", error);
    return Response.json(
      { error: error.message || "음악 프롬프트 생성 실패" },
      { status: 500 }
    );
  }
}
