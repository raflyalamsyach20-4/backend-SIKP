-- Create response_letter_status enum
CREATE TYPE IF NOT EXISTS "response_letter_status" AS ENUM('pending', 'submitted', 'verified');
