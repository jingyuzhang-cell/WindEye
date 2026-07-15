# New Report Module

`backend/new_report` is the offline, batch-oriented regulatory community analysis workspace.

Structure:

- `code/`: executable pipeline, reusable clustering/report logic, legacy prototypes, sample inputs.
- `docs/`: current operator docs in `docs/report/` and historical notes in `docs/archive/`.
- `tests/`: validation scripts separated from production code.

Generated outputs are written to `D:\\Code\\WindEye\\backend\\report_outputs` through `backend/.env`.
