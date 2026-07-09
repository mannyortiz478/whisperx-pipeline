.PHONY: dev prod build stop logs clean help shell-api shell-speech \
        test-unit-api test-integration test-api-all

help:
	@echo ""
	@echo "  WhisperX Transcription Pipeline"
	@echo "  ─────────────────────────────────────────"
	@echo "  make dev          Start dev mode (hot reload)"
	@echo "  make prod         Start production mode"
	@echo "  make build        Build production images"
	@echo "  make stop         Stop all containers"
	@echo "  make logs         Tail all container logs"
	@echo "  make clean        Remove containers and volumes"
	@echo "  make shell-api       Shell into app-api container"
	@echo "  make shell-speech    Shell into speech-api container"
	@echo "  make test-unit-api   Run app-api unit tests"
	@echo "  make test-integration Run app-api integration tests"
	@echo "  make test-api-all    Run all app-api tests"
	@echo ""

dev:
	@cp -n .env.example .env 2>/dev/null || true
	@echo "Starting dev environment..."
	docker compose -f infra/docker/docker-compose.yml \
	               -f infra/docker/docker-compose.dev.yml \
	               --env-file .env up --build

prod: build
	docker compose -f infra/docker/docker-compose.yml \
	               --env-file .env up

build:
	@echo "Building production images..."
	docker compose -f infra/docker/docker-compose.yml \
	               --env-file .env build

stop:
	docker compose -f infra/docker/docker-compose.yml down

logs:
	docker compose -f infra/docker/docker-compose.yml logs -f

clean:
	docker compose -f infra/docker/docker-compose.yml \
	               down -v --remove-orphans

shell-api:
	docker compose -f infra/docker/docker-compose.yml \
	               exec app-api /bin/bash

shell-speech:
	docker compose -f infra/docker/docker-compose.yml \
	               exec speech-api /bin/bash

test-unit-api:
	cd app-api && python -m pytest tests/ -m unit -v

test-integration:
	cd app-api && python -m pytest tests/ -m integration -v

test-api-all:
	cd app-api && python -m pytest tests/ -v
