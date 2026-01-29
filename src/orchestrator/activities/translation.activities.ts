/**
 * Translation Workflow Activities
 *
 * These activities use:
 * - FFmpeg for audio extraction from video
 * - OpenAI Whisper API for transcription
 * - GPT-4 for translation and summarization
 * - FFmpeg for subtitle overlay on video
 */

import OpenAI from "openai"
import * as fs from "fs"
import * as path from "path"
import type {
  TranscriptionResult,
  TranslationResult,
  SummaryResult,
  AudioExtractionResult,
  SubtitleGenerationResult,
  GenerateOutputVideoInput,
  GenerateOutputVideoResult,
  SaveArtifactsInput,
  SaveArtifactsResult,
} from "./types"
import { processMediaInput, isVideoFile, isAudioFile, cleanupTempFiles, generateVideoWithSubtitles, ensureOutputDir } from "./ffmpeg.utils"

// Initialize OpenAI client - will use OPENAI_API_KEY from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Track temp files for cleanup
const tempFilesCreated: string[] = []

// ==========================================
// Helper Functions
// ==========================================

function formatTime(seconds: number, format: "srt" | "vtt"): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)

  if (format === "vtt") {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`
  } else {
    // SRT uses comma for milliseconds
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`
  }
}

function pad(num: number, size: number = 2): string {
  return num.toString().padStart(size, "0")
}

// ==========================================
// Activities
// ==========================================

/**
 * Activity: Extract audio from video using FFmpeg
 *
 * Handles:
 * - Remote URLs (downloads first)
 * - Video files (extracts audio using ffmpeg)
 * - Audio files (passes through)
 *
 * @param videoUrl - URL or local path to video/audio file
 * @returns AudioExtractionResult with audioPath and optionally originalVideoPath
 */
export async function extractAudio(videoUrl: string): Promise<AudioExtractionResult> {
  console.log(`[Activity] Extracting audio from: ${videoUrl}`)

  try {
    // Process the input (download if URL, extract audio if video)
    const result = await processMediaInput(videoUrl)

    // Track for cleanup
    if (result.audioPath.startsWith("/tmp")) {
      tempFilesCreated.push(result.audioPath)
    }
    if (result.originalVideoPath?.startsWith("/tmp")) {
      tempFilesCreated.push(result.originalVideoPath)
    }

    console.log(`[Activity] Audio ready at: ${result.audioPath}`)
    return result
  } catch (error) {
    console.error("[Activity] Audio extraction error:", error)

    // If ffmpeg fails, try to return the original input
    // OpenAI Whisper can handle some formats directly
    if (isAudioFile(videoUrl) || !isVideoFile(videoUrl)) {
      console.log("[Activity] Falling back to original input")
      return { audioPath: videoUrl }
    }

    throw error
  }
}

/**
 * Activity: Transcribe audio to text using OpenAI Whisper API
 * Converts audio/video to text with timestamps
 */
export async function transcribeAudio(audioPath: string, sourceLanguage?: string): Promise<TranscriptionResult> {
  console.log(`[Activity] Transcribing audio: ${audioPath}`)

  try {
    // Check if it's a local file
    if (fs.existsSync(audioPath)) {
      // Local file - use file upload
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
        language: sourceLanguage || undefined,
      })

      return {
        text: transcription.text,
        language: transcription.language || sourceLanguage || "en",
        segments:
          transcription.segments?.map((seg) => ({
            start: seg.start,
            end: seg.end,
            text: seg.text,
          })) || [],
      }
    } else {
      // File doesn't exist - this shouldn't happen after extractAudio
      console.error(`[Activity] Audio file not found: ${audioPath}`)
      throw new Error(`Audio file not found: ${audioPath}`)
    }
  } catch (error) {
    console.error("[Activity] Transcription error:", error)
    throw error
  }
}

/**
 * Activity: Translate text to target language using GPT-4
 */
export async function translateText(text: string, sourceLanguage: string, targetLanguage: string): Promise<TranslationResult> {
  console.log(`[Activity] Translating from ${sourceLanguage} to ${targetLanguage}`)

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. 
Preserve the meaning, tone, and style of the original text. 
Only output the translated text, nothing else.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.3,
    })

    const translatedText = response.choices[0]?.message?.content || ""

    return {
      originalText: text,
      translatedText,
      sourceLanguage,
      targetLanguage,
    }
  } catch (error) {
    console.error("[Activity] Translation error:", error)
    throw error
  }
}

/**
 * Activity: Generate summary of the video content using GPT-4
 */
