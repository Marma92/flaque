FROM docker:cli

RUN apk add --no-cache bash curl git socat jq

WORKDIR /app

COPY updater/update.sh updater/server.sh ./

RUN chmod +x update.sh server.sh

EXPOSE 9090

CMD ["./server.sh"]
