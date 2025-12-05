import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { mistral } from "@ai-sdk/mistral";
import { generateText } from 'ai';
const model = mistral("codestral-latest")

const docSchema = z.object({
  author: z.string(),
  content: z.string(),
})
const userQuestionSchema = z.object({
  question: z.string()
})
const augmentedQuerySchema = userQuestionSchema.extend({
  documents: z.array(docSchema)
})
const resultSchema = augmentedQuerySchema.extend({
  answer: z.string()
})


function fetchRelevantDocuments(question: string) {
  if (question.match(/mastra/i)) {
    return [
      {
        author: "Eric Burel",
        content: "Mastra is an agentic framework for JavaScript, built-on top of Vercel AI SDK.",
      }

    ]
  }
  return []
}

const retrieval = createStep({
  id: "retrieval",
  description: "Retrieve documents for user query",
  inputSchema: userQuestionSchema,
  outputSchema: augmentedQuerySchema,
  execute: async ({ inputData }) => {
    const documents = fetchRelevantDocuments(inputData.question)
    return { ...inputData, documents }
  }
})

const augmentedGeneration = createStep({
  id: "augmented-generation",
  description: "Run an augmented LLM call",
  inputSchema: augmentedQuerySchema,
  outputSchema: resultSchema,
  execute: async ({ inputData/*, mastra*/ }) => {

    const prompt = `
User asked the following question:
<user_question>    
${inputData.question}
</user_question>    
We found the following relevant documents:
<relevant_documents>
${inputData.documents.length ? inputData.documents.map(d => JSON.stringify(d, null, 2)).join("\n\n") : "No document matched the question."}
</relevant_documents>
Answer the user question based on the relevant documents.
`

    // @ts-ignore
    const answer = await generateText({ model, prompt })
    // Alternative : apeller un agent Mastra
    //const answer = await mastra.getAgent("some-agent").generate([prompt])
    return {
      ...inputData,
      answer: answer.text
    }
  }

})

const ragWorkflow = createWorkflow({
  id: "rag",
  inputSchema: userQuestionSchema,
  outputSchema: augmentedQuerySchema,
})
  .then(retrieval)
  .then(augmentedGeneration)


ragWorkflow.commit()

export { ragWorkflow };
