
#  Qwen3-TTS Studio (Local Desktop Wrapper)

> A desktop interface for the powerful **Qwen3-TTS** model (1.7B CustomVoice). Run offline, ultra-low latency text-to-speech with emotive control directly on your GPU.

<img width="1920" height="1080" alt="graphite-render-1920x1080-1769409476829" src="https://github.com/user-attachments/assets/ff566a4a-4895-4270-83da-1ba821ce85d7" />


##  Features

*   **Offline Privacy**: Runs entirely on your local machine using PyTorch & CUDA.
*   **Clean Simple UI**: A modern, dark-themed React frontend designed for focus and aesthetics.
*   **Deep Control**:
    *   **9 Premium Voices**: From "Ryan" (Dynamic Male) to "Ono_Anna" (Playful Japanese).
    *   **10+ Languages**: English, Chinese, Japanese, Korean, German, French, etc.
    *   **Style Instructions**: Use natural language (e.g., "Whispering and terrified") to direct the emotion.
*   **Visual Feedback**: Real-time audio visualization and precise seeking.
*   **Desktop Experience**: Wraps the web engine into a native window—no browser tabs required.

---

##  Prerequisites

Before installing the studio, ensure you have the following:

1.  **NVIDIA GPU**: Minimum 8GB VRAM recommended (Supports FP16/BF16).
2.  **Python 3.10+**: [Download Here](https://www.python.org/downloads/)
3.  **Node.js & npm** (Only for building the UI): [Download Here](https://nodejs.org/)

---

##  Installation Guide

### Step 1: Install the Qwen3-TTS Backend
First, we need to install the core inference engine provided by Alibaba Cloud Qwen.

**Create a clean environment (Recommended):**
```bash
conda create -n qwen3-tts python=3.12 -y
conda activate qwen3-tts
```

**Install the package:**
```bash
pip install -U qwen-tts
```

**Install FlashAttention-2 (Optional but Recommended for Speed):**
```bash
pip install -U flash-attn --no-build-isolation
```

### Step 2: Download the Model Weights
The app uses the **1.7B CustomVoice** model. You can pre-download it to avoid timeouts during the first run.

**Using ModelScope (Mainland China):**
```bash
pip install -U modelscope
modelscope download --model Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice --local_dir ./Qwen3-TTS-12Hz-1.7B-CustomVoice
```

**Using Hugging Face:**
```bash
pip install -U "huggingface_hub[cli]"
huggingface-cli download Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice --local-dir ./Qwen3-TTS-12Hz-1.7B-CustomVoice
```

---

### Step 3: Set Up Qwen3-TTS Studio (This App)

1.  **Clone this repository:**
    ```bash
    git clone https://github.com/YourUsername/qwen3-tts-studio.git
    cd qwen3-tts-studio
    ```

2.  **Install App Dependencies:**
    ```bash
    pip install fastapi uvicorn soundfile torch numpy python-multipart pywebview
    ```

3.  **Build the Frontend:**
    Navigate to the project folder and build the React UI.
    ```bash
    npm install
    npm run build
    ```
    *This will create a `dist` folder containing the compiled UI.*

---

##  Usage

Once installed, simply run the server script. It will launch the backend and open the GUI window automatically.

```bash
python server.py
```

*   **First Run:** The console will show `--- Loading Qwen3-TTS Model... ---`. This may take 1-2 minutes depending on your disk speed.
*   **Ready:** Once the window opens, type your text, select a speaker (e.g., "Ryan"), and click **GENERATE**.

---

##  Model Capabilities

This studio utilizes the **Qwen3-TTS-12Hz-1.7B-CustomVoice** model.

| Feature | Description |
| :--- | :--- |
| **Supported Languages** | Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian |
| **Streaming Latency** | As low as 97ms (end-to-end) |
| **Instruction Control** | Supports semantic instructions like "Speak with a crying tone" or "Very fast and excited" |

### Available Speakers
*   **Vivian**: Bright, slightly edgy young female (Chinese)
*   **Serena**: Warm, gentle young female (Chinese)
*   **Uncle_Fu**: Seasoned male, low timbre (Chinese)
*   **Ryan**: Dynamic male, rhythmic drive (English)
*   **Ono_Anna**: Playful female, light timbre (Japanese)
*   *(And more included in the dropdown)*

---

##  Citation & Credits

This project is a GUI wrapper for the **Qwen3-TTS** model developed by the Qwen Team (Alibaba Group).

If you use the underlying model in research, please cite:

```bibtex
@article{Qwen3-TTS,
  title={Qwen3-TTS Technical Report},
  author={Hangrui Hu and Xinfa Zhu and Ting He and Dake Guo and Bin Zhang and Xiong Wang and Zhifang Guo and Ziyue Jiang and Hongkun Hao and Zishan Guo and Xinyu Zhang and Pei Zhang and Baosong Yang and Jin Xu and Jingren Zhou and Junyang Lin},
  journal={arXiv preprint arXiv:2601.15621},
  year={2026}
}
```

**Original Model Repo:** [Hugging Face - Qwen3-TTS](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)

---

**License:** This wrapper is released under MIT. The Qwen3-TTS model weights are licensed under Apache 2.0.
