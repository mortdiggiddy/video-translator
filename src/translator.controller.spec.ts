import { Test, TestingModule } from "@nestjs/testing"
import { TranslatorController } from "./translator.controller"
import { TranslatorService } from "./translator.service"
import { TranslateVideoDto } from "./dto"

describe("TranslatorController", () => {
  let controller: TranslatorController
  let service: TranslatorService

  const mockTranslatorService = {
    getHealthStatus: jest.fn(),
    getServiceInfo: jest.fn(),
    startTranslation: jest.fn(),
    getTranslationStatus: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranslatorController],
      providers: [{ provide: TranslatorService, useValue: mockTranslatorService }],
    }).compile()

    controller = module.get<TranslatorController>(TranslatorController)
    service = module.get<TranslatorService>(TranslatorService)

    // Reset mocks before each test
    jest.clearAllMocks()
  })

  describe("healthCheck", () => {
    it("should return health status from service", () => {
      const mockResult = {
        status: "ok",
        service: "video-translator",
        timestamp: "2026-01-29T10:00:00.000Z",
      }
      mockTranslatorService.getHealthStatus.mockReturnValue(mockResult)

      const result = controller.healthCheck()

      expect(result).toEqual(mockResult)
      expect(mockTranslatorService.getHealthStatus).toHaveBeenCalled()
    })
  })

  describe("getInfo", () => {
    it("should return service info from service", () => {
      const mockResult = {
        name: "video-translator",
        version: "1.0.0",
        description: "Video Translation Microservice",
        environment: "test",
      }
      mockTranslatorService.getServiceInfo.mockReturnValue(mockResult)

      const result = controller.getInfo()

      expect(result).toEqual(mockResult)
      expect(mockTranslatorService.getServiceInfo).toHaveBeenCalled()
    })
  })

  describe("startTranslation", () => {
    it("should start translation workflow", async () => {
      const dto: TranslateVideoDto = {
        videoUrl: "https://example.com/video.mp4",
        targetLanguage: "Spanish",
        sourceLanguage: "English",
      }
      const mockResult = {
        workflowId: "translation-123",
        runId: "run-456",
        status: "RUNNING",
      }
      mockTranslatorService.startTranslation.mockResolvedValue(mockResult)

      const result = await controller.startTranslation(dto)

      expect(result).toEqual(mockResult)
      expect(mockTranslatorService.startTranslation).toHaveBeenCalledWith(dto)
    })
  })

  describe("getTranslationStatus", () => {
    it("should get workflow status", async () => {
      const workflowId = "translation-123"
      const mockResult = {
        workflowId,
        runId: "run-456",
        status: "COMPLETED",
        result: { translatedText: "Hola mundo" },
      }
      mockTranslatorService.getTranslationStatus.mockResolvedValue(mockResult)

      const result = await controller.getTranslationStatus(workflowId)

      expect(result).toEqual(mockResult)
      expect(mockTranslatorService.getTranslationStatus).toHaveBeenCalledWith(workflowId)
    })
  })
})
