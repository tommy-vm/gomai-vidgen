// app/api/tools/process/route.js
// 신규 AI 편집 도구 실행 요청 — FAL Queue에 비동기 제출
import { fal } from "@fal-ai/client";
import OpenAI from "openai";
import { TOOLS } from "../tools";

fal.config({ credentials: process.env.FAL_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 영어 프롬프트가 필요한(영문만 인식하는) 모델 도구들 — 한글 입력 시 자동 번역
const NEEDS_EN_PROMPT = new Set([
  "cutout-image",
  "cutout-mask",
  "replace-bg",
  "bernini-edit",
  "vace-edit",
  "bgm-music",
]);

const hasKorean = (s) => /[가-힣㄰-㆏]/.test(s || "");

async function toEnglish(text) {
  try {
    const r = await openai.chat.completions.create({
      model: process.env.CUT_LLM_MODEL || "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Translate the user's text to a concise English prompt for an AI image/video/music model. " +
            "Keep it a short descriptive phrase, no quotes, no extra commentary. Output only the translation.",
        },
        { role: "user", content: text },
      ],
    });
    return r.choices[0]?.message?.content?.trim() || text;
  } catch {
    return text; // 번역 실패 시 원문 그대로 진행
  }
}

export async function POST(request) {
  try {
    const { tool, file_url, file_kind, prompt, options } = await request.json();

    const def = TOOLS[tool];
    if (!def) {
      return Response.json({ error: "알 수 없는 도구입니다." }, { status: 400 });
    }
    if (def.needsFile !== false && !file_url) {
      return Response.json({ error: "file_url은 필수입니다." }, { status: 400 });
    }
    if (file_kind && !def.accepts.includes(file_kind)) {
      return Response.json(
        { error: `이 도구는 ${def.accepts.join("/")} 입력만 지원합니다.` },
        { status: 400 }
      );
    }

    // 한글 프롬프트 → 영어 자동 번역 (영문만 받는 모델 한정)
    let finalPrompt = prompt;
    if (NEEDS_EN_PROMPT.has(tool) && hasKorean(prompt)) {
      finalPrompt = await toEnglish(prompt);
    }

    const input = def.buildInput({
      fileUrl: file_url,
      fileKind: file_kind,
      prompt: finalPrompt,
      options,
    });

    const { request_id } = await fal.queue.submit(def.model, { input });

    return Response.json({ request_id, model: def.model, status: "queued" });
  } catch (error) {
    console.error("Tool process error:", error);
    return Response.json(
      { error: error.message || "처리 요청 실패" },
      { status: 500 }
    );
  }
}
