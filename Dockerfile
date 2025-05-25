FROM node:20-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./         
COPY src ./src                

RUN npm run build

FROM node:20-slim
WORKDIR /app

COPY --from=build /app/package.json .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

ENV NODE_ENV=production

CMD [ "node", "build/index.js" ]