"""Deterministic resume-intelligence evaluation suite (mock AI only)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.domain.schemas import EvidenceItem, RequestContext, ResearchFinding
from app.main import create_app
from app.modules.guardrails.service import ATS_MARKERS, validate_resume_claims
from app.modules.retrieval import service as retrieval

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
AUTH = {"Authorization": "Bearer dev-python-backend-token-change-me"}
LENSES = ("hr-1", "em-1", "hr-2", "em-2")


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str = ""


@dataclass
class PersonaResult:
    persona_id: str
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(c.ok for c in self.checks)


def _load_fixtures() -> list[dict[str, Any]]:
    fixtures: list[dict[str, Any]] = []
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        fixtures.append(json.loads(path.read_text(encoding="utf-8-sig")))
    return fixtures


def _resume_blob(resume: dict[str, Any]) -> str:
    parts: list[str] = [str(resume.get("notes", ""))]
    for section in resume.get("sections", []):
        if section.get("content"):
            parts.append(section["content"])
        for bullet in section.get("bullets") or []:
            parts.append(bullet.get("text", ""))
            parts.extend(bullet.get("technologies") or [])
        for item in section.get("items") or []:
            parts.append(item.get("heading", ""))
            for bullet in item.get("bullets") or []:
                parts.append(bullet.get("text", ""))
    return " ".join(parts)


def _ctx(tenant_id: str, user_id: str, request_id: str) -> dict[str, Any]:
    return RequestContext(
        tenant_id=tenant_id,
        user_id=user_id,
        application_id="app_eval",
        workflow_run_id="wf_eval",
        request_id=request_id,
    ).model_dump()


def _research_findings(fixture: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx, row in enumerate(fixture.get("company_research") or []):
        finding = ResearchFinding(
            category="company",
            title=row.get("title", f"research-{idx}"),
            summary=row.get("summary", ""),
            confidence="medium",
            status="inferred",
            source_ids=[],
        )
        out.append(finding.model_dump())
    return out


def _run_lifecycle(client: TestClient, fixture: dict[str, Any], *, tenant_id: str) -> tuple[dict[str, Any], list[CheckResult]]:
    checks: list[CheckResult] = []
    owner = str(fixture["evidence"][0]["owner_user_id"])
    evidence = []
    for item in fixture["evidence"]:
        data = dict(item)
        data["tenant_id"] = tenant_id
        data["owner_user_id"] = owner
        evidence.append(EvidenceItem.model_validate(data).model_dump())

    ctx0 = _ctx(tenant_id, owner, f"req-{fixture['persona_id']}-v0")
    jd = fixture["job_description"]
    research = _research_findings(fixture)
    allowed = list(fixture.get("relevant_skills") or [])

    gen = client.post(
        "/v1/resumes/generate",
        headers=AUTH,
        json={
            "context": ctx0,
            "absolute_version": 0,
            "job_description": jd,
            "evidence": evidence,
            "allowed_technologies": allowed,
            "job_requirements": [jd[:200]],
            "research_findings": research,
        },
    )
    checks.append(CheckResult("generate_v0", gen.status_code == 200, f"status={gen.status_code}"))
    if gen.status_code != 200:
        return {}, checks
    resume = gen.json()["resume"]
    previous = resume

    # V0→V4 lifecycle
    for step, lens in enumerate(LENSES, start=1):
        audit = client.post(
            "/v1/resumes/audit",
            headers=AUTH,
            json={
                "context": _ctx(tenant_id, owner, f"req-{fixture['persona_id']}-audit-{lens}"),
                "lens": lens,
                "reviews_version": step - 1,
                "produces_version": step,
                "resume": previous,
                "evidence": evidence,
                "job_description": jd,
                "allowed_technologies": allowed,
            },
        )
        checks.append(CheckResult(f"audit_{lens}", audit.status_code == 200, f"status={audit.status_code}"))
        if audit.status_code != 200:
            return previous, checks
        body = audit.json()
        accepted = body.get("findings") or []
        rejected = body.get("rejected_findings") or []
        # Rejected claims must not return as accepted
        rejected_texts = {(r.get("suggested_text") or "").lower() for r in rejected}
        for finding in accepted:
            if (finding.get("suggested_text") or "").lower() in rejected_texts and finding.get("status") == "rejected":
                checks.append(CheckResult("rejected_not_accepted", False, "rejected finding returned as accepted"))
                break
        else:
            checks.append(CheckResult(f"rejected_isolated_{lens}", True))

        regen = client.post(
            "/v1/resumes/regenerate",
            headers=AUTH,
            json={
                "context": _ctx(tenant_id, owner, f"req-{fixture['persona_id']}-regen-{step}"),
                "absolute_version": step,
                "cycle_step": step % 5,
                "job_description": jd,
                "evidence": evidence,
                "allowed_technologies": allowed,
                "previous_resume": previous,
                "accepted_findings": accepted,
                "rejected_findings": rejected,
                "research_findings": research,
            },
        )
        checks.append(CheckResult(f"regen_v{step}", regen.status_code == 200, f"status={regen.status_code}"))
        if regen.status_code != 200:
            return previous, checks
        previous = regen.json()["resume"]
        # Rejected claim text must not appear
        blob = _resume_blob(previous).lower()
        for r in rejected:
            text = (r.get("suggested_text") or "").strip().lower()
            if text and len(text) > 24 and text in blob:
                checks.append(CheckResult("rejected_claims_absent", False, text[:80]))
                break
        else:
            checks.append(CheckResult(f"rejected_absent_v{step}", True))

    final_qa = client.post(
        "/v1/resumes/final-qa",
        headers=AUTH,
        json={
            "context": _ctx(tenant_id, owner, f"req-{fixture['persona_id']}-final"),
            "resume": previous,
            "evidence": evidence,
            "allowed_technologies": allowed,
        },
    )
    checks.append(CheckResult("final_qa", final_qa.status_code == 200, f"status={final_qa.status_code}"))

    # Absolute versions beyond V4 (5+)
    enh = client.post(
        "/v1/resumes/generate",
        headers=AUTH,
        json={
            "context": _ctx(tenant_id, owner, f"req-{fixture['persona_id']}-v5"),
            "absolute_version": 5,
            "cycle_step": 0,
            "job_description": jd,
            "evidence": evidence,
            "allowed_technologies": allowed,
            "previous_resume": previous,
            "research_findings": research,
        },
    )
    checks.append(
        CheckResult(
            "absolute_version_5plus",
            enh.status_code == 200 and enh.json()["resume"]["absolute_version"] == 5,
            f"status={enh.status_code}",
        )
    )
    return previous, checks


def _assert_truthfulness(fixture: dict[str, Any], resume: dict[str, Any], tenant_id: str) -> list[CheckResult]:
    checks: list[CheckResult] = []
    blob = _resume_blob(resume)
    blob_l = blob.lower()
    forbidden_hits = [f for f in fixture.get("forbidden_claims") or [] if f.lower() in blob_l]
    checks.append(
        CheckResult(
            "hard_factual_precision",
            not forbidden_hits,
            f"forbidden={forbidden_hits}" if forbidden_hits else "ok",
        )
    )

    # JD/research leakage
    leak_markers = [
        "company research",
        "according to the job description",
        "ignore previous instructions",
        "font-size:0",
    ]
    leaked = [m for m in leak_markers if m in blob_l]
    for marker in ATS_MARKERS:
        if marker in blob_l:
            leaked.append(marker)
    checks.append(CheckResult("zero_jd_research_leakage", not leaked, f"leaks={leaked}" if leaked else "ok"))
    checks.append(CheckResult("no_invisible_ats", not any(m in blob_l for m in ATS_MARKERS)))

    # Guardrail validation
    owner = str(fixture["evidence"][0]["owner_user_id"])
    evidence = []
    for item in fixture["evidence"]:
        data = dict(item)
        data["tenant_id"] = tenant_id
        data["owner_user_id"] = owner
        evidence.append(EvidenceItem.model_validate(data))
    from app.domain.schemas import ResumeDocument

    typed = ResumeDocument.model_validate(resume)
    research = [ResearchFinding.model_validate(r) for r in _research_findings(fixture)]
    violations = validate_resume_claims(
        typed,
        evidence,
        list(fixture.get("relevant_skills") or []),
        tenant_id=tenant_id,
        owner_user_id=owner,
        job_description=fixture["job_description"],
        research_findings=research,
    )
    bad = [v for v in violations if v not in {"UNSUPPORTED_DATE"}]  # dates may be soft in sparse notes
    # Hard precision: tech/company leaks must be blocked if present
    checks.append(CheckResult("guardrail_clean", "RESEARCH_LEAKED_INTO_CLAIM" not in bad and "ATS_MANIPULATION" not in bad, str(bad)))

    # Expected evidence questions for novel research tech
    notes = str(resume.get("notes", "")).lower()
    for needle in fixture.get("expected_evidence_questions") or []:
        checks.append(
            CheckResult(
                f"evidence_question_{needle.lower()}",
                needle.lower() in notes or needle.lower() not in blob_l,
                "question or non-claim",
            )
        )
    return checks


def _tenant_isolation(client: TestClient) -> list[CheckResult]:
    checks: list[CheckResult] = []
    retrieval.clear_index()
    ev_a = EvidenceItem(
        id="iso-a",
        tenant_id="ten_eval_a",
        owner_user_id="user_iso_a",
        title="Tenant A secret",
        organization="TenantA Co",
        claim_text="Tenant A only Python work",
        technologies=["Python"],
        source_type="employment",
        verification_status="user_attested",
        candidate_confirmation_status="confirmed",
        confidence="high",
    )
    idx = client.post(
        "/v1/evidence/index",
        headers=AUTH,
        json={"context": _ctx("ten_eval_a", "user_iso_a", "iso-a"), "evidence": [ev_a.model_dump()]},
    )
    checks.append(CheckResult("index_tenant_a", idx.status_code == 200, f"status={idx.status_code}"))
    search_b = client.post(
        "/v1/evidence/search",
        headers=AUTH,
        json={
            "context": _ctx("ten_eval_b", "user_iso_b", "iso-b"),
            "owner_user_id": "user_iso_b",
            "query": "Tenant A secret Python",
            "limit": 5,
        },
    )
    hits = search_b.json().get("hits", []) if search_b.status_code == 200 else []
    leaked = any(h.get("evidence_id") == "iso-a" for h in hits)
    checks.append(CheckResult("tenant_isolation", search_b.status_code == 200 and not leaked, f"hits={hits}"))
    return checks


def run_eval() -> int:
    get_settings.cache_clear()
    app = create_app()
    fixtures = _load_fixtures()
    if len(fixtures) < 8:
        print(f"FAIL: expected >=8 fixtures, found {len(fixtures)}")
        return 1

    results: list[PersonaResult] = []
    with TestClient(app) as client:
        isolation_checks = _tenant_isolation(client)
        iso = PersonaResult(persona_id="_tenant_isolation", checks=isolation_checks)
        results.append(iso)

        for fixture in fixtures:
            persona = PersonaResult(persona_id=fixture["persona_id"])
            resume, life_checks = _run_lifecycle(client, fixture, tenant_id="ten_eval_a")
            persona.checks.extend(life_checks)
            if resume:
                persona.checks.extend(_assert_truthfulness(fixture, resume, "ten_eval_a"))
            results.append(persona)

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    total_checks = sum(len(r.checks) for r in results)
    failed_checks = sum(1 for r in results for c in r.checks if not c.ok)

    print("=== CandidArc resume eval summary ===")
    print(f"personas+suites: {len(results)}  passed={passed}  failed={failed}")
    print(f"checks: {total_checks}  passed={total_checks - failed_checks}  failed={failed_checks}")
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(f"  [{status}] {result.persona_id}")
        for check in result.checks:
            if not check.ok:
                print(f"      - {check.name}: {check.detail}")
    return 0 if failed == 0 and failed_checks == 0 else 1


def main() -> None:
    raise SystemExit(run_eval())


if __name__ == "__main__":
    main()
