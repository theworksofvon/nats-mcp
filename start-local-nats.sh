#!/bin/bash

CONTAINER_NAME="nats-local"
JSDOMAIN="local"
STREAM_SUBJECT="edge.event.>"
STREAMS=("stream-1" "stream-2" "stream-3")


TMP_CONF="$(mktemp)"
cat > "${TMP_CONF}" <<EOF
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
  -v "${TMP_CONF}":/etc/nats/nats-server.conf:ro \
  nats:latest \
  -c /etc/nats/nats-server.conf

echo "⏳ Waiting a couple of seconds for the server to become ready ..."
sleep 2

create_stream () {
  local stream="$1"
  echo "📦 Creating stream '${stream}' with subject '${STREAM_SUBJECT}' ..."
  nats --server nats://localhost:4222 \
       --js-domain "${JSDOMAIN}" \
       stream add "${stream}" \
       --subjects "${STREAM_SUBJECT}" \
       --storage file \
       --retention limits \
       --ack
}

for s in "${STREAMS[@]}"; do
  create_stream "${s}"
done

echo -e "\n✅  All done — NATS is up on nats://localhost:4222 and the three streams are ready."
echo "   Use 'docker logs -f ${CONTAINER_NAME}' to watch the server, or 'nats stream ls --js-domain ${JSDOMAIN}' to verify."