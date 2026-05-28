"""Centralized environment configuration for BiDA-KG backend."""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Unified settings loaded from environment variables.

    Module ownership markers:
      [C] = 风险问答 (Developer C)
      [A] = 知识图谱构建 (Developer A)
      [B] = 知识图谱展示 (Developer B)
      [ALL] = Shared — coordinate changes across all modules
    """

    # ── [C] LLM ──────────────────────────────────────────────────
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "deepseek-chat")

    # ── [ALL] Neo4j ──────────────────────────────────────────────
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    NEO4J_USERNAME: str = os.getenv("NEO4J_USERNAME", "") or os.getenv("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "")
    NEO4J_DATABASE: str = os.getenv("NEO4J_DATABASE", "neo4j")

    # ── [A] Knowledge Graph Dataset ──────────────────────────────
    KG_DATASET: str = os.getenv("KG_DATASET", "metaqa").lower()

    # ── [A] Data Collection ──────────────────────────────────────
    KG_DATA_DIR: str = os.getenv("KG_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))

    # ── [A] NER ──────────────────────────────────────────────────
    NER_MODEL: str = os.getenv("NER_MODEL", "spacy")

    # ── [A] Dify Workflow API ────────────────────────────────────
    DIFY_API_KEY: str = os.getenv("DIFY_API_KEY", "")
    DIFY_BASE_URL: str = os.getenv("DIFY_BASE_URL", "https://api.dify.ai")
    # Per-stage API keys (each Dify App has its own API key).
    DIFY_SUBJECT_API_KEY: str = os.getenv("DIFY_SUBJECT_API_KEY", "")
    DIFY_EVENT_API_KEY: str = os.getenv("DIFY_EVENT_API_KEY", "")
    DIFY_FEATURE_API_KEY: str = os.getenv("DIFY_FEATURE_API_KEY", "")
    DIFY_REGULATION_API_KEY: str = os.getenv("DIFY_REGULATION_API_KEY", "")

    # ── [C] Embedding / Vector ───────────────────────────────────
    VECTOR_DIMENSION: int = int(os.getenv("VECTOR_DIMENSION", "768"))
    VECTOR_SIMILARITY_FUNCTION: str = os.getenv("VECTOR_SIMILARITY_FUNCTION", "cosine")
    EMBED_MODEL: str = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    EMBED_DIM: int = int(os.getenv("EMBED_DIM", "384"))

    # ── [C] GNN Alignment ────────────────────────────────────────
    ALIGNMENT_DIR: str = os.getenv("ALIGNMENT_DIR", "models/alignment")
    ALIGNMENT_MODEL_VERSION: str = os.getenv("ALIGNMENT_MODEL_VERSION", "v1.0")
    ALIGNMENT_SIMILARITY_FN: str = os.getenv("ALIGNMENT_SIMILARITY_FN", "cosine")


settings = Settings()
