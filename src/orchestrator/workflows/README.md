## Video Translator Workflow - Complete Pipeline Explanation

### High-Level Architecture

```mermaid
flowchart TB
    subgraph "Entry Points"
        A[POST /translate] -->|URL-based| C
        B[POST /translate/upload] -->|File Upload| C
    end

    subgraph "Controller & Service"
        C[TranslatorController] --> D[TranslatorService]
        D --> E[TemporalClientService]
    end

    subgraph "Temporal Orchestration"
        E -->|Start Workflow| F[Translation Workflow]
    end

    subgraph "5-Step Activity Pipeline"
        F --> G[1. Extract Audio]
        G --> H[2. Transcribe Audio]
        H --> I[3. Translate Text]
        I --> J[4. Generate Summary]
        J --> K[5. Generate Subtitles]
    end

    subgraph "AI Services"
        G -->|FFmpeg| L[(Local Temp Files)]
        H -->|OpenAI Whisper| M[(Whisper API)]
        I -->|GPT-4| N[(GPT-4 API)]
        J -->|GPT-4| N
        K -->|GPT-4| N
    end

    K --> O[Workflow Result]
```

---

### Step-by-Step Activity Flow

#### **Step 1: Extract Audio** ([`extractAudio()`](video-translator/src/orchestrator/activities/translation.activities.ts:60))

**Input**: Video URL or local file path
**Output**: Local path to extracted MP3 audio file

```
┌─────────────────────────────────────────────────────────────┐
│                    Extract Audio Pipeline                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Check if input is URL or local path                      │
│    └─> If URL: Download to /tmp/video-translator/           │
│                                                             │
│ 2. Detect file type by extension                            │
│    ├─> Video (.mp4, .mov, .avi, .mkv, .webm, .flv, .wmv)    │
│    │   └─> Run FFmpeg to extract audio                      │
│    └─> Audio (.mp3, .wav, .m4a, .ogg, .flac, .aac)          │
│        └─> Pass through directly                            │
│                                                             │
│ 3. FFmpeg conversion settings:                              │
│    • libmp3lame codec                                       │
│    • 192kbps bitrate                                        │
│    • 2 channels (stereo)                                    │
│    • 44.1kHz sample rate                                    │
└─────────────────────────────────────────────────────────────┘
```

#### **Step 2: Transcribe Audio** ([`transcribeAudio()`](video-translator/src/orchestrator/activities/translation.activities.ts:92))

**Input**: Local audio file path, source language hint
**Output**: `TranscriptionResult` with text, language, and time-stamped segments

```
┌─────────────────────────────────────────────────────────────┐
│                OpenAI Whisper Transcription                 │
├─────────────────────────────────────────────────────────────┤
│ API Call: openai.audio.transcriptions.create()              │
│                                                             │
│ Parameters:                                                 │
│  • model: "whisper-1"                                       │
│  • response_format: "verbose_json"                          │
│  • timestamp_granularities: ["segment"]                     │
│  • language: sourceLanguage (optional hint)                 │
│                                                             │
│ Returns:                                                    │
│  {                                                          │
│    text: "Full transcription text...",                      │
│    language: "en",                                          │
│    segments: [                                              │
│      { start: 0.0, end: 4.5, text: "First segment..." },    │
│      { start: 4.5, end: 9.2, text: "Second segment..." }    │
│    ]                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

#### **Step 3: Translate Text** ([`translateText()`](video-translator/src/orchestrator/activities/translation.activities.ts:131))

**Input**: Transcription text, source language, target language
**Output**: `TranslationResult` with original and translated text

```
┌─────────────────────────────────────────────────────────────┐
│                    GPT-4 Translation                        │
├─────────────────────────────────────────────────────────────┤
│ API Call: openai.chat.completions.create()                  │
│                                                             │
│ System Prompt:                                              │
│  "You are a professional translator. Translate from         │
│   {source} to {target}. Preserve meaning, tone, style.      │
│   Only output the translated text."                         │
│                                                             │
│ Parameters:                                                 │
│  • model: "gpt-4-turbo-preview"                             │
│  • temperature: 0.3 (more deterministic)                    │
│                                                             │
│ Returns:                                                    │
│  {                                                          │
│    originalText: "Hello world...",                          │
│    translatedText: "Hola mundo...",                         │
│    sourceLanguage: "en",                                    │
│    targetLanguage: "es"                                     │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

#### **Step 4: Generate Summary** ([`generateSummary()`](video-translator/src/orchestrator/activities/translation.activities.ts:169))

**Input**: Translated text, target language
**Output**: `SummaryResult` with summary and key points

```
┌─────────────────────────────────────────────────────────────┐
│                  GPT-4 Summarization                        │
├─────────────────────────────────────────────────────────────┤
│ API Call: openai.chat.completions.create()                  │
│                                                             │
│ System Prompt:                                              │
│  "Create a concise summary in {targetLanguage}.             │
│   Extract 3-5 key points.                                   │
│   Format as JSON: {summary, keyPoints[]}"                   │
│                                                             │
│ Parameters:                                                 │
│  • model: "gpt-4-turbo-preview"                             │
│  • temperature: 0.5                                         │
│  • response_format: { type: "json_object" }                 │
│                                                             │
│ Returns:                                                    │
│  {                                                          │
│    summary: "Este video trata sobre...",                    │
│    keyPoints: ["Punto 1", "Punto 2", "Punto 3"],            │
│    language: "es"                                           │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

#### **Step 5: Generate Subtitles** ([`generateSubtitles()`](video-translator/src/orchestrator/activities/translation.activities.ts:214))

**Input**: Original segments with timestamps, full translated text
**Output**: SRT or VTT formatted subtitle content

```
┌─────────────────────────────────────────────────────────────┐
│                 GPT-4 Subtitle Generation                    │
├─────────────────────────────────────────────────────────────┤
│ 1. Take original segments with timings from Whisper         │
│                                                             │
│ 2. Use GPT-4 to align translated text with timings:         │
│    "Distribute translated text across segments              │
│     maintaining original timing structure"                   │
│                                                             │
│ 3. Generate SRT format:                                     │
│    1                                                        │
│    00:00:00,000 --> 00:00:04,500                           │
│    Hola, bienvenido al tutorial                             │
│                                                             │
│    2                                                        │
│    00:00:04,500 --> 00:00:09,200                           │
│    Hoy aprenderemos sobre...                                │
│                                                             │
│ 4. Or VTT format:                                           │
│    WEBVTT                                                   │
│                                                             │
│    00:00:00.000 --> 00:00:04.500                           │
│    Hola, bienvenido al tutorial                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Final Workflow Result

```typescript
{
  success: true,
  transcription: "Original English transcription...",
  translation: "Translated Spanish text...",
  summary: "Resumen del video...",
  subtitlesPath: "1\n00:00:00,000 --> 00:00:04,500\nHola mundo...",
  processingTimeMs: 45000
}
```

---

### Temporal Benefits

1. **Durability**: Each activity is checkpointed - if the server crashes mid-workflow, it resumes from the last completed activity
2. **Retry Logic**: Each activity has `maximumAttempts: 3` with automatic retries on failure
3. **Timeout Protection**: `startToCloseTimeout: 5 minutes` per activity
4. **Visibility**: Monitor workflow progress in Temporal UI at `http://localhost:8089`
5. **History**: Full execution history preserved for debugging
