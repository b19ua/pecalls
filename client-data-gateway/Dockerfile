FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache wget tini
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://localhost:8080/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node migrate.js && node server.js"]
