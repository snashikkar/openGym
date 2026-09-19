---
name: bun-server-manager
description: >-
  Manage local background development and API servers for openGym using Bun MCP tools
  (start-bun-server, list-servers, get-server-logs, stop-server). Use when launching the
  frontend dev server, starting the API server, inspecting server logs, checking server health,
  or stopping background servers.
---

# Bun Server Manager Skill for openGym

Use this skill to control background servers for openGym using the Bun MCP server without tying up interactive CLI sessions or blocking terminal execution.

## openGym Server Architecture

1. **Frontend Dev Server** (`frontend/scripts/dev.js`):
   - Native `Bun.serve` server running on port `5173` (or `PORT`).
   - Serves SPA routes (`/*`), static assets from `frontend/public/`.
   - Reverse proxies:
     - `/api/*` -> API target (default `http://127.0.0.1:3000`)
     - `/img/*` and `/gif/*` -> Media server (default `http://127.0.0.1:8888`)

2. **API Server** (`api/server.js`):
   - Native HTTP server on port `3000` (or `PORT`).
   - Handles WebAuthn passkey registration/login, sessions, push notifications, user state data.

---

## Standard Server Workflows

### 1. Start Frontend Dev Server in Background

Call `call_mcp_tool` (`ServerName: "bun"`, `ToolName: "start-bun-server"`):
```json
{
  "serverName": "opengym-frontend-dev",
  "scriptPath": "scripts/dev.js",
  "cwd": "frontend",
  "optimizations": {
    "hot": true,
    "watch": true
  }
}
```

### 2. Start API Server in Background

Call `call_mcp_tool` (`ServerName: "bun"`, `ToolName: "start-bun-server"`):
```json
{
  "serverName": "opengym-api",
  "scriptPath": "server.js",
  "cwd": "api",
  "optimizations": {
    "watch": true
  }
}
```

### 3. Check Running Servers

To list all running servers and obtain their server IDs, ports, and status:
Call `call_mcp_tool` (`ServerName: "bun"`, `ToolName: "list-servers"`):
```json
{}
```

### 4. Inspect Server Logs

To tail logs for diagnostics without attaching a console:
Call `call_mcp_tool` (`ServerName: "bun"`, `ToolName: "get-server-logs"`):
```json
{
  "serverId": "<server-id-from-list-servers>",
  "lines": 50,
  "stdout": true,
  "stderr": true
}
```

Filter logs for specific errors or keywords:
```json
{
  "serverId": "<server-id-from-list-servers>",
  "filter": "error",
  "lines": 100
}
```

### 5. Stop a Running Server

When shutting down or restarting a service:
Call `call_mcp_tool` (`ServerName: "bun"`, `ToolName: "stop-server"`):
```json
{
  "serverId": "<server-id-from-list-servers>"
}
```

---

## Health Verification Checklist

1. **Start both servers**:
   - Start `opengym-api` on port 3000.
   - Start `opengym-frontend-dev` on port 5173.
2. **Verify list**: Call `list-servers` to confirm both are active.
3. **Check API Health**: Verify with `get-server-logs` or fetch `/api/health`.
4. **Clean up**: When finished with a development or debugging task, stop the background servers using `stop-server` to free ports 5173 and 3000.
