.PHONY: help install dev build test clean docker-up docker-down logs

help:
	@echo "AI Visibility Platform - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install       - Install dependencies"
	@echo "  make setup         - Initialize databases and setup"
	@echo ""
	@echo "Development:"
	@echo "  make dev           - Start backend in development mode"
	@echo "  make build         - Build TypeScript"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up     - Start all services with Docker Compose"
	@echo "  make docker-down   - Stop all Docker services"
	@echo "  make docker-logs   - View Docker service logs"
	@echo ""
	@echo "Testing & Linting:"
	@echo "  make test          - Run tests"
	@echo "  make lint          - Run linter"
	@echo "  make format        - Format code"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate    - Run database migrations"
	@echo "  make db-seed       - Seed test data"
	@echo "  make db-shell      - Connect to database shell"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         - Clean build artifacts"
	@echo "  make clean-all     - Clean everything including node_modules"

install:
	cd backend && npm install

setup: install
	cd backend && npm run db:migrate

dev:
	cd backend && npm run dev

build:
	cd backend && npm run build

test:
	cd backend && npm test

lint:
	cd backend && npm run lint

format:
	cd backend && npm run format

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

db-migrate:
	cd backend && npm run db:migrate

db-seed:
	cd backend && npm run db:seed

db-shell:
	docker exec -it ai-visibility-postgres psql -U aivisibility -d ai_visibility

clean:
	cd backend && rm -rf dist node_modules/.cache

clean-all:
	cd backend && rm -rf dist node_modules dist/
	rm -rf logs/*.log

.DEFAULT_GOAL := help
