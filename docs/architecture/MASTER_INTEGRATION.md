# Master Integration

## Product boundary

Release 3 removes Interview Lab from product navigation, routes, client contracts, prompts, and runtime services. `interviewStatus` remains on an opportunity/application only as a hiring-pipeline status. Dormant historical database tables are not a product capability.

## Opportunity model

An opportunity is the durable workspace joining a normalized Radar job, research, evidence, immutable resume versions, audit decisions, application package, submission attempts, receipts, and activity. Legacy `/applications` server routes remain compatibility surfaces while new UI navigation and redirects use `/opportunities`.

## Application Copilot

The Answer Vault stores reusable answers with explicit confidence and sensitivity. Sensitive intents require per-opportunity approval and unsupported fields remain unresolved. Application packages are immutable snapshots. Prepare Only never submits; Autofill and Review stops for user review. Authorized submission is disabled unless `COPILOT_AUTHORIZED_SUBMISSION=true`, and a receipt cannot become `CONFIRMED` without a confirmation id plus verification evidence.

## Browser extension

The MV3 extension detects only user-opened Greenhouse, Lever, and Ashby pages, saves a job after user activation, and opens the CandidArc review. It does not collect cookies or passwords, bypass CAPTCHA, scrape LinkedIn, or silently submit forms.

## Deployment and service boundaries

Next.js currently owns web rendering and API routes in one deployment. General workflow, ATS ingestion, and document processing workers are separate Kubernetes deployments and independent scaling boundaries. Postgres is the system of record; Redis-backed queues coordinate asynchronous work. A future API split should preserve these contracts rather than share process memory. Secrets come from external secret references and are never committed.
