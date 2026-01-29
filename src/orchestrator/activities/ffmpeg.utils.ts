/**
 * FFmpeg Utilities for Audio Extraction and Subtitle Overlay
 *
 * Provides utilities for:
 * - Extracting audio from video files using ffmpeg
 * - Downloading files from URLs
 * - Overlaying subtitles on video (hardcoded or softcoded)
 * - Managing output directories
 */

import ffmpeg from "fluent-ffmpeg"
import * as fs from "fs"
import * as path from "path"
import * as https from "https"
import * as http from "http"
import { v4 as uuidv4 } from "uuid"

// Constants
const TEMP_DIR = process.env.TEMP_DIR || "/tmp/video-translator"
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/output/video-translator"
const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"]
const SUPPORTED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"]

// ==========================================
// Directory Management
// ==========================================

/**
 * Ensure the temp directory exists
 */
export function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
  }
}

/**
 * Ensure the output directory exists
 */
export function ensureOutputDir(subDir?: string): string {
  const dir = subDir ? path.join(OUTPUT_DIR, subDir) : OUTPUT_DIR
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Get the output directory path
 */
export function getOutputDir(): string {
  return OUTPUT_DIR
}

// ==========================================
// File Type Detection
// ==========================================

/**
 * Get file extension from URL or path
 */
function getFileExtension(urlOrPath: string): string {
  try {
    const url = new URL(urlOrPath)
    const pathname = url.pathname
    return path.extname(pathname).toLowerCase()
  } catch {
    // Not a URL, treat as file path
    return path.extname(urlOrPath).toLowerCase()
  }
}

/**
 * Check if input is a video file that needs audio extraction
 */
export function isVideoFile(urlOrPath: string): boolean {
  const ext = getFileExtension(urlOrPath)
  return SUPPORTED_VIDEO_EXTENSIONS.includes(ext)
}

/**
 * Check if input is already an audio file
 */
export function isAudioFile(urlOrPath: string): boolean {
  const ext = getFileExtension(urlOrPath)
  return SUPPORTED_AUDIO_EXTENSIONS.includes(ext)
}

// ==========================================
// File Download
// ==========================================

/**
 * Download a file from URL to local path
 */
export function downloadFile(url: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath)
    const protocol = url.startsWith("https") ? https : http

    console.log(`[FFmpeg] Downloading file from: ${url}`)

    protocol
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            file.close()
            fs.unlinkSync(outputPath)
            return downloadFile(redirectUrl, outputPath).then(resolve).catch(reject)
          }
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(outputPath)
          reject(new Error(`Failed to download file: HTTP ${response.statusCode}`))
          return
        }

        response.pipe(file)

        file.on("finish", () => {
          file.close()
          console.log(`[FFmpeg] Downloaded to: ${outputPath}`)
          resolve(outputPath)
        })
      })
      .on("error", (err) => {
        file.close()
        fs.unlinkSync(outputPath)
        reject(err)
      })
  })
}

// ==========================================
// Audio Extraction
// ==========================================

/**
 * Extract audio from video file using ffmpeg
 */
export function extractAudioFromVideo(inputPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Extracting audio from: ${inputPath}`)

    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .audioChannels(2)
      .audioFrequency(44100)
      .output(outputPath)
      .on("start", (commandLine) => {
        console.log(`[FFmpeg] Command: ${commandLine}`)
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[FFmpeg] Progress: ${Math.round(progress.percent)}%`)
        }
      })
      .on("end", () => {
        console.log(`[FFmpeg] Audio extracted to: ${outputPath}`)
        resolve(outputPath)
      })
      .on("error", (err) => {
        console.error(`[FFmpeg] Error: ${err.message}`)
        reject(err)
      })
      .run()
  })
}

/**
 * Process video URL/path and return local audio file path AND original video path
 *
 * 1. If it's a URL, download it first
 * 2. If it's a video file, extract audio using ffmpeg
 * 3. If it's already an audio file, return as-is or download it
 *
 * @returns Object with audioPath and optionally originalVideoPath
 */
export async function processMediaInput(input: string): Promise<{ audioPath: string; originalVideoPath?: string }> {
  ensureTempDir()

  const isUrl = input.startsWith("http://") || input.startsWith("https://")
  const ext = getFileExtension(input)
  const isVideo = isVideoFile(input)
  const isAudio = isAudioFile(input)

  let localPath = input
  let originalVideoPath: string | undefined

  // Step 1: Download if URL
  if (isUrl) {
    const downloadFilename = `download-${uuidv4()}${ext || ".mp4"}`
    const downloadPath = path.join(TEMP_DIR, downloadFilename)
    localPath = await downloadFile(input, downloadPath)
  }

  // Step 2: Extract audio if video
  if (isVideo) {
    originalVideoPath = localPath // Keep reference to original video
    const audioFilename = `audio-${uuidv4()}.mp3`
    const audioPath = path.join(TEMP_DIR, audioFilename)
    const extractedAudio = await extractAudioFromVideo(localPath, audioPath)
    return { audioPath: extractedAudio, originalVideoPath }
  }

  // Step 3: If already audio, return as-is
  if (isAudio) {
    return { audioPath: localPath }
  }

  // Unknown format - try to extract audio anyway
  console.log(`[FFmpeg] Unknown format (${ext}), attempting audio extraction`)
  originalVideoPath = localPath
  const audioFilename = `audio-${uuidv4()}.mp3`
  const audioPath = path.join(TEMP_DIR, audioFilename)

  try {
    const extractedAudio = await extractAudioFromVideo(localPath, audioPath)
    return { audioPath: extractedAudio, originalVideoPath }
  } catch {
    // If extraction fails, return the original file
    // (OpenAI Whisper might be able to handle it)
    console.log(`[FFmpeg] Audio extraction failed, returning original file`)
    return { audioPath: localPath }
  }
}

