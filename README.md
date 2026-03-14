# CKS Frontend

Next.js-based web interface for the Certified Kubernetes Security Specialist (CKS) training platform. Provides browser-based terminal access via WebSocket, real-time task validation, and admin dashboard for cluster pool management.

## Architecture Overview

Production-ready React application implementing sophisticated state management with SWR caching, WebSocket-based terminal emulation using xterm.js, and real-time session monitoring. Built with Next.js 14 standalone output for containerized deployment with 70% image size reduction compared to standard builds.

### Core Components

**Terminal System** (`src/components/Terminal.js`, `src/components/TerminalContainer.js`)
- iframe-based terminal rendering via cks-terminal-mgmt (ttyd)
- Multi-terminal tabs: "+" button spawns additional terminals per target type (Control Plane / Worker Node)
- Closable tabs with automatic activation of adjacent tab
- All terminal sessions persist when switching between targets (iframes stay mounted in DOM)
- Lazy terminal creation on tab switch

**State Management Architecture**
- SWR (Stale-While-Revalidate) with 2-minute polling, focus revalidation, and 10-second deduplication
- SessionContext providing global CRUD operations with optimistic updates via `mutate()`
- ToastContext for notification system with auto-dismiss and stacking
- Custom hooks: useSession, useTerminal, useTaskValidation, useScenario, useError

**Admin Dashboard** (`src/pages/admin.js`)
- Cluster pool status monitoring with real-time updates (30-second interval)
- Session management with task progress visualization
- Bootstrap pool, create snapshots, and release all clusters operations
- Delete sessions with confirmation modal

**API Client** (`src/lib/api.js`)
- Centralized fetch wrapper with timeout support (120s default, configurable per endpoint)
- Exponential backoff retry for network errors (2 retries: 1s, 2s delays)
- AbortController integration for timeout cancellation
- Structured error handling with status code mapping to user-friendly messages

**Error Handling System** (`src/utils/errorHandler.js`, `src/hooks/useError.js`)
- Centralized error processor with HTTP status code mapping
- Context-aware error tracking for debugging
- Toast notification integration
- Error boundary for React error catching

## DevOps Practices

### Multi-Stage Docker Build

**Dependencies Stage** (node:18-alpine)
```dockerfile
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
```
- Installs production dependencies only
- Leverages Docker layer caching

**Builder Stage**
```dockerfile
RUN npm ci  # All dependencies including dev
COPY . .
RUN npm run build  # Creates standalone output
```
- Next.js build with output file tracing
- Generates minimal server bundle

**Runtime Stage**
```dockerfile
FROM node:18-alpine
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs build/standalone ./
COPY --from=builder --chown=nextjs:nodejs build/static ./build/static
USER nextjs
CMD ["node", "server.js"]
```
- Non-root execution (UID/GID 1001)
- Standalone output: ~80MB vs ~200MB standard build
- Self-contained server with traced dependencies

**Build Optimizations**:
- Multi-stage build reduces final image by 70%
- Static asset optimization via Next.js automatic image optimization
- Code splitting at route level
- Tree shaking eliminates unused code

### Next.js Standalone Output

**Configuration** (`src/next.config.js`):
```javascript
{
  output: 'standalone',  // Enables output file tracing
  distDir: 'build',     // Custom build directory
  reactStrictMode: true  // Enables strict mode checks
}
```

**Benefits**:
- Automatic dependency tracing identifies required packages
- Generates minimal `server.js` with only runtime dependencies
- Reduces `node_modules` from 300MB+ to ~50MB
- Faster container startup and deployment

### GitOps CI/CD Pipeline

**Automated Pipeline** (`.github/workflows/pipeline.yml`)

Job Flow:
1. **docker-build-and-push**: Multi-stage build, push to `registry.homelabz.eu/library/cks-frontend:latest` and commit SHA
2. **dev-deploy**: Kustomize overlay application to development cluster
3. **versioning**: Semantic versioning from commit messages, GitHub release creation

**Manual Pipeline** (`.github/workflows/manual-pipeline.yml`)
- Workflow dispatch for manual deployments
- Environment selection: dev/stg/prod
- Optional Cypress test execution (prepared but commented out)

**Deployment Strategy**:
- Kustomize base + overlays pattern for environment-specific configuration
- ConfigMap for runtime environment variables (API_BASE_URL, LOG_LEVEL)
- Single replica for dev/stg, multiple replicas for prod
- Rolling updates with readiness probe gates

### Kustomize Deployment Architecture

**Base Layer** (`kustomize/base/`)

