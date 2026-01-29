import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { TemporalClientService } from "./orchestrator/clients/temporal-client.service"
import { TranslateVideoDto } from "./dto"
import { WorkflowException, WorkflowNotFoundException, TemporalConnectionException } from "./common/exceptions"

/**
 * Helper function to extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Helper function to check if error message contains a specific string
 */
function errorContains(error: unknown, ...patterns: string[]): boolean {
  const message = getErrorMessage(error)
  return patterns.some((p) => message.includes(p))
}

@Injectable()
export class TranslatorService {
  private readonly logger = new Logger(TranslatorService.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly temporalClient: TemporalClientService,
  ) {}

  getHealthStatus() {
    this.logger.log("Health check requested")
    return {
      status: "ok",
      service: this.configService.get<string>("SERVICE_NAME"),
      timestamp: new Date().toISOString(),
    }
  }

  getServiceInfo() {
    return {
      name: this.configService.get<string>("SERVICE_NAME"),
      version: "1.0.0",
      description: "Video Translation Microservice",
      environment: this.configService.get<string>("NODE_ENV"),
    }
  }

  /**
   * Start a translation workflow via Temporal
   */
  async startTranslation(dto: TranslateVideoDto) {
    this.logger.log(`Starting translation: ${dto.videoUrl} → ${dto.targetLanguage}`)

    try {
      const result = await this.temporalClient.startTranslationWorkflow(dto)
      this.logger.log(`Workflow started: ${result.workflowId}`)
      return result
    } catch (error) {
      const errorMsg = getErrorMessage(error)
      this.logger.error(`Failed to start translation workflow: ${errorMsg}`, error instanceof Error ? error.stack : undefined)

      // Check for specific error types
      if (errorContains(error, "connection", "UNAVAILABLE")) {
        throw new TemporalConnectionException("Temporal server is unavailable. Please try again later.")
      }

      throw new WorkflowException(`Failed to start translation: ${errorMsg}`)
    }
  }

  /**
   * Get the status of a translation workflow
   */
  async getTranslationStatus(workflowId: string) {
    this.logger.log(`Getting status for workflow: ${workflowId}`)

    try {
      const status = await this.temporalClient.getWorkflowStatus(workflowId)

      if (!status) {
        throw new WorkflowNotFoundException(workflowId)
      }

      return status
    } catch (error) {
      // Re-throw custom exceptions
      if (error instanceof WorkflowNotFoundException) {
        throw error
      }

      const errorMsg = getErrorMessage(error)
      this.logger.error(`Failed to get workflow status: ${errorMsg}`, error instanceof Error ? error.stack : undefined)

      // Check for not found errors from Temporal
      if (errorContains(error, "not found", "NOT_FOUND")) {
        throw new WorkflowNotFoundException(workflowId)
      }

      // Check for connection errors
      if (errorContains(error, "connection", "UNAVAILABLE")) {
        throw new TemporalConnectionException("Temporal server is unavailable. Please try again later.")
      }

      throw new WorkflowException(`Failed to get workflow status: ${errorMsg}`)
    }
  }
}
