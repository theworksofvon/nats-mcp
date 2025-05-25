import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { connectNats } from "../nats";
import { BaseTool } from "./base";


export class ConsumerTools extends BaseTool {

    constructor(server: McpServer) {
        super(server);
    }
    
    registerTools() {
        this.server.tool(
            "diagnoseConsumer",
            "Diagnose a consumer on the NATS server",
            {
                stream: z.string().describe("Name of the stream to diagnose"),
                consumer: z.string().describe("Name of the consumer to diagnose"),
            },
            this.diagnoseConsumer.bind(this)
        );
        this.server.tool(
            "checkConsumerLag",
            "Check the lag status of a consumer in a stream",
            {
                stream: z.string().describe("Name of the NATS stream"),
                consumer: z.string().describe("Name of the consumer to check"),
            },
            this.checkConsumerLag.bind(this)
        );
    }

    private async diagnoseConsumer(
        args: { stream:string, consumer: string },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
    
        const nc = await connectNats();
        const { stream, consumer } = args;
        try {
            const js = nc.jetstream();
            
            const consumerInfo = await js.consumers.get(stream, consumer);
            const status = await consumerInfo.info();
            
            const streamInfo = await js.streams.get(stream);
            const streamState = await streamInfo.info();
    
            const streamLastSeq = this.safeNumber(streamState.state?.last_seq, 0);
            const deliveredSeq = this.safeNumber(status.delivered?.stream_seq, 0);
            const lag = Math.max(0, streamLastSeq - deliveredSeq);
            
            const config = status.config || {};
            const delivered = status.delivered || {};
            
            const report = [
                "🔍 Consumer Diagnostic Report",
                "=========================",
                "",
                "📋 Consumer Configuration:",
                `• Name: ${consumer}`,
                `• Stream: ${stream}`,
                `• Durable Name: ${this.safeValue(config.durable_name, "ephemeral")}`,
                `• Ack Policy: ${this.safeValue(config.ack_policy, "unknown")}`,
                `• Deliver Policy: ${this.safeValue(config.deliver_policy, "unknown")}`,
                `• Filter Subject: ${this.safeValue(config.filter_subject, "none")}`,
                `• Max Ack Pending: ${this.safeNumber(config.max_ack_pending, 0)}`,
                `• Max Deliver: ${config.max_deliver ? this.safeValue(config.max_deliver, "0") : "unlimited"}`,
                "",
                "📊 Consumer State:",
                `• Delivered Messages: ${this.safeNumber(delivered.consumer_seq, 0)}`,
                `• Last Stream Sequence: ${this.safeNumber(delivered.stream_seq, 0)}`,
                `• Pending Messages: ${this.safeNumber(status.num_pending, 0)}`,
                `• Waiting Requests: ${this.safeNumber(status.num_waiting, 0)}`,
                `• Redelivered Messages: ${this.safeNumber(status.num_redelivered, 0)}`,
                `• Consumer Lag: ${lag}`,
                "",
                "⚠️ Potential Issues:",
                ...(this.safeNumber(status.num_pending, 0) > 0 ? [`• ${this.safeNumber(status.num_pending, 0)} messages pending acknowledgment`] : []),
                ...(this.safeNumber(status.num_redelivered, 0) > 0 ? [`• ${this.safeNumber(status.num_redelivered, 0)} messages have been redelivered`] : []),
                ...(lag > 1000 ? [`• High consumer lag: ${lag} messages behind`] : []),
                ...(this.safeNumber(status.num_waiting, 0) === 0 ? ["• No active pull requests"] : []),
                ...(config.max_ack_pending && this.safeNumber(status.num_pending, 0) >= this.safeNumber(config.max_ack_pending, 0) * 0.9 ? 
                    ["• Approaching maximum ack pending limit"] : []),
                ...(status.delivered === undefined ? ["• ⚠️ Consumer delivery data is missing"] : []),
                ...(config === undefined ? ["• ⚠️ Consumer configuration data is missing"] : []),
            ].filter(line => line !== undefined).join("\n");
    
            return {
                content: [{ 
                    type: "text", 
                    text: report
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error diagnosing consumer: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }

    private async checkConsumerLag(
        args: { stream:string, consumer: string },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const { stream, consumer } = args;
        const nc = await connectNats();
        try {
            const js = nc.jetstream();
            
            const status = await js.consumers.get(stream, consumer);
            const stats = await status.info();
            
            return {
                content: [{ 
                    type: "text", 
                    text: `📊 Consumer Status for ${consumer} in stream ${stream}:\n` +
                          `• Stream: ${stream}\n` +
                          `• Consumer: ${consumer}\n` +
                          `• Num Pending: ${this.safeNumber(stats.num_pending, 0)}\n` +
                          `• Num Waiting: ${this.safeNumber(stats.num_waiting, 0)}\n` +
                          `• Num Redelivered: ${this.safeNumber(stats.num_redelivered, 0)}`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error checking consumer status: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }

}