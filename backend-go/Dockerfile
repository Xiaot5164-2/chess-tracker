# chess-tracker Go worker — sync Chess.com → daily_game_stats / daily_puzzle_stats (NOT daily_stats; see mysql/migrations/005)
FROM golang:1.21-alpine AS build
WORKDIR /src
RUN apk add --no-cache ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=build /out/worker /app/worker
WORKDIR /app
USER 65534:65534
ENTRYPOINT ["/app/worker"]
