// app/api/tools/tools.js
// 신규 AI 편집 도구 → FAL 모델 매핑 (process / result 라우트 공용)
//
// 각 도구는 입력 타입(image/audio/video)에 맞는 FAL 모델 하나에 대응한다.
// process 라우트는 buildInput()으로 큐에 제출하고,
// result 라우트는 normalize()로 완료 결과를 공통 형태로 변환한다.

export const TOOLS = {
  // 배경 제거 / 컷아웃 — 자동 전체 (이미지)
  "remove-bg-image": {
    model: "fal-ai/birefnet/v2",
    accepts: ["image"],
    buildInput: ({ fileUrl }) => ({
      image_url: fileUrl,
      refine_foreground: true,
      output_format: "png",
    }),
    normalize: (data) => ({ kind: "image", url: data?.image?.url, transparent: true }),
  },

  // 배경 제거 / 컷아웃 — 자동 전체 (영상) — webm/vp9 알파(투명) 출력
  "remove-bg-video": {
    model: "veed/video-background-removal",
    accepts: ["video"],
    buildInput: ({ fileUrl }) => ({
      video_url: fileUrl,
      output_codec: "vp9",
      refine_foreground_edges: true,
      subject_is_person: true,
    }),
    normalize: (data) => ({ kind: "video", url: data?.video?.[0]?.url, transparent: true }),
  },

  // 컷아웃 — 대상 지정 (이미지) : 텍스트 / 클릭 포인트 / 박스 가이드 (SAM3) → 투명 PNG
  "cutout-image": {
    model: "fal-ai/sam-3/image",
    accepts: ["image"],
    buildInput: ({ fileUrl, prompt, options }) => {
      const input = {
        image_url: fileUrl,
        apply_mask: true,
        detection_threshold: options?.threshold ?? 0.3,
      };
      if (prompt) input.prompt = prompt;
      if (options?.points?.length) input.point_prompts = options.points;
      if (options?.box) input.box_prompts = [options.box];
      return input;
    },
    normalize: (data) => ({ kind: "image", url: data?.image?.url, transparent: true }),
  },

  // 배경 생성 / 교체 (이미지)
  "replace-bg": {
    model: "fal-ai/bria/background/replace",
    accepts: ["image"],
    buildInput: ({ fileUrl, prompt }) => ({
      image_url: fileUrl,
      prompt: prompt || "",
      refine_prompt: true,
      fast: true,
      num_images: 1,
    }),
    normalize: (data) => ({ kind: "image", url: data?.images?.[0]?.url, transparent: false }),
  },

  // 오디오 Denoise (음성 격리) — 영상/오디오 모두 입력 가능
  denoise: {
    model: "fal-ai/elevenlabs/audio-isolation",
    accepts: ["audio", "video"],
    buildInput: ({ fileUrl, fileKind }) =>
      fileKind === "video" ? { video_url: fileUrl } : { audio_url: fileUrl },
    normalize: (data) => ({ kind: "audio", url: data?.audio?.url }),
  },

  // 스마트 컷 — whisper 타임스탬프. 무음 기반은 word, 내용 기반은 segment 단위로 받음
  "smart-cut": {
    model: "fal-ai/whisper",
    accepts: ["audio", "video"],
    buildInput: ({ fileUrl, options }) => ({
      audio_url: fileUrl,
      task: "transcribe",
      chunk_level: options?.chunkLevel === "segment" ? "segment" : "word",
    }),
    normalize: (data) => ({
      kind: "transcript",
      text: data?.text || "",
      chunks: (data?.chunks || []).filter(
        (c) => Array.isArray(c?.timestamp) && c.timestamp.length === 2
      ),
    }),
  },
};

// 허용 모델 화이트리스트 (result 라우트 검증용)
export const ALLOWED_MODELS = Object.values(TOOLS).map((t) => t.model);

// 입력 타입별 사용 가능한 도구 키 목록
export function toolsForKind(kind) {
  return Object.entries(TOOLS)
    .filter(([, t]) => t.accepts.includes(kind))
    .map(([key]) => key);
}
