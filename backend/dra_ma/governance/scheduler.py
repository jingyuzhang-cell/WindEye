from __future__ import annotations

from collections.abc import Iterable

from dra_ma.governance.modules.base import GovernanceModule


class StageScheduler:
    """Validates and orders governance modules by declared dependencies."""

    def order(self, modules: Iterable[GovernanceModule]) -> list[GovernanceModule]:
        ordered: list[GovernanceModule] = []
        completed: set[str] = set()
        pending = list(modules)

        while pending:
            progressed = False
            for module in pending[:]:
                if all(dep in completed for dep in module.depends_on):
                    ordered.append(module)
                    completed.add(module.name)
                    pending.remove(module)
                    progressed = True
            if not progressed:
                missing = {
                    module.name: [dep for dep in module.depends_on if dep not in completed]
                    for module in pending
                }
                raise ValueError(f"Governance module dependency cycle or missing dependency: {missing}")

        return ordered
