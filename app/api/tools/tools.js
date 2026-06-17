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

  // 배경 제거 / 컷아웃 — 자동 전체 (영상)
  // codec: vp9(webm, 투명) | h264(mp4, 비투명). 투명 여부는 출력 content_type 으로 판단
  "remove-bg-video": {
    model: "veed/video-background-removal",
    accepts: ["video"],
    buildInput: ({ fileUrl, options }) => ({
      video_url: fileUrl,
      output_codec: options?.codec === "h264" ? "h264" : "vp9",
      refine_foreground_edges: true,
      subject_is_person: true,
    }),
    normalize: (data) => {
      const v = data?.video?.[0];
      const isWebm = (v?.content_type || "").includes("webm");
      return { kind: "video", url: v?.url, transparent: isWebm, bgFilled: !isWebm };
    },
  },

  // 영상 생성 편집 — 빠른 적용 (프롬프트형, 마스크 불필요)
  "bernini-edit": {
    model: "fal-ai/bernini-r/edit-video",
    accepts: ["video"],
    buildInput: ({ fileUrl, prompt }) => ({ video_url: fileUrl, prompt: prompt || "" }),
    normalize: (data) => ({ kind: "video", url: data?.video?.url, transparent: false }),
  },

  // 영상 생성 편집 — 정밀 제어 (마스크형). mask_image_url 은 SAM3 마스크에서 생성
  "vace-edit": {
    model: "fal-ai/wan-vace-14b/inpainting",
    accepts: ["video"],
    buildInput: ({ fileUrl, prompt, options }) => {
      const input = { video_url: fileUrl, prompt: prompt || "" };
      if (options?.mask_url) input.mask_image_url = options.mask_url;
      if (options?.ref_urls?.length) input.ref_image_urls = options.ref_urls;
      return input;
    },
    normalize: (data) => ({ kind: "video", url: data?.video?.url, transparent: false }),
  },

  // 첫 프레임에서 마스크 추출 (SAM3) — vace-edit 의 mask_image_url 공급용
  "cutout-mask": {
    model: "fal-ai/sam-3/image",
    accepts: ["image"],
    buildInput: ({ fileUrl, prompt, options }) => {
      const input = {
        image_url: fileUrl,
        detection_threshold: options?.threshold ?? 0.3,
      };
      if (prompt) input.prompt = prompt;
      if (options?.points?.length) input.point_prompts = options.points;
      return input;
    },
    normalize: (data) => ({ kind: "mask", url: data?.masks?.[0]?.url }),
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
