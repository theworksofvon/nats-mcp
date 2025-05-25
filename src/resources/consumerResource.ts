import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { BaseResource } from "./base";




export class ConsumerResource extends BaseResource {

    constructor(private readonly server: McpServer) {
        super();
        this.server = server;
    }
    
    registerResources() {
        this.server.resource("consumerStatus", "nats-mcp://consumers/status", this.consumerStatus.bind(this));
    }

    private async consumerStatus(uri: URL) {
        const js = await this._getJetStreamManager();
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
      }
}