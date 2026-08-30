-- Run this file as a PostgreSQL administrator, then set the same values in .env.
-- Replace the placeholder password before executing.
CREATE ROLE intertext LOGIN PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE intertext OWNER intertext;
\connect intertext
GRANT ALL ON SCHEMA public TO intertext;
