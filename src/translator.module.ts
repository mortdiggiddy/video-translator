import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { LoggerModule } from "nestjs-pino"
import * as Joi from "joi"
import { TranslatorController } from "./translator.controller"
import { TranslatorService } from "./translator.service"
import { TemporalClientModule } from "./orchestrator/clients/temporal-client.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [
        () => {
          const config = {
            // Service
            SERVICE_NAME: process.env.SERVICE_NAME || "video-translator",
            PORT: parseInt(process.env.PORT || "3001", 10),
            NODE_ENV: process.env.NODE_ENV || "development",

            // Temporal
            TEMPORAL_SERVER_ADDRESS: process.env.TEMPORAL_SERVER_ADDRESS || "temporal:7233",
            TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE || "default",

            // File paths
            OUTPUT_DIR: process.env.OUTPUT_DIR || "/output/video-translator",
            TEMP_DIR: process.env.TEMP_DIR || "/tmp/video-translator",
            UPLOAD_DIR: process.env.UPLOAD_DIR || "/tmp/video-translator/uploads",

            // OpenAI
            OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
            OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
          }

          const schema = Joi.object({
            // Service
            SERVICE_NAME: Joi.string().required(),
            PORT: Joi.number().default(3001),
            NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),

            // Temporal
            TEMPORAL_SERVER_ADDRESS: Joi.string().required(),
            TEMPORAL_NAMESPACE: Joi.string().default("default"),

            // File paths
            OUTPUT_DIR: Joi.string().default("/output/video-translator"),
            TEMP_DIR: Joi.string().default("/tmp/video-translator"),
            UPLOAD_DIR: Joi.string().default("/tmp/video-translator/uploads"),

            // OpenAI
            OPENAI_API_KEY: Joi.string().allow("").default(""),
            OPENAI_MODEL: Joi.string().default("gpt-4-turbo-preview"),
          })

          const { value, error } = schema.validate(config, { allowUnknown: true })

          if (error) {
            throw new Error(`Config validation error: ${error.message}`)
          }

          console.log(`${config.SERVICE_NAME} configurations validated successfully.`)

          return value
        },
      ],
      cache: true,
      isGlobal: true,
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
