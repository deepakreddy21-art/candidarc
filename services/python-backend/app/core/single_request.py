"""Non-expiring allowance, separate from retryable local work and Redis response TTLs.

PostgreSQL is shared with the web application. A consumed allowance is NEVER released,
including on cancellation/timeout. Memory mode is permitted for mock demos only.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from fastapi import HTTPException


class SingleRequestLedger:
    def __init__(self, pool: Any = None, *, allow_memory: bool = False) -> None:
        self.pool = pool
        self.allow_memory = allow_memory
        self.rows: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.lock = asyncio.Lock()

    async def consume(self, tenant: str, owner: str, key: str, digest: str) -> dict[str, Any] | None:
        if self.pool is None:
            if not self.allow_memory:
                raise HTTPException(503, detail={"code": "DURABLE_ALLOWANCE_REQUIRED"})
            async with self.lock:
                row = self.rows.get((tenant, owner, key))
                if row is None:
                    self.rows[(tenant, owner, key)] = {"request_digest": digest, "state": "dispatched"}
                    return None
                return self._existing(row, digest)
        async with self.pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id',$1,true)", tenant)
            row = await conn.fetchrow("""SELECT state,data FROM resume_work_records
                WHERE tenant_id=$1 AND owner_user_id=$2 AND kind='operation' AND key=$3 FOR UPDATE""",
                UUID(tenant), UUID(owner), key)
            if row is None:
                raise HTTPException(409, detail={"code": "OPERATION_NOT_RESERVED"})
            data = json.loads(row["data"]) if isinstance(row["data"], str) else row["data"]
            if row["state"] != "ready":
                return self._existing({**data, "state": row["state"]}, digest)
            await conn.execute("""UPDATE resume_work_records SET state='dispatched',
                data=data || $4::jsonb,updated_at=now() WHERE tenant_id=$1 AND owner_user_id=$2
                AND kind='operation' AND key=$3""", UUID(tenant), UUID(owner), key,
                json.dumps({"request_digest": digest}))
            return None

    @staticmethod
    def _existing(row: dict[str, Any], digest: str) -> dict[str, Any]:
        if row.get("request_digest") != digest:
            raise HTTPException(409, detail={"code": "OPERATION_INPUT_CHANGED"})
        if isinstance(row.get("response"), dict):
            return dict(row["response"])
        raise HTTPException(409, detail={"code": "GENERATION_OUTCOME_UNCERTAIN",
            "message": "The initial request may still finish. It will not be sent again. Recover the saved response or contact support."})

    async def save(self, tenant: str, owner: str, key: str, digest: str, response: dict[str, Any] | None) -> None:
        state = "response_saved" if response is not None else "uncertain"
        data = {"response": response} if response is not None else {}
        if self.pool is None:
            async with self.lock:
                row = self.rows[(tenant, owner, key)]
                if row["request_digest"] == digest:
                    row.update(data, state=state)
            return
        async with self.pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id',$1,true)", tenant)
            await conn.execute("""UPDATE resume_work_records SET state=$4,data=data || $5::jsonb,
                updated_at=now() WHERE tenant_id=$1 AND owner_user_id=$2 AND kind='operation'
                AND key=$3 AND data->>'request_digest'=$6""", UUID(tenant), UUID(owner), key,
                state, json.dumps(data), digest)
