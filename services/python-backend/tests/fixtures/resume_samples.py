"""Deterministic résumé fixtures for parse/structure tests (non-copyrighted)."""

from __future__ import annotations

import base64
import io

PROFESSIONAL_EXPERIENCE_RESUME = """Jordan Blake
jordan.blake@example.com | (555) 010-2244 | Seattle, WA
linkedin.com/in/jordanblake | github.com/jordanblake

PROFESSIONAL EXPERIENCE

Platform Engineer | Harbor Systems | Seattle, WA
Jan 2021 - Present
- Built Kubernetes-based deployment pipelines for 12 services
- Reduced mean recovery time from 45 minutes to 8 minutes
- Mentored three engineers on observability practices

Software Engineer | Northwind Labs
Jun 2018 - Dec 2020
- Designed REST APIs in TypeScript and Node.js
- Migrated billing workflows to PostgreSQL with zero downtime

EDUCATION
B.S. Computer Science | Cascadia University | 2018

SKILLS
TypeScript, Node.js, Kubernetes, PostgreSQL, AWS, React

CERTIFICATIONS
AWS Solutions Architect Associate
"""

# De-identified layout twin of the UAT failure mode: pipe name|headline, wrapped
# unbulleted continuations, Degree|Field|Institution, Location ordering.
WRAPPED_BULLET_EMPLOYMENT_RESUME = """ALEX RIVERA | Platform Mechanic
555-010-3344 | alex.rivera.example@example.com
https://www.linkedin.com/in/alex-rivera-example/

PROFESSIONAL SUMMARY
- Senior platform engineer delivering secure insurance and banking applications.

SKILLS
- Core Engineering: Java, Python, Spring Boot, REST API
- Cloud Platforms: AWS (Lambda, S3, RDS)

PROFESSIONAL EXPERIENCE
Sr Java Full Stack Developer | Northbridge Mutual, Austin, TX, USA                                                             Jul 2025 - Present
- Engineered Java and Spring Boot microservices supporting property-insurance quoting, underwriting, policy
issuance, servicing, and renewal workflows used by member-service applications.
- Designed versioned REST and GraphQL APIs using OpenAPI specifications, standardized request validation,
pagination, error contracts, backward compatibility, and consumer-focused interface design.
- Developed React and TypeScript interfaces with Redux Toolkit, React Query, reusable components,
accessible form controls, routing, and consistent client-side state management.
- Built Python and FastAPI services with AWS Lambda workers to reconcile policy events, validate documents,
automate exception routing, and integrate supporting data sources.
- Implemented Kafka and Amazon SQS workflows using idempotent consumers, schema validation,
transactional outbox patterns, retries, dead-letter queues, and message correlation.
- Structured persistence layers using Spring Data JPA, Hibernate, Aurora PostgreSQL, DynamoDB, and Redis
while managing transactions, indexing, caching, and data-access boundaries.
- Deployed containerized services to AWS EKS using Docker, Kubernetes, Terraform, health probes,
autoscaling policies, externalized configuration, and controlled rollout strategies.
- Protected member information using Spring Security, OAuth 2.0, OIDC, JWT, IAM roles, Secrets Manager,
encryption, input sanitization, and comprehensive audit logging.
- Established automated testing with JUnit, Mockito, Testcontainers, Cypress, API contract tests, and
integration suites embedded within continuous-delivery pipelines.
- Instrumented synchronous and asynchronous workflows using CloudWatch, OpenTelemetry, structured
logging, distributed tracing, service dashboards, SLOs, and actionable production alerts.
- Tuned JVM memory, garbage collection, thread pools, connection pools, asynchronous execution, API
payloads, database queries, and caching behavior for predictable production performance.
- Led technical design discussions, code reviews, sprint planning, dependency coordination, production triage,
post-incident analysis, and mentoring across the engineering workstream.
Java Full Stack Developer | Lakeside Capital, Denver, CO, USA                                                      May 2023 - Jun 2025
- Developed Java and Spring Boot services supporting transaction processing, reconciliation, operational
controls, reference data, and internal financial-management workflows.
- Decomposed tightly coupled application functions into independently deployable microservices using Spring
Cloud, centralized configuration, service discovery, resilient communication, and clear domain boundaries.
- Built React and TypeScript dashboards with reusable components, hooks, validated forms, data tables,
filtering, routing, and predictable client-side state management.
- Created Python and FastAPI utilities for reference-data validation, transaction reconciliation, exception
analysis, scheduled processing, and operational reporting.
- Orchestrated Kafka-based processing using idempotency keys, schema governance, consumer groups, retry
policies, dead-letter topics, ordering controls, and transactional outbox patterns.
- Published REST and GraphQL APIs with OpenAPI documentation, standardized errors, pagination, request
validation, API versioning, and backward-compatible contracts for dependent systems.
- Secured financial applications through OAuth 2.0, JWT, mutual TLS, entitlement validation, encryption,
least-privilege authorization, data masking, and traceable audit events.
- Designed persistence and caching layers using PostgreSQL, Oracle, Spring Data JPA, Hibernate, Redis,
indexing strategies, query plans, connection pooling, and transactional boundaries.
- Applied Java concurrency utilities, CompletableFuture, asynchronous execution, batch processing,
controlled thread pools, and nonblocking integration patterns to resource-intensive workflows.
- Automated Maven and Gradle builds, GitLab and Jenkins pipelines, Docker packaging, Kubernetes
deployments, SonarQube quality gates, dependency analysis, and security scanning.
- Implemented JUnit, Mockito, Testcontainers, Cypress, integration tests, API tests, and consumer-driven
contract tests to validate application behavior across service boundaries.
- Supported production releases and incidents through monitoring, log analysis, distributed tracing, root-
cause analysis, remediation planning, technical documentation, and stakeholder communication.
Java Developer | Contoso Labs, Hyderabad, India                                                                               Jun 2019 - Dec 2022
- Delivered Java and Spring Boot services for client-facing order management, account administration,
customer-service, and enterprise workflow applications.
- Structured backend components using Spring MVC, dependency injection, reusable service layers, domain
models, exception handling, validation, and established object-oriented design patterns.
- Developed Angular and React interfaces using TypeScript, JavaScript, reusable components, reactive forms,
routing, API integration, responsive styling, and browser-based debugging.
- Created REST and SOAP integrations with documented contracts, standardized payloads, request validation,
authentication controls, reusable adapters, and consistent error handling.
- Integrated internal and third-party platforms using Kafka and asynchronous messaging with schema
validation, correlation identifiers, retry processing, and dead-letter handling.
- Modeled relational data using Spring Data JPA, Hibernate, PostgreSQL, and MySQL while implementing
transactional consistency, stored procedures, indexing, and optimized data access.
- Modernized legacy application modules into Dockerized microservices deployed through AWS EC2, ECS,
Lambda, S3, RDS, and environment-specific configuration.
- Developed automated unit, integration, API, and browser tests using JUnit, Mockito, Selenium, Postman,
and reusable test-data utilities.
- Implemented Maven, Jenkins, Git, SonarQube, Docker, logging, and monitoring workflows to support
repeatable builds, quality validation, deployments, and production troubleshooting.
- Collaborated with architects, product owners, QA engineers, DevOps teams, and business stakeholders
throughout requirement analysis, design, development, release, and production support.
EDUCATION
Master's | Information Systems Management | Cascadia Institute of Technology, Chicago, IL
Bachelor's | Computer Science | Lakeside University, Hyderabad, India
CERTIFICATIONS
- Oracle Certified Professional: Java SE 21 Developer
- AWS Certified Solutions Architect - Associate
"""

