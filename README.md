### NatsMCP

### Installation

## Prerequisites
- Node.js (v16 or higher)
- npm or yarn

## Build from source
# Clone the repository
git clone https://github.com/theworksofvon/nats-mcp/nats-mcp.git
cd nats-mcp

# Install dependencies
npm install

# Build the project
npm run build


### Usage

1. Build the project to generate build folder

2. Configure your AI assistant MCP host to use NatsMCP by creating config file. (e.g. claude_desktop_config.json)
{
  "mcpServers: {
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

Replace the placeholders

### Working with your AI Assistant

1. Publish a message:
"Can you publish this message {"message" : "test" } to subject test.subject

2. Diagnose stream issues
"What's going wrong with stream-2 ?

3. Create a stream
"Can you create me a new stream, stream-7 with all default values ?"
