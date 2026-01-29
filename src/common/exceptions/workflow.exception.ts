import { HttpStatus } from "@nestjs/common"
import { TranslatorException } from "./translator.exception"

/**
 * Exception for workflow-related errors
 */
export class WorkflowException extends TranslatorException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status, "WorkflowError")
  }
}

/**
 * Exception when a workflow is not found
 */
export class WorkflowNotFoundException extends TranslatorException {
  constructor(workflowId: string) {
    super(`Workflow not found: ${workflowId}`, HttpStatus.NOT_FOUND, "WorkflowNotFound")
  }
}
