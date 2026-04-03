// app/api/edit-image/route.js
// 이미지 편집 API — OpenAI + Google Gemini
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROVIDERS = {
  "gpt-image-1": "openai",
  "gpt-image-1.5": "openai",
};

async function editWithOpenAI(image_base64, image_mime, prompt, modelId, quality, input_fidelity) {
  const imageBuffer = Buffer.from(image_base64, "base64");
  const ext = image_mime === "image/png" ? "png" : image_mime === "image/webp" ? "webp" : "png";
  const imageFile = new File([imageBuffer], `input.${ext}`, { type: image_mime });

  const response = await openai.images.edit({
    model: modelId,
    image: imageFile,
    prompt,
    quality: quality || "high",
    input_fidelity: input_fidelity || "high",
    size: "auto",
  });

  const resultBase64 = response.data?.[0]?.b64_json;
  if (!resultBase64) throw new Error("OpenAI 응답에 이미지가 없습니다.");
  return { image_base64: resultBase64, mime_type: "image/png" };
}


export async function POST(request) {
  try {
    const { image_base64, image_mime, prompt, model, quality, input_fidelity } = await request.json();

    if (!image_base64 || !prompt) {
      return Response.json(
        { error: "이미지와 프롬프트는 필수입니다." },
        { status: 400 }
      );
    }

    const modelId = PROVIDERS[model] ? model : "gpt-image-1.5";
    console.log("[edit-image] model:", modelId);

    const result = await editWithOpenAI(image_base64, image_mime, prompt, modelId, quality, input_fidelity);

    return Response.json(result);
  } catch (error) {
    console.error("Edit image error:", error);
    return Response.json(
      { error: error.message || "이미지 편집 실패" },
      { status: 500 }
    );
  }
}
