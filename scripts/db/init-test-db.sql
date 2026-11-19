-- Disposable database for tests that drop the schema (issue #1545).
SELECT 'CREATE DATABASE nexafx_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nexafx_test')\gexec
