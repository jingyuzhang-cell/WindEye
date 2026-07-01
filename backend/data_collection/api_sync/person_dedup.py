"""Person deduplication — merge-key logic and batch dedup.

Because one person may serve as legal rep or executive for *multiple*
companies, we must ensure only a single PERSON node exists in Neo4j.
This module provides the ``PersonKey`` and ``deduplicate_persons()``
used by the crawler before writing to the graph.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# ── PersonKey — the dedup identity ───────────────────────────────────────

@dataclass(frozen=True)
class PersonKey:
    """Immutable, hashable key for person deduplication.

    Two strategies:
    - **Strong**: both ``name`` and ``id_card`` match exactly.
    - **Name-only**: when at least one record lacks an ID card, we fall
      back to exact name matching (with a warning about homonyms).
    """

    name: str
    id_card: str | None = None

    def __post_init__(self) -> None:
        # Normalise on construction
        object.__setattr__(self, "name", self.name.strip())
        if self.id_card is not None:
            object.__setattr__(self, "id_card", self.id_card.strip() or None)

    @property
    def has_id(self) -> bool:
        return self.id_card is not None and len(self.id_card) > 0

    def is_strong_match(self, other: PersonKey) -> bool:
        """True if the two keys definitely refer to the same person."""
        # Both have IDs → must match
        if self.has_id and other.has_id:
            return self.id_card == other.id_card
        # At least one lacks ID → fall back to name equality
        return self.name == other.name

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> PersonKey:
        return cls(name=d.get("name", ""), id_card=d.get("id_card") or d.get("ID"))

    def __str__(self) -> str:
        if self.has_id:
            return f"{self.name} ({self.id_card[:4]}...)"
        return self.name


# ── Dedup helpers ────────────────────────────────────────────────────────

def _merge_properties(
    existing: dict[str, Any],
    incoming: dict[str, Any],
) -> dict[str, Any]:
    """Merge two property dicts for the same person.

    Rules:
    - Non-None values in *incoming* overwrite None values in *existing*.
    - ``position`` becomes the most specific (longest) one seen.
    - ``source`` chains: "aiqicha" + "qcc" → "aiqicha,qcc".
    - ``confidence`` keeps the *maximum*.
    - ``aliases`` deduplicates across both.
    """
    merged = dict(existing)

    for key, new_val in incoming.items():
        if key in ("name", "id_card", "ID"):
            continue  # merge-key properties are immutable

        old_val = merged.get(key)

        if key == "position":
            # Keep the longer / more specific position string
            if new_val and (not old_val or len(str(new_val)) > len(str(old_val))):
                merged[key] = new_val
        elif key == "source":
            existing_srcs = set(str(old_val).split(",")) if old_val else set()
            incoming_srcs = set(str(new_val).split(",")) if new_val else set()
            merged[key] = ",".join(sorted(existing_srcs | incoming_srcs))
        elif key == "confidence":
            try:
                merged[key] = max(float(old_val or 0), float(new_val or 0))
            except (TypeError, ValueError):
                merged[key] = new_val or old_val
        elif key == "aliases":
            existing_aliases = set(old_val) if isinstance(old_val, list) else set()
            incoming_aliases = set(new_val) if isinstance(new_val, list) else set()
            merged[key] = sorted(existing_aliases | incoming_aliases)
        else:
            # Simple overwrite: incoming wins if non-None
            if new_val is not None:
                merged[key] = new_val

    return merged


def _build_person_dict(
    name: str,
    position: str,
    source: str,
    id_card: str | None = None,
    confidence: float = 0.5,
    aliases: list[str] | None = None,
) -> dict[str, Any]:
    """Build a normalised person property dict."""
    d: dict[str, Any] = {
        "name": name.strip(),
        "PERSON_NM": name.strip(),
        "POSITION": position.strip() if position else "",
        "source": source,
        "confidence": confidence,
    }
    if id_card:
        d["ID"] = id_card.strip()
        d["id_card"] = id_card.strip()
    if aliases:
        d["aliases"] = sorted(set(a.strip() for a in aliases if a.strip()))
    return d


# ── Weak-to-strong group merge ───────────────────────────────────────────

def _merge_weak_into_strong(
    groups: dict[PersonKey, list[dict[str, Any]]],
) -> None:
    """Merge name-only (weak) groups into ID-bearing (strong) groups.

    When the same person appears as ``PersonKey("张三", "123...")`` in
    one record and ``PersonKey("张三", None)`` in another, the two keys
    differ.  This function finds such collisions and merges the weak
    group's records into the strong group, then removes the weak key.
    """
    # Build index: name → list of (key, is_strong)
    name_index: dict[str, list[tuple[PersonKey, bool]]] = defaultdict(list)
    for key in groups:
        name_index[key.name].append((key, key.has_id))

    for name, entries in name_index.items():
        strong_keys = [k for k, strong in entries if strong]
        weak_keys = [k for k, strong in entries if not strong]

        if not strong_keys or not weak_keys:
            continue

        # Merge all weak groups into the first strong group
        target = strong_keys[0]
        for weak_key in weak_keys:
            if weak_key == target:
                continue
            # Move records
            groups[target].extend(groups.pop(weak_key, []))
            # Propagate ID to weak records
            for rec in groups[target]:
                if not rec.get("id_card") and not rec.get("ID"):
                    rec["id_card"] = target.id_card
                    rec["ID"] = target.id_card
            logger.info(
                "Merged name-only group '%s' into strong group '%s' (%d records)",
                weak_key, target, len(groups[target]),
            )


# ── Main public API ──────────────────────────────────────────────────────

def deduplicate_persons(
    legal_reps: list[dict[str, Any]],
    executives: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Deduplicate a combined list of legal-rep and executive records.

    Returns a list of **unique** person property dicts ready for Cypher
    MERGE generation.  Each dict includes ``positions`` (plural) tracking
    all roles the person holds across companies.

    Parameters
    ----------
    legal_reps:
        List of dicts with keys: name, id_card, position, source, company_name.
    executives:
        List of dicts with keys: name, id_card, position, source, company_name.

    Returns
    -------
    list[dict]
        Unique person dicts.  Each has a ``roles`` list recording
        ``(company_name, position, relationship_type)`` for every
        company this person is linked to.
    """
    # Group by PersonKey
    groups: dict[PersonKey, list[dict[str, Any]]] = defaultdict(list)

    for rec in legal_reps:
        key = PersonKey.from_dict(rec)
        rec_copy = dict(rec)
        rec_copy["relationship_type"] = "LEGAL_PERSON"
        groups[key].append(rec_copy)

    for rec in executives:
        key = PersonKey.from_dict(rec)
        rec_copy = dict(rec)
        rec_copy["relationship_type"] = "EXECUTIVE"
        groups[key].append(rec_copy)

    # ── Second pass: merge name-only groups into strong (ID-bearing) groups ──
    # When the same person appears with an ID in one record but without in
    # another, the two PersonKeys differ.  This pass finds strong-name
    # collisions and merges the weak group into the strong one.
    _merge_weak_into_strong(groups)

    # Merge each group into one person dict
    unique: list[dict[str, Any]] = []

    for key, recs in groups.items():
        # Start with the first record's properties
        first = recs[0]
        merged = _build_person_dict(
            name=key.name,
            position=first.get("position", ""),
            source=first.get("source", "unknown"),
            id_card=key.id_card,
            confidence=first.get("confidence", 0.5),
        )

        # Collect all roles across companies
        roles: list[dict[str, str]] = []
        seen_roles: set[tuple[str, str, str]] = set()  # (company, position, rel_type)

        for rec in recs:
            # Merge properties from subsequent records
            if rec is not first:
                merged = _merge_properties(merged, rec)

            # Track role
            company = rec.get("company_name", "")
            pos = rec.get("position", "")
            rel = rec.get("relationship_type", "")
            role_key = (company, pos, rel)
            if role_key not in seen_roles and company:
                seen_roles.add(role_key)
                roles.append({
                    "company_name": company,
                    "position": pos,
                    "relationship_type": rel,
                })

        merged["roles"] = roles
        merged["company_count"] = len({r["company_name"] for r in roles})

        # Log warning for name-only dedup of multi-person groups
        if not key.has_id and len(recs) > 1:
            logger.warning(
                "Name-only dedup: '%s' matched %d records without ID card. "
                "Potential homonym collision.",
                key.name, len(recs),
            )

        unique.append(merged)

    logger.info(
        "Deduplicated %d raw records → %d unique persons",
        len(legal_reps) + len(executives), len(unique),
    )

    return unique
