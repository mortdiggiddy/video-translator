import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { LoggerModule } from "nestjs-pino"
import * as Joi from "joi"
import { TranslatorController } from "./translator.controller"
import { TranslatorService } from "./translator.service"
import { TemporalClientModule } from "./orchestrator/clients/temporal-client.module"
import { join } from "path"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [join(process.cwd(), ".env")],
      validationSchema: Joi.object({
        SERVICE_NAME: Joi.string().default("video-translator"),
        PORT: Joi.number().default(3001),
        NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),

        TEMPORAL_SERVER_ADDRESS: Joi.string().default("temporal:7233"),
        TEMPORAL_NAMESPACE: Joi.string().default("default"),

        OUTPUT_DIR: Joi.string().default("/output/video-translator"),
        TEMP_DIR: Joi.string().default("/tmp/video-translator"),
        UPLOAD_DIR: Joi.string().default("/tmp/video-translator/uploads"),

        OPENAI_API_KEY: Joi.string().allow("").default(""),
        OPENAI_MODEL: Joi.string().default("gpt-4o-mini"),
      }),
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
      load: [
        () => {
          const config = {
            service: {
              name: process.env.SERVICE_NAME!,
              port: Number(process.env.PORT!),
              nodeEnv: process.env.NODE_ENV!,
            },
            temporal: {
              serverAddress: process.env.TEMPORAL_SERVER_ADDRESS!,
              namespace: process.env.TEMPORAL_NAMESPACE!,
            },
            paths: {
              outputDir: process.env.OUTPUT_DIR!,
              tempDir: process.env.TEMP_DIR!,
              uploadDir: process.env.UPLOAD_DIR!,
            },
            openai: {
              apiKey: process.env.OPENAI_API_KEY!,
              model: process.env.OPENAI_MODEL!,
            },
          }

          console.log("[Config] Loaded configuration")
          console.log(`[Config] Service: ${config.service.name}`)
          console.log(`[Config] Node env: ${config.service.nodeEnv}`)
          console.log(`[Config] Port: ${config.service.port}`)
          console.log(`[Config] Temporal address: ${config.temporal.serverAddress}`)
          console.log(`[Config] Temporal namespace: ${config.temporal.namespace}`)
          console.log(`[Config] Output dir: ${config.paths.outputDir}`)
          console.log(`[Config] Upload dir: ${config.paths.uploadDir}`)
          console.log(`[Config] OpenAI model: ${config.openai.model}`)
          console.log(`[Config] OpenAI key present: ${config.openai.apiKey ? "yes" : "no"}`)

          return config
        },
      ],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV?.toLowerCase() === "production"
            ? undefined
            : {
                target: "pino-pretty",
                options: {
                  singleLine: true,
                  translateTime: "dd/mm/yyyy HH:MM:ss",
                },
              },
        customProps: () => ({
          context: "VideoTranslator",
        }),
      },
    }),
    TemporalClientModule,
  ],
  controllers: [TranslatorController],
  providers: [TranslatorService],
})
export class TranslatorModule {}
