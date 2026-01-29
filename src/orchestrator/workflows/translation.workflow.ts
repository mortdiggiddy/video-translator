import { proxyActivities, sleep } from "@temporalio/workflow"
import type * as activities from "../activities"

// Proxy activities to use within workflow
const { extractAudio, transcribeAudio, translateText, generateSummary, generateSubtitles } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
  },
})

export interface TranslationWorkflowInput {
  videoUrl: string
  targetLanguage: string
  sourceLanguage?: string
}

export interface TranslationWorkflowResult {
  success: boolean
  transcription: string
  translation: string
  summary: string
  subtitlesPath: string
  processingTimeMs: number
}

/**
 * Translation Workflow
 *
 * This workflow orchestrates the complete video translation process:
 * 1. Extract audio from video
 * 2. Transcribe audio to text (Speech-to-Text)
 * 3. Translate text to target language
 * 4. Generate summary in target language
 * 5. Generate subtitles file
 */
export async function translationWorkflow(input: TranslationWorkflowInput): Promise<TranslationWorkflowResult> {
  const startTime = Date.now()
  const sourceLanguage = input.sourceLanguage || "en"

  console.log(`Starting translation workflow for: ${input.videoUrl}`)
  console.log(`Source: ${sourceLanguage} → Target: ${input.targetLanguage}`)

  // Step 1: Extract audio from video
  console.log("Step 1/5: Extracting audio...")
  const audioPath = await extractAudio(input.videoUrl)

  // Step 2: Transcribe audio to text
  console.log("Step 2/5: Transcribing audio...")
  const transcription = await transcribeAudio(audioPath, sourceLanguage)

  // Step 3: Translate text to target language
  console.log("Step 3/5: Translating text...")
  const translation = await translateText(transcription.text, transcription.language, input.targetLanguage)

  // Step 4: Generate summary
  console.log("Step 4/5: Generating summary...")
  const summary = await generateSummary(translation.translatedText, input.targetLanguage)

  // Step 5: Generate subtitles
  console.log("Step 5/5: Generating subtitles...")
  const subtitlesPath = await generateSubtitles(transcription.segments, translation.translatedText)

  const processingTimeMs = Date.now() - startTime

  console.log(`Translation workflow completed in ${processingTimeMs}ms`)

  return {
    success: true,
    transcription: transcription.text,
    translation: translation.translatedText,
    summary: summary.summary,
    subtitlesPath,
    processingTimeMs,
  }
}
