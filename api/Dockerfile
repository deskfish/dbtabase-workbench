FROM docker.m.daocloud.io/library/golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
ENV GOPROXY=https://goproxy.cn,direct
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/dbworkbench ./cmd/server

FROM docker.m.daocloud.io/library/alpine:3.20
RUN printf '%s\n' \
  'https://mirrors.aliyun.com/alpine/v3.20/main' \
  'https://mirrors.aliyun.com/alpine/v3.20/community' \
  > /etc/apk/repositories \
  && apk add --no-cache ca-certificates \
  && adduser -D -u 65532 app \
  && mkdir -p /data \
  && chown app:app /data
COPY --from=build /out/dbworkbench /dbworkbench
USER app
EXPOSE 8080
ENTRYPOINT ["/dbworkbench"]
