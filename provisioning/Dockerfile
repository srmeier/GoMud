FROM golang:1.26-alpine3.23 AS builder

ARG BIN=go-mud-server
ENV BIN=${BIN}
WORKDIR /src

# Build stage: keep compilers and toolchain packages out of the final runtime image.
RUN apk add --update make bash

COPY go.mod go.sum ./
# Download dependencies first so Docker can reuse this layer when app code changes.
RUN go mod download

COPY . .
# Generate derived files, then compile the server binary.
RUN go generate && go build -o ${BIN}

FROM alpine:latest AS runner
ARG BIN=go-mud-server
ENV BIN=${BIN}
ENV APP_USER=gomud
ENV APP_UID=10001
WORKDIR /app

# Runtime stage: install only what the running container needs.
RUN apk add --no-cache libcap-setcap \
    && adduser -D -u "${APP_UID}" "${APP_USER}" \
    && mkdir -p /app/log \
    && touch /app/log/logfile.log

EXPOSE ${PORT}
# Copy the compiled binary and bundled game data into the smaller runtime image.
COPY --from=builder --chown=${APP_USER}:${APP_USER} /src/${BIN} .
COPY --from=builder --chown=${APP_USER}:${APP_USER} /src/_datafiles ./_datafiles

# Run as an unprivileged user, but keep the narrow capability needed for HTTP port 80.
RUN chown -R "${APP_USER}:${APP_USER}" /app \
    && setcap 'cap_net_bind_service=+ep' "/app/${BIN}"

USER ${APP_USER}

# Use a shell so the BIN environment variable expands in the startup command.
ENTRYPOINT ["/bin/sh", "-c", "./${BIN}"]
