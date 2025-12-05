import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { mistral } from "@ai-sdk/mistral";
import { generateText } from 'ai';
const model = mistral("codestral-latest")

const userQuestionSchema = z.object({
  question: z.string()
})
const aiAnswerSchema = z.object({
  answer: z.string()
})

const generateAnswer = createStep({
  id: "generate",
  inputSchema: userQuestionSchema,
  outputSchema: aiAnswerSchema,
  execute: async ({ inputData, mastra /* , mastra*/ }) => {
    const prompt = `Answer user's question:
      <question>${inputData.question}</question>.`
    // @ts-ignore weird ts error with vercel v5, despite versions being ok
    const answer = await generateText({ model, prompt })

    // Alternative : apeller un agent Mastra
    //const answer = await mastra.getAgent("some-agent").generate([prompt])
    return { answer: answer.text }
  }
})

const basicWorkflow = createWorkflow({
  id: "basic-workflow",
  inputSchema: userQuestionSchema,
  outputSchema: aiAnswerSchema,
})
  .then(generateAnswer)

basicWorkflow.commit()

export { basicWorkflow };
