#!/usr/bin/env ts-node

/**
 * Video Translator Output Retrieval CLI
 *
 * Retrieve translated video outputs from a completed workflow.
 *
 * Usage:
 *   pnpm translate:get <workflowId> --output ./my-translations/
 *   pnpm translate:get <workflowId> -o ./downloads
 */

import { Command } from "commander"
import * as chalk from "chalk"
import * as fs from "fs"
import * as path from "path"

// Configuration
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/output/video-translator"

interface GetOptions {
  output: string
  files?: string[]
}

/**
 * List available files in workflow output directory
 */
function listOutputFiles(workflowId: string): string[] {
  const workflowDir = path.join(OUTPUT_DIR, workflowId)

  if (!fs.existsSync(workflowDir)) {
    throw new Error(`Workflow output directory not found: ${workflowDir}`)
  }

  const files = fs.readdirSync(workflowDir)
  return files.map((f) => path.join(workflowDir, f))
}

/**
 * Copy files to output directory
 */
function copyFiles(sourceFiles: string[], targetDir: string): string[] {
  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const copiedFiles: string[] = []

  for (const sourceFile of sourceFiles) {
    const fileName = path.basename(sourceFile)
    const targetPath = path.join(targetDir, fileName)

    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, targetPath)
      copiedFiles.push(targetPath)
    }
  }

  return copiedFiles
}

/**
 * Format file size
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Print file info
 */
function printFileInfo(filePath: string): void {
  const stats = fs.statSync(filePath)
  const fileName = path.basename(filePath)
  const size = formatFileSize(stats.size)

  // Color based on file type
  let coloredName = fileName
  if (fileName.endsWith(".srt") || fileName.endsWith(".vtt")) {
    coloredName = chalk.yellow(fileName)
  } else if (fileName.endsWith(".mp4") || fileName.endsWith(".mkv")) {
    coloredName = chalk.cyan(fileName)
  } else if (fileName.endsWith(".json")) {
    coloredName = chalk.magenta(fileName)
  } else if (fileName.endsWith(".txt")) {
    coloredName = chalk.gray(fileName)
  }

  console.log(`  ${coloredName} (${chalk.dim(size)})`)
}

// ==========================================
// Main Program
// ==========================================

const program = new Command()

program
  .name("translate:get")
  .description("Retrieve translated video outputs from a completed workflow")
  .version("1.0.0")
  .argument("<workflowId>", "Workflow ID to retrieve outputs from")
  .option("-o, --output <dir>", "Output directory for downloaded files", "./translation-output")
  .option("-f, --files <files...>", "Specific files to retrieve (default: all)")
  .action(async (workflowId: string, options: GetOptions) => {
    try {
      console.log(chalk.bold.cyan("\n📦 Video Translator - Output Retrieval\n"))
      console.log(chalk.gray("─".repeat(50)))
      console.log(chalk.white(`Workflow ID: ${chalk.cyan(workflowId)}`))
      console.log(chalk.white(`Output Directory: ${chalk.cyan(path.resolve(options.output))}`))
      console.log(chalk.gray("─".repeat(50)))

      // List available files
      console.log(chalk.gray("\nFinding workflow outputs..."))
      let files: string[]

      try {
        files = listOutputFiles(workflowId)
      } catch (error) {
        console.log(chalk.red(`\n❌ ${error instanceof Error ? error.message : error}`))
        console.log(chalk.gray("\nPossible reasons:"))
        console.log(chalk.gray("  • Workflow has not completed yet"))
        console.log(chalk.gray("  • Output directory is not mounted (check docker-compose.yml)"))
        console.log(chalk.gray("  • Workflow ID is incorrect"))
        console.log(chalk.gray(`\nExpected directory: ${path.join(OUTPUT_DIR, workflowId)}`))
        process.exit(1)
      }

      if (files.length === 0) {
        console.log(chalk.yellow("\n⚠️  No output files found for this workflow."))
        process.exit(1)
      }

      // Filter files if specific ones requested
      if (options.files && options.files.length > 0) {
        files = files.filter((f) => {
          const fileName = path.basename(f)
          return options.files!.some((pattern) => fileName.includes(pattern) || fileName === pattern)
        })
      }

      console.log(chalk.green(`\n✅ Found ${files.length} files:`))
      for (const file of files) {
        printFileInfo(file)
      }

      // Copy files to output directory
      console.log(chalk.gray(`\nCopying to ${path.resolve(options.output)}...`))
      const copiedFiles = copyFiles(files, options.output)

      console.log(chalk.green(`\n✅ Copied ${copiedFiles.length} files to ${path.resolve(options.output)}`))
      console.log(chalk.gray("─".repeat(50)))

      // Show copied files
      console.log(chalk.bold("\nCopied Files:"))
      for (const file of copiedFiles) {
        printFileInfo(file)
      }

      // Show metadata preview if available
      const metadataPath = path.join(options.output, "metadata.json")
      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"))
          console.log(chalk.bold("\nTranslation Info:"))
          console.log(chalk.gray("─".repeat(50)))
          if (metadata.sourceLanguage) {
            console.log(chalk.white(`  Source Language: ${chalk.cyan(metadata.sourceLanguage)}`))
          }
          if (metadata.targetLanguage) {
            console.log(chalk.white(`  Target Language: ${chalk.cyan(metadata.targetLanguage)}`))
          }
          if (metadata.createdAt) {
            console.log(chalk.white(`  Created At: ${chalk.cyan(new Date(metadata.createdAt).toLocaleString())}`))
          }
          if (metadata.summary) {
            console.log(chalk.bold("\n  Summary:"))
            console.log(chalk.gray(`  ${metadata.summary.substring(0, 200)}${metadata.summary.length > 200 ? "..." : ""}`))
          }
        } catch {
          // Ignore metadata parse errors
        }
      }

      console.log("")
    } catch (error) {
      console.log(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : error}`))
      process.exit(1)
    }
  })

program.parse()
