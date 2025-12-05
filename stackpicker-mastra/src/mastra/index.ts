
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { stackPickerAgent } from './agents/stackpicker-agent';
import { basicWorkflow } from './workflows/basic-workflow';
import { ragWorkflow } from './workflows/rag-workflow';
import { chromaRagWorkflow } from './workflows/chroma-rag-workflow';
import { foreachRagWorkflow } from './workflows/foreach-rag-workflow';
import { LangfuseExporter } from "@mastra/langfuse";
import { docIngestionWorkflow } from './workflows/doc-ingestion';

export const mastra = new Mastra({
  workflows: { basicWorkflow, ragWorkflow, foreachRagWorkflow, weatherWorkflow, docIngestionWorkflow, chromaRagWorkflow },
  agents: { stackPickerAgent },
  observability: {
    configs: {
      langfuse: {
        serviceName: 'my-service',
        exporters: [
          new LangfuseExporter({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
            secretKey: process.env.LANGFUSE_SECRET_KEY!,
            baseUrl: process.env.LANGFUSE_BASE_URL,
            options: {
              environment: process.env.NODE_ENV,
            },
          }),
        ],
      },
    }
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
