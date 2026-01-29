/**
 * Translation Workflow Activities
 *
 * These activities use:
 * - FFmpeg for audio extraction from video
 * - OpenAI Whisper API for transcription
 * - GPT-4 for translation and summarization
 */

import OpenAI from "openai"
import * as fs from "fs"
import type { TranscriptionResult, TranslationResult, SummaryResult } from "./types"
import { processMediaInput, isVideoFile, isAudioFile, cleanupTempFiles } from "./ffmpeg.utils"

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
 * @returns Local path to extracted audio file
 */
export async function extractAudio(videoUrl: string): Promise<string> {
  console.log(`[Activity] Extracting audio from: ${videoUrl}`)

  try {
    // Process the input (download if URL, extract audio if video)
    const audioPath = await processMediaInput(videoUrl)

    // Track for cleanup
    if (audioPath.startsWith("/tmp")) {
      tempFilesCreated.push(audioPath)
    }

    console.log(`[Activity] Audio ready at: ${audioPath}`)
    return audioPath
  } catch (error) {
    console.error("[Activity] Audio extraction error:", error)

    // If ffmpeg fails, try to return the original input
    // OpenAI Whisper can handle some formats directly
    if (isAudioFile(videoUrl) || !isVideoFile(videoUrl)) {
      console.log("[Activity] Falling back to original input")
      return videoUrl
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
 * Creates SRT or VTT subtitle file
 */
export async function generateSubtitles(segments: Array<{ start: number; end: number; text: string }>, translatedText: string, format: "srt" | "vtt" = "srt"): Promise<string> {
  console.log(`[Activity] Generating ${format.toUpperCase()} subtitles`)

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

Output as JSON array:
[{"start": 0, "end": 5, "text": "translated segment text"}, ...]`,
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

      const content = response.choices[0]?.message?.content || "[]"
      const parsed = JSON.parse(content)
      translatedSegments = Array.isArray(parsed) ? parsed : parsed.segments || segments
    }

    // Generate subtitle file content
    let subtitleContent = ""

    if (format === "vtt") {
      subtitleContent = "WEBVTT\n\n"
      translatedSegments.forEach((seg) => {
        subtitleContent += `${formatTime(seg.start, "vtt")} --> ${formatTime(seg.end, "vtt")}\n`
        subtitleContent += `${seg.text}\n\n`
      })
    } else {
      // SRT format
      translatedSegments.forEach((seg, index) => {
        subtitleContent += `${index + 1}\n`
        subtitleContent += `${formatTime(seg.start, "srt")} --> ${formatTime(seg.end, "srt")}\n`
        subtitleContent += `${seg.text}\n\n`
      })
    }

    return subtitleContent
  } catch (error) {
    console.error("[Activity] Subtitles error:", error)
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
