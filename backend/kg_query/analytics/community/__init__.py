"""Community detection algorithm package.

Provides a registry-based architecture for pluggable community detection algorithms.
All algorithms are auto-registered on import.
"""

from .base import BaseCommunityAlgorithm
from .registry import AlgorithmRegistry, registry

# ── Auto-register all algorithms ──────────────────────────────────────
from .wcc import WCCAlgorithm
from .louvain import LouvainAlgorithm
from .lpa import LPAAlgorithm
from .leiden import LeidenAlgorithm
from .girvan_newman import GirvanNewmanAlgorithm
from .spectral import SpectralAlgorithm
from .infomap import InfomapAlgorithm

# Register in order of sophistication
for _alg_cls in [
    WCCAlgorithm,
    LouvainAlgorithm,
    LPAAlgorithm,
    LeidenAlgorithm,
    GirvanNewmanAlgorithm,
    SpectralAlgorithm,
    InfomapAlgorithm,
]:
    registry.register(_alg_cls())

__all__ = [
    "BaseCommunityAlgorithm",
    "AlgorithmRegistry",
    "registry",
    "WCCAlgorithm",
    "LouvainAlgorithm",
    "LPAAlgorithm",
    "LeidenAlgorithm",
    "GirvanNewmanAlgorithm",
    "SpectralAlgorithm",
    "InfomapAlgorithm",
]
