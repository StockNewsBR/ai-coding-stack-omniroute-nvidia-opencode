from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from hindsight_client import HindsightClient

MEMORY_TYPES = {
    "OBSERVATION",
    "EXPERIENCE",
    "DECISION",
    "CONSTRAINT",
    "KNOWN_BUG",
    "FIX_VERIFIED",
    "REJECTED_FINDING",
    "CANONICAL",
}

CONFIDENCE_LEVELS = {"LOW", "MEDIUM", "HIGH", "CANONICAL"}

SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*", re.I),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"postgres(?:ql)?://[^\s:/]+:[^\s@]+@", re.I),
]

INJECTION_PATTERNS = [
    re.compile(r"ignore (?:all |the )?previous instructions", re.I),
    re.compile(r"override (?:the )?system prompt", re.I),
    re.compile(r"exfiltrat(?:e|ion)", re.I),
    re.compile(r"disable (?:the )?security", re.I),
    re.compile(r"send (?:me )?(?:all )?secrets", re.I),
]


class MemoryRejected(ValueError):
    pass


@dataclass
class CircuitBreaker:
    failure_threshold: int = 5
    reset_seconds: int = 60
    failures: int = 0
    opened_at: float | None = None

    @property
    def open(self) -> bool:
        if self.opened_at is None:
            return False
        if time.monotonic() - self.opened_at >= self.reset_seconds:
            self.failures = 0
            self.opened_at = None
            return False
        return True

    def success(self) -> None:
        self.failures = 0
        self.opened_at = None

    def failure(self) -> None:
        self.failures += 1
        if self.failures >= self.failure_threshold:
            self.opened_at = time.monotonic()


@dataclass
class MemoryGateway:
    project: str
    client: HindsightClient = field(default_factory=HindsightClient)
    breaker: CircuitBreaker = field(default_factory=CircuitBreaker)

    def bank(self, domain: str) -> str:
        safe_project = re.sub(r"[^a-z0-9-]+", "-", self.project.lower()).strip("-")
        safe_domain = re.sub(r"[^a-z0-9-]+", "-", domain.lower()).strip("-")
        if not safe_project or not safe_domain:
            raise MemoryRejected("invalid project or bank namespace")
        return f"{safe_project}-{safe_domain}"

    @staticmethod
    def _contains_secret(text: str) -> bool:
        return any(pattern.search(text) for pattern in SECRET_PATTERNS)

    @staticmethod
    def _looks_injected(text: str) -> bool:
        return any(pattern.search(text) for pattern in INJECTION_PATTERNS)

    def retain(
        self,
        *,
        domain: str,
        text: str,
        memory_type: str,
        confidence: str,
        source_agent: str,
        source: str,
        repo: str = "",
        branch: str = "",
        commit: str = "",
        verified: bool = False,
        allow_canonical: bool = False,
    ) -> Any:
        memory_type = memory_type.upper()
        confidence = confidence.upper()

        if memory_type not in MEMORY_TYPES:
            raise MemoryRejected(f"invalid memory type: {memory_type}")
        if confidence not in CONFIDENCE_LEVELS:
            raise MemoryRejected(f"invalid confidence: {confidence}")
        if self._contains_secret(text):
            raise MemoryRejected("memory rejected: potential secret")

        untrusted = self._looks_injected(text)
        bank_id = self.bank(domain)
        canonical_target = domain.lower() == "canonical" or memory_type == "CANONICAL" or confidence == "CANONICAL"
        if canonical_target and not allow_canonical:
            raise MemoryRejected("canonical memory requires explicit promotion")
        if canonical_target and untrusted:
            raise MemoryRejected("untrusted content cannot become canonical")

        metadata = {
            "project": self.project,
            "bank": bank_id,
            "type": memory_type,
            "confidence": confidence,
            "status": "ACTIVE",
            "source_agent": source_agent,
            "source": source,
            "repo": repo,
            "branch": branch,
            "commit": commit,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "verified": bool(verified),
            "source_trust": "untrusted" if untrusted else "trusted",
        }

        if self.breaker.open:
            return {"stored": False, "reason": "circuit_open"}

        try:
            result = self.client.retain(bank_id, text, metadata)
            self.breaker.success()
            return result
        except Exception:
            self.breaker.failure()
            raise

    def recall(self, *, domain: str, query: str, top_k: int = 5) -> Any:
        if self._contains_secret(query):
            raise MemoryRejected("query rejected: potential secret")
        if self.breaker.open:
            return {"matches": [], "reason": "circuit_open"}
        try:
            result = self.client.recall(self.bank(domain), query, max(1, min(top_k, 20)))
            self.breaker.success()
            return result
        except Exception:
            self.breaker.failure()
            raise

    def reflect(self, *, domain: str, query: str) -> Any:
        if self._contains_secret(query):
            raise MemoryRejected("query rejected: potential secret")
        if self.breaker.open:
            return {"result": None, "reason": "circuit_open"}
        try:
            result = self.client.reflect(self.bank(domain), query)
            self.breaker.success()
            return result
        except Exception:
            self.breaker.failure()
            raise
