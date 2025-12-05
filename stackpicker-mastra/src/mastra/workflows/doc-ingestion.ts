import z from "zod"
import TurndownService from "turndown"
import { load } from "cheerio"
import { createStep, createWorkflow } from "@mastra/core/workflows"
import { MDocument } from "@mastra/rag"
import { ChromaClient, Collection } from "chromadb";
import { embedMany } from "ai"
import { mistral } from "@ai-sdk/mistral"
import { nanoid } from "nanoid"


async function downloadUrlAsMarkdown(url: string, selector?: string) {
    try {
        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`${url} ${res.status} ${res.statusText}`)
        }
        const mimeType = res.headers.get("content-type")?.split(";")[0].toLowerCase()
        if (!mimeType) {
            throw new Error(`${url} unknown mime-type`)
        }
        if (!["text/html", "text/plain", "text/markdown"].includes(mimeType)) {
            throw new Error(`${url} not text or HTML: '${mimeType}'`)
        }
        let body = await res.text()
        let md = body
        // convert html to markdown if needed
        if (mimeType === "text/html") {
            if (selector) {
                const $ = load(body)
                const element = $(selector).html()
                if (!element) {
                    throw new Error(`${url} selector ${selector} doesn't get any content`)
                }
                body = element
            }
            // NOTE: parsing Vercel AI SDK and Mastra's docs
            // doesn't actually work super well (titles are lost)... 
            // but it's good enough for our RAG
            const turndownService = new TurndownService()
            turndownService.remove(["script", "nav"])
            md = turndownService.turndown(body)
        }
        return md
    } catch (err) {
        console.error(err)
        throw (err)
    }
}

const downloadStep = createStep({
    id: "download-urls",
    inputSchema: z.array(z.string()),
    outputSchema: z.array(z.string()),
    execute: async ({ inputData }) => {
        const docs = []
        // execute sequentially to avoid firing too many requests
        for (const url of inputData) {
            console.log("fetching", url)
            const res = await downloadUrlAsMarkdown(url, "article")
            docs.push(res)
        }
        return docs
    }
})

const chunkSchema = z.object({
    text: z.string(),
    metadata: z.record(z.string(), z.any())
})

const chunkStep = createStep({
    id: "chunks",
    inputSchema: z.string().describe("Markdown content"),
    outputSchema: z.array(chunkSchema),
    execute: async ({ inputData }) => {
        const mdoc = MDocument.fromMarkdown(inputData)
        const chunks = await mdoc.chunk({
            maxSize: 500,
            overlap: 200
        }) // will use default markdown strategy
        return chunks
    }
})

const ingestStep = createStep({
    id: "ingest",
    inputSchema: z.array(chunkSchema),
    outputSchema: z.array(z.any()),
    stateSchema: z.object({ "client": z.instanceof(ChromaClient) }),
    execute: async ({ inputData: chunks, setState, state }) => {
        // compute embeddings locally
        const { embeddings } = await embedMany({
            model: mistral.textEmbeddingModel("mistral-embed"),
            values: chunks.map(c => c.text)
        })
        // init chroma client
        let client = state["client"]
        if (!client) {
            try {
                client = new ChromaClient();
                setState({ client })
            } catch (err) {
                console.error("Don't forget to run the Chroma server", "chroma run --path ./chroma-data")
                throw err
            }
        }
        const collection = await client.getOrCreateCollection({ name: "documentation_mastra" })
        // delete all items to avoid duplicates on multiple runs
        await collection.delete({ where: { from: "workflow" } })
        // and finally store them
        await collection.add({
            // unique id for updates
            ids: chunks.map(chunk => nanoid()),
            // embedding
            embeddings: embeddings,
            // document text
            documents: chunks.map(chunk => chunk.text),
            // allows filtering
            metadatas: chunks.map(chunk => ({ from: "workflow" }))
        })
        return chunks
    }
})

export const docIngestionWorkflow = createWorkflow({
    id: "doc-ingestion",
    inputSchema: z.array(z.string()),
    outputSchema: z.array(z.string()),
})
    // foreach is not good, as it would fire all requests at once
    // instead we manipulate an array within the step for better control
    .then(downloadStep)
    .foreach(chunkStep)
    .foreach(ingestStep)
    // don't forget me!
    .commit()
