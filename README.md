# Video Translator

A NestJS microservice for video translation using **Temporal** for workflow orchestration and **OpenAI** for AI-powered translation (Whisper for transcription, GPT-4 for translation).

## Business Requirement

> "A business wants to take videos recorded in English and translate them to other languages. Create a workflow that takes a video, gets a transcription of the audio, translates it into another language, and produces a summary of the video in the desired language."

## Features

- **Video/Audio Processing**: Upload files directly or provide URLs
- **FFmpeg Integration**: Automatic audio extraction from video files
- **OpenAI Whisper**: Speech-to-text transcription with timestamps
- **GPT-4 Translation**: Professional-quality translation
- **Subtitle Generation**: SRT/VTT subtitle files with timestamps
- **Video Output**: Generate translated video with embedded subtitles (hardcoded or softcoded)
- **CLI Tools**: Command-line interface with real-time progress tracking
- **Temporal Workflows**: Durable, fault-tolerant 7-step execution with progress queries
- **Swagger Documentation**: Interactive API explorer at `/api`

## Quick Start

### Prerequisites

- Docker and Docker Compose
- OpenAI API key (for transcription and translation)
- Node.js 20+ (for local development without Docker)
- pnpm 9+ (required for local development)

### Running with Docker Compose

```bash
# Copy environment file and add your OpenAI API key
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-your-api-key

# Start all services (Temporal + Translator)
docker-compose up --build

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f translator

# Stop services
docker-compose down
```

### Running Locally (without Docker)

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-your-api-key

# Start in development mode (with hot reload)
pnpm start:dev

# Build for production
pnpm build

# Start production build
pnpm start:prod
```

## Services

| Service         | Port       | Description            |
| --------------- | ---------- | ---------------------- |
| Translator      | `3001`     | NestJS microservice    |
| Temporal Server | `7233`     | Workflow orchestration |
| Temporal UI     | `8089`     | Web UI for workflows   |
| Temporal DB     | `5437`     | PostgreSQL database    |
| Swagger UI      | `3001/api` | API documentation      |

## API Endpoints

| Method | Endpoint                  | Description                     |
| ------ | ------------------------- | ------------------------------- |
| GET    | `/`                       | Service information             |
| GET    | `/health`                 | Health check                    |
| POST   | `/translate`              | Start translation (URL)         |
| POST   | `/translate/upload`       | Start translation (Upload)      |
| GET    | `/translate/:id`          | Get workflow status & result    |
| GET    | `/translate/:id/progress` | Get real-time workflow progress |

## Usage Examples

### Method 1: CLI Tool (Recommended)

Use the command-line interface with real-time progress tracking:

```bash
# Translate from URL
pnpm translate --url https://example.com/video.mp4 --target Spanish

# Translate from local file
pnpm translate --file ./video.mp4 --target French

# Translate with hardcoded (burned-in) subtitles
pnpm translate --url https://example.com/video.mp4 --target German --hardcode

# Specify source language
pnpm translate --url https://example.com/video.mp4 --target Spanish --source English
```

**CLI Progress Output:**

```
🎬 Video Translator CLI

──────────────────────────────────────────────────
Source: https://example.com/video.mp4
Target Language: Spanish
Subtitle Mode: Softcoded (selectable)
──────────────────────────────────────────────────

Starting translation workflow...
Workflow started: video-spanish-a1b2c3d4-e5f6-7890-abcd-ef1234567890

⏳ Translation Progress

█████████████░░░░░░░░░ 65% | Step 5/7: Generating subtitles
```

### Method 2: REST API (URL-Based)

Submit a URL to a video/audio file:

```bash
curl -X POST http://localhost:3001/translate \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/video.mp4",
    "targetLanguage": "Spanish",
    "sourceLanguage": "English",
    "outputOptions": {
      "hardcodeSubtitles": false,
      "generateVideo": true
    }
  }'
```

### Method 3: REST API (File Upload)

Upload a file directly:

```bash
curl -X POST http://localhost:3001/translate/upload \
  -F "file=@/path/to/video.mp4" \
  -F "targetLanguage=Spanish" \
  -F "sourceLanguage=English"