SAME_EMPLOYER_TWO_ROLES_RESUME = """Priya Nair
priya.nair@example.com

PROFESSIONAL EXPERIENCE
Senior Engineer | Contoso
Jan 2022 - Present
- Led platform reliability work

Engineer | Contoso
Jun 2019 - Dec 2021
- Built internal APIs

EDUCATION
B.S. Computer Science | Example State University | 2019

SKILLS
Java, Kubernetes
"""

NAME_UNICODE_RESUME = """José María O'Neill-García
jose.oneill@example.com | +34 612 345 678

PROFESSIONAL EXPERIENCE
Software Engineer | Iberia Systems, Madrid, Spain
Mar 2020 - Present
- Shipped customer portals

EDUCATION
Master's | Computer Engineering | Universidad Ejemplo, Madrid, Spain

SKILLS
TypeScript, React
"""

WORK_HISTORY_RESUME = PROFESSIONAL_EXPERIENCE_RESUME.replace(
    "PROFESSIONAL EXPERIENCE", "WORK HISTORY"
)

NO_EMPLOYMENT_RESUME = """Sam Rivera
sam.rivera@example.com

PROJECTS
Campus Course Planner
- Built a Next.js app for course planning used by 200 students
- Stack: TypeScript, PostgreSQL

EDUCATION
B.A. Information Systems | Lakeside College | 2024

SKILLS
TypeScript, React, SQL, Figma
"""


