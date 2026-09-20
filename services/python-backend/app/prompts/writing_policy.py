"""One versioned writing policy shared by TypeScript and Python providers."""

import json
import re
from pathlib import Path

_policy = json.loads(Path(__file__).with_name("resume-writing-policy.json").read_text(encoding="utf-8"))
WRITING_POLICY_VERSION: str = _policy["version"]
RESUME_WRITING_POLICY = (
    f"CandidArc resume writing policy ({WRITING_POLICY_VERSION}):\n"
    + "\n".join(f"- {rule}" for rule in _policy["rules"])
)


def precise_action_opening(text: str) -> str:
    """Limited, context-specific edits; keep ordinary verbs when meaning is unclear.

    These local edits add no technology, outcome, metric, or ownership. They are
    intentionally narrower than the live provider's contextual writing policy.
    """
    for pattern, replacement in (
        (r"^(?:Built|Developed|Created)(?=\s+(?:(?:a|an|the|new)\s+)?(?:API(?:s)?|services?|components?|applications?|software|dashboards?)\b)", "Implemented"),
        (r"^(?:Build|Develop|Create)(?=\s+(?:(?:a|an|the|new)\s+)?(?:API(?:s)?|services?|components?|applications?|software|dashboards?)\b)", "Implement"),
        (r"^(?:Developed|Created)(?=\s+(?:(?:a|an|the|new)\s+)?(?:documentation|guides?|runbooks?|reports?|manuals?)\b)", "Authored"),
        (r"^(?:Develop|Create)(?=\s+(?:(?:a|an|the|new)\s+)?(?:documentation|guides?|runbooks?|reports?|manuals?)\b)", "Author"),
        (r"^Helped with\b", "Supported"),
        (r"^Help with\b", "Support"),
    ):
        updated, count = re.subn(pattern, replacement, text, count=1, flags=re.I)
        if count:
            return updated
    return text


def unsupported_responsibility_upgrade(text: str, source_actions: list[str]) -> bool:
    """Conservative check for stronger opening claims against cited actions only."""
    if any(text.strip().casefold() == source.strip().casefold() for source in source_actions):
        return False
    # Team/assistance wording does not attest the candidate's leadership.
    own_actions = [source for source in source_actions if not re.search(
        r"\b(?:assisted|supported|helped|collaborated|our team|the team)\b", source, re.I,
    )]
    for group in _policy["responsibilityGroups"]:
        if re.search(group["opening"], text.strip(), re.I):
            return not any(re.search(group["support"], source, re.I) for source in own_actions)
    return False
