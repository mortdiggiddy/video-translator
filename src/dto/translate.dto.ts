import { IsString, IsOptional, IsNotEmpty, MinLength, IsBoolean, ValidateNested } from "class-validator"
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"

/**
 * Supported target languages for translation
 */
export const SUPPORTED_LANGUAGES = ["Spanish", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese", "Korean", "Arabic", "Russian", "Hindi", "Dutch", "Polish", "Turkish", "Vietnamese", "Thai", "Indonesian", "Malay", "Swedish", "Norwegian", "Danish", "Finnish", "Greek", "Hebrew", "Czech", "Romanian", "Hungarian", "Ukrainian"] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * Output options for the translation workflow
 */
export class OutputOptionsDto {
  @ApiPropertyOptional({
    description: "Whether to hardcode (burn-in) subtitles into the video",
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  hardcodeSubtitles?: boolean

  @ApiPropertyOptional({
    description: "Whether to generate the output video with subtitles",
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  generateVideo?: boolean
}

/**
 * DTO for starting a translation workflow
 */
export class TranslateVideoDto {
  @ApiProperty({
    description: "URL or local path to the video/audio file",
    example: "https://example.com/video.mp4",
  })
  @IsString()
  @IsNotEmpty({ message: "videoUrl is required" })
  @MinLength(1, { message: "videoUrl cannot be empty" })
  videoUrl: string

  @ApiProperty({
    description: "Target language for translation",
    example: "Spanish",
    enum: SUPPORTED_LANGUAGES,
  })
  @IsString()
  @IsNotEmpty({ message: "targetLanguage is required" })
  targetLanguage: string

  @ApiPropertyOptional({
    description: "Source language of the video (optional, auto-detected if not provided)",
    example: "English",
    default: "English",
  })
  @IsString()
  @IsOptional()
  sourceLanguage?: string

  @ApiPropertyOptional({
    description: "Original filename (used for workflow ID, auto-extracted from URL if not provided)",
    example: "my-video.mp4",
  })
  @IsString()
  @IsOptional()
  fileName?: string

  @ApiPropertyOptional({
    description: "Output options for video generation",
    type: OutputOptionsDto,
  })
  @ValidateNested()
  @Type(() => OutputOptionsDto)
  @IsOptional()
  outputOptions?: OutputOptionsDto
}

/**
 * DTO for file upload translation (multipart form)
 */
export class TranslateFileDto {
  @ApiProperty({
    description: "Target language for translation",
    example: "Spanish",
    enum: SUPPORTED_LANGUAGES,
  })
  @IsString()
  @IsNotEmpty({ message: "targetLanguage is required" })
  targetLanguage: string

  @ApiPropertyOptional({
    description: "Source language of the video (optional, auto-detected if not provided)",
    example: "English",
    default: "English",
  })
  @IsString()
  @IsOptional()
  sourceLanguage?: string

  @ApiPropertyOptional({
    description: "Whether to hardcode (burn-in) subtitles into the video",
    example: "false",
    default: "false",
  })
  @IsString() // Form data sends booleans as strings
  @IsOptional()
  hardcodeSubtitles?: string
}

/**
 * Result DTO for completed translation (defined before WorkflowStatusDto to avoid circular reference)
 */
export class TranslationResultDto {
  @ApiProperty({ description: "Whether the translation was successful", example: true })
  success: boolean

  @ApiProperty({ description: "Original transcription text", example: "Hello, this is a test video." })
  transcription: string

  @ApiProperty({ description: "Translated text", example: "Hola, este es un video de prueba." })
  translation: string

  @ApiProperty({ description: "Summary of the content", example: "A brief test video with greeting." })
  summary: string

  @ApiProperty({ description: "Path to generated subtitles file", example: "/tmp/subtitles_123.srt" })
  subtitlesPath: string

  @ApiProperty({ description: "Total processing time in milliseconds", example: 5000 })
  processingTimeMs: number
}

/**
 * Response DTO for workflow status
 */
export class WorkflowStatusDto {
  @ApiProperty({ description: "Unique workflow identifier", example: "translation-1706518800000-abc123" })
  workflowId: string

  @ApiProperty({ description: "Current workflow status", example: "RUNNING", enum: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"] })
  status: string

  @ApiPropertyOptional({ description: "Translation result (if completed)", type: () => TranslationResultDto })
  result?: TranslationResultDto
}

/**
 * Response DTO for starting a workflow
 */
export class StartWorkflowResponseDto {
  @ApiProperty({ description: "Unique workflow identifier", example: "translation-1706518800000-abc123" })
  workflowId: string

  @ApiProperty({ description: "Initial workflow status", example: "started", enum: ["started", "running", "completed", "failed"] })
  status: "started" | "running" | "completed" | "failed"
}

/**
 * Error response DTO
 */
export class ErrorResponseDto {
  @ApiProperty({ description: "HTTP status code", example: 400 })
  statusCode: number

  @ApiProperty({ description: "Error message", example: "videoUrl is required" })
  message: string

  @ApiPropertyOptional({ description: "Error type", example: "Bad Request" })
  error?: string

  @ApiProperty({ description: "Timestamp of the error", example: "2024-01-29T08:00:00.000Z" })
  timestamp: string
}