def text_to_simple_pdf(text: str) -> bytes:
    """Minimal multi-line text PDF suitable for pypdf extraction."""
    lines = [ln[:90] for ln in text.splitlines() if ln.strip()][:80]
    content_lines = ["BT /F1 10 Tf 50 750 Td 12 TL"]
    for i, line in enumerate(lines):
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        if i == 0:
            content_lines.append(f"({safe}) Tj")
        else:
            content_lines.append(f"T* ({safe}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines)
    objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
        f"4 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj",
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ]
    pdf = ["%PDF-1.4"]
    offsets = [0]
    for obj in objects:
        offsets.append(sum(len(x) + 1 for x in pdf))
        pdf.append(obj)
    xref_pos = sum(len(x) + 1 for x in pdf)
    pdf.append("xref")
    pdf.append(f"0 {len(objects) + 1}")
    pdf.append("0000000000 65535 f ")
    for off in offsets[1:]:
        pdf.append(f"{off:010d} 00000 n ")
    pdf.append(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>")
    pdf.append("startxref")
    pdf.append(str(xref_pos))
    pdf.append("%%EOF")
    return ("\n".join(pdf) + "\n").encode("latin-1", errors="replace")


def text_to_docx(text: str) -> bytes:
    from docx import Document

    document = Document()
    for line in text.splitlines():
        document.add_paragraph(line)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


def image_only_pdf() -> bytes:
    """PDF with a page but no text operators — triggers IMAGE_ONLY_PDF_OCR_REQUIRED."""
    stream = "q 200 0 0 200 100 400 cm /Im0 Do Q"
    pdf = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >> endobj
4 0 obj << /Length {len(stream)} >> stream
{stream}
endstream endobj
xref
0 5
0000000000 65535 f 
trailer << /Size 5 /Root 1 0 R >>
startxref
0
%%EOF
"""
    return pdf.encode("latin-1")


def empty_pdf() -> bytes:
    """Valid PDF with a blank page and no extractable text."""
    return image_only_pdf()


def encrypted_pdf(password: str = "secret") -> bytes:
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.encrypt(password)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def two_column_text_pdf() -> bytes:
    """Genuine two-column PDF: left and right text at different X with overlapping Y.

    Left column (x≈50) holds contact + employment; right column (x≈320) holds skills/education.
    Extractors that ignore position may interleave lines — structure tests assert associations.
    """
    left = [
        "Jordan Blake",
        "jordan.blake@example.com",
        "PROFESSIONAL EXPERIENCE",
        "Platform Engineer | Harbor Systems",
        "Jan 2021 - Present",
        "- Built Kubernetes pipelines",
        "Software Engineer | Northwind Labs",
        "Jun 2018 - Dec 2020",
        "- Designed REST APIs in TypeScript",
    ]
    right = [
        "SKILLS",
        "TypeScript Kubernetes AWS React",
        "EDUCATION",
        "B.S. Computer Science",
        "Cascadia University 2018",
        "CERTIFICATIONS",
        "AWS Solutions Architect Associate",
    ]

    def escape(line: str) -> str:
        return line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:48]

    ops: list[str] = []
    y = 750
    for line in left:
        ops.append(f"BT /F1 9 Tf 50 {y} Td ({escape(line)}) Tj ET")
        y -= 16
    y = 750
    for line in right:
        ops.append(f"BT /F1 9 Tf 320 {y} Td ({escape(line)}) Tj ET")
        y -= 16
    stream = "\n".join(ops)
    objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
        f"4 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj",
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ]
    pdf = ["%PDF-1.4"]
    offsets = [0]
    for obj in objects:
        offsets.append(sum(len(x) + 1 for x in pdf))
        pdf.append(obj)
    xref_pos = sum(len(x) + 1 for x in pdf)
    pdf.append("xref")
    pdf.append(f"0 {len(objects) + 1}")
    pdf.append("0000000000 65535 f ")
    for off in offsets[1:]:
        pdf.append(f"{off:010d} 00000 n ")
    pdf.append(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>")
    pdf.append("startxref")
    pdf.append(str(xref_pos))
    pdf.append("%%EOF")
    return ("\n".join(pdf) + "\n").encode("latin-1", errors="replace")


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")
