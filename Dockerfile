FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node config ./config
RUN mkdir /app/data && chown node:node /app/data
USER node
CMD ["node", "src/index.js"]
