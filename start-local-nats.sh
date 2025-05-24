#!/usr/bin/env bash

CONTAINER_NAME="nats-local"
JSDOMAIN="local"
STREAM_SUBJECT="edge.event.>"
STREAMS=("stream-1" "stream-2" "stream-3")
NATS_URL="nats://localhost:4222"
CONF="$(mktemp)"
cat > "${CONF}" <<EOF
jetstream {
  domain: "${JSDOMAIN}"
  store_dir: "/data/jetstream"
}

server_name: "local-js"
http: 0.0.0.0:8222
EOF

echo "🚀 Spinning up NATS container '${CONTAINER_NAME}' ..."
docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

docker run -d \
  --name "${CONTAINER_NAME}" \
  -p 4222:4222 -p 6222:6222 -p 8222:8222 \
  -v "${CONF}":/etc/nats/nats-server.conf:ro \
  nats:latest \
  -c /etc/nats/nats-server.conf

echo "⏳ Waiting a couple of seconds for the server to become ready ..."
sleep 2


create_stream () {
  local stream="$1"
  local cfg
  cfg="$(mktemp)"
  cat > "${cfg}" <<JSON
{
  "name": "${stream}",
  "subjects": ["${STREAM_SUBJECT}"],
  "storage": "file",
  "retention": "limits",
  "discard": "new",
  "replicas": 1
}
JSON

  echo "📦 Creating stream '${stream}' ..."
  nats --server "${NATS_URL}" \
       --js-domain "${JSDOMAIN}" \
       stream add --config "${cfg}" --output /dev/null
  rm -f "${cfg}"
}

for s in "${STREAMS[@]}"; do
  create_stream "${s}"
done


echo -e "\n✅  All done — NATS is up on ${NATS_URL} and the streams are ready."
echo "   Verify with:  nats --server ${NATS_URL} --js-domain ${JSDOMAIN} stream ls"