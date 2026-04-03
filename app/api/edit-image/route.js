// app/api/edit-image/route.js
// 이미지 편집 API — OpenAI + Google Gemini
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const PROVIDERS = {
  "gpt-image-1": "openai",
  "gemini-2.5-flash-image": "gemini",
  "gemini-3-pro-image-preview": "gemini",
};

async function editWithOpenAI(image_base64, image_mime, prompt) {
  const imageBuffer = Buffer.from(image_base64, "base64");
  const ext = image_mime === "image/png" ? "png" : image_mime === "image/webp" ? "webp" : "png";
  const imageFile = new File([imageBuffer], `input.${ext}`, { type: image_mime });

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: imageFile,
    prompt,
  });

  const resultBase64 = response.data?.[0]?.b64_json;
  if (!resultBase64) throw new Error("OpenAI 응답에 이미지가 없습니다.");
  return { image_base64: resultBase64, mime_type: "image/png" };
}

async function editWithGemini(modelId, image_base64, image_mime, prompt) {
  const response = await gemini.models.generateContent({
    model: modelId,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: image_mime || "image/png", data: image_base64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  const parts = response.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData) {
      return {
        image_base64: part.inlineData.data,
        mime_type: part.inlineData.mimeType || "image/png",
      };
    }
  }

  if (finishReason === "IMAGE_SAFETY") {
    throw new Error("안전 정책에 의해 차단되었습니다. 다른 이미지나 프롬프트로 시도해주세요.");
  }
  const textPart = parts.find(p => p.text);
  throw new Error(textPart ? textPart.text : "Gemini 응답에 이미지가 포함되지 않았습니다.");
}

export async function POST(request) {
  try {
    const { image_base64, image_mime, prompt, model } = await request.json();

    if (!image_base64 || !prompt) {
      return Response.json(
        { error: "이미지와 프롬프트는 필수입니다." },
        { status: 400 }
      );
    }

    const modelId = PROVIDERS[model] ? model : "gpt-image-1";
    const provider = PROVIDERS[modelId];

    console.log("[edit-image] model:", modelId, "provider:", provider);

    let result;
    if (provider === "openai") {
      result = await editWithOpenAI(image_base64, image_mime, prompt);
    } else {
      result = await editWithGemini(modelId, image_base64, image_mime, prompt);
    }

    return Response.json(result);
  } catch (error) {
    console.error("Edit image error:", error);
    return Response.json(
      { error: error.message || "이미지 편집 실패" },
      { status: 500 }
    );
  }
}
