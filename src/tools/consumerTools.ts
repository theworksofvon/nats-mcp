import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { connectNats } from "../nats";



export class ConsumerTools {

    constructor(private readonly server: McpServer) {
        this.server = server;
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
            
            // Get consumer information
            const consumerInfo = await js.consumers.get(stream, consumer);
            const status = await consumerInfo.info();
            
            // Get stream information for context
            const streamInfo = await js.streams.get(stream);
            const streamState = await streamInfo.info();

            // Calculate consumer lag
            const lag = streamState.state.last_seq - status.delivered.stream_seq;
            
            // Build diagnostic report
            const report = [
                "🔍 Consumer Diagnostic Report",
                "=========================",
                "",
                "📋 Consumer Configuration:",
                `• Name: ${consumer}`,
                `• Stream: ${stream}`,
                `• Durable Name: ${status.config.durable_name || "ephemeral"}`,
                `• Ack Policy: ${status.config.ack_policy}`,
                `• Deliver Policy: ${status.config.deliver_policy}`,
                `• Filter Subject: ${status.config.filter_subject || "none"}`,
                `• Max Ack Pending: ${status.config.max_ack_pending}`,
                `• Max Deliver: ${status.config.max_deliver || "unlimited"}`,
                "",
                "📊 Consumer State:",
                `• Delivered Messages: ${status.delivered.consumer_seq}`,
                `• Last Stream Sequence: ${status.delivered.stream_seq}`,
                `• Pending Messages: ${status.num_pending}`,
                `• Waiting Requests: ${status.num_waiting}`,
                `• Redelivered Messages: ${status.num_redelivered}`,
                `• Consumer Lag: ${lag}`,
                "",
                "⚠️ Potential Issues:",
                ...(status.num_pending > 0 ? [`• ${status.num_pending} messages pending acknowledgment`] : []),
                ...(status.num_redelivered > 0 ? [`• ${status.num_redelivered} messages have been redelivered`] : []),
                ...(lag > 1000 ? [`• High consumer lag: ${lag} messages behind`] : []),
                ...(status.num_waiting === 0 ? ["• No active pull requests"] : []),
                ...(status.config.max_ack_pending && status.num_pending >= status.config.max_ack_pending * 0.9 ? 
                    ["• Approaching maximum ack pending limit"] : []),
            ].join("\n");

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
            
            // Get consumer status information
            const status = await js.consumers.get(stream, consumer);
            const stats = await status.info();
            
            return {
                content: [{ 
                    type: "text", 
                    text: `📊 Consumer Status for ${consumer} in stream ${stream}:\n` +
                          `• Stream: ${stream}\n` +
                          `• Consumer: ${consumer}\n` +
                          `• Num Pending: ${stats.num_pending}\n` +
                          `• Num Waiting: ${stats.num_waiting}\n` +
                          `• Num Redelivered: ${stats.num_redelivered}`
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