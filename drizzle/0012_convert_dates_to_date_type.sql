-- Migration: Convert start_date and end_date from timestamp to date
-- This removes the time component, keeping only the date

ALTER TABLE submissions 
ALTER COLUMN start_date TYPE date USING start_date::date;

ALTER TABLE submissions 
ALTER COLUMN end_date TYPE date USING end_date::date;
