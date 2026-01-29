#!/usr/bin/env ts-node

/**
 * Video Translator CLI
 *
 * A command-line tool to translate videos with real-time progress tracking.
 * This CLI uses only HTTP calls to the API - it does NOT connect directly to Temporal.
 *
 * Usage:
 *   pnpm translate --url https://example.com/video.mp4 --target Spanish
 *   pnpm translate --file ./video.mp4 --target French
 *   pnpm translate --url https://example.com/video.mp4 --target German --hardcode
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") })

import * as path from "path"
import { Command } from "commander"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require("chalk")
import * as cliProgress from "cli-progress"
import * as fs from "fs"
import * as http from "http"

// Configuration
const API_URL = process.env.API_URL || "http://localhost:3001"
const POLL_INTERVAL_MS = 2000 // Poll every 2 seconds

interface TranslateOptions {
  url?: string
  file?: string
  target: string
  source?: string
  hardcode?: boolean
}

interface WorkflowProgress {
  currentStep: number
  totalSteps: number
  stepName: string
  percentComplete: number
  status: "running" | "completed" | "failed"
  error?: string
}

interface WorkflowStatus {
  workflowId: string
  status: string
  result?: {
    success: boolean
    transcription: string
    translation: string
    summary: string
    keyPoints?: string[]
    subtitlesPath: string
    outputVideoPath?: string
    artifactsDir?: string
    processingTimeMs: number
  }
}

/**
 * Make HTTP request to API with timeout
 */
function httpRequest<T>(method: string, urlPath: string, body?: unknown, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_URL)

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname,
      method,
      timeout: timeoutMs,
      headers: body
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(JSON.stringify(body)),
          }
        : {},
    }

    const req = http.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          const result = JSON.parse(data)
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(result.message || `HTTP ${res.statusCode}`))
          } else {
            resolve(result as T)
          }
        } catch {
          reject(new Error(`Invalid response: ${data}`))
        }
      })
    })

    req.on("timeout", () => {
      req.destroy()
      reject(new Error("Request timeout"))
    })

    req.on("error", reject)

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

/**
 * Start translation workflow via API
 */
async function startTranslation(options: TranslateOptions): Promise<string> {
  if (options.file) {
    // For file upload, we need multipart form data
    return startTranslationWithFile(options)
  } else if (options.url) {
    // URL-based translation
    const body = {
      videoUrl: options.url,
      targetLanguage: options.target,
      sourceLanguage: options.source,
      outputOptions: {
        hardcodeSubtitles: options.hardcode ?? false,
        generateVideo: true,
      },
    }

    const result = await httpRequest<{ workflowId: string }>("POST", "/translate", body)
    return result.workflowId
  } else {
    throw new Error("Either --url or --file must be provided")
  }
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".flv": "video/x-flv",
    ".wmv": "video/x-ms-wmv",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
  }
  return mimeTypes[ext] || "application/octet-stream"
}

/**
 * Start translation with file upload via API
 */
async function startTranslationWithFile(options: TranslateOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL("/translate/upload", API_URL)
    const boundary = "----FormBoundary" + Math.random().toString(36).substring(2)

    const filePath = path.resolve(options.file!)
    if (!fs.existsSync(filePath)) {
      reject(new Error(`File not found: ${filePath}`))
      return
    }

    const fileContent = fs.readFileSync(filePath)
    const fileName = path.basename(filePath)
    const mimeType = getMimeType(filePath)

    // Build multipart form data manually
    let body = `--${boundary}\r\n`
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
    body += `Content-Type: ${mimeType}\r\n\r\n`

    // Build the buffer parts
    const parts: Buffer[] = [Buffer.from(body), fileContent, Buffer.from(`\r\n--${boundary}\r\n`), Buffer.from(`Content-Disposition: form-data; name="targetLanguage"\r\n\r\n${options.target}\r\n`)]

    // Add optional sourceLanguage
    if (options.source) {
      parts.push(Buffer.from(`--${boundary}\r\n`))
      parts.push(Buffer.from(`Content-Disposition: form-data; name="sourceLanguage"\r\n\r\n${options.source}\r\n`))
    }

    // Add hardcodeSubtitles option
    parts.push(Buffer.from(`--${boundary}\r\n`))
    parts.push(Buffer.from(`Content-Disposition: form-data; name="hardcodeSubtitles"\r\n\r\n${options.hardcode ? "true" : "false"}\r\n`))

    // Close the multipart form
    parts.push(Buffer.from(`--${boundary}--\r\n`))

    const bodyBuffer = Buffer.concat(parts)

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 3001,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": bodyBuffer.length,
        },
      },
      (res) => {
        let data = ""
        res.on("data", (chunk) => (data += chunk))
        res.on("end", () => {
          try {
            const result = JSON.parse(data)
            if (result.workflowId) {
              resolve(result.workflowId)
            } else {
              reject(new Error(result.message || "Failed to start workflow"))
            }
          } catch {
            reject(new Error(`Invalid response: ${data}`))
          }
        })
      },
    )

    req.on("error", reject)
    req.write(bodyBuffer)
    req.end()
  })
}

/**
 * Query workflow progress via API
 */
