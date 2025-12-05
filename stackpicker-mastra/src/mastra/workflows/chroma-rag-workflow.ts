import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { mistral } from "@ai-sdk/mistral";
import { embed, generateText } from 'ai';
import { ChromaClient } from 'chromadb';
const model = mistral("codestral-latest")

const docSchema = z.object({
  author: z.string(),
  content: z.string(),
})
type Doc = z.infer<typeof docSchema>
const userQuestionSchema = z.object({
  question: z.string()
})
const augmentedQuerySchema = userQuestionSchema.extend({
  documents: z.array(docSchema)
})
const resultSchema = augmentedQuerySchema.extend({
  answer: z.string()
})


async function fetchRelevantDocuments(question: string): Promise<Array<Doc>> {
  try {
    const client = new ChromaClient();
    const collection = await client.getCollection({
      name: "documentation_mastra",
    })
    const { embedding } = await embed({
      model: mistral.textEmbedding("mistral-embed"), value: question
    })
    const { documents } = await collection.query({ queryEmbeddings: [embedding], nResults: 3 })
    // query always takes an array of queries as param rather than a single doc
    return documents[0].map(d => ({ author: "Mastra doc", content: d || "<document vide>" }))
  } catch (err: any) {
    if (err instanceof Error) {
      console.error("Don't forget to run the Chroma server", "chroma run --path ./chroma-data")
      console.error("Run the 'doc-ingestion' workflow before trigerring this RAG workflow")
    }
    throw err
  }
}

const retrieval = createStep({
  id: "retrieval",
  description: "Retrieve documents for user query",
  inputSchema: userQuestionSchema,
  outputSchema: augmentedQuerySchema,
  execute: async ({ inputData }) => {
    const documents = await fetchRelevantDocuments(inputData.question)
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

const chromaRagWorkflow = createWorkflow({
  id: "chroma-rag",
  description: "Use this workflow to gather information about technologies in order to answer user's question.",
  inputSchema: userQuestionSchema,
  outputSchema: augmentedQuerySchema,
})
  .then(retrieval)
  .then(augmentedGeneration)


chromaRagWorkflow.commit()

export { chromaRagWorkflow };
