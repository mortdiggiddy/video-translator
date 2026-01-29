import { NestFactory } from "@nestjs/core"
import { TranslatorModule } from "./translator.module"
import { ValidationPipe } from "@nestjs/common"
import { Logger } from "nestjs-pino"
import { ConfigService } from "@nestjs/config"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { HttpExceptionFilter } from "./common/filters/http-exception.filter"

async function bootstrap() {
  const app = await NestFactory.create(TranslatorModule, { bufferLogs: true })

  app.useLogger(app.get(Logger))

  // Global exception filter for consistent error responses
  app.useGlobalFilters(new HttpExceptionFilter())

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      enableDebugMessages: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  )

  // Swagger Configuration
  const config = new DocumentBuilder().setTitle("Video Translator API").setDescription("API for translating videos using OpenAI and Temporal workflows").setVersion("1.0.0").addTag("translation", "Video translation endpoints").addTag("health", "Health check endpoints").build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup("api", app, document)

  const configService = app.get(ConfigService)
  const port = configService.get<number>("PORT", 3001)

  await app.listen(port)

  const logger = app.get(Logger)
  logger.log(`🚀 Video Translator service is running on port ${port}`)
  logger.log(`📚 Swagger documentation available at http://localhost:${port}/api`)
}

bootstrap()
