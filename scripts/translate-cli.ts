#!/usr/bin/env ts-node

/**
 * Video Translator CLI
 *
 * A command-line tool to translate videos with real-time progress tracking.
 *
 * Usage:
 *   pnpm translate --url https://example.com/video.mp4 --target Spanish
 *   pnpm translate --file ./video.mp4 --target French
 *   pnpm translate --url https://example.com/video.mp4 --target German --hardcode
 */

import { Command } from "commander"
import * as chalk from "chalk"
import * as cliProgress from "cli-progress"
import { Connection, WorkflowClient } from "@temporalio/client"
import * as fs from "fs"
import * as path from "path"
import * as http from "http"

// Configuration
const API_URL = process.env.API_URL || "http://localhost:3001"
const TEMPORAL_ADDRESS = process.env.TEMPORAL_SERVER_ADDRESS || "localhost:7233"
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || "default"
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

/**
 * Create Temporal client connection
 */
async function createTemporalClient(): Promise<WorkflowClient> {
  console.log(chalk.gray(`Connecting to Temporal at ${TEMPORAL_ADDRESS}...`))

  const connection = await Connection.connect({
    address: TEMPORAL_ADDRESS,
    tls: false,
  })

  return new WorkflowClient({
    connection,
    namespace: TEMPORAL_NAMESPACE,
  })
}

/**
 * Start translation workflow via API
 */
async function startTranslation(options: TranslateOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_URL}/translate`)

    if (options.file) {
      // File upload method
      const uploadUrl = new URL(`${API_URL}/translate/upload`)
      const boundary = "----FormBoundary" + Math.random().toString(36).substring(2)

      const filePath = path.resolve(options.file)
      if (!fs.existsSync(filePath)) {
        reject(new Error(`File not found: ${filePath}`))
        return
      }

      const fileContent = fs.readFileSync(filePath)
      const fileName = path.basename(filePath)

      // Build multipart form data manually
      let body = `--${boundary}\r\n`
      body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
      body += `Content-Type: application/octet-stream\r\n\r\n`

      const bodyBuffer = Buffer.concat([Buffer.from(body), fileContent, Buffer.from(`\r\n--${boundary}\r\n`), Buffer.from(`Content-Disposition: form-data; name="targetLanguage"\r\n\r\n${options.target}\r\n`), options.source ? Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="sourceLanguage"\r\n\r\n${options.source}\r\n`) : Buffer.from(""), Buffer.from(`--${boundary}--\r\n`)])

      const req = http.request(
        {
          hostname: uploadUrl.hostname,
          port: uploadUrl.port || 3001,
          path: uploadUrl.pathname,
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
    } else if (options.url) {
      // URL-based translation
      const body = JSON.stringify({
        videoUrl: options.url,
        targetLanguage: options.target,
        sourceLanguage: options.source,
        outputOptions: {
          hardcodeSubtitles: options.hardcode ?? false,
          generateVideo: true,
        },
      })

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 3001,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
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
      req.write(body)
      req.end()
    } else {
      reject(new Error("Either --url or --file must be provided"))
    }
  })
}

/**
 * Query workflow progress
 */
async function queryProgress(client: WorkflowClient, workflowId: string): Promise<WorkflowProgress> {
  try {
    const handle = client.getHandle(workflowId)
    const description = await handle.describe()

    if (description.status.name === "COMPLETED") {
      return {
        currentStep: 7,
        totalSteps: 7,
        stepName: "Completed",
        percentComplete: 100,
        status: "completed",
      }
    }

    if (description.status.name === "TIMED_OUT" || description.status.name === "CANCELLED") {
      return {
        currentStep: 0,
        totalSteps: 7,
        stepName: description.status.name,
        percentComplete: 0,
        status: "failed",
        error: `Workflow ${description.status.name.toLowerCase()}`,
      }
    }

    // Query the workflow for progress
    try {
      const progress = await handle.query<WorkflowProgress>("getProgress")
      return progress
    } catch {
      // Query might fail initially - return default running state
      return {
        currentStep: 0,
        totalSteps: 7,
        stepName: "Initializing...",
        percentComplete: 0,
        status: "running",
      }
    }
  } catch (error) {
    return {
      currentStep: 0,
      totalSteps: 7,
      stepName: "Error",
      percentComplete: 0,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Wait for workflow completion with progress bar
 */
async function waitForCompletion(client: WorkflowClient, workflowId: string): Promise<void> {
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

  let lastProgress: WorkflowProgress | null = null

  while (true) {
    const progress = await queryProgress(client, workflowId)
    lastProgress = progress

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

  // Get final result
  const handle = client.getHandle(workflowId)
  const result = await handle.result()

  console.log(chalk.bold("Results:"))
  console.log(chalk.gray("─".repeat(50)))
  console.log(chalk.white(`Workflow ID: ${chalk.cyan(workflowId)}`))
  if (result.artifactsDir) {
    console.log(chalk.white(`Output Directory: ${chalk.cyan(result.artifactsDir)}`))
  }
  if (result.outputVideoPath) {
    console.log(chalk.white(`Translated Video: ${chalk.cyan(result.outputVideoPath)}`))
  }
  console.log(chalk.white(`Processing Time: ${chalk.cyan(formatDuration(result.processingTimeMs))}`))
  console.log(chalk.gray("─".repeat(50)))

  // Show summary
  console.log(chalk.bold("\nSummary:"))
  console.log(chalk.gray(result.summary))

  if (result.keyPoints && result.keyPoints.length > 0) {
    console.log(chalk.bold("\nKey Points:"))
    result.keyPoints.forEach((point: string, idx: number) => {
      console.log(chalk.gray(`  ${idx + 1}. ${point}`))
    })
  }

  console.log("")
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

      // Start translation
      console.log(chalk.gray("\nStarting translation workflow..."))
      const workflowId = await startTranslation(options)
      console.log(chalk.green(`Workflow started: ${chalk.cyan(workflowId)}`))

      // Connect to Temporal and wait for completion
      const client = await createTemporalClient()
      await waitForCompletion(client, workflowId)
    } catch (error) {
      console.log(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : error}`))
      process.exit(1)
    }
  })

program.parse()
