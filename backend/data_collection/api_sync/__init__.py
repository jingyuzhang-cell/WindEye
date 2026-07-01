"""API Sync — integrates with external REST/GraphQL data APIs.

Executive crawling sub-package
------------------------------
``base``
    Abstract ``ExecutiveDataSource`` and ``ChannelManager`` orchestrator.
``free_sources``
    ``AiqichaSource`` (爱企查), ``GsxtSource`` (国家企业信用信息公示系统).
``paid_sources``
    ``QccSource`` (企查查), ``TianyanchaSource`` (天眼查), ``DemoSource``.
``rate_limiter``
    Token-bucket rate limiter with per-channel defaults.
``person_dedup``
    ``PersonKey`` and ``deduplicate_persons()`` for merge-key dedup.
``cypher_writer``
    Cypher MERGE generation + batch Neo4j write helpers.
"""

from .base import (
    ChannelManager,
    CompanyFetchResult,
    ExecutiveDataSource,
    ExecutiveResult,
    LegalPersonResult,
)
from .cypher_writer import (
    build_all_statements,
    execute_batch,
    generate_executive_relationship,
    generate_index_statements,
    generate_legal_person_relationship,
    generate_person_merge,
)
from .free_sources import AiqichaSource, GsxtSource
from .paid_sources import DemoSource, QccSource, TianyanchaSource
from .person_dedup import PersonKey, deduplicate_persons
from .rate_limiter import TokenBucket, create_rate_limiter

__all__ = [
    # base
    "ChannelManager",
    "CompanyFetchResult",
    "ExecutiveDataSource",
    "ExecutiveResult",
    "LegalPersonResult",
    # free sources
    "AiqichaSource",
    "GsxtSource",
    # paid sources
    "DemoSource",
    "QccSource",
    "TianyanchaSource",
    # rate limiter
    "TokenBucket",
    "create_rate_limiter",
    # person dedup
    "PersonKey",
    "deduplicate_persons",
    # cypher writer
    "build_all_statements",
    "execute_batch",
    "generate_executive_relationship",
    "generate_index_statements",
    "generate_legal_person_relationship",
    "generate_person_merge",
]
