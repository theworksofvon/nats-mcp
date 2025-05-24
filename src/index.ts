import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { connect, StorageType } from "nats";

const server = new McpServer({
    name: "nats-server",
    version: "1.0.0",
});

// Tool to add subjects to a stream
server.tool(
    "addSubjects",
    "Add new subjects to an existing NATS stream",
    {
        stream: z.string().describe("Name of the stream to add subjects to"),
        subjects: z.array(z.string()).describe("Array of new subjects to add to the stream"),
    },
    async ({ stream, subjects }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(stream);

            const updatedSubjects = [...new Set([...streamInfo.config.subjects, ...subjects])];
            
            const streamConfig = {
                ...streamInfo.config,
                subjects: updatedSubjects,
            };

            const updatedStream = await js.streams.update(stream,streamConfig);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully updated stream "${stream}"\n\n` +
                          `📋 Updated Stream Configuration:\n` +
                          `• Name: ${updatedStream.config.name}\n` +
                          `• Subjects: ${updatedStream.config.subjects.join(", ")}\n` +
                          `• Storage: ${updatedStream.config.storage}\n` +
                          `• Replicas: ${updatedStream.config.num_replicas}\n` +
                          `• Max Age: ${updatedStream.config.max_age ? `${updatedStream.config.max_age}ns` : "unlimited"}\n` +
                          `• Max Bytes: ${updatedStream.config.max_bytes ? `${updatedStream.config.max_bytes} bytes` : "unlimited"}\n` +
                          `• Max Messages: ${updatedStream.config.max_msgs ? updatedStream.config.max_msgs : "unlimited"}\n\n` +
                          `📝 Added Subjects:\n` +
                          subjects.map(subject => `• ${subject}`).join("\n")
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error updating stream: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to create a stream
server.tool(
    "createStream",
    "Create a new NATS stream with specified configuration",
    {
        name: z.string().describe("Name of the stream to create"),
        subjects: z.array(z.string()).describe("Array of subjects to include in the stream"),
        maxAge: z.number().optional().describe("Maximum age of messages in nanoseconds"),
        maxBytes: z.number().optional().describe("Maximum size of the stream in bytes"),
        maxMsgs: z.number().optional().describe("Maximum number of messages in the stream"),
        storage: z.enum(["memory", "file"]).default("file").describe("Storage type for the stream"),
        numReplicas: z.number().min(1).max(5).default(1).describe("Number of stream replicas"),
    },
    async ({ name, subjects, maxAge, maxBytes, maxMsgs, storage, numReplicas }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            // Create stream configuration
            const streamConfig = {
                name,
                subjects,
                max_age: maxAge,
                max_bytes: maxBytes,
                max_msgs: maxMsgs,
                storage: storage === "memory" ? StorageType.Memory : StorageType.File,
                num_replicas: numReplicas,
            };

            // Create the stream
            const stream = await js.streams.add(streamConfig);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully created stream "${name}"\n\n` +
                          `📋 Stream Configuration:\n` +
                          `• Name: ${stream.config.name}\n` +
                          `• Subjects: ${stream.config.subjects.join(", ")}\n` +
                          `• Storage: ${stream.config.storage}\n` +
                          `• Replicas: ${stream.config.num_replicas}\n` +
                          `• Max Age: ${stream.config.max_age ? `${stream.config.max_age}ns` : "unlimited"}\n` +
                          `• Max Bytes: ${stream.config.max_bytes ? `${stream.config.max_bytes} bytes` : "unlimited"}\n` +
                          `• Max Messages: ${stream.config.max_msgs ? stream.config.max_msgs : "unlimited"}`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error creating stream: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to publish messages
server.tool(
    "publish",
    "Publish a message to a NATS subject",
    {
        subject: z.string().describe("NATS subject to publish to"),
        message: z.string().describe("Message content to publish"),
    },
    async ({ subject, message }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
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
);

// Tool to check consumer lag
server.tool(
    "checkConsumerLag",
    "Check the lag status of a consumer in a stream",
    {
        stream: z.string().describe("Name of the NATS stream"),
        consumer: z.string().describe("Name of the consumer to check"),
    },
    async ({ stream, consumer }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
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
);

// Tool to list all streams
server.tool(
    "listStreams",
    "List all streams on the NATS server",
    {},
    async () => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            const streams = js.streams.list();
            
            const streamList: any[] = [];
            for await (const stream of streams) {
                streamList.push(stream);
            }
            
            if (streamList.length === 0) {
                return {
                    content: [{ 
                        type: "text", 
                        text: "📭 No streams found on the server" 
                    }]
                };
            }

            const streamDetails = streamList.map(stream => {
                return `📋 Stream: ${stream.config.name}\n` +
                       `• Subjects: ${stream.config.subjects.join(", ")}\n` +
                       `• Storage: ${stream.config.storage}\n` +
                       `• Replicas: ${stream.config.num_replicas}\n` +
                       `• Max Age: ${stream.config.max_age ? `${stream.config.max_age}ns` : "unlimited"}\n` +
                       `• Max Bytes: ${stream.config.max_bytes ? `${stream.config.max_bytes} bytes` : "unlimited"}\n` +
                       `• Max Messages: ${stream.config.max_msgs ? stream.config.max_msgs : "unlimited"}\n`;
            }).join("\n");

            return {
                content: [{ 
                    type: "text", 
                    text: `📊 Found ${streamList.length} stream(s) on the server:\n\n${streamDetails}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error listing streams: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to diagnose a stream
server.tool(
    "diagnoseStream",
    "Perform a comprehensive diagnosis of a NATS stream",
    {
        stream: z.string().describe("Name of the stream to diagnose"),
    },
    async ({ stream }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            // Get stream information
            const streamInfo = await js.streams.info(stream);
            
            // Get all consumers for this stream
            const consumers = js.consumers.list(stream);
            const consumerList: any[] = [];
            for await (const consumer of consumers) {
                consumerList.push(consumer);
            }

            // Build diagnostic report
            const report = [
                "🔍 Stream Diagnostic Report",
                "======================",
                "",
                "📋 Stream Configuration:",
                `• Name: ${streamInfo.config.name}`,
                `• Subjects: ${streamInfo.config.subjects.join(", ")}`,
                `• Storage: ${streamInfo.config.storage}`,
                `• Replicas: ${streamInfo.config.num_replicas}`,
                `• Max Age: ${streamInfo.config.max_age ? `${streamInfo.config.max_age}ns` : "unlimited"}`,
                `• Max Bytes: ${streamInfo.config.max_bytes ? `${streamInfo.config.max_bytes} bytes` : "unlimited"}`,
                `• Max Messages: ${streamInfo.config.max_msgs ? streamInfo.config.max_msgs : "unlimited"}`,
                "",
                "📊 Stream State:",
                `• Messages: ${streamInfo.state.messages}`,
                `• Bytes: ${streamInfo.state.bytes}`,
                `• First Sequence: ${streamInfo.state.first_seq}`,
                `• Last Sequence: ${streamInfo.state.last_seq}`,
                `• Consumer Count: ${streamInfo.state.consumer_count}`,
                "",
                "👥 Connected Consumers:",
                ...consumerList.map(c => 
                    `• ${c.name} (${c.config.durable_name || "ephemeral"})`
                ),
                "",
                "⚠️ Potential Issues:",
                ...(streamInfo.state.messages === 0 ? ["• Stream is empty"] : []),
                ...(streamInfo.state.consumer_count === 0 ? ["• No consumers connected"] : []),
                ...(streamInfo.config.max_bytes && streamInfo.state.bytes >= streamInfo.config.max_bytes * 0.9 ? 
                    ["• Stream is approaching maximum size limit"] : []),
                ...(streamInfo.config.max_msgs && streamInfo.state.messages >= streamInfo.config.max_msgs * 0.9 ? 
                    ["• Stream is approaching maximum message limit"] : []),
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
                    text: `❌ Error diagnosing stream: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to diagnose a consumer
server.tool(
    "diagnoseConsumer",
    "Perform a comprehensive diagnosis of a NATS consumer",
    {
        stream: z.string().describe("Name of the stream containing the consumer"),
        consumer: z.string().describe("Name of the consumer to diagnose"),
    },
    async ({ stream, consumer }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
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
);

// Start the MCP server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("📡 NATS MCP Server is running with publish and consumer lag tools...");
}

main().catch((err) => {
    console.error("❌ Fatal error in NATS MCP Server:", err);
    process.exit(1);
});