# Docker Service Updater API

A minimal REST API to automate image pulls and redeployments for **Docker Swarm** services and **Docker Compose** containers.

---

## ✨ Features

- **Docker Swarm**: Trigger zero-downtime rolling updates.
- **Docker Compose**: Automatically recreate and restart containers while preserving environment variables, commands, and host configs.

---

## 🚀 Quick Start

### 1. Run with Docker Compose

Mount the host Docker socket (`/var/run/docker.sock`) so the API can manage containers:

```yaml
version: '3.8'

services:
  updater-api:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
```

---

## 📡 Endpoints

### 1. Update Swarm Service
**`POST /swarm/services/:service`**

```json
// Body
{
  "image": "my-registry.com/app:v2.0"
}
```

### 2. Update Compose Service
**`POST /compose/services/:service`**

```json
// Body
{
  "image": "my-registry.com/app:v2.0"
}
```

---

## 🔒 Security

> **Warning:** Access to `/var/run/docker.sock` grants host-level root permissions. Always place this API behind a reverse proxy with authentication or restrict access to a private network.
