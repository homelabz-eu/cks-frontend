# CKS Frontend Makefile

# Variables
APP_NAME = cks-frontend
VERSION ?= latest
REGISTRY ?= registry.toolz.homelabz.eu
IMAGE = $(REGISTRY)/$(APP_NAME):$(VERSION)
NAMESPACE ?= cks-system

# Build configuration
BUILD_DATE = $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT = $(shell git rev-parse --short HEAD)
GIT_BRANCH = $(shell git rev-parse --abbrev-ref HEAD)

# Kubernetes configuration
KUBECTL = kubectl
KUSTOMIZE = kustomize

.PHONY: help
help: ## Show this help message
	@echo "CKS Frontend - Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build Docker image
	@echo "Building $(IMAGE)..."
	docker build \
		--tag $(IMAGE) \
		--label "org.opencontainers.image.created=$(BUILD_DATE)" \
		--label "org.opencontainers.image.revision=$(GIT_COMMIT)" \
		--label "org.opencontainers.image.version=$(VERSION)" \
		--label "org.opencontainers.image.source=https://github.com/homelabz-eu/cks-frontend" \
		.

.PHONY: push
push: ## Push Docker image to registry
	@echo "Pushing $(IMAGE)..."
	docker push $(IMAGE)

.PHONY: pull
pull: ## Pull Docker image from registry
	@echo "Pulling $(IMAGE)..."
	docker pull $(IMAGE)

.PHONY: run
run: ## Run container locally
	@echo "Running $(APP_NAME) locally..."
	docker run --rm -it \
		-p 3000:3000 \
		-e API_BASE_URL=http://localhost:8080/api/v1 \
		--name $(APP_NAME) \
		$(IMAGE)

.PHONY: dev
dev: ## Start development server
	@echo "Starting development server..."
	cd src && npm run dev

.PHONY: install
install: ## Install dependencies
	@echo "Installing dependencies..."
	cd src && npm install

.PHONY: lint
lint: ## Run linting
	@echo "Running linter..."
	cd src && npm run lint

.PHONY: test
test: ## Run tests
	@echo "Running tests..."
	cd src && npm test

.PHONY: build-local
build-local: ## Build Next.js application locally
	@echo "Building Next.js application..."
	cd src && npm run build

.PHONY: deploy
deploy: ## Deploy to Kubernetes
	@echo "Deploying $(APP_NAME) to Kubernetes..."
	@echo "Creating namespace if it doesn't exist..."
	-$(KUBECTL) create namespace $(NAMESPACE)
	@echo "Applying Kubernetes manifests..."
	$(KUBECTL) apply -f k8s/ -n $(NAMESPACE)
	@echo "Waiting for deployment to be ready..."
	$(KUBECTL) rollout status deployment/$(APP_NAME) -n $(NAMESPACE) --timeout=300s

.PHONY: undeploy
undeploy: ## Remove from Kubernetes
	@echo "Removing $(APP_NAME) from Kubernetes..."
	$(KUBECTL) delete -f k8s/ -n $(NAMESPACE) --ignore-not-found=true

.PHONY: restart
restart: ## Restart deployment
	@echo "Restarting $(APP_NAME) deployment..."
	$(KUBECTL) rollout restart deployment/$(APP_NAME) -n $(NAMESPACE)

.PHONY: status
status: ## Show deployment status
	@echo "Deployment status:"
	$(KUBECTL) get pods,svc,ingress -l app=$(APP_NAME) -n $(NAMESPACE)

.PHONY: logs
logs: ## Show application logs
	@echo "Showing logs for $(APP_NAME)..."
	$(KUBECTL) logs -l app=$(APP_NAME) -n $(NAMESPACE) --tail=100 -f

.PHONY: exec
exec: ## Execute shell in running pod
	@echo "Executing shell in $(APP_NAME) pod..."
	$(KUBECTL) exec -it deployment/$(APP_NAME) -n $(NAMESPACE) -- /bin/sh

.PHONY: port-forward
port-forward: ## Forward local port to service
	@echo "Port forwarding $(APP_NAME) service to localhost:3000..."
	$(KUBECTL) port-forward service/$(APP_NAME) 3000:3000 -n $(NAMESPACE)

.PHONY: clean
clean: ## Clean up local Docker resources
	@echo "Cleaning up Docker resources..."
	-docker rmi $(IMAGE)
	-docker system prune -f

.PHONY: clean-all
clean-all: clean ## Clean up everything
	@echo "Cleaning up all resources..."
	-docker rmi $$(docker images $(REGISTRY)/$(APP_NAME) -q)

.PHONY: release
release: build push deploy ## Build, push and deploy (full release)
	@echo "Release completed for $(APP_NAME):$(VERSION)"

.PHONY: update
update: ## Update deployment with latest image
	@echo "Updating $(APP_NAME) deployment..."
	$(KUBECTL) set image deployment/$(APP_NAME) $(APP_NAME)=$(IMAGE) -n $(NAMESPACE)
	$(KUBECTL) rollout status deployment/$(APP_NAME) -n $(NAMESPACE) --timeout=300s

.PHONY: config
config: ## Show current configuration
	@echo "Configuration:"
	@echo "  APP_NAME: $(APP_NAME)"
	@echo "  VERSION: $(VERSION)"
	@echo "  REGISTRY: $(REGISTRY)"
	@echo "  IMAGE: $(IMAGE)"
	@echo "  NAMESPACE: $(NAMESPACE)"
	@echo "  GIT_COMMIT: $(GIT_COMMIT)"
	@echo "  GIT_BRANCH: $(GIT_BRANCH)"

.PHONY: check-env
check-env: ## Check environment setup
	@echo "Checking environment..."
	@command -v docker >/dev/null 2>&1 || { echo "Docker not found"; exit 1; }
	@command -v kubectl >/dev/null 2>&1 || { echo "kubectl not found"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "Node.js not found"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "npm not found"; exit 1; }
	@echo "Environment check passed!"

# Default target
.DEFAULT_GOAL := help