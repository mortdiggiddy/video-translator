import { proxyActivities, defineQuery, setHandler } from "@temporalio/workflow"
import type * as activities from "../activities"

// Proxy activities to use within workflow
const { extractAudio, transcribeAudio, translateText, generateSummary, generateSubtitles, generateOutputVideo, saveWorkflowArtifacts, cleanupTempFilesActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
  },
})

export interface TranslationWorkflowInput {
  videoUrl: string
  targetLanguage: string
  sourceLanguage?: string
  workflowId?: string
  outputOptions?: {
    hardcodeSubtitles?: boolean
    generateVideo?: boolean
  }
}

export interface TranslationWorkflowResult {
  success: boolean
  transcription: string
  translation: string
  summary: string
  keyPoints: string[]
  subtitlesPath: string
  outputVideoPath?: string
  artifactsDir?: string
  processingTimeMs: number
}

/**
 * Progress state for workflow queries
 */
export interface WorkflowProgress {
  currentStep: number
  totalSteps: number
  stepName: string
  percentComplete: number
  status: "running" | "completed" | "failed"
  error?: string
}

// Define the progress query
export const getProgressQuery = defineQuery<WorkflowProgress>("getProgress")

/**
 * Translation Workflow
 *
 * This workflow orchestrates the complete video translation process:
 * 1. Extract audio from video
 * 2. Transcribe audio to text (Speech-to-Text)
 * 3. Translate text to target language
 * 4. Generate summary in target language
 * 5. Generate subtitles file
 * 6. Generate output video with subtitles (optional)
 * 7. Save artifacts to output directory
 */
export async function translationWorkflow(input: TranslationWorkflowInput): Promise<TranslationWorkflowResult> {
  const startTime = Date.now()
  const sourceLanguage = input.sourceLanguage || "en"
  const generateVideo = input.outputOptions?.generateVideo ?? true
  const hardcodeSubtitles = input.outputOptions?.hardcodeSubtitles ?? false
  const totalSteps = generateVideo ? 7 : 6

  // Initialize progress state
  let progress: WorkflowProgress = {
    currentStep: 0,
    totalSteps,
    stepName: "Starting",
    percentComplete: 0,
    status: "running",
  }

  // Set up progress query handler
  setHandler(getProgressQuery, () => progress)

  try {
    console.log(`Starting translation workflow for: ${input.videoUrl}`)
    console.log(`Source: ${sourceLanguage} → Target: ${input.targetLanguage}`)

    // Step 1: Extract audio from video
    progress = { ...progress, currentStep: 1, stepName: "Extracting audio from video", percentComplete: 5 }
    console.log("Step 1: Extracting audio...")
    const audioResult = await extractAudio(input.videoUrl)
    const audioPath = audioResult.audioPath
    const originalVideoPath = audioResult.originalVideoPath

    // Step 2: Transcribe audio to text
    progress = { ...progress, currentStep: 2, stepName: "Transcribing audio (Whisper)", percentComplete: 20 }
    console.log("Step 2: Transcribing audio...")
    const transcription = await transcribeAudio(audioPath, sourceLanguage)

    // Step 3: Translate text to target language
    progress = { ...progress, currentStep: 3, stepName: "Translating text (GPT-4)", percentComplete: 40 }
    console.log("Step 3: Translating text...")
    const translation = await translateText(transcription.text, transcription.language, input.targetLanguage)

    // Step 4: Generate summary
    progress = { ...progress, currentStep: 4, stepName: "Generating summary", percentComplete: 55 }
    console.log("Step 4: Generating summary...")
    const summary = await generateSummary(translation.translatedText, input.targetLanguage)

    // Step 5: Generate subtitles
    progress = { ...progress, currentStep: 5, stepName: "Generating subtitles", percentComplete: 70 }
    console.log("Step 5: Generating subtitles...")
    const subtitlesResult = await generateSubtitles(transcription.segments, translation.translatedText, input.targetLanguage)

    let outputVideoPath: string | undefined
    let artifactsDir: string | undefined

    // Step 6: Generate output video (optional)
    if (generateVideo && originalVideoPath) {
      progress = { ...progress, currentStep: 6, stepName: "Generating output video with subtitles", percentComplete: 85 }
      console.log("Step 6: Generating output video...")
      const videoResult = await generateOutputVideo({
        videoPath: originalVideoPath,
        srtPath: subtitlesResult.srtPath,
        hardcode: hardcodeSubtitles,
        workflowId: input.workflowId,
      })
      outputVideoPath = videoResult.outputPath
    }

    // Step 7 (or 6 if no video): Save artifacts
    progress = {
      ...progress,
      currentStep: generateVideo ? 7 : 6,
      stepName: "Saving workflow artifacts",
      percentComplete: 95,
    }
    console.log(`Step ${generateVideo ? 7 : 6}: Saving artifacts...`)

    const artifactResult = await saveWorkflowArtifacts({
      workflowId: input.workflowId || `translation-${Date.now()}`,
      transcription: transcription.text,
      translation: translation.translatedText,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      srtContent: subtitlesResult.srtContent,
      vttContent: subtitlesResult.vttContent,
      sourceLanguage: transcription.language,
      targetLanguage: input.targetLanguage,
      outputVideoPath,
    })
    artifactsDir = artifactResult.artifactsDir

    // Cleanup temporary files
    console.log("Cleaning up temporary files...")
    await cleanupTempFilesActivity()

    const processingTimeMs = Date.now() - startTime

    // Mark as completed
    progress = {
      currentStep: totalSteps,
      totalSteps,
      stepName: "Completed",
      percentComplete: 100,
      status: "completed",
    }

    console.log(`Translation workflow completed in ${processingTimeMs}ms`)

    return {
      success: true,
      transcription: transcription.text,
      translation: translation.translatedText,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      subtitlesPath: subtitlesResult.srtPath,
      outputVideoPath,
      artifactsDir,
      processingTimeMs,
    }
  } catch (error) {
    // Mark as failed
    progress = {
      ...progress,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    }
    throw error
  }
}
