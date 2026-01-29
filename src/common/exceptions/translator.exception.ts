import { HttpException, HttpStatus } from "@nestjs/common"

/**
 * Base exception for video translator service
 */
export class TranslatorException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly code?: string,
  ) {
    super(
      {
        statusCode: status,
        message,
        error: code || "TranslatorError",
        timestamp: new Date().toISOString(),
      },
      status,
    )
  }
}
