FROM denoland/deno:2.1.4
WORKDIR /app
COPY server.ts /app/server.ts
COPY shared /app/shared
RUN deno cache /app/server.ts
EXPOSE 8090
CMD ["run", "--allow-net", "--allow-env", "/app/server.ts"]