export async function generateSummary(translatedText: string, targetLanguage: string): Promise<SummaryResult> {
  console.log(`[Activity] Generating summary in ${targetLanguage}`)

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a content summarizer. Create a concise summary of the following content in ${targetLanguage}.
Also extract 3-5 key points.

Format your response as JSON:
{
  "summary": "your summary here",
  "keyPoints": ["point 1", "point 2", "point 3"]
}`,
        },
        {
          role: "user",
          content: translatedText,
        },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
    })

    const content = response.choices[0]?.message?.content || "{}"
    const parsed = JSON.parse(content)

    return {
      summary: parsed.summary || "Summary generation failed",
      keyPoints: parsed.keyPoints || [],
      language: targetLanguage,
    }
  } catch (error) {
    console.error("[Activity] Summary error:", error)
    throw error
  }
}

/**
 * Activity: Generate subtitles file from translated segments
 * Creates both SRT and VTT subtitle files
 */
export async function generateSubtitles(
  segments: Array<{ start: number; end: number; text: string }>,
  translatedText: string,
  targetLanguage: string
): Promise<SubtitleGenerationResult> {
  console.log(`[Activity] Generating subtitles in ${targetLanguage}`)

  try {
    // If we have segments, translate each segment
    let translatedSegments = segments

    if (segments.length > 0 && translatedText) {
      // Use GPT-4 to align translated text with segments
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a subtitle generator. Given the original segment timings and the full translated text, 
distribute the translated text across the segments maintaining the original timing structure.

Output as JSON with a "segments" array:
{"segments": [{"start": 0, "end": 5, "text": "translated segment text"}, ...]}`,
          },
          {
            role: "user",
            content: `Original segments with timings:
${JSON.stringify(segments)}

Full translated text:
${translatedText}`,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      })

      const content = response.choices[0]?.message?.content || '{"segments":[]}'
      const parsed = JSON.parse(content)
      translatedSegments = Array.isArray(parsed) ? parsed : parsed.segments || segments
    }

    // Generate SRT content
    let srtContent = ""
    translatedSegments.forEach((seg, index) => {
      srtContent += `${index + 1}\n`
      srtContent += `${formatTime(seg.start, "srt")} --> ${formatTime(seg.end, "srt")}\n`
      srtContent += `${seg.text}\n\n`
    })

    // Generate VTT content
    let vttContent = "WEBVTT\n\n"
    translatedSegments.forEach((seg) => {
      vttContent += `${formatTime(seg.start, "vtt")} --> ${formatTime(seg.end, "vtt")}\n`
      vttContent += `${seg.text}\n\n`
    })

    // Save to temp directory
    const subtitleId = Date.now().toString()
    const srtPath = path.join("/tmp/video-translator", `subtitles-${subtitleId}.srt`)
    const vttPath = path.join("/tmp/video-translator", `subtitles-${subtitleId}.vtt`)

    // Ensure temp dir exists
    if (!fs.existsSync("/tmp/video-translator")) {
      fs.mkdirSync("/tmp/video-translator", { recursive: true })
    }

    fs.writeFileSync(srtPath, srtContent, "utf-8")
    fs.writeFileSync(vttPath, vttContent, "utf-8")

    tempFilesCreated.push(srtPath, vttPath)

    return {
      srtPath,
      vttPath,
      srtContent,
      vttContent,
    }
  } catch (error) {
    console.error("[Activity] Subtitles error:", error)
    throw error
  }
}

/**
 * Activity: Generate output video with subtitle overlay
 */
export async function generateOutputVideo(input: GenerateOutputVideoInput): Promise<GenerateOutputVideoResult> {
  console.log(`[Activity] Generating output video with subtitles`)
  console.log(`  Video: ${input.videoPath}`)
  console.log(`  Subtitles: ${input.srtPath}`)
  console.log(`  Hardcode: ${input.hardcode ?? false}`)

  try {
    // Ensure output directory exists
    const workflowDir = ensureOutputDir(input.workflowId)

    // Determine output filename
    const outputFilename = input.hardcode ? "translated_video_hardcoded.mp4" : "translated_video.mp4"
    const outputPath = path.join(workflowDir, outputFilename)

    // Generate video with subtitles
    await generateVideoWithSubtitles(input.videoPath, input.srtPath, outputPath, input.hardcode ?? false)

    return {
      outputPath,
      format: "mp4",
      subtitleType: input.hardcode ? "hardcoded" : "softcoded",
    }
  } catch (error) {
    console.error("[Activity] Output video generation error:", error)
    throw error
  }
}

/**
 * Activity: Save all workflow artifacts to output directory
 */
export async function saveWorkflowArtifacts(input: SaveArtifactsInput): Promise<SaveArtifactsResult> {
  console.log(`[Activity] Saving workflow artifacts for: ${input.workflowId}`)

  try {
    // Ensure output directory exists
    const workflowDir = ensureOutputDir(input.workflowId)
    const savedFiles: string[] = []

    // Save subtitles
    const srtPath = path.join(workflowDir, "subtitles.srt")
    const vttPath = path.join(workflowDir, "subtitles.vtt")
    fs.writeFileSync(srtPath, input.srtContent, "utf-8")
    fs.writeFileSync(vttPath, input.vttContent, "utf-8")
    savedFiles.push(srtPath, vttPath)

    // Save metadata JSON
    const metadata = {
      workflowId: input.workflowId,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      transcription: input.transcription,
      translation: input.translation,
      summary: input.summary,
      keyPoints: input.keyPoints,
      outputVideoPath: input.outputVideoPath,
      createdAt: new Date().toISOString(),
    }
    const metadataPath = path.join(workflowDir, "metadata.json")
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8")
    savedFiles.push(metadataPath)

    // Save plain text files for transcription and translation
    const transcriptionPath = path.join(workflowDir, "transcription.txt")
    const translationPath = path.join(workflowDir, "translation.txt")
    fs.writeFileSync(transcriptionPath, input.transcription, "utf-8")
    fs.writeFileSync(translationPath, input.translation, "utf-8")
    savedFiles.push(transcriptionPath, translationPath)

    console.log(`[Activity] Saved ${savedFiles.length} artifacts to: ${workflowDir}`)

    return {
      artifactsDir: workflowDir,
      files: savedFiles,
    }
  } catch (error) {
    console.error("[Activity] Artifact saving error:", error)
    throw error
  }
}

/**
 * Activity: Cleanup temporary files created during processing
 * Should be called at the end of a workflow
 */
export async function cleanupTempFilesActivity(): Promise<void> {
  console.log(`[Activity] Cleaning up ${tempFilesCreated.length} temporary files`)

  try {
    cleanupTempFiles(tempFilesCreated)
    tempFilesCreated.length = 0 // Clear the array
  } catch (error) {
    console.error("[Activity] Cleanup error:", error)
    // Don't throw - cleanup failure shouldn't fail the workflow
  }
}
