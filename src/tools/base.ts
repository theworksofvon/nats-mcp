import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { connect } from "nats";


export class BaseTools {

    constructor(private readonly server: McpServer) {
        this.server = server;
    }

    protected async _getJetStreamManager() {
        const js = await (await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        })).jetstreamManager({ domain: process.env.NATS_DOMAIN || "local" });
        return js;
    }
    
    
}