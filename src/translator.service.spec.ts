import { Test, TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { TranslatorService } from "./translator.service"
import { TemporalClientService } from "./orchestrator/clients/temporal-client.service"
import { WorkflowException, WorkflowNotFoundException, TemporalConnectionException } from "./common/exceptions"
import { TranslateVideoDto } from "./dto"

describe("TranslatorService", () => {
  let service: TranslatorService
  let configService: ConfigService
  let temporalClientService: TemporalClientService

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        SERVICE_NAME: "video-translator",
        NODE_ENV: "test",
      }
      return config[key]
    }),
  }

  const mockTemporalClientService = {
    startTranslationWorkflow: jest.fn(),
    getWorkflowStatus: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TranslatorService, { provide: ConfigService, useValue: mockConfigService }, { provide: TemporalClientService, useValue: mockTemporalClientService }],
    }).compile()

    service = module.get<TranslatorService>(TranslatorService)
    configService = module.get<ConfigService>(ConfigService)
    temporalClientService = module.get<TemporalClientService>(TemporalClientService)

    // Reset mocks before each test
    jest.clearAllMocks()
  })

  describe("getHealthStatus", () => {
    it("should return health status with ok status", () => {
      const result = service.getHealthStatus()

      expect(result.status).toBe("ok")
      expect(result.service).toBe("video-translator")
      expect(result.timestamp).toBeDefined()
      expect(new Date(result.timestamp)).toBeInstanceOf(Date)
    })
  })

  describe("getServiceInfo", () => {
    it("should return service info", () => {
      const result = service.getServiceInfo()

      expect(result.name).toBe("video-translator")
      expect(result.version).toBe("1.0.0")
      expect(result.description).toBe("Video Translation Microservice")
      expect(result.environment).toBe("test")
    })
  })

  describe("startTranslation", () => {
    const dto: TranslateVideoDto = {
      videoUrl: "https://example.com/video.mp4",
      targetLanguage: "Spanish",
      sourceLanguage: "English",
    }

    it("should start translation workflow successfully", async () => {
      const mockResult = {
        workflowId: "translation-123",
        runId: "run-456",
        status: "RUNNING",
      }
      mockTemporalClientService.startTranslationWorkflow.mockResolvedValue(mockResult)

      const result = await service.startTranslation(dto)

      expect(result).toEqual(mockResult)
      expect(mockTemporalClientService.startTranslationWorkflow).toHaveBeenCalledWith(dto)
    })

    it("should throw WorkflowException on general failure", async () => {
      mockTemporalClientService.startTranslationWorkflow.mockRejectedValue(new Error("Unknown error"))

      await expect(service.startTranslation(dto)).rejects.toThrow(WorkflowException)
    })

    it("should throw TemporalConnectionException on connection failure", async () => {
      mockTemporalClientService.startTranslationWorkflow.mockRejectedValue(new Error("connection refused"))

      await expect(service.startTranslation(dto)).rejects.toThrow(TemporalConnectionException)
    })

    it("should throw TemporalConnectionException on UNAVAILABLE error", async () => {
      mockTemporalClientService.startTranslationWorkflow.mockRejectedValue(new Error("UNAVAILABLE: service unavailable"))

      await expect(service.startTranslation(dto)).rejects.toThrow(TemporalConnectionException)
    })
  })

  describe("getTranslationStatus", () => {
    const workflowId = "translation-123"

    it("should return workflow status successfully", async () => {
      const mockStatus = {
        workflowId,
        runId: "run-456",
        status: "COMPLETED",
        result: { translatedText: "Hola mundo" },
      }
      mockTemporalClientService.getWorkflowStatus.mockResolvedValue(mockStatus)

      const result = await service.getTranslationStatus(workflowId)

      expect(result).toEqual(mockStatus)
      expect(mockTemporalClientService.getWorkflowStatus).toHaveBeenCalledWith(workflowId)
    })

    it("should throw WorkflowNotFoundException when status is null", async () => {
      mockTemporalClientService.getWorkflowStatus.mockResolvedValue(null)

      await expect(service.getTranslationStatus(workflowId)).rejects.toThrow(WorkflowNotFoundException)
    })

    it("should throw WorkflowNotFoundException on not found error", async () => {
      mockTemporalClientService.getWorkflowStatus.mockRejectedValue(new Error("workflow not found"))

      await expect(service.getTranslationStatus(workflowId)).rejects.toThrow(WorkflowNotFoundException)
    })

    it("should throw WorkflowNotFoundException on NOT_FOUND error", async () => {
      mockTemporalClientService.getWorkflowStatus.mockRejectedValue(new Error("NOT_FOUND: no workflow"))

      await expect(service.getTranslationStatus(workflowId)).rejects.toThrow(WorkflowNotFoundException)
    })

    it("should throw TemporalConnectionException on connection failure", async () => {
      mockTemporalClientService.getWorkflowStatus.mockRejectedValue(new Error("connection refused"))

      await expect(service.getTranslationStatus(workflowId)).rejects.toThrow(TemporalConnectionException)
    })

    it("should throw WorkflowException on unknown error", async () => {
      mockTemporalClientService.getWorkflowStatus.mockRejectedValue(new Error("Unknown error"))

      await expect(service.getTranslationStatus(workflowId)).rejects.toThrow(WorkflowException)
    })
  })
})
