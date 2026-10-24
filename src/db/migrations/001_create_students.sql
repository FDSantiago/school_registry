-- The only table. CHECK constraints repeat the API's validation so bad data cannot get in any other way.
-- Must run on both MySQL 8.4 and MariaDB 11 (tested on 11.8) (e.g. REGEXP operator, not MySQL-only REGEXP_LIKE()).
CREATE TABLE students (
  student_id  CHAR(10)     NOT NULL,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  course      VARCHAR(20)  NOT NULL,
  year_level  TINYINT      NOT NULL,
  section     VARCHAR(20)  NOT NULL,
  status      ENUM('Active', 'Inactive', 'Graduated') NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (student_id),
  INDEX idx_students_section (section),
  CONSTRAINT chk_students_id_format CHECK (student_id REGEXP '^[0-9]{4}-[0-9]{5}$'),
  CONSTRAINT chk_students_year_level CHECK (year_level BETWEEN 1 AND 5)
);
