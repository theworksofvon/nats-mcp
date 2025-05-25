import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ConsumerTools, PublisherTools, StreamTools, MsgTools } from "./tools"
import { ConsumerResource, StreamResource, ClusterResource } from "./resources"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";


const server = new McpServer({
    name: "NATS MCP Server",
    version: "1.0.0",
    description: "A MCP server for NATS",
});

const consumerTools = new ConsumerTools(server);
const publisherTools = new PublisherTools(server);
const streamTools = new StreamTools(server);
const msgTools = new MsgTools(server);

const consumerResource = new ConsumerResource(server);
const streamResource = new StreamResource(server);
const clusterResource = new ClusterResource(server);

async function main() {
    let transport;

    consumerTools.registerTools();
    publisherTools.registerTools();
    streamTools.registerTools();
    msgTools.registerTools();

    consumerResource.registerResources();
    streamResource.registerResources();
    clusterResource.registerResources();
    
    if (process.env.MCP_TRANSPORT && process.env.MCP_TRANSPORT === 'sse') {
        let express;
        try {
            const expressModule = await import('express');
            express = expressModule.default;
        } catch (error) {
            console.error("❌ Express library not installed. Please install express and @types/express:");
            console.error("npm install express");
            console.error("npm install --save-dev @types/express");
            process.exit(1);
        }

        const app = express();
        let sseTransport: SSEServerTransport | null = null;

        app.get("/sse", (req: any, res: any) => {
            sseTransport = new SSEServerTransport("/messages", res);
            server.connect(sseTransport);
        });

        app.post("/messages", (req: any, res: any) => {
            if (sseTransport) {
                sseTransport.handlePostMessage(req, res);
            }
        });

        const port = parseInt(process.env.PORT || '8080');
        app.listen(port, () => {
            console.error(`📡 NATS MCP Server is running on port ${port}...`);
        });
    } else {
        transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("📡 NATS MCP Server is running locally with stdio transport...");
    }
}

main().catch((err) => {
    console.error("❌ Fatal error in NATS MCP Server:", err);
    process.exit(1);
});