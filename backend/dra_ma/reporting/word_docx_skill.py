"""Adapter for the local word-docx skill guide.

The installed skill is instruction-only (SKILL.md + metadata), so backend code
cannot execute it as a tool. This adapter loads its guidance and exposes stable
metadata for DocxExporter, while the exporter implements the concrete OOXML
generation rules.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WordDocxSkillGuide:
    """Loaded metadata and text from backend/dra_ma/skills/word-docx."""

    name: str
    slug: str
    version: str
    path: Path
    content: str

    @property
    def is_available(self) -> bool:
        return self.path.exists() and bool(self.content.strip())

    @classmethod
    def load(cls, skill_dir: Path | None = None) -> "WordDocxSkillGuide":
        dra_ma_dir = Path(__file__).resolve().parents[1]
        root = skill_dir or dra_ma_dir / "skills" / "word-docx"
        skill_path = root / "SKILL.md"
        meta_path = root / "_meta.json"

        content = ""
        meta: dict[str, str] = {}

        try:
            content = skill_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            logger.warning("[DocxExporter] word-docx skill not found at %s", skill_path)
        except Exception as exc:
            logger.warning("[DocxExporter] failed to read word-docx skill: %s", exc)

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            meta = {}
        except Exception as exc:
            logger.warning("[DocxExporter] failed to read word-docx metadata: %s", exc)

        frontmatter = _parse_frontmatter(content)
        return cls(
            name=frontmatter.get("name") or meta.get("name") or "Word / DOCX",
            slug=frontmatter.get("slug") or meta.get("slug") or "word-docx",
            version=frontmatter.get("version") or meta.get("version") or "unknown",
            path=skill_path,
            content=content,
        )


def _parse_frontmatter(content: str) -> dict[str, str]:
    if not content.startswith("---"):
        return {}

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}

    values: dict[str, str] = {}
    for line in parts[1].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip().strip('"')
    return values
