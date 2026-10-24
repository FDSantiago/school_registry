-- The only table. CHECK constraints repeat the API's validation so bad data cannot get in any other way.
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
  CONSTRAINT chk_students_id_format CHECK (REGEXP_LIKE(student_id, '^[0-9]{4}-[0-9]{5}$', 'c')),
  CONSTRAINT chk_students_year_level CHECK (year_level BETWEEN 1 AND 5)
);
