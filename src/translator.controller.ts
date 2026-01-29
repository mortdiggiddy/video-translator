import { Controller, Get, Post, Body, Param, UseInterceptors, UploadedFile, BadRequestException } from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiConsumes, ApiBody } from "@nestjs/swagger"
import { diskStorage } from "multer"
import { extname } from "path"
import { TranslatorService } from "./translator.service"
import { TranslateVideoDto, TranslateFileDto, StartWorkflowResponseDto, WorkflowStatusDto, ErrorResponseDto } from "./dto"

// Configure multer for file uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/video-translator/uploads"

const multerConfig = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
      const ext = extname(file.originalname)
      callback(null, `upload-${uniqueSuffix}${ext}`)
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (req: Express.Request, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => {
    // Accept video and audio files
    const allowedMimes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/webm", "video/x-flv", "video/x-ms-wmv", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/ogg", "audio/flac", "audio/aac"]
    if (allowedMimes.includes(file.mimetype)) {
      callback(null, true)
    } else {
      callback(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false)
    }
  },
}

@Controller()
export class TranslatorController {
  constructor(private readonly translatorService: TranslatorService) {}

  @Get("health")
  @ApiTags("health")
  @ApiOperation({ summary: "Health check", description: "Check if the service is running" })
  @ApiResponse({ status: 200, description: "Service is healthy" })
  healthCheck() {
    return this.translatorService.getHealthStatus()
  }

  @Get()
  @ApiTags("health")
  @ApiOperation({ summary: "Service info", description: "Get service information and version" })
  @ApiResponse({ status: 200, description: "Service information" })
  getInfo() {
    return this.translatorService.getServiceInfo()
  }

  @Post("translate")
  @ApiTags("translation")
  @ApiOperation({
    summary: "Start translation workflow (URL)",
    description: "Start a new video/audio translation workflow using a URL. The service will download and process the file.",
  })
  @ApiResponse({ status: 201, description: "Workflow started successfully", type: StartWorkflowResponseDto })
  @ApiResponse({ status: 400, description: "Invalid request body", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Internal server error", type: ErrorResponseDto })
  async startTranslation(@Body() dto: TranslateVideoDto) {
    return this.translatorService.startTranslation(dto)
  }

  @Post("translate/upload")
  @ApiTags("translation")
  @UseInterceptors(FileInterceptor("file", multerConfig))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Start translation workflow (File Upload)",
    description: "Upload a video/audio file and start translation. Max file size: 500MB. Supported formats: mp4, mov, avi, mkv, webm, mp3, wav, m4a, ogg, flac, aac",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "targetLanguage"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "Video or audio file to translate",
        },
        targetLanguage: {
          type: "string",
          example: "Spanish",
          description: "Target language for translation",
        },
        sourceLanguage: {
          type: "string",
          example: "English",
          description: "Source language (optional, auto-detected if not provided)",
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Workflow started successfully", type: StartWorkflowResponseDto })
  @ApiResponse({ status: 400, description: "Invalid file or request", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Internal server error", type: ErrorResponseDto })
  async startTranslationWithFile(@UploadedFile() file: Express.Multer.File, @Body() dto: TranslateFileDto) {
    if (!file) {
      throw new BadRequestException("No file uploaded")
    }

    // Convert file upload to video URL DTO
    const translateDto: TranslateVideoDto = {
      videoUrl: file.path,
      targetLanguage: dto.targetLanguage,
      sourceLanguage: dto.sourceLanguage,
    }

    return this.translatorService.startTranslation(translateDto)
  }

  @Get("translate/:workflowId")
  @ApiTags("translation")
  @ApiOperation({
    summary: "Get workflow status",
    description: "Get the current status of a translation workflow",
  })
  @ApiParam({ name: "workflowId", description: "Unique workflow identifier", example: "translation-1706518800000-abc123" })
  @ApiResponse({ status: 200, description: "Workflow status retrieved", type: WorkflowStatusDto })
  @ApiResponse({ status: 404, description: "Workflow not found", type: ErrorResponseDto })
  async getTranslationStatus(@Param("workflowId") workflowId: string) {
    return this.translatorService.getTranslationStatus(workflowId)
  }
}
