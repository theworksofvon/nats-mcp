import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { FilteredMessage, HeaderMatchMessage } from "../types";
import { connectNats } from "../nats";
import { BaseTool } from "./base";

export class MsgTools extends BaseTool {

    constructor(server: McpServer) {
        super(server);
    }

    private subjectMatches(msgSubject: string, filterSubject: string): boolean {
        try {
            if (!msgSubject || !filterSubject) return false;
            
            if (msgSubject === filterSubject) return true;
            
            if (filterSubject.includes('*')) {
                const regex = new RegExp(`^${filterSubject.replace(/\*/g, ".*")}$`);
                return regex.test(msgSubject);
            }  
            return false;
        } catch (error) {
            return msgSubject === filterSubject;
        }
    }

    private checkHeaderMatch(headers: any, headerKey: string, headerValue?: string): { isMatch: boolean; value: string } {
        try {
            if (!headers || !headerKey) {
                return { isMatch: false, value: "undefined" };
            }
            
            if (typeof headers.has !== 'function' || typeof headers.get !== 'function') {
                return { isMatch: false, value: "invalid headers object" };
            }
            
            if (!headers.has(headerKey)) {
                return { isMatch: false, value: "undefined" };
            }
            
            const value = headers.get(headerKey);
            const safeValue = this.safeValue(value, "undefined");
            
            if (!headerValue) {
                return { isMatch: true, value: safeValue };
            }
            const isMatch = safeValue === headerValue;
            return { isMatch, value: safeValue };
            
        } catch (error) {
            return { isMatch: false, value: "error reading header" };
        }
    }
    
    registerTools() {
        this.server.tool(
            "viewMessage",
            "View a specific message in a stream by sequence number",
            {
                stream: z.string().describe("Name of the NATS stream"),
                sequence: z.number().describe("Sequence number of the message to view"),
            },
            this.viewMessage.bind(this)
        );
        this.server.tool(
            "listRecentMessages",
            "List the N most recent messages in a stream",
            {
                stream: z.string().describe("Name of the NATS stream"),
                count: z.number().min(1).max(100).default(10).describe("Number of recent messages to list"),
            },
            this.listRecentMessages.bind(this)
        );
        this.server.tool(
            "listMessagesBySubject",
            "List messages in a stream by subject",
            {
                stream: z.string().describe("Name of the NATS stream"),
                subject: z.string().describe("Subject to filter messages by"),
                count: z.number().min(1).max(100).default(10).describe("Number of messages to list"),
            },
            this.listMessagesBySubject.bind(this)
        );
        this.server.tool(
            "searchMessagesByHeader",
            "Search messages in a stream by header",
            {
                stream: z.string().describe("Name of the NATS stream"),
                headerKey: z.string().describe("Header key to search by"),
                headerValue: z.string().describe("Header value to search for"),
                count: z.number().min(1).max(100).default(10).describe("Number of messages to list"),
            },
            this.searchMessagesByHeader.bind(this)
        );
        this.server.tool(
            "messageSizeDistribution",
            "Analyze the size distribution of messages in a stream",
            {
                stream: z.string().describe("Name of the NATS stream"),
                count: z.number().min(1).max(100).default(10).describe("Number of messages to analyze"),
            },
            this.messageSizeDistribution.bind(this)
        );
    }


    private async viewMessage(
        args: { stream: string; sequence: number },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const { stream, sequence } = args;
    
        const nc = await connectNats();
        try {
            const jsm = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN });
            const msg = await jsm.streams.getMessage(stream, { seq: sequence });
            if (!msg) {
                return {
                    content: [{
                        type: "text",
                        text: `❌ No message found at sequence ${sequence} in stream ${stream}`
                    }],
                    isError: true
                };
            }
    
            const data = msg.data ? new TextDecoder().decode(msg.data) : "<no data>";
            
            const timestamp = this.safeValue(msg.time || msg.timestamp, "unknown");
            
            const safeHeaders = (): string => {
                try {
                    if (!msg.header) return "none";
                    return JSON.stringify(Object.fromEntries(msg.header), null, 2);
                } catch (error) {
                    return "error parsing headers";
                }
            };
    
