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
