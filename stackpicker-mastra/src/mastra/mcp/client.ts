import { MCPClient } from "@mastra/mcp"
export const mcpClient = new MCPClient({
    id: "test-mcp-client",
    servers: {
        filesystem: {
            // Le client va déclencher  lui-même le programme qui agit comme serveur MCP
            // (en cas d'erreur, testez la commande à la main)
            "command": "npx",
            "args": [
                "-y",
                "@modelcontextprotocol/server-filesystem",
                // Folder must exist already
                // can only write temporary files
                "."
            ]
        }
        // Pour les APIs MCP, le serveur MCP est entièrement géré par le fournisseur de cette API
        // notre client s'y connecte selon le protocole standard MCP
        /*weather: {
            url: new URL(`https://server.smithery.ai/@smithery-ai/national-weather-service/mcp?api_key=${process.env.SMITHERY_API_KEY}`)
        },*/
    }
});