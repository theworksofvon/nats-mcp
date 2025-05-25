import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { connect } from "nats";
import { BaseResource} from "./base";


export class ClusterResource extends BaseResource {

    constructor(private readonly server: McpServer) {
        super();
        this.server = server;
    }
    
    registerResources() {
        this.server.resource("clusterStats", "/cluster/stats", this.clusterStats.bind(this));
    }

    private async clusterStats(uri: URL) {
        const js = await this._getJetStreamManager();
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
      }
}