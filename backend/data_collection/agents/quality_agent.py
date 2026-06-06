"""Quality Assessor — validate crawl results for completeness and integrity."""

from __future__ import annotations

import os


class QualityAssessor:
    """Validate crawl results."""

    def assess(self, crawl_result: dict) -> dict:
        """Assess quality of a single crawl result.

        Returns: {quality_score, issues, passed, files_downloaded, records}
        """
        save_dir = crawl_result.get("save_dir", "")
        files_downloaded = crawl_result.get("files_downloaded", 0)
        records = crawl_result.get("records", 0)
        issues = []

        if files_downloaded == 0 and records == 0:
            issues.append({"severity": "warning", "message": "No files or records produced — source may be empty or blocked"})

        if save_dir and os.path.isdir(save_dir):
            try:
                actual_files = [f for f in os.listdir(save_dir) if not f.endswith((".crdownload", ".tmp"))]
                if files_downloaded > 0 and len(actual_files) < files_downloaded * 0.5:
                    issues.append({
                        "severity": "error",
                        "message": f"File count mismatch: expected ~{files_downloaded}, got {len(actual_files)}",
                    })
                for f in actual_files[:5]:
                    fpath = os.path.join(save_dir, f)
                    if os.path.isfile(fpath) and os.path.getsize(fpath) < 1024:
                        issues.append({"severity": "warning", "message": f"Small/empty file: {f}"})
            except Exception:
                pass

        quality_score = 1.0
        if any(i["severity"] == "error" for i in issues):
            quality_score = 0.3
        elif any(i["severity"] == "warning" for i in issues):
            quality_score = 0.7

        return {
            "quality_score": quality_score,
            "issues": issues,
            "files_downloaded": files_downloaded,
            "records": records,
            "passed": quality_score >= 0.5,
        }
