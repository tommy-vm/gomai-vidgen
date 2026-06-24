"use client";

import { useState, useRef, useEffect, useMemo } from "react";

// 사용자 기능 목록. 항상 노출, 파일 타입(kind)이 accepts 에 없으면 비활성화.
const FEATURES = [
  {
    id: "bg-remove",
    label: "배경 제거 / 컷아웃",
    desc: "자동 전체 제거, 또는 대상을 지정해 컷아웃",
    accepts: ["image", "video"],
  },
  {
    id: "bg-replace",
    label: "배경 생성",
    desc: "프롬프트로 새 배경을 합성",
    accepts: ["image"],
  },
  {
    id: "denoise",
    label: "오디오 Denoise",
    desc: "배경 소음을 제거하고 음성만 추출",
    accepts: ["audio", "video"],
  },
  {
    id: "smart-cut",
    label: "스마트 컷",
    desc: "무음 기반 또는 내용(대사) 기반으로 컷",
    accepts: ["audio", "video"],
  },
  {
    id: "video-edit",
    label: "영상 생성 편집",
    desc: "배경 생성·오브젝트 추가/교체 (생성형)",
    accepts: ["video"],
  },
  {
    id: "bgm",
    label: "배경음악 (BGM)",
    desc: "화면 분위기에 맞는 저작권 프리 음악 생성",
    accepts: ["video"],
  },
  {
    id: "shortform",
    label: "숏폼 추천",
    desc: "긴 영상에서 하이라이트 클립 자동 추천",
    accepts: ["video"],
  },
];

const KIND_LABEL = { image: "이미지", video: "영상", audio: "오디오" };
const MAX_SIZE = 100 * 1024 * 1024;
const CHECKER =
  "repeating-conic-gradient(#2a2a3a 0% 25%, #1a1a28 0% 50%) 50% / 20px 20px";

// 곰 개발자 연동 가이드 — 기능별 FAL 모델 / 입력 / 출력 / 비고
const GUIDE = [
  {
    title: "배경 제거 / 컷아웃",
    items: [
      {
        mode: "자동 · 이미지",
        model: "fal-ai/birefnet/v2",
        input: "image_url",
        output: "image.url — PNG(투명)",
      },
      {
        mode: "자동 · 영상",
        model: "veed/video-background-removal",
        input: "video_url, output_codec:'vp9'(webm,투명) | 'h264'(mp4,비투명), refine_foreground_edges:true, subject_is_person:true",
        output: "video[0].url — vp9=webm(알파/투명), h264=mp4(배경 단색)",
      },
      {
        mode: "대상 지정 · 이미지",
        model: "fal-ai/sam-3/image",
        input:
          "image_url, apply_mask:true, detection_threshold:0.3, + prompt(영문 개념어) 또는 point_prompts:[{x,y,label}] / box_prompts:[{x_min,y_min,x_max,y_max}]",
        output: "image.url — PNG(투명)",
      },
    ],
    note: "영상 대상 지정은 SAM3 video가 mp4(검정 배경)·검출 불안정으로 미채택. 영상은 자동(veed)만 사용.",
  },
  {
    title: "배경 생성",
    items: [
      {
        mode: "이미지",
        model: "fal-ai/bria/background/replace",
        input: "image_url, prompt(새 배경 설명, 영문 권장)",
        output: "images[0].url",
      },
    ],
  },
  {
    title: "오디오 Denoise",
    items: [
      {
        mode: "영상 / 오디오",
        model: "fal-ai/elevenlabs/audio-isolation",
        input: "audio_url 또는 video_url",
        output: "audio.url — 음성만 분리",
      },
    ],
  },
  {
    title: "스마트 컷",
    items: [
      {
        mode: "무음 기반",
        model: "fal-ai/whisper (chunk_level:'word')",
        input: "audio_url",
        output:
          "chunks[].timestamp → 단어 간격 ≥ 임계값(기본 0.6s, padding 0.1s)을 무음으로 컷",
      },
      {
        mode: "내용 기반",
        model: "fal-ai/whisper (chunk_level:'segment') + LLM",
        input: "자막 세그먼트 + 자연어 지시문 → LLM이 지울 세그먼트 인덱스 반환",
        output: "선택 구간 → 컷 리스트",
      },
    ],
    note:
      "최종 출력은 컷 리스트 JSON: { unit:'seconds', keep:[[s,e],...], remove:[[s,e],...] }. 곰믹스가 이 좌표를 타임라인에 적용(영상 렌더링은 곰 측).",
  },
  {
    title: "영상 생성 편집 (배경 생성 / 오브젝트 추가·교체)",
    items: [
      {
        mode: "빠른 적용 · 프롬프트형",
        model: "fal-ai/bernini-r/edit-video",
        input: "video_url, prompt(영문 권장: 배경/객체/날씨/카메라각 변경 지시)",
        output: "video.url — mp4 ($0.08/s @848px)",
      },
      {
        mode: "정밀 제어 · 마스크형",
        model: "fal-ai/wan-vace-14b/inpainting (+ fal-ai/sam-3/image 마스크)",
        input:
          "1) 첫 프레임 추출(클라 canvas) → 2) SAM3로 대상 마스크 생성 → 3) video_url + mask_image_url + prompt",
        output: "video.url — mp4 (마스크 영역만 재생성, 수 분 소요)",
      },
    ],
    note:
      "생성형(diffusion) 편집이라 원본 픽셀이 그대로 보존되지 않음(인물 디테일 미세 변화 가능). 초당 과금·처리시간 김. VACE는 출력 프레임 수가 고정이라 길이가 원본과 다를 수 있음.",
  },
  {
    title: "배경음악 (BGM) — 화면 분위기 매칭, 저작권 프리",
    items: [
      {
        mode: "라이브러리 · 추천",
        model: "OpenAI vision + Jamendo API",
        input:
          "1) 프레임 샘플 → 2) /api/tools/music-prompt 로 무드 태그 → 3) /api/tools/music-library?tags= 로 Jamendo 검색(instrumental)",
        output: "tracks:[{title,artist,url,license,commercial_safe}] — CC 음악 후보. 끊김 없는 전문 트랙",
      },
      {
        mode: "AI 생성 · 트랙",
        model: "OpenAI vision + cassetteai/music-generator",
        input:
          "1) 프레임 샘플 → 2) music-prompt 로 음악 브리프 → 3) prompt + duration(10~180s)",
        output: "audio_file.url — WAV 음악 트랙 (작곡 퀄리티 편차 가능)",
      },
      {
        mode: "영상에 믹스",
        model: "위 음악 트랙 + ffmpeg.wasm (브라우저 합성)",
        input:
          "원본 영상 + 음악 → amix(원본 음성 유지, 음악 volume↓), -c:v copy(영상 스트림 복사)",
        output: "mp4 — 원본 음성 위에 BGM, 회전·화질 보존",
      },
    ],
    note:
      "라이브러리(Jamendo)는 JAMENDO_CLIENT_ID 필요(무료). CC 라이선스라 상업적 사용은 CC BY/CC0 위주 + 저작자 표시 필요(응답의 license/attribution 노출). '영상에 믹스'는 서버 모델이 아니라 브라우저 ffmpeg.wasm 합성(원본 음성+회전 보존) → 곰 앱은 네이티브 ffmpeg(c:v copy, amix)로 동일 구현 권장.",
  },
  {
    title: "숏폼 추천 (하이라이트 클립)",
    items: [
      {
        mode: "구간 추천",
        model: "fal-ai/whisper(segment) + LLM",
        input:
          "1) whisper로 문장 단위 자막+타임스탬프 → 2) /api/tools/shortform 에 segments+개수+최대길이 전달",
        output: "clips:[{start,end,title,caption}] — 추천 클립 리스트",
      },
    ],
    note:
      "영상을 자르지 않고 추천 구간(초)+제목+자막만 반환. 곰믹스가 좌표로 클립 컷 → 세로 크롭·자막 번인은 곰 측 타임라인에서 처리. (스마트컷 내용기반과 같은 whisper+LLM 엔진)",
  },
];

function detectKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function fmtTime(s) {
  if (!isFinite(s)) return "0:00.0";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

function mergeRanges(ranges) {
  const sorted = [...ranges].filter(Boolean).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    if (out.length && a <= out[out.length - 1][1]) {
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    } else {
      out.push([a, b]);
    }
  }
  return out;
}

// remove 구간 → {total, remove, keep, removed, final}
function cutsFromRemove(removeRanges, total) {
  const remove = mergeRanges(removeRanges).map(([a, b]) => [
    Math.max(0, a),
    Math.min(total, b),
  ]);
  const keep = [];
  let cursor = 0;
  for (const [a, b] of remove) {
    if (a > cursor) keep.push([cursor, a]);
    cursor = b;
  }
  if (cursor < total) keep.push([cursor, total]);
  const removed = remove.reduce((s, [a, b]) => s + (b - a), 0);
  return { total, remove, keep, removed, final: total - removed };
}

// 무음 기반: 단어 청크 사이 간격으로 무음 구간 계산
function silenceCuts(chunks, minSilence, padding) {
  if (!chunks?.length) return null;
  const total = chunks[chunks.length - 1].timestamp[1];
  const remove = [];
  if (chunks[0].timestamp[0] > minSilence) {
    remove.push([0, Math.max(0, chunks[0].timestamp[0] - padding)]);
  }
  for (let i = 0; i < chunks.length - 1; i++) {
    const end = chunks[i].timestamp[1];
    const next = chunks[i + 1].timestamp[0];
    if (next - end >= minSilence) {
      const a = end + padding;
      const b = next - padding;
      if (b > a) remove.push([a, b]);
    }
  }
  return cutsFromRemove(remove, total);
}

