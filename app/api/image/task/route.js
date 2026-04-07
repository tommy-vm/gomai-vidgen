// app/api/image/task/route.js
// Step 2: 편집 작업 요청 → tid 반환, 백그라운드 처리
import { randomUUID } from "crypto";
import OpenAI from "openai";
import sharp from "sharp";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED_MODELS = ["gpt-image-1", "gpt-image-1.5"];
const STANDARD_SIZES = [
  { w: 1024, h: 1024, label: "1024x1024" },
  { w: 1536, h: 1024, label: "1536x1024" },
  { w: 1024, h: 1536, label: "1024x1536" },
];

// 인메모리 작업 저장소 (공유)
if (!globalThis.__taskStore) globalThis.__taskStore = new Map();

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
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const resizedW = Math.round(srcW * scale);
  const resizedH = Math.round(srcH * scale);

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

  return { buffer: padded, resizedW, resizedH, padTop: Math.floor((targetH - resizedH) / 2), padLeft: Math.floor((targetW - resizedW) / 2) };
}

async function cropPadding(outputBuffer, padInfo) {
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

async function processTask(tid, imageData, params) {
  const task = globalThis.__taskStore.get(tid);
  try {
    task.state = "processing";
    task.progress = 10;

    const inputBuffer = imageData.buffer;
    const meta = await sharp(inputBuffer).metadata();
    const targetSize = pickBestSize(meta.width, meta.height);

    task.progress = 20;

    const padInfo = await padToSize(inputBuffer, targetSize.w, targetSize.h);
    const paddedFile = new File([padInfo.buffer], "input.png", { type: "image/png" });

    task.progress = 30;

    console.log(`[task:${tid}] model: ${params.model}, input: ${meta.width}x${meta.height}, target: ${targetSize.label}`);

    const response = await openai.images.edit({
      model: params.model,
      image: paddedFile,
      prompt: params.prompt,
      quality: params.quality,
      input_fidelity: params.input_fidelity,
      size: targetSize.label,
    });

    task.progress = 80;

    const resultBase64 = response.data?.[0]?.b64_json;
    if (!resultBase64) throw new Error("OpenAI 응답에 이미지가 없습니다.");

    const resultBuffer = Buffer.from(resultBase64, "base64");
    const croppedBuffer = await cropPadding(resultBuffer, padInfo);

    task.progress = 100;
    task.state = "completed";
    task.resultBuffer = croppedBuffer;

    // 1시간 후 결과 자동 삭제
    setTimeout(() => globalThis.__taskStore.delete(tid), 3600000);
  } catch (error) {
    console.error(`[task:${tid}] error:`, error);
    task.state = "failed";
    task.error = error.message || "편집 실패";
  }
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization");
    const validToken = process.env.API_TOKEN;
    if (validToken && auth !== validToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { uid, prompt, model, quality, input_fidelity } = body;

    if (!uid || !prompt) {
      return Response.json({ error: "uid와 prompt는 필수입니다." }, { status: 400 });
    }

    const imageData = globalThis.__imageStore?.get(uid);
    if (!imageData) {
      return Response.json({ error: "uid에 해당하는 이미지가 없습니다." }, { status: 404 });
    }

    const tid = randomUUID();
    const params = {
      model: ALLOWED_MODELS.includes(model) ? model : "gpt-image-1.5",
      quality: quality || "high",
      input_fidelity: input_fidelity || "high",
      prompt,
    };

    globalThis.__taskStore.set(tid, {
      tid,
      uid,
      state: "queued",
      progress: 0,
      resultBuffer: null,
      error: null,
      createdAt: Date.now(),
    });

    // 백그라운드 처리 시작
    processTask(tid, imageData, params);

    return Response.json({ tid, uid });
  } catch (error) {
    console.error("Task create error:", error);
    return Response.json({ error: error.message || "작업 생성 실패" }, { status: 500 });
  }
}
