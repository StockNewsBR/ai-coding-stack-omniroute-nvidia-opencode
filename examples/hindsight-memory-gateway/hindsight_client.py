from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class HindsightClient:
    base_url: str = os.getenv("HINDSIGHT_URL", "http://127.0.0.1:8888")
    timeout: float = float(os.getenv("HINDSIGHT_TIMEOUT", "5"))

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url.rstrip('/')}{path}",
            data=body,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Hindsight HTTP {exc.code}: {detail[:300]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Hindsight unavailable: {exc.reason}") from exc

    def health(self) -> Any:
        return self._request("GET", "/health")

    def ensure_bank(self, bank_id: str) -> Any:
        # API shapes may evolve across Hindsight releases. Keep this adapter isolated.
        try:
            return self._request("POST", "/v1/banks", {"bank_id": bank_id})
        except RuntimeError as exc:
            if "409" in str(exc):
                return {"bank_id": bank_id, "status": "exists"}
            raise

    def retain(self, bank_id: str, content: str, metadata: dict[str, Any]) -> Any:
        return self._request(
            "POST",
            f"/v1/default/banks/{bank_id}/memories",
            {"content": content, "metadata": metadata},
        )

    def recall(self, bank_id: str, query: str, top_k: int = 5) -> Any:
        return self._request(
            "POST",
            f"/v1/default/banks/{bank_id}/memories/recall",
            {"query": query, "top_k": top_k},
        )

    def reflect(self, bank_id: str, query: str) -> Any:
        return self._request(
            "POST",
            f"/v1/default/banks/{bank_id}/reflect",
            {"query": query},
        )
