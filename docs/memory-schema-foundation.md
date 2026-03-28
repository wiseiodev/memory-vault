# Memory Schema Foundation

LAB-116 establishes the first canonical memory-domain schema for Memory Vault.

## Durable Truth

- `spaces` are the top-level personal containers owned by Better Auth users.
- `source_items`, `source_blobs`, and `segments` are the durable evidence layer.
- `memories` are derived records that can be superseded, invalidated, archived,
  or regenerated.
- `memory_citations` preserve provenance from a memory back to the evidence
  layer.

## Operational Tables

- `ingestion_jobs` track import, extraction, segmentation, embedding, sync, and
  evaluation work.
- `device_tokens` reserve schema space for extension handshakes and scoped
  device access.
- `connector_cursors` provide generic per-user/per-space sync state for future
  connectors.
- `evaluation_runs` and `evaluation_results` record memory-quality and
  retrieval-quality assessments without locking the app into a provider-specific
  design.

## Lifecycle Policy

- User-facing domain tables carry archive and soft-delete fields.
- Hard deletes should be intentional and rare.
- Broad destructive cascades are avoided for canonical user data; operational
  rows may cascade more freely where they are purely derivative.

## Retrieval Readiness

- `segments` and `memories` include nullable `vector(1536)` embedding columns.
- Full-text retrieval is expected to use expression indexes over durable text
  fields.
- Embedding generation and retrieval logic are explicitly out of scope for
  LAB-116; this ticket only makes the schema ready for them.
