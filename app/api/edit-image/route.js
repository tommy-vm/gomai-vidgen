// app/api/edit-image/route.js
// 이미지 편집 API — OpenAI GPT Image
import OpenAI from "openai";
import sharp from "sharp";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED_MODELS = ["gpt-image-1", "gpt-image-1.5"];

// OpenAI 지원 사이즈: 1024x1024, 1536x1024, 1024x1536
const STANDARD_SIZES = [
  { w: 1024, h: 1024, label: "1024x1024" },
  { w: 1536, h: 1024, label: "1536x1024" },
  { w: 1024, h: 1536, label: "1024x1536" },
];

function pickBestSize(width, height) {
  const ratio = width / height;
  let best = STANDARD_SIZES[0];
  let bestDiff = Infinity;
  for (const s of STANDARD_SIZES) {
    const diff = Math.abs(ratio - s.w / s.h);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

async function padToSize(imageBuffer, targetW, targetH) {
  const meta = await sharp(imageBuffer).metadata();
  const srcW = meta.width;
  const srcH = meta.height;

  // 원본 비율 유지하면서 target 안에 맞추기
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const resizedW = Math.round(srcW * scale);
  const resizedH = Math.round(srcH * scale);

  // 리사이즈 후 패딩 추가 (검정 배경)
  const padded = await sharp(imageBuffer)
    .resize(resizedW, resizedH, { fit: "inside" })
    .extend({
      top: Math.floor((targetH - resizedH) / 2),
      bottom: Math.ceil((targetH - resizedH) / 2),
      left: Math.floor((targetW - resizedW) / 2),
      right: Math.ceil((targetW - resizedW) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toBuffer();

  return {
    buffer: padded,
    resizedW,
    resizedH,
    padTop: Math.floor((targetH - resizedH) / 2),
    padLeft: Math.floor((targetW - resizedW) / 2),
  };
}

async function cropPadding(outputBuffer, padInfo) {
  // 패딩 제거하여 원본 비율 복원
  return sharp(outputBuffer)
    .extract({
      left: padInfo.padLeft,
      top: padInfo.padTop,
      width: padInfo.resizedW,
      height: padInfo.resizedH,
    })
    .png()
    .toBuffer();
}

export async function POST(request) {
  try {
    const { image_base64, image_mime, prompt, model, quality, input_fidelity } =
      await request.json();

    if (!image_base64 || !prompt) {
      return Response.json(
        { error: "이미지와 프롬프트는 필수입니다." },
        { status: 400 }
      );
    }

    const modelId = ALLOWED_MODELS.includes(model) ? model : "gpt-image-1.5";
    const inputBuffer = Buffer.from(image_base64, "base64");

    // 1. 입력 이미지 분석 → 최적 표준 사이즈 선택
    const meta = await sharp(inputBuffer).metadata();
    const targetSize = pickBestSize(meta.width, meta.height);

    console.log(
      `[edit-image] model: ${modelId}, input: ${meta.width}x${meta.height}, target: ${targetSize.label}`
    );

    // 2. 패딩 추가하여 표준 사이즈로 변환
    const padInfo = await padToSize(inputBuffer, targetSize.w, targetSize.h);
    const paddedFile = new File([padInfo.buffer], "input.png", {
      type: "image/png",
    });

    // 3. OpenAI API 호출 (명시적 사이즈 지정)
    const response = await openai.images.edit({
      model: modelId,
      image: paddedFile,
      prompt,
      quality: quality || "high",
      input_fidelity: input_fidelity || "high",
      size: targetSize.label,
    });

    const resultBase64 = response.data?.[0]?.b64_json;
    if (!resultBase64) throw new Error("OpenAI 응답에 이미지가 없습니다.");

    // 4. 패딩 제거 → 원본 비율 복원
    const resultBuffer = Buffer.from(resultBase64, "base64");
    const croppedBuffer = await cropPadding(resultBuffer, padInfo);

    return Response.json({
      image_base64: croppedBuffer.toString("base64"),
      mime_type: "image/png",
    });
  } catch (error) {
    console.error("Edit image error:", error);
    return Response.json(
      { error: error.message || "이미지 편집 실패" },
      { status: 500 }
    );
  }
}
