/**
 * Activity Types for Translation Workflow
 */

export interface TranslationInput {
  videoUrl: string
  targetLanguage: string
  sourceLanguage?: string
}

export interface TranscriptionResult {
  text: string
  language: string
  segments: Array<{
    start: number
    end: number
    text: string
  }>
}

export interface TranslationResult {
  originalText: string
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
}

export interface SummaryResult {
  summary: string
  keyPoints: string[]
  language: string
}

/**
 * Result from audio extraction activity
 */
export interface AudioExtractionResult {
  audioPath: string
  originalVideoPath?: string
}

/**
 * Result from subtitle generation activity
 */
export interface SubtitleGenerationResult {
  srtPath: string
  vttPath: string
  srtContent: string
  vttContent: string
}

/**
 * Input for video output generation
 */
export interface GenerateOutputVideoInput {
  videoPath: string
  srtPath: string
  hardcode?: boolean
  workflowId?: string
}

/**
 * Result from video output generation
 */
export interface GenerateOutputVideoResult {
  outputPath: string
  format: "mp4" | "mkv"
  subtitleType: "hardcoded" | "softcoded"
}

/**
 * Input for saving workflow artifacts
 */
export interface SaveArtifactsInput {
  workflowId: string
  transcription: string
  translation: string
  summary: string
  keyPoints: string[]
  srtContent: string
  vttContent: string
  sourceLanguage: string
  targetLanguage: string
  outputVideoPath?: string
}

/**
 * Result from saving artifacts
 */
export interface SaveArtifactsResult {
  artifactsDir: string
  files: string[]
}
