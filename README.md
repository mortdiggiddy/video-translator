# Video Translator

A NestJS microservice for video translation using **Temporal** for workflow orchestration and **OpenAI** for AI-powered translation (Whisper for transcription, GPT-4 for translation).

## Business Requirement

> "A business wants to take videos recorded in English and translate them to other languages. Create a workflow that takes a video, gets a transcription of the audio, translates it into another language, and produces a summary of the video in the desired language."

## Features

- **Video/Audio Processing**: Upload files directly or provide URLs
- **FFmpeg Integration**: Automatic audio extraction from video files
- **OpenAI Whisper**: Speech-to-text transcription with timestamps
- **GPT-4 Translation**: Professional-quality translation
- **Subtitle Generation**: SRT/VTT subtitle files
- **Temporal Workflows**: Durable, fault-tolerant execution
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

| Method | Endpoint            | Description                |
| ------ | ------------------- | -------------------------- |
| GET    | `/`                 | Service information        |
| GET    | `/health`           | Health check               |
| POST   | `/translate`        | Start translation (URL)    |
| POST   | `/translate/upload` | Start translation (Upload) |
| GET    | `/translate/:id`    | Get workflow status        |

## Usage Examples

### Method 1: URL-Based Translation

Submit a URL to a video/audio file:

```bash
curl -X POST http://localhost:3001/translate \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/video.mp4",
    "targetLanguage": "Spanish",
    "sourceLanguage": "English"
  }'
```

### Method 2: File Upload

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

### Example Responses

**POST /translate or /translate/upload**

```json
{
  "workflowId": "translation-1706518800000-abc123",
  "status": "started"
}
```

**GET /translate/:workflowId (Running)**

```json
{
  "workflowId": "translation-1706518800000-abc123",
  "status": "RUNNING"
}
```

**GET /translate/:workflowId (Completed)**

```json
{
  "workflowId": "translation-1706518800000-abc123",
  "status": "COMPLETED",
  "result": {
    "success": true,
    "transcription": "Hello, this is a test video...",
    "translation": "Hola, este es un video de prueba...",
    "summary": "A brief test video with greeting.",
    "subtitlesPath": "/tmp/subtitles_123.srt",
    "processingTimeMs": 15000
  }
}
```

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
├── .kilocode/rules/memory-bank/   # Project documentation
│   ├── projectbrief.md            # Project overview
│   ├── productContext.md          # Why this exists
│   ├── systemPatterns.md          # Architecture patterns
│   ├── techContext.md             # Technical details
│   └── progress.md                # Progress tracker
├── src/
│   ├── main.ts                    # Application entry point
│   ├── translator.module.ts       # Root NestJS module
│   ├── translator.controller.ts   # HTTP endpoints
│   ├── translator.service.ts      # Business logic
│   ├── dto/                       # Request/Response DTOs
│   ├── common/
│   │   ├── exceptions/            # Custom exceptions
│   │   └── filters/               # Exception filters
│   └── orchestrator/
│       ├── activities/            # Temporal activities
│       │   ├── translation.activities.ts
│       │   ├── ffmpeg.utils.ts
│       │   └── types.ts
│       ├── workflows/             # Temporal workflows
│       └── clients/               # Temporal client
├── scripts/temporal/              # Temporal configuration
├── docker-compose.yml             # Docker orchestration
├── Dockerfile                     # Container build
├── package.json                   # Dependencies (pnpm)
└── .env.example                   # Environment template
```

## Configuration

Environment variables are defined in `.env`:

| Variable                  | Description        | Default               |
| ------------------------- | ------------------ | --------------------- |
| `SERVICE_NAME`            | Service identifier | `video-translator`    |
| `PORT`                    | HTTP server port   | `3001`                |
| `NODE_ENV`                | Environment mode   | `development`         |
| `TEMPORAL_SERVER_ADDRESS` | Temporal server    | `temporal:7233`       |
| `TEMPORAL_NAMESPACE`      | Temporal namespace | `default`             |
| `OPENAI_API_KEY`          | OpenAI API key     | (required)            |
| `OPENAI_MODEL`            | GPT model to use   | `gpt-4-turbo-preview` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Temporal Server                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                 Translation Workflow                        │ │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐ │ │
│  │  │ Extract │→ │Transcribe│→ │ Translate │→ │ Generate   │ │ │
│  │  │ Audio   │  │(Whisper) │  │(GPT-4)    │  │ Subtitles  │ │ │
│  │  │(FFmpeg) │  │          │  │           │  │ & Summary  │ │ │
│  │  └─────────┘  └──────────┘  └───────────┘  └────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
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

## Tech Stack

- **NestJS** v10.4.x - Backend framework
- **Temporal** v1.25.1 - Workflow orchestration
- **OpenAI** v4.73.0 - Whisper + GPT-4
- **FFmpeg** - Video/audio processing
- **pnpm** v9.14.1 - Package manager
- **Docker** - Containerization

## Related Projects

- [nebula-services](../nebula-services) - Original monorepo
- [robot-data](../nebula-services/apps/robot-data) - Service template
- [mission-orchestrator](../nebula-services/apps/mission-orchestrator/src/orchestrator) - Temporal patterns

## License

MIT
