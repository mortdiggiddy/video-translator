import { HttpException, HttpStatus } from "@nestjs/common"
import { HttpExceptionFilter } from "./http-exception.filter"
import { TranslatorException, WorkflowNotFoundException } from "../exceptions"

describe("HttpExceptionFilter", () => {
  let filter: HttpExceptionFilter

  const mockJson = jest.fn()
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson })
  const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus })
  const mockGetRequest = jest.fn().mockReturnValue({
    url: "/test",
    method: "GET",
    headers: {},
  })

  const mockArgumentsHost = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: mockGetResponse,
      getRequest: mockGetRequest,
    }),
  }

  beforeEach(() => {
    filter = new HttpExceptionFilter()
    jest.clearAllMocks()
    // Mock Date
    jest.useFakeTimers()
    jest.setSystemTime(new Date("2026-01-29T10:00:00.000Z"))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe("catch", () => {
    it("should handle HttpException with default format", () => {
      const exception = new HttpException("Test error", HttpStatus.BAD_REQUEST)

      filter.catch(exception, mockArgumentsHost as any)

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: "Test error",
          path: "/test",
          method: "GET",
          timestamp: expect.any(String),
        }),
      )
    })

    it("should handle HttpException with object response", () => {
      const exception = new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: "Validation failed",
          error: "ValidationError",
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      )

      filter.catch(exception, mockArgumentsHost as any)

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: "Validation failed",
          error: "ValidationError",
        }),
      )
    })

    it("should handle TranslatorException", () => {
      const exception = new TranslatorException("Custom translator error", HttpStatus.BAD_GATEWAY, "CustomError")

      filter.catch(exception, mockArgumentsHost as any)

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_GATEWAY,
          message: "Custom translator error",
          error: "CustomError",
        }),
      )
    })

    it("should handle WorkflowNotFoundException", () => {
      const exception = new WorkflowNotFoundException("workflow-123")

      filter.catch(exception, mockArgumentsHost as any)

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: "Workflow not found: workflow-123",
          error: "WorkflowNotFound",
        }),
      )
    })

    it("should include timestamp, path, and method in response", () => {
      const exception = new HttpException("Test", HttpStatus.OK)

      filter.catch(exception, mockArgumentsHost as any)

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
          path: "/test",
          method: "GET",
        }),
      )
    })

    it("should handle generic Error (non-HttpException)", () => {
      const exception = new Error("Generic error")

      filter.catch(exception as any, mockArgumentsHost as any)

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: "Generic error",
        }),
      )
    })

    it("should include requestId if present in headers", () => {
      const requestWithId = {
        url: "/test",
        method: "POST",
        headers: { "x-request-id": "req-12345" },
      }
      mockGetRequest.mockReturnValue(requestWithId)

      const exception = new HttpException("Test", HttpStatus.OK)

      filter.catch(exception, mockArgumentsHost as any)

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-12345",
        }),
      )
    })
  })
})
