FROM node:22-alpine
WORKDIR /app
COPY core/public ./core/public
COPY core/config ./core/config
COPY core/lib ./core/lib
COPY core/server.mjs ./core/server.mjs
ENV PORT=8080 HOST=0.0.0.0 NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "core/server.mjs"]
