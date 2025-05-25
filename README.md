# NatsMCP

Unofficial Nats MCP server to play around with nats. 

## Features

- **Create streams on demand**  
  Spin up a fully-configured JetStream stream (storage, limits, replicas) with a single prompt.

- **Add or update subject filters**  
  Append new subjects to any existing stream without downtime.

- **One-shot message publishing**  
  Send JSON or plain-text payloads to any subject for smoke-testing producers or consumers.

- **Cluster inventory at a glance**  
  List every stream in the current JetStream domain with message / byte counts and replica info.

- **Stream health diagnostics**  
  Get a rich report covering retention limits, utilization, and common mis-configurations.

- **Consumer lag & state analytics**  
  Inspect delivered, pending, redelivered counts and real-time lag for any consumer.

- **Detailed consumer diagnostics**  
  Deep-dive into a consumer's config (ack policy, deliver policy, filters) and surface red flags.

- **Human-friendly errors & guidance**  
  Straightforward explanations and remediation tips instead of cryptic stack traces.

- **Add Sourcing on Demand**
  Add a new stream to sourcing for an existing stream.

- **Stream Backup & Restore**
  Backup stream configurations and states to Google Cloud Storage, with smart date-based restore capabilities.

- **Flexible NATS Authentication**
  Connect to NATS using a token, a creds file, a creds string, or no authentication at all. See Usage/Config for details.

- **Advanced Message Tools**
  List, filter, and inspect messages by subject, header, or size, and view message details.

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- **Google Cloud Storage bucket (optional, only required for backup/restore features)**
- **Express (optional, only required for SSE/remote mode)**
- **Docker (optional, for running via container)**

### Run with Docker (Quick Start)

You can run NatsMCP instantly using the latest Docker image:

```bash
docker pull theworksofvon915/nats-mcp:latest
```

Then, in your AI assistant config, you can use:

```json
{
  "mcpServers": {
    "NatsMCP": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "NATS_SERVER_URL=YOUR_NATS_URL",
        "theworksofvon915/nats-mcp:latest"
      ]
    }
  }
}
```

Replace `YOUR_NATS_URL` with your NATS server URL (e.g., `nats://localhost:4222`).

You can also pass other environment variables (see below for options)

### Build from source

```bash
# Clone the repository
git clone https://github.com/theworksofvon/nats-mcp/nats-mcp.git
cd nats-mcp

# Install dependencies
npm install

# If you want to use SSE (remote) mode, install express:
npm install express
npm install --save-dev @types/express

# If you want to use backup/restore features, install Google Cloud Storage:
npm install @google-cloud/storage

# Build the project
npm run build
```

## Usage

### Setup

1. Build the project to generate the `build` folder
```bash
npm run build
```

