import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { connect, StorageType, DiscardPolicy, RetentionPolicy } from "nats";
import { BackupFile } from "../types";

export class StreamTools {
    constructor(private readonly server: McpServer) {}

    registerTools() {
        this.server.tool(
            "addSubjects",
            "Add new subjects to an existing NATS stream",
            {
                stream: z.string().describe("Name of the stream to add subjects to"),
                subjects: z.array(z.string()).describe("Array of new subjects to add to the stream"),
            },
            this.addSubjects.bind(this)
        );
        this.server.tool(
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
            this.createStream.bind(this)
        );
        this.server.tool(
            "listStreams",
            "List all streams on the NATS server",
            {},
            this.listStreams.bind(this)
        );
        this.server.tool(
            "diagnoseStream",
            "Perform a comprehensive diagnosis of a NATS stream",
            {
                stream: z.string().describe("Name of the stream to diagnose"),
            },
            this.diagnoseStream.bind(this)
        );
        this.server.tool(
            "addStreamSource",
            "Add a source stream to an existing NATS stream",
            {
                stream: z.string().describe("Name of the stream to add the source to"),
                sourceStream: z.string().describe("Name of the source stream to add"),
            },
            this.addStreamSource.bind(this)
        );
        this.server.tool(
            "checkStreamSources",
            "Check the sources configured for a NATS stream",
            {
                stream: z.string().describe("Name of the stream to check sources for"),
            },
            this.checkStreamSources.bind(this)
        );
        this.server.tool(
            "removeStreamSource",
            "Remove a source stream from a NATS stream's sourcing list",
            {
                stream: z.string().describe("Name of the stream to remove the source from"),
                sourceStream: z.string().describe("Name of the source stream to remove"),
            },
            this.removeStreamSource.bind(this)
        );
        this.server.tool(
            "deleteStream",
            "Delete a NATS stream completely",
            {
                stream: z.string().describe("Name of the stream to delete"),
                force: z.boolean().default(false).describe("Force deletion even if stream has consumers"),
            },
            this.deleteStream.bind(this)
        );
        this.server.tool(
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
            this.updateStreamConfig.bind(this)
        );
        this.server.tool(
            "purgeStream",
            "Purge messages from a NATS stream with various options",
            {
                stream: z.string().describe("Name of the stream to purge"),
                subject: z.string().optional().describe("Optional subject filter to purge specific messages"),
                sequence: z.number().optional().describe("Purge messages up to this sequence number"),
                keep: z.number().optional().describe("Keep this many messages from the end"),
                olderThan: z.number().optional().describe("Purge messages older than this duration in nanoseconds"),
            },
            this.purgeStream.bind(this)
        );
        this.server.tool(
            "monitorStreamHealth",
            "Monitor the health and performance of a NATS stream",
            {
                stream: z.string().describe("Name of the stream to monitor"),
                duration: z.number().describe("Duration of the monitoring period in seconds"),
            },
            this.monitorStreamHealth.bind(this)
        );
        this.server.tool(
            "backupStream",
            "Backup or restore a NATS stream",
            {
                stream: z.string().describe("Name of the stream to backup/restore"),
                action: z.enum(["backup", "restore"]).describe("Whether to backup or restore the stream"),
                bucketName: z.string().describe("Name of the GCS bucket to store/retrieve backups"),
                backupName: z.string().optional().describe("Name of the backup file (required for restore)"),
            },
            this.backupStream.bind(this)
        );
        this.server.tool(
            "listBackups",
            "List all backups for a given stream",
            {
                stream: z.string().describe("Name of the stream to list backups for"),
                bucketName: z.string().describe("Name of the GCS bucket to list backups from"),
                targetDate: z.string().optional().describe("Target date for backups (YYYY-MM-DD)"),
            },
            this.listBackups.bind(this)
        );
    }

