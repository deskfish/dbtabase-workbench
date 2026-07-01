.PHONY: test build verify

test:
	cd api && go test ./...
	cd web && npm test -- --run

build:
	cd api && go build ./cmd/server
	cd web && npm run build

verify: test build