async function queryProgress(workflowId: string): Promise<WorkflowProgress> {
  try {
    return await httpRequest<WorkflowProgress>("GET", `/translate/${workflowId}/progress`)
  } catch (error) {
    // If query fails, return unknown state
    return {
      currentStep: 0,
      totalSteps: 7,
      stepName: "Connecting...",
      percentComplete: 0,
      status: "running",
      error: error instanceof Error ? error.message : "Query failed",
    }
  }
}

/**
 * Get workflow status via API
 */
async function getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
  return httpRequest<WorkflowStatus>("GET", `/translate/${workflowId}`)
}

/**
 * Wait for workflow completion with progress bar
 */
async function waitForCompletion(workflowId: string): Promise<void> {
  console.log(chalk.cyan("\n⏳ Translation Progress\n"))

  const progressBar = new cliProgress.SingleBar(
    {
      format: `${chalk.cyan("{bar}")} ${chalk.yellow("{percentage}%")} | Step {currentStep}/{totalSteps}: ${chalk.white("{stepName}")}`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  )

  progressBar.start(100, 0, {
    currentStep: 0,
    totalSteps: 7,
    stepName: "Starting...",
  })

  while (true) {
    const progress = await queryProgress(workflowId)

    progressBar.update(progress.percentComplete, {
      currentStep: progress.currentStep,
      totalSteps: progress.totalSteps,
      stepName: progress.stepName,
    })

    if (progress.status === "completed") {
      progressBar.update(100, {
        currentStep: progress.totalSteps,
        totalSteps: progress.totalSteps,
        stepName: "Completed",
      })
      progressBar.stop()
      console.log(chalk.green("\n✅ Translation completed successfully!\n"))
      break
    }

    if (progress.status === "failed") {
      progressBar.stop()
      console.log(chalk.red(`\n❌ Translation failed: ${progress.error}\n`))
      process.exit(1)
    }

    await sleep(POLL_INTERVAL_MS)
  }

  // Get final result via API
  const status = await getWorkflowStatus(workflowId)

  if (status.result) {
    console.log(chalk.bold("Results:"))
    console.log(chalk.gray("─".repeat(50)))
    console.log(chalk.white(`Workflow ID: ${chalk.cyan(workflowId)}`))
    if (status.result.artifactsDir) {
      console.log(chalk.white(`Output Directory: ${chalk.cyan(status.result.artifactsDir)}`))
    }
    if (status.result.outputVideoPath) {
      console.log(chalk.white(`Translated Video: ${chalk.cyan(status.result.outputVideoPath)}`))
    }
    console.log(chalk.white(`Processing Time: ${chalk.cyan(formatDuration(status.result.processingTimeMs))}`))
    console.log(chalk.gray("─".repeat(50)))

    // Show summary
    console.log(chalk.bold("\nSummary:"))
    console.log(chalk.gray(status.result.summary))

    if (status.result.keyPoints && status.result.keyPoints.length > 0) {
      console.log(chalk.bold("\nKey Points:"))
      status.result.keyPoints.forEach((point: string, idx: number) => {
        console.log(chalk.gray(`  ${idx + 1}. ${point}`))
      })
    }

    console.log("")
  }
}

/**
 * Format duration in human readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

/**
 * Sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ==========================================
// Main Program
// ==========================================

const program = new Command()

program.name("translate").description("Video Translator CLI - Translate videos with real-time progress tracking").version("1.0.0")

program
  .option("-u, --url <url>", "URL to video file")
  .option("-f, --file <path>", "Path to local video file")
  .option("-t, --target <language>", "Target language (e.g., Spanish, French, German)")
  .option("-s, --source <language>", "Source language (optional, auto-detected)")
  .option("--hardcode", "Burn subtitles into video (default: softcode)")
  .action(async (options: TranslateOptions) => {
    try {
      // Validate options
      if (!options.url && !options.file) {
        console.log(chalk.red("Error: Either --url or --file must be provided"))
        program.help()
        return
      }

      if (!options.target) {
        console.log(chalk.red("Error: --target language is required"))
        program.help()
        return
      }

      console.log(chalk.bold.cyan("\n🎬 Video Translator CLI\n"))
      console.log(chalk.gray("─".repeat(50)))

      if (options.url) {
        console.log(chalk.white(`Source: ${chalk.cyan(options.url)}`))
      } else if (options.file) {
        console.log(chalk.white(`Source: ${chalk.cyan(path.resolve(options.file))}`))
      }

      console.log(chalk.white(`Target Language: ${chalk.cyan(options.target)}`))
      if (options.source) {
        console.log(chalk.white(`Source Language: ${chalk.cyan(options.source)}`))
      }
      console.log(chalk.white(`Subtitle Mode: ${chalk.cyan(options.hardcode ? "Hardcoded (burned-in)" : "Softcoded (selectable)")}`))
      console.log(chalk.gray("─".repeat(50)))

      // Start translation via API
      console.log(chalk.gray("\nStarting translation workflow..."))
      const workflowId = await startTranslation(options)
      console.log(chalk.green(`Workflow started: ${chalk.cyan(workflowId)}`))

      // Wait for completion (polling API for progress)
      await waitForCompletion(workflowId)
    } catch (error) {
      console.log(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : error}`))
      process.exit(1)
    }
  })

program.parse()
