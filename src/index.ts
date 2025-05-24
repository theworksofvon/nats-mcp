import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { connect, StorageType, DiscardPolicy, RetentionPolicy } from "nats";

// Conditionally import Express
let express: any;
try {
    const expressModule = await import('express');
    express = expressModule.default;
} catch (error) {
    console.error("Express library not installed. SSE transport will be disabled.");
}

interface BackupFile {
    name: string;
    timestamp: Date;
    metadata: {
        stream?: string;
        timestamp?: string;
        version?: string;
    };
}

// Conditionally import Google Cloud Storage
let Storage: any;
try {
    const gcs = await import("@google-cloud/storage");
    Storage = gcs.Storage;
} catch (error) {
    console.error("Google Cloud Storage library not installed. Backup/restore features will be disabled.");
}

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

// Tool to add a source stream
server.tool(
    "addStreamSource",
    "Add a source stream to an existing NATS stream",
    {
        stream: z.string().describe("Name of the stream to add the source to"),
        sourceStream: z.string().describe("Name of the source stream to add"),
    },
    async ({ stream, sourceStream }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(stream);
            
            await js.streams.info(sourceStream);
            
            const streamConfig = {
                ...streamInfo.config,
                sources: [
                    ...(streamInfo.config.sources || []),
                    { name: sourceStream }
                ]
            };

            const updatedStream = await js.streams.update(stream, streamConfig);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully added source stream "${sourceStream}" to "${stream}"\n\n` +
                          `📋 Updated Stream Configuration:\n` +
                          `• Name: ${updatedStream.config.name}\n` +
                          `• Sources: ${updatedStream.config.sources?.map(s => s.name).join(", ") || "none"}\n` +
                          `• Storage: ${updatedStream.config.storage}\n` +
                          `• Replicas: ${updatedStream.config.num_replicas}\n` +
                          `• Max Age: ${updatedStream.config.max_age ? `${updatedStream.config.max_age}ns` : "unlimited"}\n` +
                          `• Max Bytes: ${updatedStream.config.max_bytes ? `${updatedStream.config.max_bytes} bytes` : "unlimited"}\n` +
                          `• Max Messages: ${updatedStream.config.max_msgs ? updatedStream.config.max_msgs : "unlimited"}`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error adding source stream: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to check stream sources
server.tool(
    "checkStreamSources",
    "Check the sources configured for a NATS stream",
    {
        stream: z.string().describe("Name of the stream to check sources for"),
    },
    async ({ stream }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(stream);
            
            const sources = streamInfo.config.sources || [];
            
            if (sources.length === 0) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `📋 Stream "${stream}" has no configured sources`
                    }]
                };
            }

            const sourceDetails = sources.map(source => {
                return `• ${source.name}`;
            }).join("\n");

            return {
                content: [{ 
                    type: "text", 
                    text: `📋 Sources configured for stream "${stream}":\n\n${sourceDetails}`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error checking stream sources: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to remove a source stream
server.tool(
    "removeStreamSource",
    "Remove a source stream from a NATS stream's sourcing list",
    {
        stream: z.string().describe("Name of the stream to remove the source from"),
        sourceStream: z.string().describe("Name of the source stream to remove"),
    },
    async ({ stream, sourceStream }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(stream);
            
            if (!streamInfo.config.sources || streamInfo.config.sources.length === 0) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `❌ Stream "${stream}" has no configured sources to remove`
                    }],
                    isError: true
                };
            }

            const updatedSources = streamInfo.config.sources.filter(s => s.name !== sourceStream);
            
            if (updatedSources.length === streamInfo.config.sources.length) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `❌ Source stream "${sourceStream}" is not configured as a source for "${stream}"`
                    }],
                    isError: true
                };
            }

            const streamConfig = {
                ...streamInfo.config,
                sources: updatedSources
            };

            const updatedStream = await js.streams.update(stream, streamConfig);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully removed source stream "${sourceStream}" from "${stream}"\n\n` +
                          `📋 Updated Stream Configuration:\n` +
                          `• Name: ${updatedStream.config.name}\n` +
                          `• Remaining Sources: ${updatedStream.config.sources?.map(s => s.name).join(", ") || "none"}\n` +
                          `• Storage: ${updatedStream.config.storage}\n` +
                          `• Replicas: ${updatedStream.config.num_replicas}`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error removing source stream: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to delete a stream
server.tool(
    "deleteStream",
    "Delete a NATS stream completely",
    {
        stream: z.string().describe("Name of the stream to delete"),
        force: z.boolean().default(false).describe("Force deletion even if stream has consumers"),
    },
    async ({ stream, force }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(stream);
            
            if (streamInfo.state.consumer_count > 0 && !force) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `⚠️ Stream "${stream}" has ${streamInfo.state.consumer_count} active consumers.\n` +
                              `Use force=true to delete the stream anyway.`
                    }],
                    isError: true
                };
            }

            await js.streams.delete(stream);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully deleted stream "${stream}"\n\n` +
                          `📋 Deletion Details:\n` +
                          `• Stream Name: ${stream}\n` +
                          `• Storage Type: ${streamInfo.config.storage}\n` +
                          `• Messages Deleted: ${streamInfo.state.messages}\n` +
                          `• Bytes Freed: ${streamInfo.state.bytes}\n` +
                          `• Consumers Removed: ${streamInfo.state.consumer_count}`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error deleting stream: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to update stream configuration
server.tool(
    "updateStreamConfig",
    "Update any configurable field in a NATS stream's configuration",
    {
        stream: z.string().describe("Name of the stream to update"),
        maxAge: z.number().optional().describe("Maximum age of messages in nanoseconds"),
        maxBytes: z.number().optional().describe("Maximum size of the stream in bytes"),
        maxMsgs: z.number().optional().describe("Maximum number of messages in the stream"),
        maxMsgSize: z.number().optional().describe("Maximum size of a single message in bytes"),
        maxConsumers: z.number().optional().describe("Maximum number of consumers allowed"),
        maxMsgsPerSubject: z.number().optional().describe("Maximum number of messages per subject"),
        storage: z.enum(["memory", "file"]).optional().describe("Storage type for the stream"),
        numReplicas: z.number().min(1).max(5).optional().describe("Number of stream replicas"),
        retention: z.enum(["limits", "interest", "workqueue"]).optional().describe("Message retention policy"),
        discard: z.enum(["old", "new"]).optional().describe("Message discard policy when limits are reached"),
        duplicateWindow: z.number().optional().describe("Time window for duplicate detection in nanoseconds"),
        sealed: z.boolean().optional().describe("Whether the stream is sealed (no new messages)"),
        denyDelete: z.boolean().optional().describe("Whether to deny stream deletion"),
        denyPurge: z.boolean().optional().describe("Whether to deny stream purging"),
        allowRollupHdrs: z.boolean().optional().describe("Whether to allow rollup headers"),
    },
    async ({ 
        stream, 
        maxAge, 
        maxBytes, 
        maxMsgs, 
        maxMsgSize,
        maxConsumers,
        maxMsgsPerSubject,
        storage,
        numReplicas,
        retention,
        discard,
        duplicateWindow,
        sealed,
        denyDelete,
        denyPurge,
        allowRollupHdrs
    }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(stream);
            
            const streamConfig = {
                ...streamInfo.config,
                max_age: maxAge ?? streamInfo.config.max_age,
                max_bytes: maxBytes ?? streamInfo.config.max_bytes,
                max_msgs: maxMsgs ?? streamInfo.config.max_msgs,
                max_msg_size: maxMsgSize ?? streamInfo.config.max_msg_size,
                max_consumers: maxConsumers ?? streamInfo.config.max_consumers,
                max_msgs_per_subject: maxMsgsPerSubject ?? streamInfo.config.max_msgs_per_subject,
                storage: storage ? (storage === "memory" ? StorageType.Memory : StorageType.File) : streamInfo.config.storage,
                num_replicas: numReplicas ?? streamInfo.config.num_replicas,
                retention: retention ? (retention as RetentionPolicy) : streamInfo.config.retention,
                discard: discard ? (discard === "old" ? DiscardPolicy.Old : DiscardPolicy.New) : streamInfo.config.discard,
                duplicate_window: duplicateWindow ?? streamInfo.config.duplicate_window,
                sealed: sealed ?? streamInfo.config.sealed,
                deny_delete: denyDelete ?? streamInfo.config.deny_delete,
                deny_purge: denyPurge ?? streamInfo.config.deny_purge,
                allow_rollup_hdrs: allowRollupHdrs ?? streamInfo.config.allow_rollup_hdrs
            };

            const updatedStream = await js.streams.update(stream, streamConfig);

            const changes = [];
            if (maxAge !== undefined) changes.push(`• Max Age: ${maxAge}ns`);
            if (maxBytes !== undefined) changes.push(`• Max Bytes: ${maxBytes} bytes`);
            if (maxMsgs !== undefined) changes.push(`• Max Messages: ${maxMsgs}`);
            if (maxMsgSize !== undefined) changes.push(`• Max Message Size: ${maxMsgSize} bytes`);
            if (maxConsumers !== undefined) changes.push(`• Max Consumers: ${maxConsumers}`);
            if (maxMsgsPerSubject !== undefined) changes.push(`• Max Messages Per Subject: ${maxMsgsPerSubject}`);
            if (storage !== undefined) changes.push(`• Storage: ${storage}`);
            if (numReplicas !== undefined) changes.push(`• Replicas: ${numReplicas}`);
            if (retention !== undefined) changes.push(`• Retention: ${retention}`);
            if (discard !== undefined) changes.push(`• Discard Policy: ${discard}`);
            if (duplicateWindow !== undefined) changes.push(`• Duplicate Window: ${duplicateWindow}ns`);
            if (sealed !== undefined) changes.push(`• Sealed: ${sealed}`);
            if (denyDelete !== undefined) changes.push(`• Deny Delete: ${denyDelete}`);
            if (denyPurge !== undefined) changes.push(`• Deny Purge: ${denyPurge}`);
            if (allowRollupHdrs !== undefined) changes.push(`• Allow Rollup Headers: ${allowRollupHdrs}`);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully updated stream "${stream}"\n\n` +
                          `📋 Updated Configuration:\n` +
                          changes.join("\n") + "\n\n" +
                          `📊 Current Stream State:\n` +
                          `• Messages: ${updatedStream.state.messages}\n` +
                          `• Bytes: ${updatedStream.state.bytes}\n` +
                          `• First Sequence: ${updatedStream.state.first_seq}\n` +
                          `• Last Sequence: ${updatedStream.state.last_seq}\n` +
                          `• Consumer Count: ${updatedStream.state.consumer_count}`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error updating stream configuration: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to purge messages from a stream
