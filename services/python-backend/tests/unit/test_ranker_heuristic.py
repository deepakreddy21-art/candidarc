"""Labeled relevance tests for the heuristic hybrid ranker.

The ranker uses deterministic scoring (keyword overlap + pseudo-vector cosine),
NOT learned embeddings or ML models. This fixture evaluates precision@k style
metrics against a labeled relevance set.
"""

from __future__ import annotations

import pytest

from app.domain.schemas import EvidenceItem
from app.modules.retrieval.rankers import HybridKeywordVectorRanker, get_ranker


def _make_evidence(
    id: str,
    title: str,
    *,
    claim_text: str = "",
    technologies: list[str] | None = None,
    organization: str | None = None,
) -> EvidenceItem:
    return EvidenceItem(
        id=id,
        tenant_id="ten_test",
        owner_user_id="user_test",
        title=title,
        claim_text=claim_text,
        technologies=technologies or [],
        organization=organization,
        verification_status="user_attested",
        candidate_confirmation_status="confirmed",
        confidence="high",
    )


# Labeled relevance fixture: (query, evidence_pool, expected_relevant_ids)
LABELED_RELEVANCE_FIXTURES = [
    # Python backend query should rank Python evidence higher
    (
        "Python backend API development",
        [
            _make_evidence("ev1", "Backend Engineer", claim_text="Built RESTful APIs with Python and FastAPI", technologies=["Python", "FastAPI"]),
            _make_evidence("ev2", "Frontend Developer", claim_text="Created React components for dashboard", technologies=["React", "TypeScript"]),
            _make_evidence("ev3", "Data Analyst", claim_text="Analyzed sales data with Excel", technologies=["Excel"]),
            _make_evidence("ev4", "Python Developer", claim_text="Developed microservices using Python Django", technologies=["Python", "Django"]),
        ],
        ["ev1", "ev4"],  # Expected top-2 relevant
    ),
    # Machine learning query
    (
        "machine learning model training PyTorch",
        [
            _make_evidence("ml1", "ML Engineer", claim_text="Trained neural networks with PyTorch for image classification", technologies=["PyTorch", "Python"]),
            _make_evidence("ml2", "Web Developer", claim_text="Built websites using HTML and CSS", technologies=["HTML", "CSS"]),
            _make_evidence("ml3", "Data Scientist", claim_text="Built machine learning pipelines with scikit-learn", technologies=["Python", "scikit-learn"]),
        ],
        ["ml1", "ml3"],  # Expected top-2 relevant
    ),
    # Infrastructure / DevOps query
    (
        "Kubernetes Docker container orchestration",
        [
            _make_evidence("k1", "DevOps Engineer", claim_text="Deployed applications using Kubernetes and Docker", technologies=["Kubernetes", "Docker"]),
            _make_evidence("k2", "Frontend Engineer", claim_text="Built UI components", technologies=["React"]),
            _make_evidence("k3", "SRE", claim_text="Managed container infrastructure with Docker Compose", technologies=["Docker"]),
        ],
        ["k1", "k3"],
    ),
    # Organization-specific query
    (
        "Google engineering experience",
        [
            _make_evidence("g1", "Software Engineer", claim_text="Worked on search infrastructure", organization="Google", technologies=["C++", "Python"]),
            _make_evidence("g2", "Software Engineer", claim_text="Built payment systems", organization="Stripe", technologies=["Ruby"]),
            _make_evidence("g3", "Engineer", claim_text="Developed ads platform", organization="Google", technologies=["Java"]),
        ],
        ["g1", "g3"],
    ),
]


