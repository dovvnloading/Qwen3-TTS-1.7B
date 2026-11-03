# Qwen3-TTS Studio

Local desktop application for **Qwen3-TTS 1.7B**, with React/Vite controls and a Python FastAPI + pywebview backend.

![Qwen3-TTS Studio](https://github.com/user-attachments/assets/ff566a4a-4895-4270-83da-1ba821ce85d7)

## What it does

- **Preset voices:** 9 CustomVoice speakers, 10 languages, natural-language delivery instructions.
- **Voice cloning:** uses the *separate* 1.7B Base model. Supply a clean reference audio clip and its exact transcript for high-fidelity in-context cloning; without a transcript, speaker-embedding-only mode is used (lower similarity is possible).
- **Quality presets:** default checkpoint sampling, a lower-variation preset, and a higher-variation preset; optional deterministic seed.
- **Candidate takes:** generate 1–3 takes sequentially, compare in recent-history controls and export the selected WAV.
- **Long-form narration:** optional sentence/clause-aware segmentation, configurable pauses, and segment concatenation for up to 20,000 characters.
- **Real waveform:** displays peaks from the generated PCM WAV, with clicking/dragging and keyboard seeking.
- **Output processing:** optional peak normalization and boundary-silence trimming.
- **Native WAV Save dialog:** pywebview bridge, with browser download fallback.
- **Offline-minded design:** the frontend loads no remote fonts or JavaScript; when model downloads are disabled, loading uses verified local snapshots.

**Important:** This app returns complete WAV clips. It does **not** implement the Qwen paper's 97 ms streaming demonstration or true incremental audio playback. The advanced presets are starting points, not universally superior speech-quality settings.

## Requirements

- Windows is the primary tested desktop target; Linux requires a supported graphical pywebview backend. macOS may require platform-specific pywebview dependencies.
- NVIDIA GPU with enough free VRAM for the ~4.5 GB 1.7B model and runtime overhead (8 GB or more recommended); CPU fallback is much slower.
- Python **3.12** recommended; Node.js **20+** and npm.
- Compatible PyTorch and torchaudio CUDA wheels. Install from [PyTorch's official selector](https://pytorch.org/get-started/locally/) **before** installing the Python dependencies; choose wheels matching your installed CUDA runtime/driver.

## Installation

Clone the **actual** project:

```bash
git clone https://github.com/dovvnloading/Qwen3-TTS-1.7B.git
cd Qwen3-TTS-1.7B
```

Create an environment, then install the correct CUDA PyTorch wheels using the official selector:

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
# source .venv/bin/activate
```

Install application dependencies (the qwen-tts version is pinned in this file):

```bash
python -m pip install -r requirements.txt
```

Build the frontend **at the repository root**:

```bash
npm ci
npm run typecheck
npm run build
```

Vite writes the production files directly into `Local-TTS/Local-TTS/dist/`. **Rebuild after each frontend source update**, because generated frontend files are intentionally not committed. The backend refuses to open a stale or missing build.

Start the real backend entry point from the repository root:

```bash
python Local-TTS/Local-TTS/Local_TTS.py
```

A desktop window will open once the local HTTP server has bound to `127.0.0.1:8000`. Model loading occurs in the background; if a model is missing, the UI remains available for repairing Settings.

## Model downloads and cache layout

This app uses **two separate models**, not a single 1.7B checkpoint:

- `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` for preset speakers.
- `Qwen/Qwen3-TTS-12Hz-1.7B-Base` for voice cloning.

You can place the model folders under the parent directory configured in Settings:

```text
<Model parent>/
  Qwen3-TTS-12Hz-1.7B-CustomVoice/
    config.json
    model.safetensors
    speech_tokenizer/model.safetensors
    ...
  Qwen3-TTS-12Hz-1.7B-Base/
    config.json
    model.safetensors
    speech_tokenizer/model.safetensors
    ...
```

Download to standalone folders using the official CLI, from inside your preferred parent directory:

```bash
python -m pip install -U "huggingface_hub[cli]"
hf download Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice --local-dir ./Qwen3-TTS-12Hz-1.7B-CustomVoice
hf download Qwen/Qwen3-TTS-12Hz-1.7B-Base --local-dir ./Qwen3-TTS-12Hz-1.7B-Base
```

Alternatively point Settings to a standard Hugging Face cache containing `models--Qwen--.../snapshots/<revision>` folders. A model is shown as complete only when core config, tokenizer, and both weight files are present (not merely `config.json`).

On first run, the default local cache is under the current user's application/cache directory. Enable **Allow model downloads** in Settings if you want the app to fetch missing weights automatically. Configuration is saved atomically under the user's app-data directory, not inside the source checkout. Existing `app_config.json` next to the Python script is read once for migration.

Changing the model directory, precision, or download setting unloads the active model and reloads without restarting the process. **Auto precision** chooses BF16 on supported CUDA GPUs and FP16 otherwise; FP32 is available for debugging at substantially higher memory cost. The default attention implementation is SDPA, which performed well in the original project's RTX 3060 Ti measurements. Benchmark before changing it.

## Using voice cloning

For best results, upload a clean, single-speaker **3–15-second** reference and enter the **exact** words spoken in it. The server accepts decoded 1–90-second audio up to **20 MB**. WAV or FLAC gives the most predictable compatibility; format detection is based on audio decoding, not the filename.

Without a transcript, the Base model uses speaker-embedding-only cloning. The interface labels this as a lower-fidelity mode. Repeated generations with an identical audio/transcript combination can reuse a bounded in-memory clone prompt until the model is switched.

Only clone a voice you have permission to use.

## Quality and workflow tips

Use a matching native-language preset when possible (Ryan/Aiden for English; Ono_Anna for Japanese; Sohee for Korean; Chinese presets for Chinese). Set a specific language when you know it.

Start with **Model defaults** for a baseline. Use the optional Consistent or Expressive presets for comparison, but expect trade-offs. Choosing 2–3 takes automatically uses distinct recorded seeds. A single take without an explicit seed retains Qwen's default randomness.

Enable **Long-form mode** beyond 1,200 characters. Sentences are split into short segments with pauses; this reduces excessive autoregressive decoding but can introduce segment-to-segment prosody changes. For maximal consistency, generate the final text in short coherent sections and compare results by listening.

Recent takes are held in memory (not uploaded to an external service). Their WAVs can be played and saved. The backend keeps a bounded archive for the native Save dialog; the browser retains the current session history.

## Reproducible audio-quality benchmark

For a quantitative GPU comparison of baseline, Consistent, and Expressive settings:

```bash
python tools/benchmark_tts.py --models-dir D:/Models --samples tools/benchmark_prompts.jsonl --task custom --seeds 17,18 --out benchmark_outputs
```

The script writes WAV files and `metrics.csv` with generation time, real-time factor (RTF), peak GPU memory, audio duration, RMS, peak amplitude, clipping and silence percentages. It also supports `--task clone` with JSONL rows supplying `reference_audio` and `reference_text`.

These measurements are diagnostic, **not** an automatic naturalness score. Run blinded listening evaluations, plus an independent ASR word/character-error evaluation and a speaker-similarity model where available. Use identical prompts, seeds, model revisions, and hardware when comparing settings.

## Security and privacy

The backend binds to `127.0.0.1`, checks allowed `Host` and `Origin` headers, requires a random local session token on state-changing API requests, rejects oversized payloads, and confines static-file serving to `dist`. Vite development also binds to loopback only.

The application itself loads no remote fonts or CDNs. Turning off model downloads prevents the app's model-resolution path from contacting the Hub to fetch weights; third-party libraries may nevertheless have their own network behavior. For strict air-gap guarantees, validate the full dependency environment and enforce network isolation at the operating-system level.

The local server is **not designed for remote network access**. Do not expose port 8000 to public networks or put it behind an internet-facing reverse proxy.

## Development and tests

```bash
npm ci
npm run typecheck
npm run build
python -m pip install -r requirements-test.txt
python -m pytest -q
```

Development UI: `npm run dev` runs on `http://127.0.0.1:3000` and proxies API calls to the Python server on port 8000.

CI runs a frontend typecheck and production build plus offline Python utility/security regression checks. These tests do **not** verify audio quality, CUDA loading, pywebview/native Save behavior, or exact GPU peak memory. Those require a real desktop/GPU smoke test.

**GPU smoke checklist:** start on a clean profile; generate a short preset clip; generate 2–3 candidates; seek and save; upload a valid clone reference with and without transcript; switch Base ↔ CustomVoice while a generation is in progress; test missing/incomplete weights; change precision; then run long-form narration and inspect generated audio for clipping, silence, repeated words, and truncation. Record duration, RTF, peak VRAM and errors.

## Credits and license

Studio wrapper: MIT ([LICENSE](LICENSE)). Qwen3-TTS models and upstream code: Alibaba Qwen Team, Apache-2.0; see the [upstream repo](https://github.com/QwenLM/Qwen3-TTS) and [model card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) for their requirements and license.

**Citation:** Hu et al., *Qwen3-TTS Technical Report*, arXiv:2601.15621 (2026).
