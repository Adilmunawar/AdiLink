-- Make candidate_email nullable since email extraction may fail
ALTER TABLE candidate_matches ALTER COLUMN candidate_email DROP NOT NULL;