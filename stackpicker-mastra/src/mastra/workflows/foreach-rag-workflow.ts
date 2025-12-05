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

const questionSplitter = createStep({
  id: "question-splitter",
  description: "Splits multiple questions to run them in parallel",
  inputSchema: z.string(),
  outputSchema: z.array(z.string()),
  // must be async even if function is trivial
  execute: async ({ inputData }) => {
    // split by "?", and add the "?" again to each question
    // Improvement: we should use an LLM to get a semantic split and avoid cutting related questions
    // complex example: "What is Mastra? And LangChain?" -> question should not be cut.
    return inputData.split("?").map(q => q + "?")
  }
})

const retrieval = createStep({
  id: "retrieval",
  description: "Retrieve documents for user query",
  inputSchema: z.string(),
  outputSchema: augmentedQuerySchema,
  execute: async ({ inputData }) => {
    const documents = fetchRelevantDocuments(inputData)
    return { question: inputData, documents }
  }
})

const aggregation = createStep({
  id: "aggregation",
  description: "Aggregate multiple responses",
  inputSchema: z.array(augmentedQuerySchema),
  outputSchema: augmentedQuerySchema,
  execute: async ({ inputData }) => {
    return {
      // merges questions back into a single question
      question: inputData.map(i => i.question).join(""),
      // merges arrays of documents
      documents: inputData.map(i => i.documents).reduce((a, b) => a.concat(b), [])
    }
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

/**
 * Test with following JSON input:
 * [{"question":"What is mastra?"},{"question": "Is LangChain better?"}]
 */
const foreachRagWorkflow = createWorkflow({
  id: "parallel-rag",
  // inputSchema is usually an object, 
  // even when we have a single value,
  // in order to be valid JSON
  // But a string will still work apparently
  inputSchema: z.string(),
  outputSchema: augmentedQuerySchema,
})
  // Must return an array to be chained with for each
  .then(questionSplitter)
  // @see https://github.com/mastra-ai/mastra/issues/9395
  .foreach(retrieval)
  // turn input array into a single output
  .then(aggregation)
  // generate the final response
  .then(augmentedGeneration)


foreachRagWorkflow.commit()
export { foreachRagWorkflow };