**Deployment**:
```yaml
containers:
  - name: cks-frontend
    image: registry.homelabz.eu/library/cks-frontend:latest
    ports:
      - containerPort: 3000
    envFrom:
      - configMapRef:
          name: cks-frontend-config
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 200m
        memory: 256Mi
    readinessProbe:
      httpGet:
        path: /
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 10
    livenessProbe:
      httpGet:
        path: /
        port: 3000
      initialDelaySeconds: 15
      periodSeconds: 20
```

**Service**:
- Type: ClusterIP
- Port: 3000

**VirtualService** (Istio):
```yaml
spec:
  hosts:
    - dev.cks.homelabz.eu  # Overridden per environment
  gateways:
    - istio-system/default-gateway
  http:
    - route:
        - destination:
            host: cks-frontend.default.svc.cluster.local
            port:
              number: 3000
```
- TLS termination via cert-manager annotation
- Automatic HTTPS certificate management

**Overlays** (dev/stg/prod):
- Environment-specific ConfigMap values
- Replica count adjustments
- Resource limit modifications
- API endpoint URLs

### State Management Patterns

**SWR Configuration**:
```javascript
useSWR(key, fetcher, {
  refreshInterval: 120000,      // Poll every 2 minutes
  revalidateOnFocus: true,      // Refresh on window focus
  dedupingInterval: 10000,      // Dedupe within 10 seconds
  onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
    if (retryCount >= 3) return;  // Max 3 retries
    setTimeout(() => revalidate({ retryCount }), 5000 * Math.pow(2, retryCount));
  }
})
```

**Benefits**:
- Automatic caching reduces redundant API calls
- Stale-while-revalidate pattern: Show cached data instantly, fetch in background
- Optimistic updates via `mutate()` for instant UI feedback
- Focus revalidation ensures fresh data when user returns to tab

**Data Flow**:
1. Component calls `useSession(sessionId)`
2. SWR checks cache, returns stale data if exists
3. Background fetch initiated
4. On success: cache updated, components re-render
5. On error: retry with exponential backoff, show error state

### Terminal Architecture

