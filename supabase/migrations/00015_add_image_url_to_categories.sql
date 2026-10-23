-- Migration 00015: Add image_url to categories table
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;
