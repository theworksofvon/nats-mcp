import { connect } from "nats";

export class BaseResource {

    protected async _getJetStreamManager() {
        const js = await (await connect({
            servers: [process.env.NATS_SERVER_URL || "nats://localhost:4222"]
        })).jetstreamManager({ domain: process.env.NATS_DOMAIN || "local" });
        return js;
    }

}