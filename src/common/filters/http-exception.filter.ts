import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from "@nestjs/common"
import { Request, Response } from "express"

interface ErrorResponse {
  statusCode: number
  message: string | string[]
  error: string
  timestamp: string
  path: string
  method: string
  requestId?: string
}

/**
 * Global exception filter that catches all exceptions and formats them consistently
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status: number
    let message: string | string[]
    let error: string

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>
        message = (responseObj.message as string | string[]) || exception.message
        error = (responseObj.error as string) || this.getErrorName(status)
      } else {
        message = exceptionResponse as string
        error = this.getErrorName(status)
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR
      message = exception.message || "Internal server error"
      error = "InternalServerError"

      // Log unexpected errors with stack trace
      this.logger.error(`Unexpected error: ${exception.message}`, exception.stack)
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR
      message = "An unexpected error occurred"
      error = "UnknownError"

      this.logger.error(`Unknown error type: ${JSON.stringify(exception)}`)
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    }

    // Add request ID if available (for tracing)
    const requestId = request.headers["x-request-id"] as string
    if (requestId) {
      errorResponse.requestId = requestId
    }

    // Log the error (non-4xx errors are logged as errors)
    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} - ${status} - ${JSON.stringify(message)}`)
    } else {
      this.logger.warn(`${request.method} ${request.url} - ${status} - ${JSON.stringify(message)}`)
    }

    response.status(status).json(errorResponse)
  }

  private getErrorName(status: number): string {
    const statusMessages: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: "Bad Request",
      [HttpStatus.UNAUTHORIZED]: "Unauthorized",
      [HttpStatus.FORBIDDEN]: "Forbidden",
      [HttpStatus.NOT_FOUND]: "Not Found",
      [HttpStatus.METHOD_NOT_ALLOWED]: "Method Not Allowed",
      [HttpStatus.CONFLICT]: "Conflict",
      [HttpStatus.UNPROCESSABLE_ENTITY]: "Unprocessable Entity",
      [HttpStatus.TOO_MANY_REQUESTS]: "Too Many Requests",
      [HttpStatus.INTERNAL_SERVER_ERROR]: "Internal Server Error",
      [HttpStatus.BAD_GATEWAY]: "Bad Gateway",
      [HttpStatus.SERVICE_UNAVAILABLE]: "Service Unavailable",
      [HttpStatus.GATEWAY_TIMEOUT]: "Gateway Timeout",
    }

    return statusMessages[status] || "Unknown Error"
  }
}