```

### Check Translation Status

```bash
curl http://localhost:3001/translate/{workflowId}
```

### Workflow ID Naming Convention

Workflow IDs are automatically generated using the format:

```
{filename}-{targetLanguage}-{uuid}
```

**Examples:**

| Input                                                  | Workflow ID                           |
| ------------------------------------------------------ | ------------------------------------- |
| File upload: `JillTaylor_TED.mp4` → Spanish            | `jilltaylor_ted-spanish-a1b2c3d4-...` |
| URL: `https://example.com/Interview.mp4` → French      | `interview-french-e5f6g7h8-...`       |
| URL: `https://cdn.site.com/meeting_notes.mov` → German | `meeting_notes-german-i9j0k1l2-...`   |

The filename is extracted from:

1. **File uploads**: The original filename
2. **URL submissions**: The last path segment before the file extension

### Download Workflow Output (CLI)

```bash
# Download all artifacts from a completed workflow
pnpm translate:get <workflowId> --output ./my-translations/
```

### Example Responses

**POST /translate or /translate/upload**

```json
{
  "workflowId": "video-spanish-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "started"
}
```

**GET /translate/:workflowId (Running)**

```json
{
  "workflowId": "video-spanish-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "RUNNING"
}
```

**GET /translate/:workflowId (Completed)**

```json
{
  "workflowId": "video-spanish-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "COMPLETED",
  "result": {
    "success": true,
    "transcription": "Hello, this is a test video...",
    "translation": "Hola, este es un video de prueba...",
    "summary": "A brief test video with greeting.",
    "keyPoints": ["Point 1", "Point 2", "Point 3"],
    "subtitlesPath": "/output/video-translator/video-spanish-a1b2c3d4.../subtitles.srt",
    "outputVideoPath": "/output/video-translator/video-spanish-a1b2c3d4.../translated_video.mp4",
    "artifactsDir": "/output/video-translator/video-spanish-a1b2c3d4...",
    "processingTimeMs": 45000
  }
}
```

### Output Options

| Option              | Type    | Default | Description                           |
| ------------------- | ------- | ------- | ------------------------------------- |
| `hardcodeSubtitles` | boolean | `false` | Burn subtitles into video (permanent) |
| `generateVideo`     | boolean | `true`  | Generate video with subtitle overlay  |

**Subtitle Modes:**

- **Softcoded** (default): Subtitles as separate track, togglable in video player
- **Hardcoded**: Subtitles burned into video pixels, always visible

## Supported File Formats

| Type  | Extensions                         | Max Size |
| ----- | ---------------------------------- | -------- |
| Video | mp4, mov, avi, mkv, webm, flv, wmv | 500MB    |
| Audio | mp3, wav, m4a, ogg, flac, aac      | 500MB    |

## Supported Languages

Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Arabic, Russian, Hindi, Dutch, Polish, Turkish, Vietnamese, Thai, Indonesian, Malay, Swedish, Norwegian, Danish, Finnish, Greek, Hebrew, Czech, Romanian, Hungarian, Ukrainian

## Project Structure

```
video-translator/
├── src/
│   ├── main.ts                    # Application entry point
│   ├── translator.module.ts       # Root NestJS module
│   ├── translator.controller.ts   # HTTP endpoints
│   ├── translator.service.ts      # Business logic
│   ├── dto/                       # Request/Response DTOs
│   │   └── translate.dto.ts       # Translation DTOs with validation
│   ├── common/
│   │   ├── exceptions/            # Custom exceptions
│   │   └── filters/               # Exception filters
│   └── orchestrator/
│       ├── activities/            # Temporal activities (7 activities)
│       │   ├── translation.activities.ts  # All 7 activities
│       │   ├── ffmpeg.utils.ts    # FFmpeg wrappers, subtitle overlay
│       │   ├── types.ts           # Activity type definitions
│       │   └── index.ts           # Barrel exports
│       ├── workflows/             # Temporal workflows
│       │   ├── translation.workflow.ts  # 7-step workflow with progress query
│       │   └── index.ts           # Barrel exports
│       └── clients/               # Temporal client
│           └── temporal-client.service.ts  # Workflow start, status, progress query
├── scripts/                       # CLI tools
│   ├── translate-cli.ts           # CLI with progress bar
│   └── translate-get.ts           # Download workflow outputs
├── scripts/temporal/              # Temporal configuration
├── docker-compose.yml             # Docker orchestration (5 services)
├── Dockerfile                     # Container build (node:20-slim + ffmpeg)
├── package.json                   # Dependencies (pnpm)
├── output/                        # Workflow output directory (volume mount)
└── .env.example                   # Environment template
```

