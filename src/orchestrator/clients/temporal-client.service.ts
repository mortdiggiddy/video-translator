import { Injectable, OnModuleInit, OnModuleDestroy, Logger, OnApplicationShutdown } from "@nestjs/common"
import { Connection, WorkflowClient } from "@temporalio/client"
import { NativeConnection, Worker, bundleWorkflowCode, WorkflowBundleWithSourceMap } from "@temporalio/worker"
import { ConfigService } from "@nestjs/config"
import * as path from "path"
import * as fs from "fs"
import { v4 as uuidv4 } from "uuid"

@Injectable()
export class TemporalClientService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private client: WorkflowClient
  private worker: Worker | null = null
  private static workflowBundle: WorkflowBundleWithSourceMap | undefined
  private static started = false

  protected logger = new Logger(TemporalClientService.name)

  constructor(private readonly configService: ConfigService) {
    this.setupSignalHandlers()
  }

  async onModuleInit() {
    if (TemporalClientService.started) {
      this.logger.warn("TemporalClientService already initialized. Skipping duplicate init.")
      return
    }

    TemporalClientService.started = true

    try {
      const address = this.configService.get<string>("TEMPORAL_SERVER_ADDRESS", "temporal:7233")
      const namespace = this.configService.get<string>("TEMPORAL_NAMESPACE", "default")

      this.logger.log(`Connecting to Temporal server at ${address}...`)

      const connection = await Connection.connect({
        address,
        tls: false,
      })

      this.client = new WorkflowClient({
        connection,
        namespace,
      })

      // Verify connection
      await connection.workflowService.getSystemInfo({})

      this.logger.log(`✅ Temporal client initialized for namespace:address = ${namespace}:${address}`)

      // Start worker
      await this.startWorker(namespace)
    } catch (error) {
      this.logger.error("❌ Error initializing Temporal client:", error)
      throw error
    }
  }

  async onModuleDestroy() {
    await this.shutdownWorker()

    if (this.client?.connection) {
      await this.client.connection.close()
      this.logger.log("Temporal connection closed.")
    }
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Application shutting down due to signal: ${signal}`)
    await this.onModuleDestroy()
  }

  getClient(): WorkflowClient {
    if (!this.client) {
      throw new Error("Temporal client is not initialized.")
    }
    return this.client
  }

  /**
   * Start a translation workflow
   *
   * @param input - Workflow input matching TranslationWorkflowInput interface
   */
  async startTranslationWorkflow(input: {
    videoUrl: string
    targetLanguage: string
    sourceLanguage?: string
    fileName?: string
    outputOptions?: {
      hardcodeSubtitles?: boolean
      generateVideo?: boolean
    }
  }): Promise<{ workflowId: string; status: string }> {
    // Generate workflow ID: filename-targetlanguage-uuid
    const fileBaseName = this.extractBaseName(input.videoUrl, input.fileName)
    const targetLang = input.targetLanguage.toLowerCase().replace(/\s+/g, "-")
    const workflowId = `${fileBaseName}-${targetLang}-${uuidv4()}`

    this.logger.log(`Starting translation workflow: ${workflowId}`)

    // Build full workflow input with workflowId included
    const workflowInput = {
      ...input,
      workflowId, // Pass workflowId so workflow can use it for artifact paths
    }

    const handle = await this.client.start("translationWorkflow", {
      args: [workflowInput],
      workflowId,
      taskQueue: "translation-queue",
    })

    return {
      workflowId: handle.workflowId,
      status: "started",
    }
  }

  /**
   * Extract base name from URL or filename (without extension)
   */
  private extractBaseName(videoUrl: string, fileName?: string): string {
    // If filename provided, use it
    if (fileName) {
      return fileName
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .toLowerCase()
    }

    // Extract from URL
    try {
      const url = new URL(videoUrl)
      const pathname = url.pathname
      const filename = pathname.split("/").pop() || "video"
      return filename
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .toLowerCase()
    } catch {
      // If not a valid URL, try to extract as file path
      const parts = videoUrl.split("/")
      const filename = parts[parts.length - 1] || "video"
      return filename
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .toLowerCase()
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<{
    workflowId: string
    status: string
    result?: any
  }> {
    const handle = this.client.getHandle(workflowId)
    const description = await handle.describe()

    return {
      workflowId,
      status: description.status.name,
      result: description.status.name === "COMPLETED" ? await handle.result() : undefined,
    }
  }

  /**
   * Query workflow progress using Temporal query mechanism
   *
   * @param workflowId - The workflow ID to query
   * @returns WorkflowProgress object with current step, percentage, etc.
   */
  async queryWorkflowProgress(workflowId: string): Promise<{
    currentStep: number
    totalSteps: number
    stepName: string
    percentComplete: number
    status: "running" | "completed" | "failed"
    error?: string
  }> {
    try {
      const handle = this.client.getHandle(workflowId)

      // Check if workflow is still running
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
      const progress = await handle.query<{
        currentStep: number
        totalSteps: number
        stepName: string
        percentComplete: number
        status: "running" | "completed" | "failed"
        error?: string
      }>("getProgress")

      return progress
    } catch (error) {
      this.logger.error(`Error querying workflow progress: ${error}`)

      // If query fails, return unknown state
      return {
        currentStep: 0,
        totalSteps: 7,
        stepName: "Unknown",
        percentComplete: 0,
        status: "running",
        error: error instanceof Error ? error.message : "Query failed",
      }
    }
  }

  private async startWorker(namespace: string): Promise<void> {
    try {
      const address = this.configService.get<string>("TEMPORAL_SERVER_ADDRESS", "temporal:7233")

      const nativeConnection = await NativeConnection.connect({ address })

      // Bundle workflows
      if (!TemporalClientService.workflowBundle) {
        const workflowsPath = path.resolve(__dirname, "../workflows")

        if (fs.existsSync(workflowsPath)) {
          this.logger.log(`Bundling workflows from: ${workflowsPath}`)

          TemporalClientService.workflowBundle = await bundleWorkflowCode({
            workflowsPath,
          })

          this.logger.log(`✅ Workflow bundle created`)
        } else {
          this.logger.warn(`⚠️ Workflows directory not found at ${workflowsPath} - skipping worker start`)
          return
        }
      }

      // Import activities
      const activitiesModule = await import("../activities")

      this.worker = await Worker.create({
        connection: nativeConnection,
        taskQueue: "translation-queue",
        namespace,
        workflowBundle: TemporalClientService.workflowBundle,
        activities: activitiesModule,
      })

      this.logger.log(`✅ Temporal worker started for task queue: translation-queue`)

      // Run worker in background
      this.worker.run().catch((err) => {
        this.logger.error("❌ Worker error:", err)
      })
    } catch (error) {
      this.logger.warn(`⚠️ Could not start worker: ${(error as Error).message}`)
    }
  }

  private async shutdownWorker(): Promise<void> {
    if (this.worker) {
      this.worker.shutdown()
      this.logger.log("Temporal worker shut down.")
      this.worker = null
    }
  }

  private setupSignalHandlers() {
    process.on("SIGTERM", async () => {
      this.logger.log("SIGTERM received. Cleaning up...")
      await this.onApplicationShutdown("SIGTERM")
      process.exit(0)
    })

    process.on("SIGINT", async () => {
      this.logger.log("SIGINT received. Cleaning up...")
      await this.onApplicationShutdown("SIGINT")
      process.exit(0)
    })
  }
}