            return {
                content: [{
                    type: "text",
                    text: `📨 Message in stream "${stream}" (sequence: ${sequence}):\n` +
                          `• Subject: ${this.safeValue(msg.subject, "unknown")}\n` +
                          `• Timestamp: ${timestamp}\n` +
                          `• Headers: ${safeHeaders()}\n` +
                          `• Data: ${data}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error viewing message: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }

    private async listRecentMessages(
        args: { stream: string; count: number },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const { stream, count } = args;
        const nc = await connectNats();
        try {
            const jsm = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN });
            const info = await jsm.streams.info(stream);
            const lastSeq = info.state.last_seq;
            const firstSeq = Math.max(1, lastSeq - count + 1);
            const messages = [];
            
            for (let seq = firstSeq; seq <= lastSeq; seq++) {
                try {
                    const msg = await jsm.streams.getMessage(stream, { seq });
                    const data = msg.data ? new TextDecoder().decode(msg.data) : "<no data>";
                    
                    messages.push({
                        sequence: seq,
                        subject: this.safeValue(msg.subject, "unknown"),
                        time: this.safeValue(msg.time || msg.timestamp, "unknown"),
                        header: msg.header,
                        data: data
                    });
                } catch (e) {
                    // skip missing messages (e.g., deleted)
                }
            }
            
            if (messages.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `📭 No messages found in stream "${stream}".`
                    }]
                };
            }
            
            const msgList = messages.map(m => {
                const safeData = this.safeValue(m.data, "<no data>");
                const truncatedData = safeData.length > 100 ? `${safeData.substring(0, 100)}...` : safeData;
                
                return `• Seq: ${m.sequence}\n  Subject: ${m.subject}\n  Time: ${m.time}\n  Data: ${truncatedData}`;
            }).join("\n\n");
            
            return {
                content: [{
                    type: "text",
                    text: `📋 Recent ${messages.length} messages in stream "${stream}":\n\n${msgList}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error listing recent messages: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }

    private async listMessagesBySubject(
        args: { stream: string; subject: string; count: number },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const { stream, subject, count } = args;
    
        const nc = await connectNats();
        try {
            const jsm = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN });
            const info = await jsm.streams.info(stream);
            const lastSeq = info.state.last_seq;
            const firstSeq = Math.max(1, lastSeq - 500 + 1); // scan up to 500 messages for filtering
            const messages: FilteredMessage[] = [];
            
            for (let seq = lastSeq; seq >= firstSeq && messages.length < count; seq--) {
                try {
                    const msg = await jsm.streams.getMessage(stream, { seq });
                    const msgSubject = this.safeValue(msg.subject, "");
                    
                    const isMatch = this.subjectMatches(msgSubject, subject);
                    
                    if (isMatch) {
                        const data = msg.data ? new TextDecoder().decode(msg.data) : "<no data>";
                        
                        messages.push({
                            sequence: seq,
                            subject: this.safeValue(msg.subject, "unknown"),
                            time: this.safeValue(msg.time || msg.timestamp, "unknown"),
                            header: msg.header,
                            data: data
                        });
                    }
                } catch (e) {
                    // skip missing messages
                    console.error(`Error listing messages by subject: ${e}`);
                }
            }
            
            if (messages.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `📭 No messages found in stream "${stream}" matching subject "${subject}".`
                    }]
                };
            }
            
            const msgList = messages.map(m => {
                const safeData = this.safeValue(m.data, "<no data>");
                const truncatedData = safeData.length > 100 ? `${safeData.substring(0, 100)}...` : safeData;
                
                return `• Seq: ${m.sequence}\n  Subject: ${m.subject}\n  Time: ${m.time}\n  Data: ${truncatedData}`;
            }).join("\n\n");
            
            return {
                content: [{
                    type: "text",
                    text: `📋 Recent ${messages.length} messages in stream "${stream}" matching subject "${subject}":\n\n${msgList}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error listing messages by subject: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }


    private async searchMessagesByHeader(
        args: { stream: string; headerKey: string; headerValue: string; count: number },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const { stream, headerKey, headerValue, count } = args;
        const nc = await connectNats();
        try {
            const jsm = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN });
            const info = await jsm.streams.info(stream);
            const lastSeq = info.state.last_seq;
            const firstSeq = Math.max(1, lastSeq - 500 + 1); // scan up to 500 messages
            const messages: HeaderMatchMessage[] = [];
            
            for (let seq = lastSeq; seq >= firstSeq && messages.length < count; seq--) {
                try {
                    const msg = await jsm.streams.getMessage(stream, { seq });
                    
                    // Safe header checking
                    const headerMatch = this.checkHeaderMatch(msg.header, headerKey, headerValue);
                    
                    if (headerMatch.isMatch) {
                        const data = msg.data ? new TextDecoder().decode(msg.data) : "<no data>";
                        
                        messages.push({
                            sequence: seq,
                            subject: this.safeValue(msg.subject, "unknown"),
                            time: this.safeValue(msg.time || msg.timestamp, "unknown"),
                            header: msg.header,
                            headerValue: headerMatch.value,
                            data: data
                        });
                    }
                } catch (e) {
                    // skip missing messages
                }
            }
            
            if (messages.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `📭 No messages found in stream "${stream}" with header "${headerKey}"${headerValue ? ` and value "${headerValue}"` : ''}.`
                    }]
                };
            }
            
            const msgList = messages.map(m => {
                const safeData = this.safeValue(m.data, "<no data>");
                const truncatedData = safeData.length > 100 ? `${safeData.substring(0, 100)}...` : safeData;
                
                return `• Seq: ${m.sequence}\n  Subject: ${m.subject}\n  Time: ${m.time}\n  Header: ${headerKey} = ${this.safeValue(m.headerValue, "undefined")}\n  Data: ${truncatedData}`;
            }).join("\n\n");
            
            return {
                content: [{
                    type: "text",
                    text: `📋 Found ${messages.length} messages in stream "${stream}" with header "${headerKey}"${headerValue ? ` and value "${headerValue}"` : ''}:\n\n${msgList}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error searching messages by header: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }

    private async messageSizeDistribution(
        args: { stream: string; count: number },
        _extra: any
    ): Promise<{ content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "audio"; data: string; mimeType: string } | { type: "resource"; resource: any })[]; isError?: boolean }> {
        const { stream, count } = args;
        const nc = await connectNats();
        try {
            const jsm = await nc.jetstreamManager({domain: process.env.NATS_DOMAIN });
            const info = await jsm.streams.info(stream);
            const lastSeq = info.state.last_seq;
            const firstSeq = Math.max(1, lastSeq - count + 1);
            const sizes = [];
            for (let seq = firstSeq; seq <= lastSeq; seq++) {
                try {
                    const msg = await jsm.streams.getMessage(stream, { seq });
                    sizes.push(msg.data ? msg.data.length : 0);
                } catch (e) {
                    // skip missing messages
                    console.error(`Error analyzing message sizes: ${e}`);
                }
            }
            if (sizes.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `📭 No messages found in stream "${stream}".`
                    }]
                };
            }
            const min = Math.min(...sizes);
            const max = Math.max(...sizes);
            const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
            // Simple histogram (bucketed by 0-99, 100-499, 500-999, 1000+)
            const histogram = {
                "0-99": sizes.filter(s => s < 100).length,
                "100-499": sizes.filter(s => s >= 100 && s < 500).length,
                "500-999": sizes.filter(s => s >= 500 && s < 1000).length,
                "1000+": sizes.filter(s => s >= 1000).length
            };
            return {
                content: [{
                    type: "text",
                    text: `📊 Message Size Distribution in stream "${stream}" (last ${sizes.length} messages):\n` +
                          `• Min: ${min} bytes\n` +
                          `• Max: ${max} bytes\n` +
                          `• Avg: ${avg} bytes\n` +
                          `• Histogram: ${JSON.stringify(histogram)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error analyzing message sizes: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
            };
        }
    }
    
}