import { HttpStatus } from "@nestjs/common"
import { TranslatorException } from "./translator.exception"

/**
 * Exception for OpenAI API errors
 */
export class OpenAIException extends TranslatorException {
  constructor(message: string = "OpenAI API error occurred") {
    super(message, HttpStatus.BAD_GATEWAY, "OpenAIError")
  }
}

/**
 * Exception for transcription errors
 */
export class TranscriptionException extends TranslatorException {
  constructor(message: string = "Failed to transcribe audio") {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, "TranscriptionError")
  }
}

/**
 * Exception for translation errors
 */
export class TranslationException extends TranslatorException {
  constructor(message: string = "Failed to translate text") {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, "TranslationError")
  }
}
