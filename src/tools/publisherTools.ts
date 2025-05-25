import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { connectNats } from "../nats";

export class PublisherTools {

    constructor(private readonly server: McpServer) {
        this.server = server;
    }
    
    registerTools() {
        this.server.tool(
            "publish",
            "Publish a message to a NATS subject",
            {
                subject: z.string().describe("NATS subject to publish to"),
                message: z.string().describe("Message content to publish"),
            },
            this.publish.bind(this)
        );
    }


    private async publish(
        args: { subject: string; message: string },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const { subject, message } = args;
        const nc = await connectNats();
        try {
            nc.publish(subject, new TextEncoder().encode(message));
            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully published message to ${subject}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error publishing message: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
    
}