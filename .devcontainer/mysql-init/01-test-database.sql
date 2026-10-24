-- Runs once, on the first start of an empty MySQL volume.
-- A separate database for the test suite so tests never touch the dev data.
CREATE DATABASE IF NOT EXISTS school_registry_test;
GRANT ALL PRIVILEGES ON school_registry_test.* TO 'registry'@'%';
FLUSH PRIVILEGES;
