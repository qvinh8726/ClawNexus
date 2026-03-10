# ClawAI Gateway

A unified API gateway for AI models with multi-provider routing, smart model selection, cost tracking, and a web dashboard.

## Features

- **Unified API**: Single OpenAI-compatible endpoint (`/v1/chat/completions`) for all providers
- **Multi-Provider Support**: OpenAI, Anthropic, Google Gemini, and local OpenAI-compatible models
- **Smart Routing**: Model aliases (smart, cheap, fast, code, best) with configurable routing rules
- **API Key Management**: Secure encrypted storage, automatic rotation, rate limit detection
- **Cost Tracking**: Per-request cost calculation and usage analytics
- **Request Logging**: Full request/response logging with search and filtering
- **Fallback System**: Automatic failover to backup providers on errors
- **Web Dashboard**: Modern UI for managing providers, routing, and viewing usage

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ClawAI Gateway                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │   Web UI    │    │   REST API  │    │  OpenAI API │    │
│  │  (Next.js)  │    │  (NestJS)   │    │ Compatible  │    │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│         │                  │                  │            │
│         └──────────────────┼──────────────────┘            │
│                            │                               │
│  ┌─────────────────────────┴─────────────────────────────┐ │
│  │              Routing Engine                           │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐ │ │
│  │  │ Router  │ │Key Mgr  │ │Model    │ │  Strategies │ │ │
│  │  │         │ │         │ │Resolver │ │             │ │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                               │
│  ┌─────────────────────────┴─────────────────────────────┐ │
│  │                   Providers                           │ │
│  │  ┌────────┐ ┌──────────┐ ┌────────┐ ┌─────────────┐  │ │
│  │  │ OpenAI │ │Anthropic │ │ Gemini │ │ Local/Other │  │ │
│  │  └────────┘ └──────────┘ └────────┘ └─────────────┘  │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- npm 9+

### Development Setup

1. **Clone and install dependencies**

```bash
git clone https://github.com/yourusername/clawai-gateway.git
cd clawai-gateway
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Set up database**

```bash
# Start PostgreSQL and Redis (or use Docker)
docker-compose up -d postgres redis

# Run migrations
npm run db:migrate

# Seed initial data
npm run db:seed
```

4. **Start development servers**

```bash
# Start all services
npm run dev

# Or start individually
npm run dev --workspace=@clawai/api   # API on port 3001
npm run dev --workspace=@clawai/web   # Web on port 3000
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

## API Usage

### Authentication

Include your API key in requests:

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "smart",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Model Aliases

| Alias | Maps To | Use Case |
|-------|---------|----------|
| `smart` | GPT-4o | General purpose, balanced |
| `cheap` | Gemini Flash | Budget-friendly tasks |
| `fast` | Gemini 2.0 Flash | Low latency required |
| `code` | Claude 3.5 Sonnet | Programming tasks |
| `best` | Claude 3 Opus | Highest quality |
| `long_context` | Gemini 1.5 Pro | Large documents |

### Streaming

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "smart",
    "messages": [{"role": "user", "content": "Write a poem"}],
    "stream": true
  }'
```

## Project Structure

```
clawai-gateway/
├── apps/
│   ├── api/                 # NestJS backend
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/    # JWT + API key auth
│   │       │   ├── gateway/ # OpenAI-compatible endpoints
│   │       │   ├── providers/
│   │       │   ├── routing/
│   │       │   ├── usage/
│   │       │   └── health/
│   │       └── main.ts
│   └── web/                 # Next.js dashboard
│       └── src/
│           ├── app/         # App router pages
│           ├── components/  # React components
│           └── lib/         # Utilities
├── packages/
│   ├── shared-types/        # TypeScript types
│   ├── database/            # Prisma + repositories
│   ├── providers/           # AI provider implementations
│   └── routing-engine/      # Request routing logic
├── docker-compose.yml
└── turbo.json
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `ENCRYPTION_KEY` | 32-byte key for API key encryption | - |
| `PORT` | API server port | 3001 |
| `RATE_LIMIT_MAX` | Max requests per window | 100 |
| `RATE_LIMIT_TTL` | Rate limit window (ms) | 60000 |

### Adding Providers

1. Navigate to Dashboard → Providers
2. Click "Add Provider"
3. Select provider type (OpenAI, Anthropic, etc.)
4. Add one or more API keys
5. Configure routing rules if needed

## Routing Strategies

- **Priority**: Use provider with highest priority
- **Round Robin**: Rotate through providers
- **Least Latency**: Choose fastest provider
- **Least Cost**: Choose cheapest provider
- **Weighted**: Random based on weights
- **Random**: Pure random selection

## License

MIT
