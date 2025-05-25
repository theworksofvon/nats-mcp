import { Authenticator, connect, credsAuthenticator } from "nats";
import * as fs from "fs";

export type NatsConnectOptions = {
  servers?: string | string[];
  name?: string;
  token?: string;
  credsFile?: string;
  creds?: string;
};

export type NatsConnector = NatsConnectOptions & {
  authenticator?: Authenticator;
}

export async function connectNats(options: NatsConnectOptions = {}) {
  const servers = options.servers
    || process.env.NATS_SERVER_URL
  const name = options.name
    || process.env.NATS_CONNECTION_NAME;
  const token = options.token
    || process.env.NATS_TOKEN;
  const credsFile = options.credsFile
    || process.env.NATS_CREDS_FILE;
  const creds = options.creds
    || process.env.NATS_CREDS;

  const connectOpts: NatsConnector = { servers };
  if (name) connectOpts.name = name;
  if (token) connectOpts.token = token;

  if (creds) {
    connectOpts.authenticator = credsAuthenticator(new TextEncoder().encode(creds));
  } else if (credsFile) {
    connectOpts.authenticator = credsAuthenticator(fs.readFileSync(credsFile));
  }

  return await connect(connectOpts);
}