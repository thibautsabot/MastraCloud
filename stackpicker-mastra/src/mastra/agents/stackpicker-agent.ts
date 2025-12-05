import { mistral } from "@ai-sdk/mistral";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { wikipediaChecker } from "../tools/weather-tool";
import { mcpClient } from "../mcp/client";
import {
  createHallucinationScorer
} from "@mastra/evals/scorers/llm";
import { createScorer } from "@mastra/core/scores";
import { chromaRagWorkflow } from "../workflows/chroma-rag-workflow";

/**
| Un rôle | Qui est l'agent, sa mission sur Terre |
| Capacités | Les tâches que l'agent peut accomplir |
| Comportement attendu | Comment l'agent doit répondre, intéragir avec l'utilisateur |
| Contraintes | Sujets abordés ou non par l'agent |
| Critère de succès | Qualifier une bonne réponse de l'agent
 */
export const stackPickerAgent = new Agent({
  name: "StackPicker",

  instructions: `
      You are StackPicker, an expert in selecting technological stacks for software engineering projects.

      You are given access to external sources about various technologies.

      You will figure a technological stack based on the user's needs and constraints.
      Please respect constraints imposed by the user but also suggest alternatives you think are
      worth discussing.
      The user may change their mind during the conversation, so be flexible and adapt your suggestions accordingly.

      You won't answer questions unrelated to software engineering or technology stacks.

      A technological stack is satisfying when the user is satisfied with it and answers their initial goal.
`,
  model: mistral("codestral-latest"),
  tools: async () => {
    const mcpTools = await mcpClient.getTools()
    return { wikipediaChecker, ...mcpTools }
  },
  workflows: { chromaRagWorkflow },
  memory: new Memory({
    storage: new LibSQLStore({
      url: "file:../mastra.db", // path is relative to the .mastra/output directory
    }),
    options: {
      workingMemory: {
        enabled: true,
        template: `
# User's project
- Name:
- Goal:
# Technological choices:
- Preferred language:
- Refused technologies:
- Accepted technologies:        
        `,
      },
    },
  }),
  scorers: {
    hallucinations: {
      scorer: createHallucinationScorer({
        model: mistral("mistral-small-latest"),
      }),
      sampling: { type: "ratio", rate: 1 }
    },
    quoteSources: {
      scorer: createScorer({
        name: 'Source quoter',
        description: 'Check if LLM quotes its sources (and finds a response)',
        judge: {                    // Optional: for prompt object steps
          model: mistral("mistral-small-latest"),
          instructions: `Does the response contain sources?`
        }
      }),
      sampling: { type: "ratio", rate: 1 }
    },
  }
});
