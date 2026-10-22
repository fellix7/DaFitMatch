"""Catalog access for the offline batch jobs.

Talks to Postgres through the Supabase REST API with the service-role key (batch writes are
service-role only; RLS stays intact for the app). Every method is a plain function so the jobs
can be unit tested with a fake catalog.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

PAGE_SIZE = 500


@dataclass(frozen=True)
class ProductRow:
    """A catalog product that still needs an embedding."""

    id: str
    title: str
    brand: str
    category: str
    slot: str
    gender: str
    image_url: str
    price_inr: int


@dataclass(frozen=True)
class ArchetypeRow:
    id: str
    slug: str
    name: str


@dataclass(frozen=True)
class WardrobeRow:
    id: str
    user_id: str
    image_path: str
    slot: str


@dataclass(frozen=True)
class VenueRow:
    id: str
    name: str
    city: str
    category: str
    vibe_tags: list[str]


class Catalog:
    """Thin wrapper over the Supabase REST client (service role)."""

    def __init__(self, client: Any) -> None:
        self._client = client

    @classmethod
    def from_settings(cls, settings: Any) -> Catalog:
        from supabase import create_client

        client = create_client(settings.supabase_url, settings.supabase_secret_key)
        return cls(client)

    # ── generic paging helper ───────────────────────────────────────────────
    def _page(self, table: str, select: str, query: Any) -> list[dict[str, Any]]:
        rows = query.execute()
        return list(rows.data or [])

    # ── products ────────────────────────────────────────────────────────────
    def products_without_embedding(
        self,
        limit: int = 0,
        only_in_stock: bool = True,
        only_missing: bool = True,
    ) -> list[ProductRow]:
        """Products to embed, oldest first (stable, resumable order)."""
        rows: list[dict[str, Any]] = []
        start = 0
        while True:
            query = (
                self._client.table("products")
                .select("id,title,brand,category,slot,gender,image_url,price_inr")
                .order("created_at", ascending=True)
                .order("id", ascending=True)
                .range(start, start + PAGE_SIZE - 1)
            )
            if only_missing:
                query = query.is_("embedding", None)
            if only_in_stock:
                query = query.eq("in_stock", True)
            page = self._page("products", "*", query)
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                break
            start += PAGE_SIZE
            if limit and len(rows) >= limit:
                break
        if limit:
            rows = rows[:limit]
        return [
            ProductRow(
                id=row["id"],
                title=row.get("title", ""),
                brand=row.get("brand", ""),
                category=row.get("category", ""),
                slot=row.get("slot", ""),
                gender=row.get("gender", ""),
                image_url=row.get("image_url", ""),
                price_inr=int(row.get("price_inr") or 0),
            )
            for row in rows
        ]

    def set_product_embedding(self, product_id: str, vector: str) -> None:
        """Write one product vector (pgvector text form) and stamp `embedded_at`."""
        self._client.table("products").update(
            {"embedding": vector, "embedded_at": datetime.now(UTC).isoformat()}
        ).eq("id", product_id).execute()

    def set_product_embeddings(self, updates: Sequence[tuple[str, str]]) -> None:
        """Write several product vectors one by one (PostgREST has no bulk upsert helper)."""
        for product_id, vector in updates:
            self.set_product_embedding(product_id, vector)

    # ── archetypes & reference looks ────────────────────────────────────────
    def archetypes(self) -> list[ArchetypeRow]:
        rows = (
            self._client.table("archetypes")
            .select("id,slug,name")
            .order("slug", ascending=True)
            .execute()
        ).data or []
        return [ArchetypeRow(id=r["id"], slug=r["slug"], name=r["name"]) for r in rows]

    def insert_reference_look(
        self,
        archetype_id: str,
        source_brand: str,
        source_url: str | None,
        gender: str,
        vector: str,
    ) -> None:
        self._client.table("reference_looks").insert(
            {
                "archetype_id": archetype_id,
                "source_brand": source_brand,
                "source_url": source_url,
                "gender": gender,
                "embedding": vector,
            }
        ).execute()

    def reference_look_vectors(self, archetype_id: str) -> list[str]:
        rows = (
            self._client.table("reference_looks")
            .select("embedding")
            .eq("archetype_id", archetype_id)
            .not_("embedding", "is", None)
            .execute()
        ).data or []
        return [row["embedding"] for row in rows if row.get("embedding")]

    def set_archetype_centroid(self, archetype_id: str, vector: str) -> None:
        self._client.table("archetypes").update({"centroid": vector}).eq(
            "id", archetype_id
        ).execute()

    # ── wardrobe ────────────────────────────────────────────────────────────
    def wardrobe_items_without_embedding(self, limit: int = 0) -> list[WardrobeRow]:
        rows: list[dict[str, Any]] = []
        start = 0
        while True:
            query = (
                self._client.table("wardrobe_items")
                .select("id,user_id,image_path,slot")
                .is_("embedding", None)
                .eq("is_archived", False)
                .not_("image_path", "is", None)
                .order("created_at", ascending=True)
                .range(start, start + PAGE_SIZE - 1)
            )
            page = self._page("wardrobe_items", "*", query)
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                break
            start += PAGE_SIZE
            if limit and len(rows) >= limit:
                break
        if limit:
            rows = rows[:limit]
        return [
            WardrobeRow(
                id=row["id"],
                user_id=row["user_id"],
                image_path=row["image_path"],
                slot=row.get("slot", ""),
            )
            for row in rows
        ]

    def set_wardrobe_embedding(self, item_id: str, vector: str) -> None:
        self._client.table("wardrobe_items").update({"embedding": vector}).eq(
            "id", item_id
        ).execute()

    def signed_url(self, bucket: str, path: str, expires: int = 120) -> str:
        """Short-lived signed URL for a private storage object (wardrobe photos)."""
        signed = self._client.storage.from_(bucket).create_signed_url(path, expires)
        data = getattr(signed, "signed_url", None) or signed.get("signedURL")
        if not data:
            raise RuntimeError(f"could not sign {bucket}/{path}")
        return str(data)

    # ── venues ──────────────────────────────────────────────────────────────
    def venues(self) -> list[VenueRow]:
        rows = (
            self._client.table("venues")
            .select("id,name,city,category,vibe_tags")
            .eq("is_open", True)
            .execute()
        ).data or []
        return [
            VenueRow(
                id=row["id"],
                name=row.get("name", ""),
                city=row.get("city", ""),
                category=row.get("category", ""),
                vibe_tags=list(row.get("vibe_tags") or []),
            )
            for row in rows
        ]

    def set_venue_vibe_embedding(self, venue_id: str, vector: str) -> None:
        self._client.table("venues").update({"vibe_embedding": vector}).eq("id", venue_id).execute()

    # ── counts (catalog health report) ──────────────────────────────────────
    def product_counts(self) -> list[dict[str, Any]]:
        return list(
            (
                self._client.table("products")
                .select("slot,gender,in_stock,price_inr,embedding,tags_version,embedded_at")
                .limit(10000)
                .execute()
            ).data
            or []
        )
