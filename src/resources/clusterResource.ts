import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { connect, StreamInfo } from "nats";
import { BaseResource} from "./base";


export class ClusterResource extends BaseResource {

    constructor(private readonly server: McpServer) {
        super();
        this.server = server;
    }
    
    registerResources() {
        this.server.resource("clusterStats", "nats-mcp://cluster/stats", this.clusterStats.bind(this));
        this.server.resource("serverInfo", "nats-mcp://cluster/server-info", this.serverInfo.bind(this));
    }

    private async clusterStats(uri: URL) {
        const js = await this._getJetStreamManager();
        const streams = js.streams.list();
        const streamList: StreamInfo[] = []; 
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
    }

    private async serverInfo(uri: URL) {
        const nc = await connect({
            servers: process.env.NATS_SERVER_URL
        });
        
        try {
            const serverInfo = nc.info;
            const serverData = {
                server: {
                    version: serverInfo?.version || 'unknown',
                    server_id: serverInfo?.server_id || 'unknown',
                    server_name: serverInfo?.server_name || 'unknown',
                    go_version: serverInfo?.go || 'unknown',
                    git_commit: serverInfo?.git_commit || 'unknown',
                    proto: serverInfo?.proto || 'unknown',
                    max_payload: serverInfo?.max_payload || 'unknown',
                    jetstream: serverInfo?.jetstream || false,
                    cluster: serverInfo?.cluster || 'unknown',
                },
                client: {
                    client_id: serverInfo?.client_id || 'unknown',
                    client_ip: serverInfo?.client_ip || 'unknown'
                },
                connection: {
                    auth_required: serverInfo?.auth_required || false,
                    tls_required: serverInfo?.tls_required || false,
                    tls_verify: serverInfo?.tls_verify || false
                }
            };

            return {
                contents: [
                    {
                        text: JSON.stringify(serverData, null, 2),
                        uri: uri.toString(),
                        mimeType: "application/json"
                    }
                ]
            };
        } catch (error) {
            const errorData = {
                error: true,
                message: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString()
            };
            
            return {
                contents: [
                    {
                        text: JSON.stringify(errorData, null, 2),
                        uri: uri.toString(),
                        mimeType: "application/json"
                    }
                ]
            };
        } finally {
            await nc.close();
        }
    }
}