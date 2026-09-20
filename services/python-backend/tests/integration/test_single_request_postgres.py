"""Actual shared PostgreSQL allowance: mandatory in the pgvector CI job, no paid provider."""
from __future__ import annotations

import asyncio
import json
import os
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.single_request import SingleRequestLedger


@pytest.mark.asyncio
async def test_allowance_survives_reconnection_and_concurrent_workers() -> None:
    if os.getenv("RUN_PGVECTOR_TESTS") != "1":
        pytest.skip("RUN_PGVECTOR_TESTS!=1")
    import asyncpg
    dsn = os.environ["DATABASE_URL"]
    tenant, owner, other = uuid4(), uuid4(), uuid4()
    pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
    try:
        async with pool.acquire() as conn:
            await conn.execute("INSERT INTO tenants(id,public_id,name,plan) VALUES($1,$2,'Allowance test','free')", tenant, f"t-{tenant}")
            for user in (owner, other):
                await conn.execute("INSERT INTO users(id,public_id,email,name) VALUES($1,$2,$3,'Test')", user, f"u-{user}", f"{user}@example.com")
            async with conn.transaction():
                await conn.execute("SELECT set_config('app.tenant_id',$1,true)", str(tenant))
                await conn.execute("INSERT INTO resume_work_records(tenant_id,owner_user_id,kind,key,data) VALUES($1,$2,'operation','op',$3::jsonb)", tenant, owner, json.dumps({"profileKey": "immutable-profile", "jobKey": "immutable-job"}))
        workers = [SingleRequestLedger(pool) for _ in range(12)]
        results = await asyncio.gather(*(worker.consume(str(tenant), str(owner), "op", "digest") for worker in workers), return_exceptions=True)
        assert results.count(None) == 1
        assert sum(isinstance(result, HTTPException) for result in results) == 11
        await pool.close()
        pool = await asyncpg.create_pool(dsn, min_size=1, max_size=2)
        restarted = SingleRequestLedger(pool)
        with pytest.raises(HTTPException) as uncertain:
            await restarted.consume(str(tenant), str(owner), "op", "digest")
        assert uncertain.value.detail["code"] == "GENERATION_OUTCOME_UNCERTAIN"
        # The other owner cannot consume or read a candidate's response.
        with pytest.raises(HTTPException) as denied:
            await restarted.consume(str(tenant), str(other), "op", "digest")
        assert denied.value.detail["code"] == "OPERATION_NOT_RESERVED"
        await restarted.save(str(tenant), str(owner), "op", "digest", {"resume": "late saved response"})
        assert await restarted.consume(str(tenant), str(owner), "op", "digest") == {"resume": "late saved response"}
        with pytest.raises(HTTPException):
            await restarted.consume(str(tenant), str(owner), "op", "mutated-profile")
    finally:
        async with pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id',$1,true)", str(tenant))
            await conn.execute("DELETE FROM resume_work_records WHERE tenant_id=$1", tenant)
            await conn.execute("DELETE FROM users WHERE id=ANY($1::uuid[])", [owner, other])
            await conn.execute("DELETE FROM tenants WHERE id=$1", tenant)
        await pool.close()
