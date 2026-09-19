CREATE TABLE claims (
  id TEXT PRIMARY KEY NOT NULL,
  original_input TEXT NOT NULL,
  normalized_claim TEXT NOT NULL,
  search_terms TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  url TEXT NOT NULL,
  title TEXT,
  source TEXT NOT NULL,
  published_at TEXT,
  retrieved_at TEXT NOT NULL,
  content TEXT,
  is_primary_source BOOLEAN NOT NULL DEFAULT FALSE,
  origin TEXT NOT NULL,
  user_state TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE evidence_chunks (
  id TEXT PRIMARY KEY NOT NULL,
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE evidence_judgements (
  id TEXT PRIMARY KEY NOT NULL,
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  chunk_id TEXT REFERENCES evidence_chunks(id),
  relevance_noul DOUBLE PRECISION NOT NULL,
  stance TEXT NOT NULL,
  stance_probabilities TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  model_version TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  is_representative BOOLEAN NOT NULL DEFAULT FALSE,
  judged_at TEXT NOT NULL
);

CREATE TABLE quality_checks (
  evidence_id TEXT PRIMARY KEY NOT NULL REFERENCES evidence(id),
  accessible BOOLEAN NOT NULL,
  official_source BOOLEAN NOT NULL,
  date_match TEXT NOT NULL,
  duplicate_of TEXT REFERENCES evidence(id),
  excluded_reason TEXT
);

CREATE TABLE investigation_branches (
  id TEXT PRIMARY KEY NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  parent_evidence_id TEXT REFERENCES evidence(id),
  branch_type TEXT NOT NULL,
  search_terms_used TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE verdicts (
  id TEXT PRIMARY KEY NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  result TEXT NOT NULL,
  supporting_count INTEGER NOT NULL,
  contradicting_count INTEGER NOT NULL,
  primary_source_count INTEGER NOT NULL,
  evidence_sufficient BOOLEAN NOT NULL,
  computed_at TEXT NOT NULL
);

CREATE INDEX idx_evidence_claim_id ON evidence(claim_id);
CREATE INDEX idx_evidence_chunks_evidence_id ON evidence_chunks(evidence_id);
CREATE INDEX idx_evidence_judgements_evidence_id ON evidence_judgements(evidence_id);
CREATE INDEX idx_investigation_branches_claim_id ON investigation_branches(claim_id);
CREATE INDEX idx_verdicts_claim_id ON verdicts(claim_id);
