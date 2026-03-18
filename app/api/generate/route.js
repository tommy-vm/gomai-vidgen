// app/api/generate/route.js
// FAL.ai Kling Image-to-Video 생성 요청 API
import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

export async function POST(request) {
  try {
    const { image_url, prompt, duration, aspect_ratio, model } =
      await request.json();

    if (!image_url || !prompt) {
      return Response.json(
        { error: "image_url과 prompt는 필수입니다." },
        { status: 400 }
      );
    }

    const ALLOWED_MODELS = [
      "fal-ai/kling-video/v2.1/pro/image-to-video",
      "fal-ai/kling-video/v2.6/pro/image-to-video",
      "fal-ai/kling-video/v3/pro/image-to-video",
    ];
    const modelId = ALLOWED_MODELS.includes(model)
      ? model
      : ALLOWED_MODELS[0];

    // FAL.ai Queue API로 비동기 요청 제출
    const { request_id } = await fal.queue.submit(modelId,
      {
        input: {
          prompt,
          image_url,
          duration: duration || "5",
          aspect_ratio: aspect_ratio || "16:9",
          negative_prompt: "blur, distort, low quality, watermark",
          cfg_scale: 0.5,
        },
      }
    );

    return Response.json({ request_id, status: "queued" });
  } catch (error) {
    console.error("Generate error:", error);
    return Response.json(
      { error: error.message || "영상 생성 요청 실패" },
      { status: 500 }
    );
  }
}
