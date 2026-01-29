import { HttpStatus } from "@nestjs/common"
import { TranslatorException, WorkflowException, WorkflowNotFoundException, TemporalConnectionException, OpenAIException, TranscriptionException, TranslationException, FileProcessingException, ValidationException } from "./index"

describe("Custom Exceptions", () => {
  describe("TranslatorException", () => {
    it("should create exception with default status", () => {
      const exception = new TranslatorException("Test error")

      expect(exception.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
      expect(exception.getResponse()).toMatchObject({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "Test error",
        error: "TranslatorError",
      })
    })

    it("should create exception with custom status and code", () => {
      const exception = new TranslatorException("Custom error", HttpStatus.BAD_REQUEST, "CustomCode")

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST)
      expect(exception.getResponse()).toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Custom error",
        error: "CustomCode",
      })
      expect(exception.code).toBe("CustomCode")
    })

    it("should include timestamp in response", () => {
      const exception = new TranslatorException("Test")
      const response = exception.getResponse() as Record<string, unknown>

      expect(response.timestamp).toBeDefined()
      expect(typeof response.timestamp).toBe("string")
    })
  })

  describe("WorkflowException", () => {
    it("should create with BAD_REQUEST status by default", () => {
      const exception = new WorkflowException("Workflow error")

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST)
      expect(exception.getResponse()).toMatchObject({
        error: "WorkflowError",
      })
    })

    it("should allow custom status", () => {
      const exception = new WorkflowException("Custom workflow error", HttpStatus.CONFLICT)

      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT)
    })
  })

  describe("WorkflowNotFoundException", () => {
    it("should create with NOT_FOUND status", () => {
      const exception = new WorkflowNotFoundException("workflow-123")

      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND)
      expect(exception.getResponse()).toMatchObject({
        message: "Workflow not found: workflow-123",
        error: "WorkflowNotFound",
      })
    })
  })

  describe("TemporalConnectionException", () => {
    it("should create with SERVICE_UNAVAILABLE status", () => {
      const exception = new TemporalConnectionException()

      expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
      expect(exception.getResponse()).toMatchObject({
        message: "Failed to connect to Temporal server",
        error: "TemporalConnectionError",
      })
    })

    it("should allow custom message", () => {
      const exception = new TemporalConnectionException("Custom connection error")

      expect(exception.getResponse()).toMatchObject({
        message: "Custom connection error",
      })
    })
  })

  describe("OpenAIException", () => {
    it("should create with BAD_GATEWAY status", () => {
      const exception = new OpenAIException()

      expect(exception.getStatus()).toBe(HttpStatus.BAD_GATEWAY)
      expect(exception.getResponse()).toMatchObject({
        message: "OpenAI API error occurred",
        error: "OpenAIError",
      })
    })
  })

  describe("TranscriptionException", () => {
    it("should create with UNPROCESSABLE_ENTITY status", () => {
      const exception = new TranscriptionException()

      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
      expect(exception.getResponse()).toMatchObject({
        message: "Failed to transcribe audio",
        error: "TranscriptionError",
      })
    })
  })

  describe("TranslationException", () => {
    it("should create with UNPROCESSABLE_ENTITY status", () => {
      const exception = new TranslationException()

      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
      expect(exception.getResponse()).toMatchObject({
        message: "Failed to translate text",
        error: "TranslationError",
      })
    })
  })

  describe("FileProcessingException", () => {
    it("should create with UNPROCESSABLE_ENTITY status", () => {
      const exception = new FileProcessingException()

      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
      expect(exception.getResponse()).toMatchObject({
        message: "Failed to process file",
        error: "FileProcessingError",
      })
    })
  })

  describe("ValidationException", () => {
    it("should create with BAD_REQUEST status", () => {
      const exception = new ValidationException("Invalid input")

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST)
      expect(exception.getResponse()).toMatchObject({
        message: "Invalid input",
        error: "ValidationError",
      })
    })
  })
})
