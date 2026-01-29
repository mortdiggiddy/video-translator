import { HttpStatus } from "@nestjs/common"
import { TranslatorException } from "./translator.exception"

/**
 * Exception for Temporal connection errors
 */
export class TemporalConnectionException extends TranslatorException {
  constructor(message: string = "Failed to connect to Temporal server") {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, "TemporalConnectionError")
  }
}