2. Configure your AI assistant's MCP host to use Nats-MCP by creating a configuration file (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "NatsMCP": {
      "command": "node",
      "args": [
        "/path/to/your/nats-mcp/build/index.js"
      ],
      "env": {
        "NATS_SERVER_URL": "YOUR_NATS_SERVER_URL",
        "NATS_DOMAIN": "YOUR_JS_DOMAIN",
        // gcloud
        // "GOOGLE_CLOUD_PROJECT": "YOUR_GCP_PROJECT_ID",
        // "GOOGLE_CLOUD_CLIENT_EMAIL": "YOUR_SERVICE_ACCOUNT_EMAIL",
        // "GOOGLE_CLOUD_PRIVATE_KEY": "YOUR_SERVICE_ACCOUNT_PRIVATE_KEY"

        // Http
        // "MCP_TRANSPORT": <sse or exclude for local>
        // "PORT": < define port # or exclude for local>

        // Optional Nats
        // "NATS_CONNECTION_NAME": "YOUR_CONNECTION_NAME"
        // "NATS_TOKEN": "YOUR_NATS_TOKEN"
        // "NATS_CREDS_FILE": "PATH_TO_NATS_CREDS_FILE"
        // "NATS_CREDS": "NATS_CREDS_FILE_CONTENTS"
      }
    }
  }
}
```

Replace the placeholders:
- `/path/to/your/nats-mcp/build/index.js` - The full path to the built index.js file
- `NATS_SERVER_URL` - URL to nats server (e.g., `nats@localhost:4222`)
- `NATS_DOMAIN` - Your JS domain name
- `GOOGLE_CLOUD_PROJECT` - Your Google Cloud project ID (optional)
- `GOOGLE_CLOUD_CLIENT_EMAIL` - Service account email (optional)
- `GOOGLE_CLOUD_PRIVATE_KEY` - Service account private key (optional)
- `NATS_TOKEN` - NATS token for authentication (optional)
- `NATS_CREDS_FILE` - Path to a NATS creds file (optional)
- `NATS_CREDS` - NATS creds file contents as a string (optional)

### Flexible NATS Authentication

NatsMCP supports multiple authentication methods for connecting to your NATS server:
- **Token**: Set `NATS_TOKEN` in your environment or config.
- **Creds File**: Set `NATS_CREDS_FILE` to the path of your `.creds` file.
- **Creds String**: Set `NATS_CREDS` to the contents of your creds file (as a string).
- **No authentication**: If none of the above are set, NatsMCP will connect without authentication.

You can also pass these options programmatically if you use the `connectNats` helper in your own code.

### Running the Server

- **Local (stdio) mode (default, no express required):**
  ```bash
  npm start
  ```
  The server will run locally and communicate via stdio (for desktop/local AI assistants).

- **Remote (SSE) mode (requires express):**
  ```bash
  MCP_TRANSPORT=sse PORT=8080 npm start
  ```
  The server will listen on the specified port (default 8080) and expose two endpoints:
  - `/sse` (for SSE connections)
  - `/messages` (for message POSTs)

  > **Note:** If you run in SSE mode without express installed, the server will exit with an error and instructions.

- **Backup/Restore (requires @google-cloud/storage):**
  If you want to use the backup and restore tools, you must install the Google Cloud Storage library:
  ```bash
  npm install @google-cloud/storage
  ```
  If you run a backup/restore command without this library, the server will show an error and instructions.

## Working with your AI Assistant

Once configured, you can ask your AI assistant to:

1. Publish a message:
  ```
  "Can you publish this message {"message" : "test" } to subject test.subject"
  ```

2. Diagnose Stream/Consumer issues:
  ```
  "What's going wrong with stream-2 and consumer-1?"
  ```

3. Create a stream:
  ```
  "Can you create me a new stream, stream-7 with all default values ?"
  ```

4. Add sourcing:
  ```
  "Can you add stream-1 to source-stream-2 sourcing list ?"
  ```

5. Backup a stream:
  ```
  "Can you backup stream-1 to my-backups-bucket?"
  ```

6. Restore a stream:
  ```
  "Can you restore stream-1 from the backup closest to May 30th?"
  ```

7. List recent messages:
  ```
  "Show me the 5 most recent messages in stream-1."
  ```

8. Filter messages by subject:
  ```
  "List the last 10 messages in stream-1 with subject 'foo.bar'."
  ```

9. Search messages by header:
  ```
  "Find messages in stream-1 with header 'x-request-id'."
  ```

10. Show message size distribution:
  ```
  "Show the size distribution of the last 100 messages in stream-1."
  ```

11. View a specific message:
  ```
  "Show me message 42 in stream-1."
  ```

## Available MCP Tools

NatsMCP exposes the following JetStream-focused tools to your AI assistant:

- `createStream`: Create a new stream with a given name, subject set, storage type, limits, etc.
- `addSubjects`: Append one or more additional subjects to an existing stream.
- `publish`: Publish an arbitrary text payload to any subject in the cluster (handy for smoke-tests).
- `listStreams`: List every stream in the configured JetStream domain together with basic stats.
- `diagnoseStream`: Produce a detailed health report for a stream — messages/bytes, limits, potential issues.
- `checkConsumerLag`: Show pending, redelivered, and lag metrics for a specific consumer.
- `diagnoseConsumer`: Deep-dive into one consumer's config and runtime state, highlighting red flags.
- `addStreamSource`: Adds a stream to a SourceStream sources list.
- `checkStreamSources`: Check the sources a stream has listed.
- `removeStreamSource`: Removes a stream from another streams sourcing list.
- `deleteStream`: Delete a stream completely.
- `backupStream`: Backup or restore a stream's configuration and state using Google Cloud Storage.
- `listBackups`: List available backups for a stream and find the closest backup to a specific date.
- `listRecentMessages`: List the N most recent messages in a stream.
- `listMessagesBySubject`: List the N most recent messages in a stream matching a subject filter.
- `searchMessagesByHeader`: Find messages in a stream that contain a specific header key (and optionally value).
- `messageSizeDistribution`: Show min, max, average, and histogram of message sizes in a stream.
- `viewMessage`: View a specific message in a stream by sequence number.

## Available MCP Resources

NatsMCP also provides the following resources for monitoring and diagnostics:

- `/streams/health`: Provides real-time health metrics and status of all streams, including:
  - Message counts and byte sizes
  - Sequence numbers (first and last)
  - Consumer counts
  - Deletion statistics
  - Stream configuration details (max age, bytes, messages, storage type, replicas)

- `/consumers/status`: Provides current state of all consumers across all streams, including:
  - Delivery status (delivered and acknowledged messages)
  - Pending message counts
  - Redelivery statistics
  - Consumer configuration (ack policy, delivery policy, etc.)

- `/cluster/stats`: Provides cluster-wide statistics and metrics, including:
  - Total number of streams
  - Total messages and bytes across all streams
  - Distribution of streams by storage type
  - Distribution of streams by replica count
  - Total number of consumers

These resources return JSON data that can be used for monitoring, alerting, and diagnostics. They are accessible via the MCP protocol and can be integrated with your monitoring systems.