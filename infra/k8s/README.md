# Kubernetes deployment

Apply the base with `kubectl apply -k infra/k8s`. Next.js serves both the web UI and `/api` routes, so the base intentionally uses one web deployment and service. Split API processes only after route workloads require independent scaling.

Replace image tags, ingress host/TLS, resources, and replica values per environment. **Never commit secrets.** Create `candidarc-runtime` through External Secrets, Sealed Secrets, or your cloud secret manager; it should reference database, Redis, session, and provider credentials. The worker variants are explicit scaling boundaries. Docker Compose remains the local-development path.