## Configuration

Environment variables are defined in `.env`:

| Variable                  | Description               | Default                    |
| ------------------------- | ------------------------- | -------------------------- |
| `SERVICE_NAME`            | Service identifier        | `video-translator`         |
| `PORT`                    | HTTP server port          | `3001`                     |
| `NODE_ENV`                | Environment mode          | `development`              |
| `TEMPORAL_SERVER_ADDRESS` | Temporal server           | `temporal:7233`            |
| `TEMPORAL_NAMESPACE`      | Temporal namespace        | `default`                  |
| `OPENAI_API_KEY`          | OpenAI API key            | (required)                 |
| `OPENAI_MODEL`            | GPT model to use          | `gpt-4-turbo-preview`      |
| `OUTPUT_DIR`              | Workflow output directory | `/output/video-translator` |
| `TEMP_DIR`                | Temporary file directory  | `/tmp/video-translator`    |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         7-Step Translation Workflow                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌───────────┐   │
│  │ 1.      │   │ 2.       │   │ 3.        │   │ 4.       │   │ 5.        │   │
│  │ Extract │ → │Transcribe│ → │ Translate │ → │ Generate │ → │ Generate  │   │
│  │ Audio   │   │(Whisper) │   │(GPT-4)    │   │ Summary  │   │ Subtitles │   │
│  │(FFmpeg) │   │          │   │           │   │(GPT-4)   │   │           │   │
│  └─────────┘   └──────────┘   └───────────┘   └──────────┘   └───────────┘   │
│       │                                                             │        │
│       │   ┌──────────────┐              ┌─────────────────────────┐ │        │
│       └──→│ 6. Generate  │─────────────→│ 7. Save Artifacts       │─┘        │
│           │ Output Video │              │ (metadata, subtitles,   │          │
│           │ (FFmpeg)     │              │  text files)            │          │
│           └──────────────┘              └─────────────────────────┘          │
│                                                                              │
│  Progress Query:  ═══════════════════════════════════════════════►  100%     │
│                   │       │        │        │        │        │        │     │
│                   5%     20%      40%      55%      70%      85%      95%    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Development

### Testing

```bash
# Run unit tests
pnpm test

# Run with verbose output
pnpm test:all

# Run with coverage
pnpm test:cov

# Watch mode
pnpm test:watch
```

### Adding New Features

1. **New Endpoints**: Add methods to `translator.controller.ts`
2. **Business Logic**: Implement in `translator.service.ts`
3. **DTOs**: Create in `src/dto/` with validation decorators
4. **Activities**: Add to `src/orchestrator/activities/`
5. **Workflows**: Define in `src/orchestrator/workflows/`

### Code Patterns

- **Index.ts files**: Only use for barrel exports (no inline definitions)
- **Exceptions**: Extend `TranslatorException` base class
- **DTOs**: Use class-validator + Swagger decorators

## Why Temporal? Cost/Benefit Analysis

### The Problem: Long-Running AI Workflows

Video translation involves multiple long-running operations:

1. **Video download** - Minutes for large files
2. **FFmpeg audio extraction** - CPU-intensive processing
3. **Whisper transcription** - 5-10 minutes for 30+ minute videos
4. **GPT-4 translation** - Multiple API calls with rate limits
5. **Subtitle generation** - Additional API processing

Traditional REST APIs struggle with this because:

