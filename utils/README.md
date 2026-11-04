# utils/

Loader for `data/questions.json`, used by the scoring engine, `app.py` and `verify_benchmark.py`.

## Files

| File | What it does |
|---|---|
| `__init__.py` | Empty package marker. |
| `data_loader.py` | `load_data()` reads and caches `../data/questions.json`; `get_domains()`, `get_stage_weights()`, `get_stage_names()` return its three keys. |
