#!/usr/bin/env bash

CONTAINER_NAME="nats-local"
JS_DOMAIN="local"
NATS_SERVER="nats://localhost:4222"
WAIT_SECONDS=2

echo "🚀 Spinning up NATS container '${CONTAINER_NAME}' …"
docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

CONF_FILE="$(mktemp)"
cat > "${CONF_FILE}" <<EOF
jetstream {
  domain: "${JS_DOMAIN}"
  store_dir: "/data/jetstream"
}
EOF

docker run -d \
  --name "${CONTAINER_NAME}" \
  -p 4222:4222 -p 8222:8222 \
  -v "${CONF_FILE}":/etc/nats/nats.conf:ro \
  nats:latest -c /etc/nats/nats.conf

echo "⏳ Waiting ${WAIT_SECONDS}s for the server to become ready …"
sleep "${WAIT_SECONDS}"

for cfg in *-stream.json; do
  [ -e "$cfg" ] || continue

  stream="${cfg%-stream.json}"
  echo "📦 Creating stream '${stream}' from '${cfg}' …"

  nats --server "${NATS_SERVER}" \
       --js-domain "${JS_DOMAIN}" \
       stream add "${stream}" --config "${cfg}"
done

echo
echo "📋 Streams on ${JS_DOMAIN}:"
nats --server "${NATS_SERVER}" --js-domain "${JS_DOMAIN}" stream ls
echo
echo "🎉 Done – NATS is running at ${NATS_SERVER}"