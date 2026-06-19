// app/api/tools/process/route.js
// 신규 AI 편집 도구 실행 요청 — FAL Queue에 비동기 제출
import { fal } from "@fal-ai/client";
import { TOOLS } from "../tools";

fal.config({ credentials: process.env.FAL_KEY });

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

    const input = def.buildInput({
      fileUrl: file_url,
      fileKind: file_kind,
      prompt,
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