Terminal access is delegated to [cks-terminal-mgmt](https://github.com/homelabz-eu/cks-terminal-mgmt), a dedicated microservice running on the toolz cluster.

**Flow**:
```
Browser → iframe → cks-terminal-mgmt → ttyd → SSH → KubeVirt VM
```

1. Frontend calls `POST /api/v1/sessions/:id/terminals` with target (`control-plane` or `worker-node`)
2. Backend resolves VM name to IP via KubeVirt API, returns terminal-mgmt URL
3. Frontend renders URL in an iframe
4. ttyd handles xterm.js rendering, WebSocket, and terminal resize natively

**Multi-Terminal Tabs**:
- Two-level navigation: target type (Control Plane / Worker Node) and sub-tabs (CP 1, CP 2, etc.)
- "+" button creates a new terminal session for the active target type
- Closable tabs (X button, shown when >1 tab exists)
- Sequential tab naming via counter ref (CP 1, CP 2, WK 1, WK 2...)
- All iframes remain mounted with `pointer-events-none` on inactive tabs to preserve sessions

### Error Handling Architecture

**Centralized Error Processor**:
```javascript
ErrorHandler.processApiError(error, context) {
  // 1. Parse error (network, timeout, HTTP)
  // 2. Map status code to user message
  // 3. Log with context
  // 4. Return structured error
  return {
    message: "User-friendly message",
    statusCode: 404,
    originalError: error,
    context: { endpoint, sessionId }
  };
}
```

**Status Code Mapping**:
- 401: "Authentication required. Please log in again."
- 403: "You do not have permission to perform this action."
- 404: "The requested resource was not found."
- 408: "Request timed out. The server is taking too long to respond."
- 429: "Too many requests. Please slow down."
- 500+: "We're experiencing technical difficulties. Please try again later."

**Integration Points**:
- API client: All fetch calls wrapped
- React components: useError hook
- Error boundaries: Catch React errors
- Toast notifications: User feedback

## Technical Innovations

### Optimistic UI Updates

**Session Creation**:
```javascript
const createSession = async (scenarioId) => {
  // 1. Optimistic update: Add to cache immediately
  mutate('/api/v1/sessions',
    async (current) => [...current, { id: tempId, status: 'creating' }],
    false  // Don't revalidate yet
  );

  // 2. Make API call
  const session = await api.sessions.create(scenarioId);

  // 3. Replace temp with real data
  mutate('/api/v1/sessions');

  // 4. Navigate to lab page
  router.push(`/lab/${session.id}`);
};
```

**Benefits**:
- Instant UI feedback
- Perceived performance improvement
- Rollback on error
- Seamless navigation

### Environment Variable Injection

**Problem**: Next.js bundles environment variables at build time, but API URL varies per deployment

**Solution**:
```javascript
// _app.js server-side
export async function getInitialProps() {
  return {
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8080/api/v1'
  };
}

// Inject into client
<script dangerouslySetInnerHTML={{
  __html: `window.__API_BASE_URL__ = ${JSON.stringify(apiBaseUrl)};`
}} />

// API client runtime
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.__API_BASE_URL__;
  }
  return 'http://localhost:8080/api/v1';
};
```

**Benefits**:
- Single Docker image for all environments
- Runtime configuration via ConfigMap
- No rebuild required for environment changes

## Admin Panel Features

### Cluster Pool Monitoring

**Display Information**:
- Total clusters: 3
- Available count (green indicator)
- Locked count (yellow indicator)
- Cluster table with columns:
  - Cluster ID
  - Status (available/locked/resetting/error) with color coding
  - Assigned Session ID
  - Lock Duration (formatted as "1h 23m" or "45m")
  - VM Names (control-plane + worker)
  - Last Reset timestamp
  - Last Health Check timestamp

**Operations**:
- **Release All Clusters**: Bulk operation to force-release all locked clusters
  - Confirmation modal with warning
  - Disabled when no clusters locked
  - Loading spinner during operation
  - Success toast on completion

**Auto-Refresh**:
- Fetches cluster status every 30 seconds
- Manual refresh button in page header
- Loading indicator during fetch
- Error toast on fetch failure

### Session Management

**Session Table Columns**:
- Session ID (truncated with tooltip)
- Status badge (running/provisioning/failed with colors)
- Scenario ID
- Assigned Cluster (green badge)
- Duration since start ("2h 15m ago")
- Time Remaining (red if expired, countdown format)
- Active Terminals count
- Task Progress (X/Y completed with inline progress bar)
- Actions (Delete button)

**Delete Session Operation**:
```javascript
const handleDelete = async (sessionId) => {
  // 1. Show confirmation modal
  const confirmed = await showConfirmation({
    title: "Delete Session",
    message: "This will terminate the session and release resources.",
    danger: true
  });

  // 2. Call API
  await api.admin.deleteSession(sessionId);

  // 3. Refresh both clusters and sessions
  await Promise.all([
    fetchClusters(),
    fetchSessions()
  ]);

  // 4. Show success toast
  toast.success("Session deleted successfully");
};
```

**Task Progress Visualization**:
- Inline progress bar (green fill based on percentage)
- Completion count (e.g., "3/5")
- Percentage calculation
- Visual indicator for 0%, partial, and 100% completion

### Bootstrap Operations

**POST /api/v1/admin/bootstrap-pool**:
- Creates 3 baseline clusters from scratch
- Blocks UI with loading state
- Progress tracking (if implemented)
- Use case: Initial setup, disaster recovery

**POST /api/v1/admin/create-snapshots**:
- Creates VirtualMachineSnapshot for all cluster VMs
- Must run after bootstrap before first session
- Loading state with progress indication
- Success/error toast notifications

## Task Validation System

**Validation Flow**:
1. User clicks "Validate" button on task card
2. `useTaskValidation` hook calls `POST /api/v1/sessions/{id}/tasks/{taskId}/validate`
3. Backend executes validation rules (resource checks, commands, scripts)
4. Response includes:
   ```json
   {
     "success": true,
     "message": "All validation rules passed",
     "results": [
       {
         "ruleId": "namespace-exists",
         "ruleType": "resource_exists",
         "passed": true,
         "message": "Namespace test-pods found",
         "expected": "exists",
         "actual": "exists"
       }
     ],
     "timestamp": "2025-11-15T10:30:00Z"
   }
   ```
5. Frontend updates task status to "completed" or "failed"
6. Visual feedback: green checkmark or red X
7. Details expandable showing individual rule results

**Validation Result Caching**:
- Results stored in component state to prevent redundant checks
- Cleared on session refresh
- Displayed in validation history panel

**Progress Tracking**:
- Task list shows completion status per task
- Progress bar at scenario level (X/Y tasks completed)
- Percentage calculation
- Session context maintains global task state

## Technology Stack

**Core Framework**:
- Next.js 14 (React framework with SSR)
- React 18 (functional components with hooks)
- Node.js 18+ (runtime environment)

**UI & Styling**:
- Tailwind CSS 3.3 (utility-first CSS)
- Custom CSS (global styles, animations)
- Responsive design (mobile-first breakpoints)

**State Management**:
- SWR 2.0 (data fetching with caching)
- React Context (SessionContext, ToastContext)
- Custom hooks (5 specialized hooks)

**Terminal**:
- iframe-based rendering via [cks-terminal-mgmt](https://github.com/homelabz-eu/cks-terminal-mgmt) (ttyd)

**Content & Utilities**:
- react-markdown 8.0 (Markdown rendering)
- Custom error handler (centralized error processing)

**Build Tools**:
- PostCSS (CSS processing)
- Autoprefixer (browser compatibility)
- ESLint (code linting)

**Infrastructure**:
- Kubernetes (deployment orchestration)
- Kustomize (configuration management)
- Istio (service mesh, ingress)
- Cert-Manager (TLS certificates)

## Environment Configuration

Key configuration via ConfigMap:

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | `http://localhost:8080/api/v1` |
| `NEXT_TELEMETRY_DISABLED` | Disable Next.js telemetry | `1` |
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging verbosity | `DEBUG` |

**Environment-Specific Values**:
- **dev**: `https://dev.api.cks.homelabz.eu/api/v1`
- **stg**: `https://stg.api.cks.homelabz.eu/api/v1`
- **prod**: `https://api.cks.homelabz.eu/api/v1`

## Repository Structure

```
cks-frontend/
├── src/
│   ├── pages/
│   │   ├── index.js                # Home: Scenario browser
│   │   ├── admin.js                # Admin dashboard
│   │   ├── lab/[id].js             # Lab environment (dynamic route)
│   │   ├── _app.js                 # App wrapper with contexts
│   │   └── 404.js                  # Custom 404 page
│   ├── components/
│   │   ├── common/                 # Reusable UI (11 components)
│   │   ├── Terminal.js             # iframe terminal wrapper
│   │   ├── TerminalContainer.js    # Multi-terminal tabs
│   │   ├── TaskPanel.js            # Task list UI
│   │   ├── TaskValidation.js       # Validation display
│   │   ├── ScenarioCard.js         # Scenario display
│   │   ├── Admin*.js               # Admin dashboard components
│   │   └── Toast.js                # Notification system
│   ├── hooks/
│   │   ├── useSession.js           # Session management with SWR
│   │   ├── useTerminal.js          # Multi-terminal state management
│   │   ├── useTaskValidation.js    # Task validation logic
│   │   ├── useScenario.js          # Scenario data fetching
│   │   └── useError.js             # Error handling
│   ├── contexts/
│   │   ├── SessionContext.js       # Global session state
│   │   └── ToastContext.js         # Toast notifications
│   ├── lib/
│   │   └── api.js                  # API client with retry/timeout
│   ├── utils/
│   │   └── errorHandler.js         # Centralized error processing
│   ├── styles/
│   │   └── globals.css             # Global CSS + Tailwind
│   ├── public/                     # Static assets
│   ├── package.json                # Dependencies
│   ├── next.config.js              # Next.js configuration
│   └── tailwind.config.js          # Tailwind configuration
├── kustomize/
│   ├── base/                       # Base manifests
│   └── overlays/{dev,stg,prod}/    # Environment configs
├── .github/workflows/              # CI/CD pipelines
├── Dockerfile                      # Multi-stage build
├── Makefile                        # Build/deploy commands
└── README.md                       # This file
```

## Performance Characteristics

**Build Performance**:
- Docker image: ~80MB (standalone) vs ~200MB (standard)
- Build time: ~2 minutes (multi-stage)
- Deployment time: ~30 seconds (rolling update)

**Runtime Performance**:
- Time to Interactive: <2 seconds (SWR cached)
- Terminal connection: <2 seconds (ttyd spawn + SSH)
- Validation execution: 2-10 seconds (backend-dependent)
- SWR cache hit rate: ~80% (2-minute refresh)

**Resource Usage**:
- Container: ~100m CPU, ~128Mi memory (idle)
- Container: ~150m CPU, ~200Mi memory (active)
- Browser: ~50MB memory per tab

**Network**:
- Initial page load: ~300KB (gzipped)
- Terminal iframe: ~50KB (ttyd frontend)

## Security Implementation

**Container Security**:
- Non-root execution (UID 1001)
- Minimal base image (Alpine)
- Health checks for liveness/readiness
- Resource limits prevent DoS

**Network Security**:
- HTTPS via Istio + cert-manager
- Automatic certificate renewal
- Secure WebSocket (wss://)
- CORS enforcement (backend)

**Client-Side Security**:
- Input sanitization in error messages
- No secrets in client code
- XSS prevention via React escaping
- No eval() or dangerouslySetInnerHTML (except controlled env injection)

**API Security**:
- Timeout protection (120s max)
- Request cancellation via AbortController
- Retry limits prevent abuse

---

**Version**: 1.0.0
**License**: Proprietary
**Repository**: https://github.com/homelabz-eu/cks-frontend