def precision_at_k(ranked_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """Calculate precision@k: fraction of top-k results that are relevant."""
    if k == 0:
        return 0.0
    top_k = ranked_ids[:k]
    relevant_in_top_k = sum(1 for id in top_k if id in relevant_ids)
    return relevant_in_top_k / k


class TestHeuristicHybridRanker:
    """Tests for the heuristic_hybrid_ranker (not an ML embedding model)."""

    def test_ranker_name_is_honest(self) -> None:
        """Ranker name should indicate heuristic, not 'embedding_model' or similar."""
        ranker = HybridKeywordVectorRanker()
        assert "heuristic" in ranker.name.lower()
        assert "embedding_model" not in ranker.name.lower()
        assert "ml" not in ranker.name.lower()

    def test_get_ranker_returns_heuristic_by_default(self) -> None:
        """Default ranker should be the heuristic hybrid, not an ML model."""
        ranker = get_ranker()
        assert "heuristic" in ranker.name.lower()

    @pytest.mark.parametrize(
        "query,evidence_pool,expected_relevant_ids",
        LABELED_RELEVANCE_FIXTURES,
        ids=["python_backend", "ml_pytorch", "kubernetes_docker", "google_org"],
    )
    def test_labeled_relevance_precision_at_k(
        self,
        query: str,
        evidence_pool: list[EvidenceItem],
        expected_relevant_ids: list[str],
    ) -> None:
        """Heuristic ranker should achieve reasonable precision@k on labeled fixtures.

        Note: This is evaluating a HEURISTIC ranker, not a learned model.
        We expect decent but not perfect precision since it's based on
        keyword overlap and pseudo-vector similarity.
        """
        ranker = HybridKeywordVectorRanker()
        k = len(expected_relevant_ids)
        ranked = ranker.rank(query, evidence_pool, limit=k)
        ranked_ids = [item.id for item, _ in ranked]
        relevant_set = set(expected_relevant_ids)

        p_at_k = precision_at_k(ranked_ids, relevant_set, k)
        # Heuristic ranker should achieve at least 50% precision@k
        # (lower bar than ML since this is deterministic keyword/hash-based)
        assert p_at_k >= 0.5, f"precision@{k}={p_at_k:.2f}, ranked={ranked_ids}, expected={expected_relevant_ids}"

    def test_empty_evidence_returns_empty(self) -> None:
        """Ranker should handle empty evidence gracefully."""
        ranker = HybridKeywordVectorRanker()
        result = ranker.rank("Python developer", [], limit=5)
        assert result == []

    def test_ranker_does_not_download_models_on_import(self) -> None:
        """Importing rankers module should not trigger any model downloads."""
        # This test is a canary — if it takes more than 1 second to import,
        # something is downloading models on import.
        import time
        start = time.time()
        import importlib

        import app.modules.retrieval.rankers as rankers_module
        importlib.reload(rankers_module)
        elapsed = time.time() - start
        # Import should be nearly instant (< 0.5s) since no models are downloaded
        assert elapsed < 0.5, f"Import took {elapsed:.2f}s — may be downloading models"

    def test_scores_are_bounded_zero_to_one(self) -> None:
        """Heuristic scores should be normalized between 0 and 1."""
        ranker = HybridKeywordVectorRanker()
        evidence = [
            _make_evidence("e1", "Engineer", claim_text="Python FastAPI microservices", technologies=["Python", "FastAPI"]),
            _make_evidence("e2", "Engineer", claim_text="Java Spring Boot applications", technologies=["Java", "Spring"]),
        ]
        ranked = ranker.rank("Python FastAPI", evidence, limit=10)
        for _, score in ranked:
            assert 0 <= score <= 1, f"Score {score} out of expected [0,1] range"


class TestRankerMetricsReport:
    """Precision@k metrics across the labeled relevance fixture set.

    This is not a pass/fail test — it reports aggregate metrics for the
    heuristic ranker to establish a baseline and track regressions.
    """

    def test_aggregate_precision_report(self) -> None:
        """Report aggregate precision@k across all labeled fixtures."""
        ranker = HybridKeywordVectorRanker()
        precisions: list[float] = []

        for query, evidence_pool, expected_relevant_ids in LABELED_RELEVANCE_FIXTURES:
            k = len(expected_relevant_ids)
            ranked = ranker.rank(query, evidence_pool, limit=k)
            ranked_ids = [item.id for item, _ in ranked]
            p_at_k = precision_at_k(ranked_ids, set(expected_relevant_ids), k)
            precisions.append(p_at_k)

        avg_precision = sum(precisions) / len(precisions) if precisions else 0.0
        # Report metrics (visible in pytest output with -v)
        print("\n=== Heuristic Hybrid Ranker Metrics ===")
        print(f"Ranker name: {ranker.name}")
        print(f"Fixtures evaluated: {len(LABELED_RELEVANCE_FIXTURES)}")
        print(f"Average precision@k: {avg_precision:.2%}")
        print(f"Per-fixture precision: {[f'{p:.2%}' for p in precisions]}")

        # Baseline assertion: average precision should be >= 50%
        assert avg_precision >= 0.5, f"Average precision {avg_precision:.2%} below 50% baseline"
