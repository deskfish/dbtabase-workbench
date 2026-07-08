.PHONY: test build verify web-assets test-foundation build-container

test:
	cd api && go test ./...
	cd web && npm test -- --run

web-assets:
	cd web && npm run build
	rm -rf api/internal/webui/dist
	mkdir -p api/internal/webui/dist
	cp -R web/dist/. api/internal/webui/dist/
	touch api/internal/webui/dist/.gitkeep

build: web-assets
	cd api && go build ./cmd/server

verify: test build
	cd api && go test -race ./...
	cd web && npm audit --audit-level=high

test-foundation:
	cd api && go test ./...
	cd web && npm test -- --run
	cd web && npm run typecheck
	cd web && npm run build

build-container:
	docker build -t ops-console:foundation .