server.tool(
    "purgeStream",
    "Purge messages from a NATS stream with various options",
    {
        stream: z.string().describe("Name of the stream to purge"),
        subject: z.string().optional().describe("Optional subject filter to purge specific messages"),
        sequence: z.number().optional().describe("Purge messages up to this sequence number"),
        keep: z.number().optional().describe("Keep this many messages from the end"),
        olderThan: z.number().optional().describe("Purge messages older than this duration in nanoseconds"),
    },
    async ({ stream, subject, sequence, keep, olderThan }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(stream);
            
            // Build purge options
            const purgeOpts: any = {};
            if (subject) purgeOpts.filter = subject;
            if (sequence) purgeOpts.upto_seq = sequence;
            if (keep) purgeOpts.keep = keep;
            if (olderThan) purgeOpts.older_than = olderThan;

            const purgeResponse = await js.streams.purge(stream, purgeOpts);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully purged messages from stream "${stream}"\n\n` +
                          `📋 Purge Details:\n` +
                          `• Purged Messages: ${purgeResponse.purged}\n` +
                          `• Subject Filter: ${subject || "all subjects"}\n` +
                          `• Sequence Limit: ${sequence ? `up to ${sequence}` : "none"}\n` +
                          `• Keep Last: ${keep ? `${keep} messages` : "none"}\n` +
                          `• Age Limit: ${olderThan ? `${olderThan}ns` : "none"}\n\n` +
                          `📊 Remaining Stream State:\n` +
                          `• Messages: ${streamInfo.state.messages - purgeResponse.purged}\n` +
                          `• Bytes: ${streamInfo.state.bytes}\n` +
                          `• First Sequence: ${streamInfo.state.first_seq}\n` +
                          `• Last Sequence: ${streamInfo.state.last_seq}`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error purging stream: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to monitor stream health and performance
server.tool(
    "monitorStreamHealth",
    "Monitor stream health, performance metrics, and potential issues in a production environment",
    {
        stream: z.string().describe("Name of the stream to monitor"),
        duration: z.number().default(60).describe("Duration in seconds to collect metrics"),
    },
    async ({ stream, duration }) => {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            // Get initial stream state
            const initialInfo = await js.streams.info(stream);
            const startTime = Date.now();
            const startMessages = initialInfo.state.messages;
            const startBytes = initialInfo.state.bytes;
            
            // Wait for the specified duration
            await new Promise(resolve => setTimeout(resolve, duration * 1000));
            
            // Get final stream state
            const finalInfo = await js.streams.info(stream);
            const endTime = Date.now();
            
            // Calculate metrics
            const timeElapsed = (endTime - startTime) / 1000; // in seconds
            const messagesDelta = finalInfo.state.messages - startMessages;
            const bytesDelta = finalInfo.state.bytes - startBytes;
            const messagesPerSecond = messagesDelta / timeElapsed;
            const bytesPerSecond = bytesDelta / timeElapsed;
            
            // Get consumer information
            const consumers = js.consumers.list(stream);
            const consumerList: any[] = [];
            for await (const consumer of consumers) {
                consumerList.push(consumer);
            }
            
            // Calculate consumer lag and performance
            const consumerMetrics = await Promise.all(consumerList.map(async (consumer) => {
                const status = await js.consumers.info(stream, consumer.name);
                const lag = finalInfo.state.last_seq - status.delivered.stream_seq;
                return {
                    name: consumer.name,
                    lag,
                    pending: status.num_pending,
                    redelivered: status.num_redelivered,
                    ackPending: status.num_ack_pending
                };
            }));
            
            // Check for potential issues
            const issues = [];
            
            // Check message rate
            if (messagesPerSecond > 10000) {
                issues.push(`⚠️ High message rate: ${Math.round(messagesPerSecond)} msgs/sec`);
            }
            
            // Check consumer lag
            const highLagConsumers = consumerMetrics.filter(c => c.lag > 1000);
            if (highLagConsumers.length > 0) {
                issues.push(`⚠️ High consumer lag detected for: ${highLagConsumers.map(c => `${c.name} (${c.lag} messages)`).join(", ")}`);
            }
            
            // Check storage usage
            if (finalInfo.config.max_bytes && finalInfo.state.bytes > finalInfo.config.max_bytes * 0.9) {
                issues.push(`⚠️ Stream approaching storage limit: ${Math.round((finalInfo.state.bytes / finalInfo.config.max_bytes) * 100)}% used`);
            }
            
            // Check message age
            if (finalInfo.config.max_age && finalInfo.state.last_ts) {
                const lastMsgAge = Date.now() - new Date(finalInfo.state.last_ts).getTime();
                if (lastMsgAge > finalInfo.config.max_age / 1e6) { // Convert ns to ms
                    issues.push(`⚠️ Messages older than max_age detected`);
                }
            }

            return {
                content: [{ 
                    type: "text", 
                    text: `📊 Stream Health Report for "${stream}"\n` +
                          `==============================\n\n` +
                          `⏱️ Performance Metrics (${duration}s):\n` +
                          `• Messages/sec: ${Math.round(messagesPerSecond)} msgs/sec\n` +
                          `• Throughput: ${Math.round(bytesPerSecond / 1024)} KB/sec\n` +
                          `• Total Messages: ${finalInfo.state.messages}\n` +
                          `• Total Bytes: ${Math.round(finalInfo.state.bytes / 1024)} KB\n\n` +
                          `👥 Consumer Status:\n` +
                          consumerMetrics.map(c => 
                              `• ${c.name}:\n` +
                              `  - Lag: ${c.lag} messages\n` +
                              `  - Pending: ${c.pending} messages\n` +
                              `  - Redelivered: ${c.redelivered} messages\n` +
                              `  - Ack Pending: ${c.ackPending} messages`
                          ).join("\n") + "\n\n" +
                          `⚙️ Configuration:\n` +
                          `• Storage: ${finalInfo.config.storage}\n` +
                          `• Replicas: ${finalInfo.config.num_replicas}\n` +
                          `• Retention: ${finalInfo.config.retention}\n` +
                          `• Max Age: ${finalInfo.config.max_age ? `${finalInfo.config.max_age}ns` : "unlimited"}\n` +
                          `• Max Bytes: ${finalInfo.config.max_bytes ? `${Math.round(finalInfo.config.max_bytes / 1024)} KB` : "unlimited"}\n\n` +
                          (issues.length > 0 ? 
                              `⚠️ Potential Issues:\n${issues.map(i => `• ${i}`).join("\n")}\n` : 
                              `✅ No issues detected\n`)
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error monitoring stream: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to backup and restore stream configuration
server.tool(
    "backupStream",
    "Backup or restore a stream's configuration and state using Google Cloud Storage",
    {
        stream: z.string().describe("Name of the stream to backup/restore"),
        action: z.enum(["backup", "restore"]).describe("Whether to backup or restore the stream"),
        bucketName: z.string().describe("Name of the GCS bucket to store/retrieve backups"),
        backupName: z.string().optional().describe("Name of the backup file (required for restore)"),
    },
    async ({ stream, action, bucketName, backupName }) => {
        if (!Storage) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Google Cloud Storage functionality is not available. Please install @google-cloud/storage package to use backup/restore features.\n\n` +
                          `Run: npm install @google-cloud/storage`
                }],
                isError: true
            };
        }

        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            // Initialize Google Cloud Storage with authentication from environment variables
            const storageOptions: any = {};
            
            
            // Check for direct credentials in environment variables
            if (process.env.GOOGLE_CLOUD_CLIENT_EMAIL && 
                process.env.GOOGLE_CLOUD_PRIVATE_KEY &&
                process.env.GOOGLE_CLOUD_PROJECT) {
                storageOptions.credentials = {
                    client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n')
                };
                storageOptions.projectId = process.env.GOOGLE_CLOUD_PROJECT;
            }
            // If no direct credentials, it will fall back to GOOGLE_APPLICATION_CREDENTIALS
            
            const storage = new Storage(storageOptions);
            
            // Verify bucket exists and is accessible
            const [exists] = await storage.bucket(bucketName).exists();
            if (!exists) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `❌ Bucket "${bucketName}" does not exist or is not accessible. Please check your credentials and bucket name.\n\n` +
                              `Required environment variables:\n` +
                              `• GOOGLE_CLOUD_PROJECT: Your GCP project ID\n` +
                              `• GOOGLE_CLOUD_CLIENT_EMAIL: Service account email\n` +
                              `• GOOGLE_CLOUD_PRIVATE_KEY: Service account private key\n` +
                              `OR\n` +
                              `• GOOGLE_APPLICATION_CREDENTIALS: Path to service account key file`
                    }],
                    isError: true
                };
            }
            
            const bucket = storage.bucket(bucketName);
            
            if (action === "backup") {
                const streamInfo = await js.streams.info(stream);
                
                // Get all consumers
                const consumers = js.consumers.list(stream);
                const consumerList: any[] = [];
                for await (const consumer of consumers) {
                    const consumerInfo = await js.consumers.info(stream, consumer.name);
                    consumerList.push({
                        name: consumer.name,
                        config: consumerInfo.config,
                        state: {
                            delivered: consumerInfo.delivered,
                            ack_floor: consumerInfo.ack_floor,
                            num_ack_pending: consumerInfo.num_ack_pending,
                            num_redelivered: consumerInfo.num_redelivered,
                            num_waiting: consumerInfo.num_waiting,
                            num_pending: consumerInfo.num_pending
                        }
                    });
                }
                
                // Create backup object
                const backup = {
                    stream: {
                        config: streamInfo.config,
                        state: streamInfo.state
                    },
                    consumers: consumerList,
                    timestamp: new Date().toISOString(),
                    version: "1.0"
                };
                
                const backupJson = JSON.stringify(backup, null, 2);
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `${stream}-${timestamp}.json`;
                
                const file = bucket.file(filename);
                await file.save(backupJson, {
                    contentType: 'application/json',
                    metadata: {
                        stream: stream,
                        timestamp: backup.timestamp,
                        version: backup.version
                    }
                });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: `✅ Successfully created backup for stream "${stream}"\n\n` +
                              `📋 Backup Details:\n` +
                              `• Stream: ${stream}\n` +
                              `• Consumers: ${consumerList.length}\n` +
                              `• Timestamp: ${backup.timestamp}\n` +
                              `• Version: ${backup.version}\n` +
                              `• GCS Location: gs://${bucketName}/${filename}`
                    }]
                };
            } else {
                // Restore from backup
                if (!backupName) {
                    return {
                        content: [{ 
                            type: "text", 
                            text: `❌ Backup name is required for restore operation` 
                        }],
                        isError: true
                    };
                }
                
                // Download and parse backup file
                const file = bucket.file(backupName);
                const [content] = await file.download();
                const backupData = JSON.parse(content.toString());
                
                // Verify backup version
                if (backupData.version !== "1.0") {
                    return {
                        content: [{ 
                            type: "text", 
                            text: `❌ Unsupported backup version: ${backupData.version}` 
                        }],
                        isError: true
                    };
                }
                
                try {
                    await js.streams.info(stream);
                    // Stream exists, update it
                    await js.streams.update(stream, backupData.stream.config);
                } catch {
                    // Stream doesn't exist, create it
                    await js.streams.add(backupData.stream.config);
                }
                
                // Restore consumers
                for (const consumer of backupData.consumers) {
                    try {
                        await js.consumers.add(stream, consumer.config);
                    } catch (error) {
                        // Consumer might already exist, try updating
                        await js.consumers.update(stream, consumer.name, consumer.config);
                    }
                }
                
                return {
                    content: [{ 
                        type: "text", 
                        text: `✅ Successfully restored stream "${stream}" from backup\n\n` +
                              `📋 Restore Details:\n` +
                              `• Stream: ${stream}\n` +
                              `• Consumers Restored: ${backupData.consumers.length}\n` +
                              `• Backup Timestamp: ${backupData.timestamp}\n` +
                              `• Backup Version: ${backupData.version}\n` +
                              `• GCS Location: gs://${bucketName}/${backupName}`
                    }]
                };
            }
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error during ${action} operation: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

