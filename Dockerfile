FROM docker.m.daocloud.io/library/node:24-alpine AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM docker.m.daocloud.io/library/golang:1.25-alpine AS go-build
WORKDIR /src/api
COPY api/go.mod api/go.sum ./
ENV GOPROXY=https://goproxy.cn,direct
RUN go mod download
COPY api/ ./
COPY --from=web-build /src/web/dist ./internal/webui/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ops-console ./cmd/server

FROM docker.m.daocloud.io/library/alpine:3.20
RUN printf '%s\n' \
  'https://mirrors.aliyun.com/alpine/v3.20/main' \
  'https://mirrors.aliyun.com/alpine/v3.20/community' \
  > /etc/apk/repositories \
  && apk add --no-cache ca-certificates \
  && adduser -D -u 65532 app \
  && mkdir -p /data \
  && chown app:app /data
COPY --from=go-build /out/ops-console /ops-console
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD ["/ops-console", "--healthcheck"]
ENTRYPOINT ["/ops-console"]
