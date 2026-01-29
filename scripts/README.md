# Video Translator CLI Scripts

Command-line tools for video translation with real-time progress tracking.

## Prerequisites

1. **Docker Compose running:**

   ```bash
   cd video-translator
   docker-compose up -d
   ```

2. **Environment file:**

   ```bash
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

3. **For host CLI usage (optional):**
   ```bash
   pnpm install
   ```

---

## Scripts

### 1. `translate-cli.ts` - Start Translation

Translate a video with real-time progress tracking.

**Usage:**

```bash
# From URL
pnpm translate --url https://example.com/video.mp4 --target Spanish

# From local file
pnpm translate --file ./myvideo.mp4 --target French

# With burned-in (hardcoded) subtitles
pnpm translate -u https://example.com/video.mp4 -t German --hardcode

# Specify source language
pnpm translate -u https://example.com/video.mp4 -t Spanish -s English
```

**Options:**
| Option | Alias | Description | Required |
|--------|-------|-------------|----------|
| `--url` | `-u` | URL to video file | _ |
| `--file` | `-f` | Path to local video file | _ |
| `--target` | `-t` | Target language (e.g., Spanish) | Yes |
| `--source` | `-s` | Source language (auto-detected if omitted) | No |
| `--hardcode` | | Burn subtitles into video | No |

\*Either `--url` or `--file` is required.

**Workflow ID Format:**

Workflow IDs use the naming convention: `{filename}-{targetLanguage}-{uuid}`

- **File uploads**: Uses the original filename (e.g., `myvideo-french-a1b2c3d4-...`)
- **URL submissions**: Extracts filename from URL path (e.g., `video-spanish-e5f6g7h8-...`)

**Sample Output:**

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

✅ Translation completed successfully!

Results:
──────────────────────────────────────────────────
Workflow ID: video-spanish-a1b2c3d4-e5f6-7890-abcd-ef1234567890
Output Directory: /output/video-translator/video-spanish-a1b2c3d4-e5f6-7890-abcd-ef1234567890
Translated Video: /output/video-translator/.../translated_video.mp4
Processing Time: 2m 34s
──────────────────────────────────────────────────

Summary:
The video discusses modern software architecture patterns...

Key Points:
  1. Microservices enable independent deployment
  2. Event-driven architecture improves scalability
```

---

### 2. `translate-get.ts` - Retrieve Output Files

Download/copy workflow output files to a local directory.

**Usage:**

```bash
# Download all outputs to ./my-downloads/
pnpm translate:get <workflowId> --output ./my-downloads/

# Using short option
pnpm translate:get <workflowId> -o ./downloads/

# Filter specific files
pnpm translate:get <workflowId> -o ./out --files subtitles video
```

**Options:**
| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--output` | `-o` | Output directory | `./translation-output` |
| `--files` | `-f` | Filter specific files | all files |

**Output Files:**
| File | Description |
|------|-------------|
| `subtitles.srt` | SRT subtitle file |
| `subtitles.vtt` | WebVTT subtitle file |
| `metadata.json` | Workflow metadata and results |
| `transcription.txt` | Original transcription |
| `translation.txt` | Translated text |
| `translated_video.mp4` | Video with embedded subtitles |

---

## How It Works

### CLI → API Architecture

The CLI scripts run on your **host machine** and make HTTP calls to the containerized service:

```
┌─────────────────────┐          HTTP           ┌─────────────────────┐
│   Host Machine      │  ───────────────────▶  │   Docker Container  │
│                     │                         │                     │
│  pnpm translate     │   POST /translate       │   NestJS Service    │
│  pnpm translate:get │   GET /translate/:id    │   port 3001         │
└─────────────────────┘                         └─────────────────────┘
         │                                                │
         │                                                │
         ▼                                                ▼
   ./output/{id}/                             /output/video-translator/{id}/
   (volume mount)                              (container filesystem)
```

### Environment Variables

The CLI loads `.env` via dotenv:

| Variable         | Purpose                | Default                 |
| ---------------- | ---------------------- | ----------------------- |
| `API_URL`        | NestJS service URL     | `http://localhost:3001` |
| `CLI_OUTPUT_DIR` | Local output directory | `./output`              |

**Example `.env`:**

```bash
# CLI Configuration
API_URL=http://localhost:3001
CLI_OUTPUT_DIR=./output
```

---

## Alternative: Using curl

If you don't want to install Node.js/pnpm on your host, use curl directly:

### Start Translation

```bash
curl -X POST http://localhost:3001/translate \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/video.mp4",
    "targetLanguage": "Spanish",
    "outputOptions": {
      "hardcodeSubtitles": false,
      "generateVideo": true
    }
  }'
# Returns: {"workflowId": "video-spanish-a1b2c3d4-...", "status": "started"}
```

### Check Progress

```bash
curl http://localhost:3001/translate/video-spanish-a1b2c3d4-.../progress
# Returns: {"currentStep": 3, "totalSteps": 7, "stepName": "Translating text", ...}
```

### Get Final Result

```bash
curl http://localhost:3001/translate/video-spanish-a1b2c3d4-...
# Returns full result with output paths
```

### Access Output Files

```bash
# Files are available via docker volume mount
ls ./output/video-spanish-a1b2c3d4-.../
# subtitles.srt subtitles.vtt metadata.json translated_video.mp4
```

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              WORKFLOW                                     │
│                                                                           │
│  pnpm translate -u video.mp4 -t Spanish                                   │
│        │                                                                  │
│        ▼                                                                  │
│  ┌──────────────┐     HTTP POST      ┌───────────────────────────────┐    │
│  │ translate-cli│ ────────────────▶  │ Container (port 3001)        │    │
│  │ (host)       │                    │                               │    │
│  │              │  polls /progress   │ - Temporal workflow runs      │    │
│  │   ████░░░░   │ ◀────────────────  │ - Saves to /output/{id}/     │    │
│  └──────────────┘                    └───────────────────────────────┘    │
│                                                   │                       │
│                                                   │ volume mount          │
│                                                   ▼                       │
│                                       ┌───────────────────────┐           │
│                                       │ ./output/{id}/        │           │
│                                       │  translated_video.mp4 │           │
│                                       │  subtitles.srt       │            │
│                                       │  metadata.json       │            │
│                                       └───────────────────────┘           │
│                                                   │                       │
│                                                   │ optional copy         │
│                                                   ▼                       │
│  pnpm translate:get {id} -o ./downloads/                                  │
│                                       ┌───────────────────────┐           │
│                                       │ ./downloads/          │           │
│                                       │  (same files)         │           │
│                                       └───────────────────────┘           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Running Inside Container

If you prefer to run CLI inside the container:

```bash
# Run translate CLI inside container
docker exec -it video-translator pnpm translate \
  -u https://example.com/video.mp4 -t Spanish

# Note: translate:get won't work for copying to host
# Use volume mount instead - files are at ./output/ on host
```

---

## Troubleshooting

### "Connection refused" error

- Ensure docker-compose is running: `docker-compose ps`
- Check service is healthy: `curl http://localhost:3001/health`

### "File not found" in translate:get

- Workflow may not be complete yet - check progress first
- Ensure volume mount is correct in docker-compose.yml
- Check `CLI_OUTPUT_DIR` points to the volume mount target

### Progress stuck at 0%

- Check workflow logs: `docker-compose logs -f translator`
- Verify OPENAI_API_KEY is set in .env
- Check Temporal UI at http://localhost:8089 for errors
