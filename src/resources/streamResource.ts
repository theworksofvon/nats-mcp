import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { BaseResource } from "./base";

export class StreamResource extends BaseResource {

    constructor(private readonly server: McpServer) {
        super();
        this.server = server;
    }
    registerResources() {
        this.server.resource("streamHealth", "/streams/health", this.streamHealth.bind(this));
      }

    private async streamHealth(uri: URL) {
        const js = await this._getJetStreamManager();
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
      }


}