- HTTP requests timeout (typically 30-60 seconds)
- Server restarts lose in-progress work
- API rate limits require retry logic
- No visibility into where a job failed

### Why Temporal is a Good Fit

| Challenge                 | Temporal Solution                              |
| ------------------------- | ---------------------------------------------- |
| **Long operations**       | Workflows can run for hours/days - no timeouts |
| **Server crashes**        | Automatic resume from last checkpoint          |
| **API rate limits**       | Built-in retry with exponential backoff        |
| **Debugging failures**    | Full execution history in web UI               |
| **Progress queries**      | Real-time progress tracking via query API      |
| **Complex orchestration** | Manages state machine for 7-step pipeline      |

**Temporal's Durable Execution Model:**

```
Without Temporal:
┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐
│Step 1│ →  │Step 2│ →  │Step 3│ →  │Step 4│ →  │Step 5│
└──────┘    └──────┘    └──────┘    └──────┘    └──────┘
                              ❌ Server crash = Start over

With Temporal:
┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐
│Step 1│ →  │Step 2│ →  │Step 3│ →  │Step 4│ →  │Step 5│
└──────┘    └──────┘    └──────┘    └──────┘    └──────┘
    ✓           ✓           ✓
                              ❌ Server crash
                              ✅ Resume at Step 4
```

### Comparison with Alternatives

| Factor                    | Temporal                 | BullMQ + Redis          | Plain Async              |
| ------------------------- | ------------------------ | ----------------------- | ------------------------ |
| **Automatic retries**     | ✅ Built-in with backoff | ✅ Configurable         | ❌ Manual implementation |
| **Resume after crash**    | ✅ From exact checkpoint | ⚠️ Restart entire job   | ❌ Lost work             |
| **Long-running (>30min)** | ✅ Designed for it       | ⚠️ Possible with config | ❌ Timeout issues        |
| **Visibility/debugging**  | ✅ Excellent web UI      | ⚠️ Basic dashboard      | ❌ Custom logging needed |
| **State management**      | ✅ Automatic             | ⚠️ Manual               | ❌ Manual                |
| **Infrastructure cost**   | ❌ 4 containers          | ⚠️ 1 container (Redis)  | ✅ None                  |
| **Learning curve**        | ❌ High                  | ⚠️ Medium               | ✅ Low                   |
| **Team familiarity**      | ❌ Specialized knowledge | ✅ Common pattern       | ✅ Standard JS           |

### When to Use Temporal (This Project)

✅ **Good fit when:**

- Videos longer than 10 minutes
- Reliability is critical (paid service, can't lose translations)
- Need observability without building custom dashboards
- Planning to add complexity (human review, parallel processing)
- Multiple environments (dev/staging/prod) benefit from Temporal Cloud

⚠️ **Consider simpler alternatives when:**

- Prototype/MVP stage only
- Videos are consistently short (<5 minutes)
- Single developer, want minimal infrastructure
- Budget constraints (Temporal Cloud costs, or ops time for self-hosted)

### This Project's Configuration

```yaml
# Activities are configured with:
- startToCloseTimeout: 5 minutes
- maximumAttempts: 3 retries
- Automatic exponential backoff on failure
```

Each of the 7 activities is checkpointed. If GPT-4 returns an error during translation:

1. Temporal automatically retries up to 3 times
2. If all retries fail, the workflow pauses
3. You can fix the issue and replay from the failed step
4. Successful steps (audio extraction, transcription, etc.) are NOT re-run

### Monitoring & Debugging

Access Temporal UI at `http://localhost:8089` to:

- View all workflows and their real-time status
- Inspect input/output of each activity
- See retry attempts and error messages
- Replay failed workflows
- Terminate stuck workflows

## Tech Stack

- **NestJS** v10.4.x - Backend framework
- **Temporal** v1.25.1 - Workflow orchestration
- **OpenAI** v4.73.0 - Whisper + GPT-4
- **FFmpeg** - Video/audio processing
- **pnpm** v9.14.1 - Package manager
- **Docker** - Containerization

## License

MIT