export default function AiEditPanel() {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [kind, setKind] = useState(null);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("idle"); // idle|uploading|processing|polling|completed|error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // 가이드 상태
  const [cutoutMode, setCutoutMode] = useState("auto"); // auto | target
  const [cutoutText, setCutoutText] = useState("");
  const [points, setPoints] = useState([]); // {x,y,label} 자연좌표
  const [pointLabel, setPointLabel] = useState(1); // 1=남길곳, 0=뺄곳
  const [imgDims, setImgDims] = useState(null);
  const [bgPrompt, setBgPrompt] = useState("");
  const [cutMode, setCutMode] = useState("silence"); // silence | content
  const [cutInstruction, setCutInstruction] = useState("");
  const [videoCodec, setVideoCodec] = useState("vp9"); // vp9(webm,투명) | h264(mp4)
  const [veditMode, setVeditMode] = useState("fast"); // fast(프롬프트) | precise(마스크)
  const [veditPrompt, setVeditPrompt] = useState("");
  const [veditRegion, setVeditRegion] = useState("");
  const [procNote, setProcNote] = useState("");
  const [bgmSource, setBgmSource] = useState("library"); // library(Jamendo) | generate(CassetteAI)
  const [bgmMode, setBgmMode] = useState("track"); // track(음악 트랙) | video(영상에 믹스)
  const [bgmPrompt, setBgmPrompt] = useState("");
  const [usedPrompt, setUsedPrompt] = useState(""); // 실제 사용된(분석된) 음악 프롬프트
  const [sfCount, setSfCount] = useState(3); // 숏폼 추천 개수
  const [sfMaxLen, setSfMaxLen] = useState(60); // 숏폼 클립 최대 길이(초)

  // 결과 보조 상태
  const [minSilence, setMinSilence] = useState(0.6);
  const [padding, setPadding] = useState(0.1);
  const [runMode, setRunMode] = useState("silence"); // 완료된 smart-cut 의 모드
  const [aiRemove, setAiRemove] = useState(null); // 내용컷: 지울 세그먼트 인덱스
  const [aiLoading, setAiLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const inputRef = useRef(null);
  const pollingRef = useRef(null);
  const runCfgRef = useRef({});
  const ffmpegRef = useRef(null);

  useEffect(() => () => pollingRef.current && clearInterval(pollingRef.current), []);

  const isBusy = ["uploading", "processing", "polling"].includes(status);
  const feature = FEATURES.find((f) => f.id === selected) || null;

  const resetResult = () => {
    setResult(null);
    setStatus("idle");
    setErrorMsg("");
    setAiRemove(null);
  };

  const resetGuidance = () => {
    setCutoutMode("auto");
    setCutoutText("");
    setPoints([]);
    setBgPrompt("");
    setCutMode("silence");
    setCutInstruction("");
    setVideoCodec("vp9");
    setVeditMode("fast");
    setVeditPrompt("");
    setVeditRegion("");
    setProcNote("");
    setBgmSource("library");
    setBgmMode("track");
    setBgmPrompt("");
    setUsedPrompt("");
    setSfCount(3);
    setSfMaxLen(60);
  };

  const acceptFile = (f) => {
    if (!f) return;
    const k = detectKind(f);
    if (!k) return setErrorMsg("이미지 / 영상 / 오디오 파일만 업로드할 수 있습니다.");
    if (f.size > MAX_SIZE) return setErrorMsg("파일 크기는 100MB 이하여야 합니다.");
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setKind(k);
    setImgDims(null);
    setSelected((prev) => {
      const feat = FEATURES.find((x) => x.id === prev);
      return feat && feat.accepts.includes(k) ? prev : null;
    });
    resetGuidance();
    resetResult();
  };

  const handleSelect = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    acceptFile(f);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const onImgClick = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * el.naturalWidth);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * el.naturalHeight);
    setPoints((p) => [...p, { x, y, label: pointLabel }]);
  };

  const selectCutsAI = async (chunks, instruction) => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/tools/select-cuts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: chunks.map((c) => ({ text: c.text })),
          instruction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiRemove(data.remove || []);
    } catch (err) {
      setErrorMsg(err.message || "AI 구간 선택 실패");
      setAiRemove([]);
    } finally {
      setAiLoading(false);
    }
  };

  const poll = (request_id, model, toolKey) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/tools/result?request_id=${request_id}&model=${encodeURIComponent(
            model
          )}&tool=${toolKey}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.status === "completed") {
          clearInterval(pollingRef.current);
          setResult(data.result);
          setStatus("completed");
          const cfg = runCfgRef.current;
          if (data.result?.kind === "transcript" && cfg.cutMode === "content") {
            selectCutsAI(data.result.chunks, cfg.instruction);
          }
        }
      } catch (err) {
        clearInterval(pollingRef.current);
        setErrorMsg(err.message || "처리 중 오류가 발생했습니다.");
        setStatus("error");
      }
    }, 2000);
  };

  // --- 영상 생성 편집 (체이닝) 헬퍼 ---
  const uploadFile = async (f) => {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.url;
  };

  const pollResultPromise = (request_id, model, toolKey) =>
    new Promise((resolve, reject) => {
      const iv = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/tools/result?request_id=${request_id}&model=${encodeURIComponent(
              model
            )}&tool=${toolKey}`
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (data.status === "completed") {
            clearInterval(iv);
            resolve(data.result);
          }
        } catch (e) {
          clearInterval(iv);
          reject(e);
        }
      }, 2000);
      pollingRef.current = iv;
    });

  const submitAndWait = async (toolKey, file_url, { prompt, options, file_kind } = {}) => {
    const res = await fetch("/api/tools/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: toolKey,
        file_url,
        file_kind: file_kind || "video",
        prompt: prompt || "",
        options,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return pollResultPromise(data.request_id, data.model, toolKey);
  };

  // 영상 첫 프레임을 PNG로 추출 (브라우저 canvas)
  const extractFirstFrame = (f) =>
    new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.src = URL.createObjectURL(f);
      v.onloadeddata = () => {
        v.currentTime = Math.min(0.1, v.duration || 0.1);
      };
      v.onseeked = () => {
        try {
          const c = document.createElement("canvas");
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          c.getContext("2d").drawImage(v, 0, 0);
          c.toBlob((b) => {
            URL.revokeObjectURL(v.src);
            b
              ? resolve(new File([b], "frame.png", { type: "image/png" }))
              : reject(new Error("프레임 추출 실패"));
          }, "image/png");
        } catch (e) {
          reject(e);
        }
      };
      v.onerror = () => reject(new Error("영상 로드 실패"));
    });

  const handleVideoEdit = async () => {
    const prompt = veditPrompt.trim();
    if (!prompt) return setErrorMsg("편집 프롬프트를 입력하세요.");
    if (veditMode === "precise" && !veditRegion.trim()) {
      return setErrorMsg("정밀 제어는 대상(마스크) 텍스트가 필요합니다 (한글 가능, 예: 사람).");
    }
    setErrorMsg("");
    setResult(null);
    setAiRemove(null);
    setRunMode("none");
    try {
      setStatus("uploading");
      setProcNote("영상 업로드 중…");
      const videoUrl = await uploadFile(file);

      if (veditMode === "fast") {
        setStatus("polling");
        setProcNote("생성형 편집 중… (수십 초~수 분)");
        const r = await submitAndWait("bernini-edit", videoUrl, { prompt });
        setResult(r);
      } else {
        setStatus("polling");
        setProcNote("첫 프레임에서 대상 마스크 추출 중…");
        const frame = await extractFirstFrame(file);
        const frameUrl = await uploadFile(frame);
        const mask = await submitAndWait("cutout-mask", frameUrl, {
          prompt: veditRegion.trim(),
          file_kind: "image",
        });
        if (!mask?.url) throw new Error("마스크 생성 실패 — 대상어를 바꿔보세요.");
        setProcNote("마스크 영역 생성형 편집 중… (수 분 소요)");
        const r = await submitAndWait("vace-edit", videoUrl, {
          prompt,
          options: { mask_url: mask.url },
        });
        setResult(r);
      }
      setProcNote("");
      setStatus("completed");
    } catch (err) {
      setProcNote("");
      setErrorMsg(err.message || "오류가 발생했습니다.");
      setStatus("error");
    }
  };

  // 영상에서 여러 프레임을 dataURL 로 샘플 + 길이(초) 반환
  const sampleFrames = (f, count = 3) =>
    new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.src = URL.createObjectURL(f);
      v.onloadedmetadata = async () => {
        const dur = v.duration || 1;
        const times = Array.from({ length: count }, (_, i) =>
          Math.min(dur - 0.05, (dur * (i + 0.5)) / count)
        );
        const frames = [];
        const c = document.createElement("canvas");
        const grab = (t) =>
          new Promise((res) => {
            const onSeek = () => {
              c.width = Math.min(v.videoWidth, 512);
              c.height = Math.round((c.width / v.videoWidth) * v.videoHeight);
              c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
              frames.push(c.toDataURL("image/jpeg", 0.7));
              v.removeEventListener("seeked", onSeek);
              res();
            };
            v.addEventListener("seeked", onSeek);
            v.currentTime = t;
          });
        try {
          for (const t of times) await grab(t);
          URL.revokeObjectURL(v.src);
          resolve({ frames, duration: dur });
        } catch (e) {
          reject(e);
        }
      };
      v.onerror = () => reject(new Error("영상 로드 실패"));
    });

  // ffmpeg.wasm 지연 로드 (단일 스레드 코어 — COOP/COEP 불필요)
  const loadFfmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const [{ FFmpeg }, { toBlobURL, fetchFile }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util"),
    ]);
    const ff = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = { ff, fetchFile };
    return ffmpegRef.current;
  };

  // 원본 영상 위에 음악을 깔아 믹스. 영상 스트림은 copy(회전·화질 보존),
  // 원본 음성이 있으면 그 아래에 음악을 낮춰서 합성. 결과 mp4 objectURL 반환.
  const muxMusicUnderVideo = async (videoFile, musicUrl) => {
    const { ff, fetchFile } = await loadFfmpeg();
    await ff.writeFile("in.mp4", await fetchFile(videoFile));
    // 음악은 프록시 경유로 받아 CORS 회피
    await ff.writeFile(
      "music.wav",
      await fetchFile(`/api/tools/proxy?url=${encodeURIComponent(musicUrl)}`)
    );

    // 원본 음성 + 음악(볼륨↓) 믹스. 원본 음성은 normalize=0 으로 그대로 유지.
    const mixArgs = [
      "-i", "in.mp4",
      "-i", "music.wav",
      "-filter_complex",
      "[1:a]volume=0.35[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]",
      "-map", "0:v", "-map", "[a]",
      "-c:v", "copy", "-shortest", "out.mp4",
    ];
    let code = await ff.exec(mixArgs);

    // 원본에 오디오 트랙이 없으면 위 필터 실패 → 음악만 입히기로 폴백
    if (code !== 0) {
      const musicOnly = [
        "-i", "in.mp4",
        "-i", "music.wav",
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-shortest", "out.mp4",
      ];
      code = await ff.exec(musicOnly);
      if (code !== 0) throw new Error("영상 믹스 실패 (ffmpeg)");
    }

    const data = await ff.readFile("out.mp4");
    return URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }));
  };

  const handleBgm = async () => {
    setErrorMsg("");
    setResult(null);
    setAiRemove(null);
    setRunMode("none");
    setUsedPrompt("");
    try {
      setStatus("polling");
      setProcNote("화면 분석 중…");
      const { frames, duration } = await sampleFrames(file, 3);

      // 화면 분석 → 음악 프롬프트 + 검색 태그 (프롬프트 직접 입력 시 그걸 우선)
      const manual = bgmPrompt.trim();
      let prompt = manual;
      let tags = "";
      const res = await fetch("/api/tools/music-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!prompt) prompt = data.prompt;
      tags = data.tags || "";

      if (bgmSource === "library") {
        // 라이선스 프리 라이브러리(Jamendo)에서 분위기 매칭 트랙 검색
        setUsedPrompt(tags);
        setProcNote("라이브러리 검색 중… (Jamendo)");
        const lib = await fetch(
          `/api/tools/music-library?tags=${encodeURIComponent(tags)}&limit=6`
        );
        const ld = await lib.json();
        if (!lib.ok) throw new Error(ld.error);
        if (!ld.tracks?.length) throw new Error("매칭되는 트랙을 찾지 못했습니다. 다른 분위기로 시도해보세요.");
        setResult({ kind: "music-list", tracks: ld.tracks });
        setProcNote("");
        setStatus("completed");
        return;
      }

      // AI 생성 (CassetteAI)
      setUsedPrompt(prompt);
      const secs = Math.max(1, Math.round(duration));
      setProcNote("음악 트랙 생성 중… (CassetteAI)");
      const music = await submitAndWait("bgm-music", "", {
        prompt,
        options: { duration: Math.max(10, Math.min(secs, 180)) },
      });
      if (!music?.url) throw new Error("음악 생성 실패");

      if (bgmMode === "track") {
        setResult(music);
      } else {
        setProcNote("영상에 배경음악 믹스 중… (최초 1회 로딩 다소 소요)");
        const outUrl = await muxMusicUnderVideo(file, music.url);
        setResult({ kind: "video", url: outUrl, transparent: false, blob: true });
      }
      setProcNote("");
      setStatus("completed");
    } catch (err) {
      setProcNote("");
      setErrorMsg(err.message || "BGM 처리 실패");
      setStatus("error");
    }
  };

  // 라이브러리에서 고른 트랙을 사용 (트랙만 / 영상에 믹스)
  const useLibraryTrack = async (track) => {
    setErrorMsg("");
    if (bgmMode === "track") {
      setResult({
        kind: "audio",
        url: track.url,
        attribution: track.attribution,
        license: track.license_url,
        commercial: track.commercial_safe,
      });
      return;
    }
    try {
      setStatus("polling");
      setProcNote("영상에 배경음악 믹스 중… (최초 1회 로딩 다소 소요)");
      const outUrl = await muxMusicUnderVideo(file, track.url);
      setResult({
        kind: "video",
        url: outUrl,
        transparent: false,
        blob: true,
        attribution: track.attribution,
        license: track.license_url,
        commercial: track.commercial_safe,
      });
      setProcNote("");
      setStatus("completed");
    } catch (err) {
      setProcNote("");
      setErrorMsg(err.message || "영상 믹스 실패");
      setStatus("error");
    }
  };

  const handleShortform = async () => {
    setErrorMsg("");
    setResult(null);
    setAiRemove(null);
    setRunMode("none");
    try {
      setStatus("uploading");
      setProcNote("영상 업로드 중…");
      const videoUrl = await uploadFile(file);

      setStatus("polling");
      setProcNote("음성 인식 중… (whisper)");
      const tr = await submitAndWait("smart-cut", videoUrl, {
        options: { chunkLevel: "segment" },
      });
      const segments = (tr?.chunks || []).map((c) => ({
        start: c.timestamp[0],
        end: c.timestamp[1],
        text: c.text,
      }));
      if (!segments.length) throw new Error("자막을 추출하지 못했습니다 (음성이 없는 영상일 수 있음).");

      setProcNote("하이라이트 클립 선별 중…");
      const res = await fetch("/api/tools/shortform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments, target_count: sfCount, max_len: sfMaxLen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResult({ kind: "shortform", clips: data.clips || [], source: file?.name });
      setProcNote("");
      setStatus("completed");
    } catch (err) {
      setProcNote("");
      setErrorMsg(err.message || "숏폼 추천 실패");
      setStatus("error");
    }
  };

  const handleRun = async () => {
    if (!file || !feature) return;
    if (feature.id === "video-edit") return handleVideoEdit();
    if (feature.id === "bgm") return handleBgm();
    if (feature.id === "shortform") return handleShortform();
    let toolKey;
    let prompt = "";
    let options;

    if (feature.id === "bg-remove") {
      // 영상은 자동(전체) 전용, 타깃 컷아웃은 이미지에서만
      if (kind === "video" || cutoutMode === "auto") {
        toolKey = kind === "video" ? "remove-bg-video" : "remove-bg-image";
        if (kind === "video") options = { codec: videoCodec };
      } else {
        toolKey = "cutout-image";
        prompt = cutoutText.trim();
        if (points.length) options = { points };
        if (!prompt && !options?.points?.length) {
          return setErrorMsg("남길 대상을 텍스트로 입력하거나 이미지를 클릭해 지정하세요.");
        }
      }
    } else if (feature.id === "bg-replace") {
      toolKey = "replace-bg";
      prompt = bgPrompt.trim();
      if (!prompt) return setErrorMsg("배경 생성에는 프롬프트가 필요합니다.");
    } else if (feature.id === "denoise") {
      toolKey = "denoise";
    } else if (feature.id === "smart-cut") {
      toolKey = "smart-cut";
      options = { chunkLevel: cutMode === "content" ? "segment" : "word" };
      if (cutMode === "content" && !cutInstruction.trim()) {
        return setErrorMsg("내용 기반 컷은 지시문이 필요합니다 (예: 인사말 부분 빼줘).");
      }
    }

    runCfgRef.current = { cutMode, instruction: cutInstruction.trim() };
    setRunMode(cutMode);
    setErrorMsg("");
    setResult(null);
    setAiRemove(null);

    try {
      setStatus("uploading");
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error);

      setStatus("processing");
      const procRes = await fetch("/api/tools/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: toolKey,
          file_url: upData.url,
          file_kind: kind,
          prompt,
          options,
        }),
      });
      const procData = await procRes.json();
      if (!procRes.ok) throw new Error(procData.error);

      setStatus("polling");
      poll(procData.request_id, procData.model, toolKey);
    } catch (err) {
      setErrorMsg(err.message || "오류가 발생했습니다.");
      setStatus("error");
    }
  };

  // 결과 컷 계산 (smart-cut)
  const cuts = useMemo(() => {
    if (result?.kind !== "transcript") return null;
    if (runMode === "content") {
      if (!aiRemove) return null;
      const total = result.chunks[result.chunks.length - 1].timestamp[1];
      const ranges = aiRemove
        .map((i) => result.chunks[i]?.timestamp)
        .filter(Boolean);
      return cutsFromRemove(ranges, total);
    }
    return silenceCuts(result.chunks, minSilence, padding);
  }, [result, runMode, aiRemove, minSilence, padding]);

  const downloadEDL = () => {
    if (!cuts) return;
    const payload = {
      source: file?.name,
      unit: "seconds",
      mode: runMode,
      original_duration: cuts.total,
      final_duration: cuts.final,
      keep: cuts.keep,
      remove: cuts.remove,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name || "smart-cut"}.cuts.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const statusLabel = {
    uploading: "업로드 중…",
    processing: "요청 제출 중…",
    polling: "처리 중…",
  }[status];

  const showCutoutCanvas =
    feature?.id === "bg-remove" && cutoutMode === "target" && kind === "image";

  return (
    <main className="px-6 py-6" style={{ height: "calc(100vh - 57px)", overflowY: "auto" }}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-1">AI Edit</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            파일을 올리면 포맷에 맞는 기능이 활성화됩니다
          </p>
          <button
            onClick={() => setShowGuide((v) => !v)}
            className="mt-3 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: showGuide ? "var(--accent)" : "var(--bg-hover)",
              color: showGuide ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            📖 곰 연동 개발 가이드 {showGuide ? "닫기" : "열기"}
          </button>
        </div>

        {/* 개발자 연동 가이드 */}
        {showGuide && (
          <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-1">곰 연동 개발 가이드</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
              모든 호출은 FAL Queue 비동기 패턴 권장: <code>submit → status(polling) → result</code>. 입력 파일은 먼저 FAL 스토리지(또는 공개 URL)로 올린 뒤 URL을 전달합니다.
              <br />
              <b>프롬프트 한글 지원:</b> 영문만 인식하는 모델(SAM3·bria·bernini·VACE·CassetteAI)은 <code>/api/tools/process</code>에서 한글 감지 시 OpenAI로 영어 자동 번역 후 전달합니다. 사용자/곰 앱은 한글로 입력해도 됩니다.
            </p>
            <div className="space-y-4">
              {GUIDE.map((g) => (
                <div key={g.title} className="rounded-xl p-4" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                  <div className="text-sm font-medium mb-2">{g.title}</div>
                  <div className="space-y-3">
                    {g.items.map((it, i) => (
                      <div key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        <div className="mb-1">
                          <span className="px-1.5 py-0.5 rounded mr-2" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
                            {it.mode}
                          </span>
                          <code style={{ color: "var(--accent)" }}>{it.model}</code>
                        </div>
                        <div><span style={{ color: "var(--text-primary)" }}>입력</span> · {it.input}</div>
                        <div><span style={{ color: "var(--text-primary)" }}>출력</span> · {it.output}</div>
                      </div>
                    ))}
                  </div>
                  {g.note && (
                    <p className="text-[11px] mt-3 pt-3" style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border)" }}>
                      ⚠ {g.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 1. 업로드 */}
        <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-3">1. 파일 업로드</h2>
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center text-center p-8"
            style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}
          >
            {!file ? (
              <>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  이미지 · 영상 · 오디오 파일을 드래그하거나 클릭
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>최대 100MB</p>
              </>
            ) : (
              <div className="w-full">
                <p className="text-sm mb-3" style={{ color: "var(--text-primary)" }}>
                  {file.name}{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    ({KIND_LABEL[kind]} · {(file.size / 1024 / 1024).toFixed(1)}MB)
                  </span>
                </p>
                {kind === "image" && <img src={fileUrl} alt="" className="max-h-56 mx-auto rounded-lg" />}
                {kind === "video" && <video src={fileUrl} controls className="max-h-56 mx-auto rounded-lg" />}
                {kind === "audio" && <audio src={fileUrl} controls className="w-full mt-2" />}
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/*,video/*,audio/*" onChange={handleSelect} className="hidden" />
          </div>
        </section>

        {/* 2. 기능 선택 */}
        <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-3">2. 기능 선택</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map((feat) => {
              const enabled = !!file && feat.accepts.includes(kind);
              const active = selected === feat.id;
              return (
                <button
                  key={feat.id}
                  disabled={!enabled}
                  onClick={() => {
                    if (!enabled) return;
                    setSelected(feat.id);
                    resetResult();
                  }}
                  className="text-left rounded-xl p-4 transition-all"
                  style={{
                    background: active ? "var(--accent-glow)" : "var(--bg-hover)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    opacity: enabled ? 1 : 0.4,
                    cursor: enabled ? "pointer" : "not-allowed",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{feat.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                      {feat.accepts.map((k) => KIND_LABEL[k]).join("·")}
                    </span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{feat.desc}</div>
                </button>
              );
            })}
          </div>
          {!file && (
            <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
              먼저 파일을 업로드하면 사용 가능한 기능이 활성화됩니다.
            </p>
          )}
        </section>

        {/* 3. 가이드 / 옵션 */}
        {feature && file && (
          <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-3">3. 가이드</h2>

            {/* 배경 제거 / 컷아웃 */}
            {feature.id === "bg-remove" && (
              <div className="space-y-4">
                {kind === "video" ? (
                  <div className="space-y-2">
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      영상은 전체 배경 제거만 지원합니다(대상 지정은 이미지 전용). 출력 형식 선택:
                    </p>
                    <div className="flex gap-2">
                      {[
                        ["vp9", "투명 webm"],
                        ["h264", "mp4 (비투명)"],
                      ].map(([v, label]) => (
                        <button
                          key={v}
                          onClick={() => setVideoCodec(v)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: videoCodec === v ? "var(--accent)" : "var(--bg-hover)",
                            color: videoCodec === v ? "#fff" : "var(--text-secondary)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      mp4는 투명을 지원하지 않아 제거된 배경이 단색으로 채워집니다. 다른 배경에 합성하려면 투명 webm을 쓰세요.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {[
                      ["auto", "자동 (전체 배경)"],
                      ["target", "대상 지정"],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setCutoutMode(v)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: cutoutMode === v ? "var(--accent)" : "var(--bg-hover)",
                          color: cutoutMode === v ? "#fff" : "var(--text-secondary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {kind === "image" && cutoutMode === "target" && (
                  <>
                    <input
                      value={cutoutText}
                      onChange={(e) => setCutoutText(e.target.value)}
                      placeholder={
                        kind === "video"
                          ? "남길 대상 (한글 가능, 예: 사람 / person, 강아지, 자동차)"
                          : "남길 대상 텍스트 (한글 가능, 예: 사람) — 또는 아래 이미지 클릭"
                      }
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    />

                    {showCutoutCanvas && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>클릭 지정:</span>
                          {[
                            [1, "남길 곳"],
                            [0, "뺄 곳"],
                          ].map(([v, label]) => (
                            <button
                              key={v}
                              onClick={() => setPointLabel(v)}
                              className="px-2 py-1 rounded text-[11px]"
                              style={{
                                background: pointLabel === v ? "var(--accent)" : "var(--bg-hover)",
                                color: pointLabel === v ? "#fff" : "var(--text-secondary)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                          <button
                            onClick={() => setPoints([])}
                            className="px-2 py-1 rounded text-[11px] ml-auto"
                            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                          >
                            지우기 ({points.length})
                          </button>
                        </div>
                        <div className="relative inline-block w-full">
                          <img
                            src={fileUrl}
                            alt=""
                            onLoad={(e) => setImgDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                            onClick={onImgClick}
                            className="w-full rounded-lg cursor-crosshair select-none"
                            style={{ display: "block" }}
                          />
                          {imgDims &&
                            points.map((pt, i) => (
                              <span
                                key={i}
                                className="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-white"
                                style={{
                                  left: `${(pt.x / imgDims.w) * 100}%`,
                                  top: `${(pt.y / imgDims.h) * 100}%`,
                                  background: pt.label === 1 ? "#22c55e" : "#ef4444",
                                }}
                              />
                            ))}
                        </div>
                        <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                          녹색=남길 곳, 빨강=뺄 곳. 텍스트와 클릭은 함께 쓸 수 있습니다.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 배경 생성 */}
            {feature.id === "bg-replace" && (
              <input
                value={bgPrompt}
                onChange={(e) => setBgPrompt(e.target.value)}
                placeholder="새 배경 설명 (한글 가능, 예: 노을 지는 해변)"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            )}

            {/* Denoise */}
            {feature.id === "denoise" && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                추가 설정 없이 배경 소음을 제거하고 음성만 추출합니다.
              </p>
            )}

            {/* 스마트 컷 */}
            {feature.id === "smart-cut" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {[
                    ["silence", "무음 기반"],
                    ["content", "내용 기반"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setCutMode(v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: cutMode === v ? "var(--accent)" : "var(--bg-hover)",
                        color: cutMode === v ? "#fff" : "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {cutMode === "content" ? (
                  <input
                    value={cutInstruction}
                    onChange={(e) => setCutInstruction(e.target.value)}
                    placeholder="지울 내용을 자연어로 (예: 인사말과 가격 얘기 부분 빼줘)"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                ) : (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    대사 사이 무음 구간을 자동 탐지합니다. 임계값은 결과에서 조절할 수 있습니다.
                  </p>
                )}
              </div>
            )}

            {/* 영상 생성 편집 */}
            {feature.id === "video-edit" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {[
                    ["fast", "빠른 적용 (프롬프트)"],
                    ["precise", "정밀 제어 (마스크)"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setVeditMode(v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: veditMode === v ? "var(--accent)" : "var(--bg-hover)",
                        color: veditMode === v ? "#fff" : "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {veditMode === "precise" && (
                  <input
                    value={veditRegion}
                    onChange={(e) => setVeditRegion(e.target.value)}
                    placeholder="편집할 대상 (한글 가능, 예: 사람, 자동차) · 첫 프레임에서 마스크 자동 추출"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                )}
                <input
                  value={veditPrompt}
                  onChange={(e) => setVeditPrompt(e.target.value)}
                  placeholder={
                    veditMode === "fast"
                      ? "편집 지시 (한글 가능, 예: 배경을 노을 해변으로 바꿔줘 / 강아지 추가)"
                      : "대상 영역을 무엇으로 바꿀지 (한글 가능, 예: 빨간 스포츠카로 교체)"
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {veditMode === "fast"
                    ? "프롬프트형(bernini-r): 마스크 없이 전체 장면을 재편집. 빠르고 저렴하나 의도 외 영역도 바뀔 수 있음."
                    : "마스크형(Wan VACE + SAM): 첫 프레임에서 대상 마스크를 뽑아 그 영역만 정밀 편집. 단계가 많아 수 분 소요."}
                  {" "}생성형이라 원본 픽셀이 그대로 보존되지 않고, 초당 과금됩니다.
                </p>
              </div>
            )}

            {/* 배경음악 (BGM) */}
            {feature.id === "bgm" && (
              <div className="space-y-4">
                {/* 소스: 라이브러리(추천) vs AI 생성 */}
                <div className="flex gap-2">
                  {[
                    ["library", "라이브러리 (추천)"],
                    ["generate", "AI 생성"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setBgmSource(v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: bgmSource === v ? "var(--accent)" : "var(--bg-hover)",
                        color: bgmSource === v ? "#fff" : "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* 출력: 음악 트랙만 vs 영상에 믹스 */}
                <div className="flex gap-2">
                  {[
                    ["track", "음악 트랙만"],
                    ["video", "영상에 믹스"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setBgmMode(v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: bgmMode === v ? "var(--accent)" : "var(--bg-hover)",
                        color: bgmMode === v ? "#fff" : "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {bgmSource === "generate" && (
                  <input
                    value={bgmPrompt}
                    onChange={(e) => setBgmPrompt(e.target.value)}
                    placeholder="분위기 직접 지정 (한글 가능, 비우면 화면 분석 자동, 예: 신나는 로파이 힙합)"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                )}

                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {bgmSource === "library"
                    ? "화면을 분석해 분위기에 맞는 라이선스 프리(CC) 음악을 Jamendo에서 찾아 후보를 보여줍니다. 전문 제작 트랙이라 끊김이 없습니다. 상업적 이용은 CC BY/CC0 위주(저작자 표시 필요)."
                    : "화면 분석(또는 입력)으로 음악을 AI 생성(CassetteAI)합니다. 저작권 프리지만 작곡 퀄리티 편차가 있을 수 있습니다."}
                  {bgmMode === "video" ? " · 선택한 곡을 원본 음성 위에 믹스해 mp4로 반환(회전·음성 보존)." : " · 음악 트랙만 반환(곰믹스 타임라인 합성용)."}
                </p>
              </div>
            )}

            {/* 숏폼 추천 */}
            {feature.id === "shortform" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    추천 클립 수: {sfCount}개
                    <input type="range" min="1" max="10" step="1" value={sfCount}
                      onChange={(e) => setSfCount(parseInt(e.target.value))} className="w-full mt-1" />
                  </label>
                  <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    클립 최대 길이: {sfMaxLen}초
                    <input type="range" min="15" max="90" step="5" value={sfMaxLen}
                      onChange={(e) => setSfMaxLen(parseInt(e.target.value))} className="w-full mt-1" />
                  </label>
                </div>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  음성을 인식해 하이라이트 구간을 추천합니다. 결과는 구간(초)+제목+자막 리스트로,
                  곰믹스가 그 좌표로 클립을 잘라 숏폼을 만듭니다(세로 크롭·자막 번인은 곰 측).
                </p>
              </div>
            )}

            <button
              onClick={handleRun}
              disabled={isBusy}
              className="w-full mt-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              {isBusy ? statusLabel : "실행"}
            </button>
            {isBusy && procNote && (
              <p className="text-xs mt-2 text-center" style={{ color: "var(--text-secondary)" }}>{procNote}</p>
            )}
            {errorMsg && <p className="text-xs mt-3" style={{ color: "#f87171" }}>{errorMsg}</p>}
          </section>
        )}

        {/* 4. 결과 */}
        {result && (
          <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-3">4. 결과</h2>

            {usedPrompt && (
              <p className="text-[11px] mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                🎵 분석된 분위기/태그: {usedPrompt}
              </p>
            )}

            {result.attribution && (
              <p className="text-[11px] mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                🎼 {result.attribution}
                {result.license && (
                  <> · <a href={result.license} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>라이선스</a></>
                )}
                {!result.commercial && <span style={{ color: "#f0b429" }}> · ⚠ 비상업(NC/ND) 가능성 — 상업적 사용 전 확인</span>}
                {" "}· 사용 시 저작자 표시 필요할 수 있음
              </p>
            )}

            {result.kind === "music-list" && (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  분위기에 맞는 후보 {result.tracks.length}곡. 미리듣고 “사용”을 누르면 {bgmMode === "video" ? "영상에 믹스" : "트랙으로 사용"}합니다.
                </p>
                {result.tracks.map((t) => (
                  <div key={t.id} className="rounded-xl p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{t.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-primary)", color: t.commercial_safe ? "var(--text-secondary)" : "#f0b429" }}>
                        {t.commercial_safe ? "상업 가능(CC BY/0)" : "NC/ND 확인필요"}
                      </span>
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{t.artist} · {Math.round(t.duration)}s</div>
                    <audio src={t.url} controls preload="none" className="w-full mt-2" style={{ height: 32 }} />
                    <button
                      onClick={() => useLibraryTrack(t)}
                      disabled={isBusy}
                      className="mt-2 text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                      style={{ background: "var(--accent)" }}
                    >
                      {bgmMode === "video" ? "이 곡으로 영상에 믹스" : "이 곡 사용"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {result.kind === "image" && (
              <div>
                <div className="rounded-lg overflow-hidden" style={{ background: result.transparent ? CHECKER : "var(--bg-primary)" }}>
                  <img src={result.url} alt="" className="max-h-96 mx-auto" />
                </div>
                <a href={result.url} download className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>다운로드</a>
              </div>
            )}

            {result.kind === "video" && (
              <div>
                <div className="rounded-lg overflow-hidden" style={{ background: result.transparent ? CHECKER : "#000" }}>
                  <video src={result.url} controls className="max-h-96 mx-auto" />
                </div>
                <a href={result.url} download className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>
                  다운로드 ({result.transparent ? "webm" : "mp4"})
                </a>
                {result.bgFilled && (
                  <p className="text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>
                    mp4(h264)는 투명을 지원하지 않아 제거된 배경이 단색으로 채워집니다. 다른 배경 위에 합성하려면 출력 형식을 “투명 webm”으로 선택하세요.
                  </p>
                )}
              </div>
            )}

            {result.kind === "audio" && (
              <div>
                <audio src={result.url} controls className="w-full" />
                <a href={result.url} download className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>다운로드</a>
              </div>
            )}

            {result.kind === "shortform" && (
              <div className="space-y-3">
                {result.clips.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    추천할 만한 하이라이트를 찾지 못했습니다.
                  </p>
                ) : (
                  <>
                    {result.clips.map((c, i) => (
                      <div key={i} className="rounded-xl p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{i + 1}. {c.title}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                            {fmtTime(c.start)}–{fmtTime(c.end)} ({(c.end - c.start).toFixed(0)}s)
                          </span>
                        </div>
                        {c.caption && (
                          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{c.caption}</div>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const payload = { source: result.source, unit: "seconds", clips: result.clips };
                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `${result.source || "shortform"}.clips.json`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      클립 리스트 JSON 다운로드
                    </button>
                    <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      곰믹스는 이 구간(초)으로 클립을 잘라 숏폼을 생성합니다. 세로 크롭·자막 번인은 곰 측 타임라인에서.
                    </p>
                  </>
                )}
              </div>
            )}

            {result.kind === "transcript" && (
              <div className="space-y-4">
                {runMode === "silence" && cuts && (
                  <div className="grid grid-cols-2 gap-4">
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      최소 무음 길이: {minSilence.toFixed(1)}s
                      <input type="range" min="0.2" max="2" step="0.1" value={minSilence} onChange={(e) => setMinSilence(parseFloat(e.target.value))} className="w-full mt-1" />
                    </label>
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      여유(padding): {padding.toFixed(2)}s
                      <input type="range" min="0" max="0.5" step="0.05" value={padding} onChange={(e) => setPadding(parseFloat(e.target.value))} className="w-full mt-1" />
                    </label>
                  </div>
                )}

                {runMode === "content" && (
                  <div className="flex gap-2 items-center">
                    <input
                      value={cutInstruction}
                      onChange={(e) => setCutInstruction(e.target.value)}
                      placeholder="지울 내용 (예: 가격 얘기 부분 빼줘)"
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    />
                    <button
                      onClick={() => selectCutsAI(result.chunks, cutInstruction.trim())}
                      disabled={aiLoading || !cutInstruction.trim()}
                      className="text-xs px-3 py-2 rounded-lg text-white disabled:opacity-40 shrink-0"
                      style={{ background: "var(--accent)" }}
                    >
                      {aiLoading ? "분석 중…" : "다시 적용"}
                    </button>
                  </div>
                )}

                {runMode === "content" && aiRemove === null ? (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {aiLoading ? "AI가 지울 구간을 고르는 중…" : "지시문을 입력하고 적용하세요."}
                  </p>
                ) : (
                  cuts && (
                    <>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {[
                          ["원본", fmtTime(cuts.total)],
                          ["제거", `−${fmtTime(cuts.removed)}`],
                          ["결과", fmtTime(cuts.final)],
                        ].map(([label, val]) => (
                          <div key={label} className="rounded-lg py-3" style={{ background: "var(--bg-hover)" }}>
                            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</div>
                            <div className="text-sm font-semibold mt-1">{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* 내용 기반: 자막 + 제거 표시 */}
                      {runMode === "content" && (
                        <div className="max-h-56 overflow-auto rounded-lg p-2 space-y-1" style={{ background: "var(--bg-primary)" }}>
                          {result.chunks.map((c, i) => {
                            const removed = aiRemove?.includes(i);
                            return (
                              <div
                                key={i}
                                className="text-xs px-2 py-1 rounded"
                                style={{
                                  color: removed ? "#f87171" : "var(--text-primary)",
                                  textDecoration: removed ? "line-through" : "none",
                                  background: removed ? "rgba(248,113,113,0.08)" : "transparent",
                                }}
                              >
                                <span style={{ color: "var(--text-secondary)" }}>
                                  [{fmtTime(c.timestamp[0])}]{" "}
                                </span>
                                {c.text}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        잘라낼 구간 {cuts.remove.length}개
                      </div>
                      <div className="max-h-40 overflow-auto rounded-lg" style={{ background: "var(--bg-primary)" }}>
                        {cuts.remove.length === 0 ? (
                          <p className="text-xs p-3" style={{ color: "var(--text-secondary)" }}>잘라낼 구간이 없습니다.</p>
                        ) : (
                          cuts.remove.map(([a, b], i) => (
                            <div key={i} className="flex justify-between px-3 py-1.5 text-xs" style={{ borderBottom: "1px solid var(--border)" }}>
                              <span>{fmtTime(a)} → {fmtTime(b)}</span>
                              <span style={{ color: "var(--text-secondary)" }}>{(b - a).toFixed(1)}s</span>
                            </div>
                          ))
                        )}
                      </div>

                      <button onClick={downloadEDL} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>
                        컷 리스트 JSON 다운로드
                      </button>
                      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        곰믹스는 이 keep/remove 좌표(초)를 타임라인에 적용해 컷을 수행합니다.
                      </p>
                    </>
                  )
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
