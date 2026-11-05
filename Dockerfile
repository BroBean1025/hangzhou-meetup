FROM node:22-alpine
WORKDIR /app
COPY public ./public
COPY config ./config
COPY lib ./lib
COPY server.mjs ./server.mjs
ENV PORT=8080 HOST=0.0.0.0 NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
