import { connectNats } from "../nats";

export class BaseResource {

    protected async _getJetStreamManager() {
        const nc = await connectNats();
        const js = await nc.jetstreamManager({ domain: process.env.NATS_DOMAIN });
        return js;
    }

}