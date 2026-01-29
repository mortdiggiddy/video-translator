import { HttpStatus } from "@nestjs/common"
import { TranslatorException } from "./translator.exception"

/**
 * Exception for file processing errors
 */
export class FileProcessingException extends TranslatorException {
  constructor(message: string = "Failed to process file") {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, "FileProcessingError")
  }
}

/**
 * Exception for validation errors
 */
export class ValidationException extends TranslatorException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, "ValidationError")
  }
}
