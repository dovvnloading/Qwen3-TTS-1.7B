"""Reproducible GPU quality/latency harness for preset or cloned Qwen3-TTS speech.

Example:
  python tools/benchmark_tts.py --models-dir D:/Models --samples tools/benchmark_prompts.jsonl \
      --task custom --seeds 17,18 --out benchmark_outputs

Outputs a CSV with duration, real-time factor, peak, RMS and silence fraction.
Human blind listening and optional independent ASR/speaker-similarity evaluation are
still necessary: waveform statistics cannot measure naturalness or pronunciation.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Local-TTS" / "Local-TTS"))
from tts_utils import cached_model_path, decode_reference_audio

MODEL_IDS = {
    "custom": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "clone": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
}
QUALITY_KWARGS = {
    "default": {},
    "consistent": {"temperature": 0.65, "top_p": 0.85, "repetition_penalty": 1.10},
    "expressive": {"temperature": 1.05, "top_p": 0.98, "repetition_penalty": 1.02},
}


def summarize(samples: np.ndarray, sr: int) -> dict:
    wave = np.asarray(samples, dtype=np.float64).reshape(-1)
    if not wave.size:
        raise ValueError("Empty model output")
    return {
        "duration_s": len(wave) / sr,
        "peak": float(np.max(np.abs(wave))),
        "rms": float(np.sqrt(np.mean(np.square(wave)))),
        "near_clip_pct": float(np.mean(np.abs(wave) >= 0.99) * 100),
        "quiet_pct": float(np.mean(np.abs(wave) < 0.005) * 100),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models-dir", required=True, help="Cache or parent of standalone model folders")
    parser.add_argument("--samples", required=True, help="JSONL rows: text, language, speaker, instruct")
    parser.add_argument("--task", choices=["custom", "clone"], default="custom")
    parser.add_argument("--seeds", default="17,18", help="Comma-delimited reproducible seeds")
    parser.add_argument("--presets", default="default,consistent,expressive")
    parser.add_argument("--out", default="benchmark_outputs")
    parser.add_argument("--precision", choices=["auto", "float16", "bfloat16", "float32"], default="auto")
    args = parser.parse_args()
    source = cached_model_path(MODEL_IDS[args.task], args.models_dir)
    if source is None:
        parser.error("No complete model snapshot found in --models-dir")
    rows = [json.loads(line) for line in Path(args.samples).read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")]
    if not rows:
        parser.error("No prompts in samples file")
    seeds = [int(s) for s in args.seeds.split(",") if s.strip()]
    presets = [s.strip() for s in args.presets.split(",") if s.strip()]
    if any(p not in QUALITY_KWARGS for p in presets):
        parser.error("Unknown preset")
    from qwen_tts import Qwen3TTSModel
    has_cuda = torch.cuda.is_available()
    if not has_cuda or args.precision == "float32":
        dtype = torch.float32
    elif args.precision == "bfloat16" or (args.precision == "auto" and torch.cuda.is_bf16_supported()):
        dtype = torch.bfloat16
    else:
        dtype = torch.float16
    print(f"Loading {source} ({dtype})")
    model = Qwen3TTSModel.from_pretrained(source, device_map="auto", dtype=dtype, attn_implementation="sdpa")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    metrics = []
    for index, sample in enumerate(rows):
        text = str(sample["text"])
        language = str(sample.get("language", "Auto"))
        prompt = None
        if args.task == "clone":
            ref = sample.get("reference_audio")
            if not ref:
                raise ValueError("Clone samples require reference_audio")
            ref_file = Path(ref)
            if not ref_file.is_absolute():
                ref_file = Path(args.samples).resolve().parent / ref_file
            audio = decode_reference_audio(ref_file.read_bytes())
            ref_text = str(sample.get("reference_text", "")).strip()
            prompt = model.create_voice_clone_prompt(
                ref_audio=audio, ref_text=ref_text or None,
                x_vector_only_mode=not bool(ref_text),
            )
        for preset in presets:
            for seed in seeds:
                torch.manual_seed(seed)
                if has_cuda:
                    torch.cuda.manual_seed_all(seed)
                    torch.cuda.reset_peak_memory_stats()
                started = time.perf_counter()
                if args.task == "clone":
                    wavs, sr = model.generate_voice_clone(
                        text=text, language=language, voice_clone_prompt=prompt,
                        **QUALITY_KWARGS[preset],
                    )
                else:
                    wavs, sr = model.generate_custom_voice(
                        text=text, language=language,
                        speaker=sample.get("speaker", "Ryan"),
                        instruct=sample.get("instruct", "") or None,
                        **QUALITY_KWARGS[preset],
                    )
                elapsed = time.perf_counter() - started
                wave = np.asarray(wavs[0], dtype=np.float32)
                stats = summarize(wave, sr)
                name = f"prompt-{index:03d}_{args.task}_{preset}_seed-{seed}.wav"
                sf.write(out / name, wave, sr, format="WAV", subtype="PCM_16")
                entry = {
                    "file": name, "sample": index, "task": args.task,
                    "language": language, "speaker": sample.get("speaker", ""),
                    "preset": preset, "seed": seed,
                    "precision": str(dtype), "model_source": source,
                    "elapsed_s": round(elapsed, 4),
                    "rtf": round(elapsed / stats["duration_s"], 4),
                    "peak_gpu_gib": round(torch.cuda.max_memory_allocated() / 2 ** 30, 3) if has_cuda else "",
                    **{k: round(v, 6) for k, v in stats.items()},
                }
                metrics.append(entry)
                print(f"{name}: RTF={entry['rtf']}, duration={entry['duration_s']:.2f}s")
    with (out / "metrics.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(metrics[0].keys()))
        writer.writeheader()
        writer.writerows(metrics)
    print(f"Saved {len(metrics)} WAVs and {out / 'metrics.csv'}")


if __name__ == "__main__":
    main()
