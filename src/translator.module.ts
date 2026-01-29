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
            SERVICE_NAME: process.env.SERVICE_NAME || "video-translator",
            PORT: parseInt(process.env.PORT || "3001", 10),
            NODE_ENV: process.env.NODE_ENV || "development",
            TEMPORAL_SERVER_ADDRESS: process.env.TEMPORAL_SERVER_ADDRESS || "temporal:7233",
            TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE || "default",
          }

          const schema = Joi.object({
            SERVICE_NAME: Joi.string().required(),
            PORT: Joi.number().default(3001),
            NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),
            TEMPORAL_SERVER_ADDRESS: Joi.string().required(),
            TEMPORAL_NAMESPACE: Joi.string().default("default"),
          })

          const { error } = schema.validate(config, { allowUnknown: true })

          if (error) {
            throw new Error(`Config validation error: ${error.message}`)
          }

          console.log(`${config.SERVICE_NAME} configurations validated successfully.`)

          return config
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