// ==========================================
// Subtitle Overlay
// ==========================================

/**
 * Overlay subtitles on video (hardcoded/burned-in)
 *
 * Uses the 'subtitles' video filter to burn subtitles into the video.
 * The resulting video will always show the subtitles.
 */
export function overlaySubtitlesHardcode(videoPath: string, srtPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Hardcoding subtitles onto video: ${videoPath}`)

    // Escape special characters in path for ffmpeg filter
    const escapedSrtPath = srtPath.replace(/:/g, "\\:").replace(/\\/g, "/")

    ffmpeg(videoPath)
      .videoFilters(`subtitles='${escapedSrtPath}'`)
      .outputOptions(["-c:a copy"]) // Copy audio without re-encoding
      .output(outputPath)
      .on("start", (commandLine) => {
        console.log(`[FFmpeg] Command: ${commandLine}`)
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[FFmpeg] Subtitle overlay progress: ${Math.round(progress.percent)}%`)
        }
      })
      .on("end", () => {
        console.log(`[FFmpeg] Subtitles overlaid to: ${outputPath}`)
        resolve(outputPath)
      })
      .on("error", (err) => {
        console.error(`[FFmpeg] Subtitle overlay error: ${err.message}`)
        reject(err)
      })
      .run()
  })
}

/**
 * Add subtitles as a separate track (softcoded)
 *
 * The resulting video will have an optional subtitle track that can be
 * toggled on/off by the video player.
 */
export function overlaySubtitlesSoftcode(videoPath: string, srtPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Adding subtitle track to video: ${videoPath}`)

    const outputExt = path.extname(outputPath).toLowerCase()

    // Different subtitle codecs for different containers
    const subtitleCodec = outputExt === ".mkv" ? "srt" : "mov_text"

    ffmpeg(videoPath)
      .input(srtPath)
      .outputOptions([
        "-c:v copy", // Copy video without re-encoding
        "-c:a copy", // Copy audio without re-encoding
        `-c:s ${subtitleCodec}`, // Subtitle codec
        "-metadata:s:s:0 language=eng", // Set subtitle language
      ])
      .output(outputPath)
      .on("start", (commandLine) => {
        console.log(`[FFmpeg] Command: ${commandLine}`)
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[FFmpeg] Muxing progress: ${Math.round(progress.percent)}%`)
        }
      })
      .on("end", () => {
        console.log(`[FFmpeg] Subtitle track added to: ${outputPath}`)
        resolve(outputPath)
      })
      .on("error", (err) => {
        console.error(`[FFmpeg] Subtitle muxing error: ${err.message}`)
        reject(err)
      })
      .run()
  })
}

/**
 * Generate output video with subtitles
 *
 * @param videoPath - Path to the original video
 * @param srtPath - Path to the SRT subtitle file
 * @param outputPath - Path for the output video
 * @param hardcode - Whether to hardcode (burn-in) subtitles or add as track
 */
export async function generateVideoWithSubtitles(videoPath: string, srtPath: string, outputPath: string, hardcode: boolean = false): Promise<string> {
  if (hardcode) {
    return overlaySubtitlesHardcode(videoPath, srtPath, outputPath)
  } else {
    return overlaySubtitlesSoftcode(videoPath, srtPath, outputPath)
  }
}

// ==========================================
// Cleanup
// ==========================================

/**
 * Clean up temporary files
 */
export function cleanupTempFiles(files: string[]): void {
  for (const file of files) {
    if (file.startsWith(TEMP_DIR) && fs.existsSync(file)) {
      try {
        fs.unlinkSync(file)
        console.log(`[FFmpeg] Cleaned up: ${file}`)
      } catch {
        console.error(`[FFmpeg] Failed to clean up: ${file}`)
      }
    }
  }
}

// ==========================================
// Health Check
// ==========================================

/**
 * Get ffmpeg info (for health checks)
 */
export function getFfmpegInfo(): Promise<{ version: string; codecs: string[] }> {
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableFormats((err) => {
      if (err) {
        reject(err)
        return
      }

      ffmpeg.getAvailableCodecs((codecErr, codecs) => {
        if (codecErr) {
          reject(codecErr)
          return
        }

        resolve({
          version: "Available",
          codecs: Object.keys(codecs).slice(0, 10), // First 10 codecs
        })
      })
    })
  })
}
