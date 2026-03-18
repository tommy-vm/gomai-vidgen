// app/api/status/route.js
// FAL.ai 영상 생성 상태 확인 API
import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const request_id = searchParams.get("request_id");
    const modelParam = searchParams.get("model");

    if (!request_id) {
      return Response.json(
        { error: "request_id가 필요합니다." },
        { status: 400 }
      );
    }

    const ALLOWED_MODELS = [
      "fal-ai/kling-video/v2.1/pro/image-to-video",
      "fal-ai/kling-video/v2.6/pro/image-to-video",
      "fal-ai/kling-video/v3/pro/image-to-video",
    ];
    const modelId = ALLOWED_MODELS.includes(modelParam)
      ? modelParam
      : ALLOWED_MODELS[0];

    const status = await fal.queue.status(modelId, {
      requestId: request_id,
      logs: false,
    });

    // 완료 시 결과 가져오기
    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(modelId, {
        requestId: request_id,
      });
      return Response.json({
        status: "completed",
        video_url: result.data?.video?.url,
      });
    }

    return Response.json({
      status: status.status?.toLowerCase() || "processing",
    });
  } catch (error) {
    console.error("Status check error:", error);
    return Response.json(
      { error: error.message || "상태 확인 실패" },
      { status: 500 }
    );
  }
}
