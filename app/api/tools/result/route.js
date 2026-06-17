// app/api/tools/result/route.js
// 신규 AI 편집 도구 상태 확인 / 결과 조회
import { fal } from "@fal-ai/client";
import { TOOLS, ALLOWED_MODELS } from "../tools";

fal.config({ credentials: process.env.FAL_KEY });

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const request_id = searchParams.get("request_id");
    const model = searchParams.get("model");
    const tool = searchParams.get("tool");

    if (!request_id || !model) {
      return Response.json(
        { error: "request_id와 model이 필요합니다." },
        { status: 400 }
      );
    }
    if (!ALLOWED_MODELS.includes(model)) {
      return Response.json({ error: "허용되지 않은 모델입니다." }, { status: 400 });
    }

    const status = await fal.queue.status(model, { requestId: request_id, logs: false });

    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(model, { requestId: request_id });
      const def = TOOLS[tool];
      const normalized = def ? def.normalize(result.data) : { kind: "raw", data: result.data };
      return Response.json({ status: "completed", result: normalized });
    }

    return Response.json({
      status: status.status?.toLowerCase() || "processing",
    });
  } catch (error) {
    console.error("Tool result error:", error);
    return Response.json(
      { error: error.message || "상태 확인 실패" },
      { status: 500 }
    );
  }
}