// Tool to list and find backups
server.tool(
    "listBackups",
    "List available backups for a stream and optionally find the closest backup to a specific date",
    {
        stream: z.string().describe("Name of the stream to list backups for"),
        bucketName: z.string().describe("Name of the GCS bucket containing backups"),
        targetDate: z.string().optional().describe("Optional target date to find closest backup (ISO format, e.g., '2024-05-30')"),
    },
    async ({ stream, bucketName, targetDate }) => {
        if (!Storage) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Google Cloud Storage functionality is not available. Please install @google-cloud/storage package to use backup/restore features.\n\n` +
                          `Run: npm install @google-cloud/storage`
                }],
                isError: true
            };
        }

        try {
            // Initialize Google Cloud Storage with authentication from environment variables
            const storageOptions: any = {};
            
            if (process.env.GOOGLE_CLOUD_CLIENT_EMAIL && 
                process.env.GOOGLE_CLOUD_PRIVATE_KEY &&
                process.env.GOOGLE_CLOUD_PROJECT) {
                storageOptions.credentials = {
                    client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n')
                };
                storageOptions.projectId = process.env.GOOGLE_CLOUD_PROJECT;
            }
            
            const storage = new Storage(storageOptions);
            const bucket = storage.bucket(bucketName);
            
            // List all files in the bucket
            const [files] = await bucket.getFiles({
                prefix: stream // Only get files for this stream
            });
            
            if (files.length === 0) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `📭 No backups found for stream "${stream}" in bucket "${bucketName}"` 
                    }]
                };
            }
            
            // Parse timestamps and sort backups
            const backups: BackupFile[] = files.map((file: any) => {
                const timestamp = file.name.split('-').slice(1).join('-').replace('.json', '');
                return {
                    name: file.name,
                    timestamp: new Date(timestamp),
                    metadata: file.metadata
                };
            }).sort((a: BackupFile, b: BackupFile) => b.timestamp.getTime() - a.timestamp.getTime());
            
            if (targetDate) {
                // Find closest backup to target date
                const target = new Date(targetDate);
                const closest = backups.reduce((prev: BackupFile, curr: BackupFile) => {
                    const prevDiff = Math.abs(prev.timestamp.getTime() - target.getTime());
                    const currDiff = Math.abs(curr.timestamp.getTime() - target.getTime());
                    return prevDiff < currDiff ? prev : curr;
                });
                
                const timeDiff = Math.abs(closest.timestamp.getTime() - target.getTime());
                const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));
                
                return {
                    content: [{ 
                        type: "text", 
                        text: `🔍 Found closest backup to ${targetDate}:\n\n` +
                              `📋 Backup Details:\n` +
                              `• Filename: ${closest.name}\n` +
                              `• Date: ${closest.timestamp.toISOString()}\n` +
                              `• Time Difference: ${daysDiff} days\n` +
                              `• GCS Location: gs://${bucketName}/${closest.name}\n\n` +
                              `To restore this backup, use:\n` +
                              `backupStream(stream: "${stream}", action: "restore", bucketName: "${bucketName}", backupName: "${closest.name}")`
                    }]
                };
            }
            
            // List all backups
            const backupList = backups.map((backup: BackupFile) => 
                `• ${backup.name}\n` +
                `  - Date: ${backup.timestamp.toISOString()}\n` +
                `  - GCS Location: gs://${bucketName}/${backup.name}`
            ).join("\n\n");
            
            return {
                content: [{ 
                    type: "text", 
                    text: `📋 Available backups for stream "${stream}":\n\n${backupList}\n\n` +
                          `To find the closest backup to a specific date, use:\n` +
                          `listBackups(stream: "${stream}", bucketName: "${bucketName}", targetDate: "YYYY-MM-DD")`
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error listing backups: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }
);

server.resource("streamHealth", "/streams/health", async (uri: URL) => {
  const js = await (await connect({
    servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
  })).jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
  
  const streams = js.streams.list();
  const streamList: any[] = [];
  for await (const stream of streams) {
    streamList.push(stream);
  }
  
  const healthData = await Promise.all(
    streamList.map(async (stream: any) => {
      const info = await js.streams.info(stream.config.name);
      return {
        name: stream.config.name,
        messages: info.state.messages,
        bytes: info.state.bytes,
        firstSeq: info.state.first_seq,
        lastSeq: info.state.last_seq,
        consumerCount: info.state.consumer_count,
        deleted: info.state.deleted,
        numDeleted: info.state.num_deleted,
        config: {
          maxAge: stream.config.max_age,
          maxBytes: stream.config.max_bytes,
          maxMsgs: stream.config.max_msgs,
          storage: stream.config.storage,
          replicas: stream.config.num_replicas
        }
      };
    })
  );
  return {
    contents: [
      {
        text: JSON.stringify(healthData, null, 2),
        uri: uri.toString(),
        mimeType: "application/json"
      }
    ]
  };
});

server.resource("consumerStatus", "/consumers/status", async (uri: URL) => {
  const js = await (await connect({
    servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
  })).jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
  
  const streams = js.streams.list();
  const streamList: any[] = [];
  for await (const stream of streams) {
    streamList.push(stream);
  }
  
  const consumerData = await Promise.all(
    streamList.map(async (stream: any) => {
      const consumers = await js.consumers.list(stream.config.name);
      const consumerList: any[] = [];
      for await (const consumer of consumers) {
        consumerList.push(consumer);
      }
      const consumerStatus = await Promise.all(
        consumerList.map(async (consumer: any) => {
          const info = await js.consumers.info(stream.config.name, consumer.name);
          return {
            stream: stream.config.name,
            name: consumer.name,
            delivered: info.delivered.stream_seq,
            ackFloor: info.ack_floor.stream_seq,
            pending: info.num_pending,
            redelivered: info.num_redelivered,
            config: {
              ackPolicy: consumer.config.ack_policy,
              deliverPolicy: consumer.config.deliver_policy,
              maxDeliver: consumer.config.max_deliver,
              filterSubject: consumer.config.filter_subject
            }
          };
        })
      );
      return consumerStatus;
    })
  );
  return {
    contents: [
      {
        text: JSON.stringify(consumerData.flat(), null, 2),
        uri: uri.toString(),
        mimeType: "application/json"
      }
    ]
  };
});

server.resource("clusterStats", "/cluster/stats", async (uri: URL) => {
  const js = await (await connect({
    servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
  })).jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
  
  const streams = js.streams.list();
  const streamList: any[] = [];
  for await (const stream of streams) {
    streamList.push(stream);
  }
  
  const clusterData = {
    totalStreams: streamList.length,
    totalMessages: streamList.reduce((acc: number, stream: any) => acc + stream.state.messages, 0),
    totalBytes: streamList.reduce((acc: number, stream: any) => acc + stream.state.bytes, 0),
    streamsByStorage: streamList.reduce((acc: Record<string, number>, stream: any) => {
      acc[stream.config.storage] = (acc[stream.config.storage] || 0) + 1;
      return acc;
    }, {}),
    streamsByReplicas: streamList.reduce((acc: Record<string, number>, stream: any) => {
      acc[stream.config.num_replicas] = (acc[stream.config.num_replicas] || 0) + 1;
      return acc;
    }, {}),
    totalConsumers: streamList.reduce((acc: number, stream: any) => acc + stream.state.consumer_count, 0)
  };
  return {
    contents: [
      {
        text: JSON.stringify(clusterData, null, 2),
        uri: uri.toString(),
        mimeType: "application/json"
      }
    ]
  };
});

// Start the MCP server
async function main() {
    let transport;
    
    if (process.env.MCP_TRANSPORT && process.env.MCP_TRANSPORT === 'sse') {
        if (!express) {
            console.error("❌ SSE transport requires Express. Please install express and @types/express:");
            console.error("npm install express");
            console.error("npm install --save-dev @types/express");
            process.exit(1);
        }

        // Create Express app for SSE transport
        const app = express();
        let sseTransport: SSEServerTransport | null = null;

        // SSE endpoint
        app.get("/sse", (req: any, res: any) => {
            sseTransport = new SSEServerTransport("/messages", res);
            server.connect(sseTransport);
        });

        // Message endpoint
        app.post("/messages", (req: any, res: any) => {
            if (sseTransport) {
                sseTransport.handlePostMessage(req, res);
            }
        });

        // Start Express server
        const port = parseInt(process.env.PORT || '8080');
        app.listen(port, () => {
            console.error(`📡 NATS MCP Server is running on port ${port}...`);
        });
    } else {
        // Default to stdio for local connections
        transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("📡 NATS MCP Server is running locally with stdio transport...");
    }
}

main().catch((err) => {
    console.error("❌ Fatal error in NATS MCP Server:", err);
    process.exit(1);
});