# resources/

Vetted CVI content the AI report steps may use. `pipeline.py` reads both parts at import time, and `scripts/build.sh` copies the folder into the Lambda package.

## Files

| File | What it does |
|---|---|
| `catalog.json` | List of 19 vetted resources, each with `id`, `title`, `url`, `publisher`, `domains` (OCI area codes such as `PL`, `ML`) and `use_for`. These are the only links the model may recommend: the prompt passes `id`, `title`, `domains` and `use_for`, the model answers with a `resource_id`, and the URL comes from this file. |
| `library/*.md` | One field guide per OCI area (`community-engagement`, `financial-management`, `fundraising`, `governance`, `human-resources`, `mle`, `planning`, `technology`) plus `cvi-principles.md`. Plain Markdown with sources cited inline. |

## How it connects

- `pipeline.py` sends the whole library in every report prompt (about 6.5k tokens, cached by Bedrock).
- `scripts/deploy.sh` syncs `library/*.md` to the stack's docs bucket and runs a Bedrock Knowledge Base ingestion job. When `OCI_KB_ID` is set, `pipeline.gather_library` adds retrieved passages for the organization's top priorities, including any `EXTRA_DOCS` uploaded at deploy.

## Changing it safely

- Add a link only by adding a catalog entry with a stable `id`; never put raw URLs in the library for the model to copy.
- After editing the library, redeploy (or rerun the ingestion step) so the Knowledge Base matches the files.
