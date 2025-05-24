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
  Deep-dive into a consumer’s config (ack policy, deliver policy, filters) and surface red flags.

- **Human-friendly errors & guidance**  
  Straightforward explanations and remediation tips instead of cryptic stack traces.

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Build from source

```bash
# Clone the repository
git clone https://github.com/theworksofvon/nats-mcp/nats-mcp.git
cd nats-mcp

# Install dependencies
npm install

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
        "NATS_URL": "YOUR_NATS_SERVER_URL",
        "NATS_DOMAIN": "YOUR_JS_DOMAIN"
      }
    }
  }
}
```

Replace the placeholders:
- `/path/to/your/nats-mcp/build/index.js` - The full path to the built index.js file
- `NATS_URL` - URL to nats server (e.g., `nats@localhost:4222`)
- `NATS_DOMAIN` - Your JS domain name.

## Working with your AI Assistant

Once configured, you can ask your AI assistant to:

1. Publish a message:
   ```
   "Can you publish this message {"message" : "test" } to subject test.subject"
   ```

2. Diagnose Stream/Consumer issues:
   ```
  "What's going wrong with stream-2 and consumer-1 ?"
   ```

3. Create a stream:
   ```
   "Can you create me a new stream, stream-7 with all default values ?"
   ```

## Available MCP Tools

NatsMCP exposes the following JetStream-focused tools to your AI assistant:

| Tool | Purpose |
|------|---------|
| **`createStream`** | Create a new stream with a given name, subject set, storage type, limits, etc. |
| **`addSubjects`** | Append one or more additional subjects to an existing stream. |
| **`publish`** | Publish an arbitrary text payload to any subject in the cluster (handy for smoke-tests). |
| **`listStreams`** | List every stream in the configured JetStream domain together with basic stats. |
| **`diagnoseStream`** | Produce a detailed health report for a stream — messages/bytes, limits, potential issues. |
| **`checkConsumerLag`** | Show pending, redelivered, and lag metrics for a specific consumer. |
| **`diagnoseConsumer`** | Deep-dive into one consumer’s config and runtime state, highlighting red flags. |

## Tool Parameters

### createStream
```javascript

```

### addSubjects
```javascript

```

### publish
```javascript

```

### listStreams
```javascript

```

### diagnoseStream
```javascript

```

### checkConsumerLag
```javascript

```

### diagnoseConsumer
```javascript

```