    private async addSubjects(
        { stream, subjects }: { stream: string; subjects: string[] },
        _extra: any
    ): Promise<{ [x: string]: unknown; content: { [x: string]: unknown; type: "text"; text: string }[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({ domain: process.env.NATS_DOMAIN || "local" });
            const streamInfo = await js.streams.info(stream);
            const updatedSubjects = [...new Set([...(streamInfo.config.subjects || []), ...subjects])];
            const streamConfig = {
                ...streamInfo.config,
                subjects: updatedSubjects,
            };
            const updatedStream = await js.streams.update(stream, streamConfig);
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

    private async createStream(
        { name, subjects, maxAge, maxBytes, maxMsgs, storage, numReplicas }: {
            name: string;
            subjects: string[];
            maxAge?: number;
            maxBytes?: number;
            maxMsgs?: number;
            storage: "memory" | "file";
            numReplicas: number;
        },
        _extra: any
    ): Promise<{ [x: string]: unknown; content: { [x: string]: unknown; type: "text"; text: string }[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({ domain: process.env.NATS_DOMAIN || "local" });
            const streamConfig = {
                name,
                subjects,
                max_age: maxAge,
                max_bytes: maxBytes,
                max_msgs: maxMsgs,
                storage: storage === "memory" ? StorageType.Memory : StorageType.File,
                num_replicas: numReplicas,
            };
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

    private async listStreams(
        _args: {},
        _extra: any
    ): Promise<{ [x: string]: unknown; content: { [x: string]: unknown; type: "text"; text: string }[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({ domain: process.env.NATS_DOMAIN || "local" });
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
                       `• Max Messages: ${stream.config.max_msgs ? stream.config.max_msgs : "unlimited"}\n` +
                       `• Sources: ${stream.config.sources?.map((s: any) => s.name).join(", ") || "none"}\n`;
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

    private async diagnoseStream(
        { stream }: { stream: string },
        _extra: any
    ): Promise<{ [x: string]: unknown; content: { [x: string]: unknown; type: "text"; text: string }[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({ domain: process.env.NATS_DOMAIN || "local" });
            const streamInfo = await js.streams.info(stream);
            const consumers = js.consumers.list(stream);
            const consumerList: any[] = [];
            for await (const consumer of consumers) {
                consumerList.push(consumer);
            }
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

    private async addStreamSource(
        args: { stream: string; sourceStream: string },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(args.stream);
            
            await js.streams.info(args.sourceStream);
            
            const streamConfig = {
                ...streamInfo.config,
                sources: [
                    ...(streamInfo.config.sources || []),
                    { name: args.sourceStream }
                ]
            };

            const updatedStream = await js.streams.update(args.stream, streamConfig);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully added source stream "${args.sourceStream}" to "${args.stream}"\n\n` +
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

    private async checkStreamSources(
        args: { stream: string },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(args.stream);
            
            const sources = streamInfo.config.sources || [];
            
            if (sources.length === 0) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `📋 Stream "${args.stream}" has no configured sources`
                    }]
                };
            }

            const sourceDetails = sources.map(source => {
                return `• ${source.name}`;
            }).join("\n");

            return {
                content: [{ 
                    type: "text", 
                    text: `Sources configured for stream "${args.stream}":\n\n${sourceDetails}`
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

    private async removeStreamSource(
        args: { stream: string; sourceStream: string },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(args.stream);
            
            if (!streamInfo.config.sources || streamInfo.config.sources.length === 0) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `❌ Stream "${args.stream}" has no configured sources to remove`
                    }],
                    isError: true
                };
            }

            const updatedSources = streamInfo.config.sources.filter(s => s.name !== args.sourceStream);
            
            if (updatedSources.length === streamInfo.config.sources.length) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `❌ Source stream "${args.sourceStream}" is not configured as a source for "${args.stream}"`
                    }],
                    isError: true
                };
            }

            const streamConfig = {
                ...streamInfo.config,
                sources: updatedSources
            };

            const updatedStream = await js.streams.update(args.stream, streamConfig);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully removed source stream "${args.sourceStream}" from "${args.stream}"\n\n` +
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

    private async deleteStream(
        args: { stream: string; force?: boolean },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(args.stream);
            
            if (streamInfo.state.consumer_count > 0 && !args.force) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `⚠️ Stream "${args.stream}" has ${streamInfo.state.consumer_count} active consumers.\n` +
                              `Use force=true to delete the stream anyway.`
                    }],
                    isError: true
                };
            }

            await js.streams.delete(args.stream);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully deleted stream "${args.stream}"\n\n` +
                          `📋 Deletion Details:\n` +
                          `• Stream Name: ${args.stream}\n` +
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

    private async updateStreamConfig(
        args: {
            stream: string;
            maxAge?: number;
            maxBytes?: number;
            maxMsgs?: number;
            maxMsgSize?: number;
            maxConsumers?: number;
            maxMsgsPerSubject?: number;
            storage?: "memory" | "file";
            numReplicas?: number;
            retention?: "limits" | "interest" | "workqueue";
            discard?: "old" | "new";
            duplicateWindow?: number;
            sealed?: boolean;
            denyDelete?: boolean;
            denyPurge?: boolean;
            allowRollupHdrs?: boolean;
        },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(args.stream);
            
            const streamConfig = {
                ...streamInfo.config,
                max_age: args.maxAge ?? streamInfo.config.max_age,
                max_bytes: args.maxBytes ?? streamInfo.config.max_bytes,
                max_msgs: args.maxMsgs ?? streamInfo.config.max_msgs,
                max_msg_size: args.maxMsgSize ?? streamInfo.config.max_msg_size,
                max_consumers: args.maxConsumers ?? streamInfo.config.max_consumers,
                max_msgs_per_subject: args.maxMsgsPerSubject ?? streamInfo.config.max_msgs_per_subject,
                storage: args.storage ? (args.storage === "memory" ? StorageType.Memory : StorageType.File) : streamInfo.config.storage,
                num_replicas: args.numReplicas ?? streamInfo.config.num_replicas,
                retention: args.retention ? (args.retention as RetentionPolicy) : streamInfo.config.retention,
                discard: args.discard ? (args.discard === "old" ? DiscardPolicy.Old : DiscardPolicy.New) : streamInfo.config.discard,
                duplicate_window: args.duplicateWindow ?? streamInfo.config.duplicate_window,
                sealed: args.sealed ?? streamInfo.config.sealed,
                deny_delete: args.denyDelete ?? streamInfo.config.deny_delete,
                deny_purge: args.denyPurge ?? streamInfo.config.deny_purge,
                allow_rollup_hdrs: args.allowRollupHdrs ?? streamInfo.config.allow_rollup_hdrs
            };

            const updatedStream = await js.streams.update(args.stream, streamConfig);

            const changes = [];
            if (args.maxAge !== undefined) changes.push(`• Max Age: ${args.maxAge}ns`);
            if (args.maxBytes !== undefined) changes.push(`• Max Bytes: ${args.maxBytes} bytes`);
            if (args.maxMsgs !== undefined) changes.push(`• Max Messages: ${args.maxMsgs}`);
            if (args.maxMsgSize !== undefined) changes.push(`• Max Message Size: ${args.maxMsgSize} bytes`);
            if (args.maxConsumers !== undefined) changes.push(`• Max Consumers: ${args.maxConsumers}`);
            if (args.maxMsgsPerSubject !== undefined) changes.push(`• Max Messages Per Subject: ${args.maxMsgsPerSubject}`);
            if (args.storage !== undefined) changes.push(`• Storage: ${args.storage}`);
            if (args.numReplicas !== undefined) changes.push(`• Replicas: ${args.numReplicas}`);
            if (args.retention !== undefined) changes.push(`• Retention: ${args.retention}`);
            if (args.discard !== undefined) changes.push(`• Discard Policy: ${args.discard}`);
            if (args.duplicateWindow !== undefined) changes.push(`• Duplicate Window: ${args.duplicateWindow}ns`);
            if (args.sealed !== undefined) changes.push(`• Sealed: ${args.sealed}`);
            if (args.denyDelete !== undefined) changes.push(`• Deny Delete: ${args.denyDelete}`);
            if (args.denyPurge !== undefined) changes.push(`• Deny Purge: ${args.denyPurge}`);
            if (args.allowRollupHdrs !== undefined) changes.push(`• Allow Rollup Headers: ${args.allowRollupHdrs}`);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully updated stream "${args.stream}"\n\n` +
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

    private async purgeStream(
        args: { stream: string; subject?: string; sequence?: number; keep?: number; olderThan?: number },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            const streamInfo = await js.streams.info(args.stream);
            
            // Build purge options
            const purgeOpts: any = {};
            if (args.subject) purgeOpts.filter = args.subject;
            if (args.sequence) purgeOpts.upto_seq = args.sequence;
            if (args.keep) purgeOpts.keep = args.keep;
            if (args.olderThan) purgeOpts.older_than = args.olderThan;

            const purgeResponse = await js.streams.purge(args.stream, purgeOpts);

            return {
                content: [{ 
                    type: "text", 
                    text: `✅ Successfully purged messages from stream "${args.stream}"\n\n` +
                          `📋 Purge Details:\n` +
                          `• Purged Messages: ${purgeResponse.purged}\n` +
                          `• Subject Filter: ${args.subject || "all subjects"}\n` +
                          `• Sequence Limit: ${args.sequence ? `up to ${args.sequence}` : "none"}\n` +
                          `• Keep Last: ${args.keep ? `${args.keep} messages` : "none"}\n` +
                          `• Age Limit: ${args.olderThan ? `${args.olderThan}ns` : "none"}\n\n` +
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

    private async monitorStreamHealth(
        args: { stream: string; duration: number },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const nc = await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        });
        try {
            const js = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN || "local"});
            
            // Get initial stream state
            const initialInfo = await js.streams.info(args.stream);
            const startTime = Date.now();
            const startMessages = initialInfo.state.messages;
            const startBytes = initialInfo.state.bytes;
            
            // Wait for the specified duration
            await new Promise(resolve => setTimeout(resolve, args.duration * 1000));
            
            // Get final stream state
            const finalInfo = await js.streams.info(args.stream);
            const endTime = Date.now();
            
            // Calculate metrics
            const timeElapsed = (endTime - startTime) / 1000; // in seconds
            const messagesDelta = finalInfo.state.messages - startMessages;
            const bytesDelta = finalInfo.state.bytes - startBytes;
            const messagesPerSecond = messagesDelta / timeElapsed;
            const bytesPerSecond = bytesDelta / timeElapsed;
            
            // Get consumer information
            const consumers = js.consumers.list(args.stream);
            const consumerList: any[] = [];
            for await (const consumer of consumers) {
                consumerList.push(consumer);
            }
            
            // Calculate consumer lag and performance
            const consumerMetrics = await Promise.all(consumerList.map(async (consumer) => {
                const status = await js.consumers.info(args.stream, consumer.name);
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
                    text: `📊 Stream Health Report for "${args.stream}"\n` +
                          `==============================\n\n` +
                          `⏱️ Performance Metrics (${args.duration}s):\n` +
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

    private async backupStream(
        args: { stream: string; action: "backup" | "restore"; bucketName: string; backupName?: string },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {

        let Storage: any;
        try {
            const gcs = await import("@google-cloud/storage");
            Storage = gcs.Storage;
        } catch (error) {
            console.error("Google Cloud Storage library not installed. Backup/restore features will be disabled.");
        }

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
            const [exists] = await storage.bucket(args.bucketName).exists();
            if (!exists) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `❌ Bucket "${args.bucketName}" does not exist or is not accessible. Please check your credentials and bucket name.\n\n` +
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
            
            const bucket = storage.bucket(args.bucketName);
            
            if (args.action === "backup") {
                const streamInfo = await js.streams.info(args.stream);
                
                // Get all consumers
                const consumers = js.consumers.list(args.stream);
                const consumerList: any[] = [];
                for await (const consumer of consumers) {
                    const consumerInfo = await js.consumers.info(args.stream, consumer.name);
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
                const filename = `${args.stream}-${timestamp}.json`;
                
                const file = bucket.file(filename);
                await file.save(backupJson, {
                    contentType: 'application/json',
                    metadata: {
                        stream: args.stream,
                        timestamp: backup.timestamp,
                        version: backup.version
                    }
                });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: `✅ Successfully created backup for stream "${args.stream}"\n\n` +
                              `�� Backup Details:\n` +
                              `• Stream: ${args.stream}\n` +
                              `• Consumers: ${consumerList.length}\n` +
                              `• Timestamp: ${backup.timestamp}\n` +
                              `• Version: ${backup.version}\n` +
                              `• GCS Location: gs://${args.bucketName}/${filename}`
                    }]
                };
            } else {
                // Restore from backup
                if (!args.backupName) {
                    return {
                        content: [{ 
                            type: "text", 
                            text: `❌ Backup name is required for restore operation` 
                        }],
                        isError: true
                    };
                }
                
                // Download and parse backup file
                const file = bucket.file(args.backupName);
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
                    await js.streams.info(args.stream);
                    // Stream exists, update it
                    await js.streams.update(args.stream, backupData.stream.config);
                } catch {
                    // Stream doesn't exist, create it
                    await js.streams.add(backupData.stream.config);
                }
                
                // Restore consumers
                for (const consumer of backupData.consumers) {
                    try {
                        await js.consumers.add(args.stream, consumer.config);
                    } catch (error) {
                        // Consumer might already exist, try updating
                        await js.consumers.update(args.stream, consumer.name, consumer.config);
                    }
                }
                
                return {
                    content: [{ 
                        type: "text", 
                        text: `✅ Successfully restored stream "${args.stream}" from backup\n\n` +
                              `📋 Restore Details:\n` +
                              `• Stream: ${args.stream}\n` +
                              `• Consumers Restored: ${backupData.consumers.length}\n` +
                              `• Backup Timestamp: ${backupData.timestamp}\n` +
                              `• Backup Version: ${backupData.version}\n` +
                              `• GCS Location: gs://${args.bucketName}/${args.backupName}`
                    }]
                };
            }
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: `❌ Error during ${args.action} operation: ${error instanceof Error ? error.message : String(error)}` 
                }],
                isError: true
            };
        }
    }

    private async listBackups(
        args: { stream: string; bucketName: string; targetDate?: string },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {

        let Storage: any;
        try {
            const gcs = await import("@google-cloud/storage");
            Storage = gcs.Storage;
        } catch (error) {
            console.error("Google Cloud Storage library not installed. Backup/restore features will be disabled.");
        }
        
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
            const bucket = storage.bucket(args.bucketName);
            
            // List all files in the bucket
            const [files] = await bucket.getFiles({
                prefix: args.stream // Only get files for this stream
            });
            
            if (files.length === 0) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `📭 No backups found for stream "${args.stream}" in bucket "${args.bucketName}"` 
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
            
            if (args.targetDate) {
                // Find closest backup to target date
                const target = new Date(args.targetDate);
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
                        text: `🔍 Found closest backup to ${args.targetDate}:\n\n` +
                              `📋 Backup Details:\n` +
                              `• Filename: ${closest.name}\n` +
                              `• Date: ${closest.timestamp.toISOString()}\n` +
                              `• Time Difference: ${daysDiff} days\n` +
                              `• GCS Location: gs://${args.bucketName}/${closest.name}\n\n` +
                              `To restore this backup, use:\n` +
                              `backupStream(stream: "${args.stream}", action: "restore", bucketName: "${args.bucketName}", backupName: "${closest.name}")`
                    }]
                };
            }
            
            // List all backups
            const backupList = backups.map((backup: BackupFile) => 
                `• ${backup.name}\n` +
                `  - Date: ${backup.timestamp.toISOString()}\n` +
                `  - GCS Location: gs://${args.bucketName}/${backup.name}`
            ).join("\n\n");
            
            return {
                content: [{ 
                    type: "text", 
                    text: `📋 Available backups for stream "${args.stream}":\n\n${backupList}\n\n` +
                          `To find the closest backup to a specific date, use:\n` +
                          `listBackups(stream: "${args.stream}", bucketName: "${args.bucketName}", targetDate: "YYYY-MM-DD")`
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
}