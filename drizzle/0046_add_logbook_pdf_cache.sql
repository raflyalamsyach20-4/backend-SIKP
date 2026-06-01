ALTER TABLE internships ADD COLUMN logbook_pdf_url text;
ALTER TABLE internships ADD COLUMN logbook_pdf_key text;
ALTER TABLE internships ADD COLUMN logbook_pdf_generated_at timestamp;
ALTER TABLE internships ADD COLUMN logbook_pdf_version integer DEFAULT 1;
