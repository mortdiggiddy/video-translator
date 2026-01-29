# Network Resilience for Temporal Activities

## Problem: ECONNRESET during Whisper API uploads

Long-running HTTP uploads (>30s) to OpenAI's Whisper API were being killed by TCP idle timeouts, causing `ECONNRESET` errors.

## Root Cause

Default Node.js `node-fetch` behavior:

- No TCP keepalive packets
- No request timeout
- New socket per request

When uploading large audio files, the socket would idle during the upload phase and get killed by network infrastructure (load balancers, NAT, etc.) after 30-40 seconds.

## Fixes Applied

### 1. HTTPS Agent with Keepalive

```typescript
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // Send keepalive every 30s
})
```

### 2. Manual Retry Wrapper

```typescript
await retryWithBackoff(fn, { attempts: 3, delayMs: 2000 })
```

- Retries only on `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`
- Does NOT retry on 4xx client errors
- Exponential backoff between attempts

### 3. Audio Compression (ffmpeg.utils.ts)

- 64kbps bitrate (vs 192k)
- Mono channel (vs stereo)
- 16kHz sample rate (Whisper's native rate)

Result: **~6x smaller file size**, faster uploads, less timeout risk.

### 4. Longer Activity Timeout (workflow)

```typescript
const { transcribeAudio } = proxyActivities({
  startToCloseTimeout: "30 minutes",
  retry: { maximumAttempts: 1 }, // We retry manually
})
```

## Temporal-Specific Notes

- **We handle retries manually** in the activity, not via Temporal's retry policy
- This gives us control over which errors to retry (only network errors, not API errors)
- Temporal's `startToCloseTimeout` is set high (30m) to allow for large file processing
- The activity itself manages connection resilience

## Additional Hardening Fixes

### 1. Idempotent Transcription Cache

- Compute a deterministic key (e.g., `sha256(audio)` or `workflowId + audioHash`).
- Store transcription results keyed by that value.
- On retry, return the cached result instead of re-uploading.

### 2. Workflow-Level Backoff and Control

- Keep activity retries minimal.
- On transient connectivity errors, let the workflow apply progressive backoff (`sleep`) before re-invoking the activity.
- This avoids rapid retry storms and keeps orchestration decisions in the workflow layer.

### 3. Circuit Breaker for Upstream Instability

- Track consecutive network failures per worker (or per dependency).
- If failures exceed a threshold, fail fast for a short cooldown window.
- Surface a typed error so the workflow can pause, alert, or route to an alternative path.

### 4. Chunked Transcription for Long Media

- Split long audio into fixed windows (e.g., 5–10 minutes).
- Transcribe chunks independently.
- Re-time segments with offsets and stitch results.
- Bounds request duration and reduces the probability of midstream resets.

### 5. Worker Concurrency and Rate Limiting

- Constrain worker concurrency for transcription tasks to protect outbound bandwidth and sockets.
- Add a simple token bucket limiter per worker process to smooth burst traffic.

### 6. Cancellation and Cleanup Discipline

- Propagate cancellation to the HTTP request when possible (abort signal).
- Ensure temp files get cleaned on cancellation and failure paths.
- Prevents wasted uploads and resource leaks during workflow termination.
