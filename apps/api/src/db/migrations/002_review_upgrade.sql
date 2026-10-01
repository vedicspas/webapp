-- Incremental upgrade for existing databases. Does NOT drop spas/users/bookings.
-- Safe to run once on a local/staging copy. Do not run on production until reviewed.
-- Deletes existing reviews (authorized for this upgrade) then recreates the review tables.

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS review_moderation_events, review_photos, review_responses, reviews;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE reviews (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  spa_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  rating DECIMAL(2,1) NOT NULL,
  rating_treatments DECIMAL(2,1) NULL,
  rating_practitioners DECIMAL(2,1) NULL,
  rating_staff DECIMAL(2,1) NULL,
  rating_food DECIMAL(2,1) NULL,
  rating_accommodations DECIMAL(2,1) NULL,
  rating_cleanliness DECIMAL(2,1) NULL,
  rating_location DECIMAL(2,1) NULL,
  rating_transport DECIMAL(2,1) NULL,
  rating_communication DECIMAL(2,1) NULL,
  rating_value DECIMAL(2,1) NULL,
  recommends TINYINT(1) NULL,
  confirmed_genuine TINYINT(1) NOT NULL DEFAULT 1,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  visited_on DATE NULL,
  status ENUM('published','hidden') NOT NULL DEFAULT 'published',
  moderated_at DATETIME NULL,
  moderated_by BIGINT UNSIGNED NULL,
  moderation_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_review_spa (spa_id, status, created_at),
  KEY idx_review_user (user_id),
  CONSTRAINT fk_review_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_review_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
  CONSTRAINT fk_review_moderator FOREIGN KEY (moderated_by) REFERENCES users(id),
  CONSTRAINT chk_rating CHECK (rating IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_treatments CHECK (rating_treatments IS NULL OR rating_treatments IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_practitioners CHECK (rating_practitioners IS NULL OR rating_practitioners IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_staff CHECK (rating_staff IS NULL OR rating_staff IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_food CHECK (rating_food IS NULL OR rating_food IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_accommodations CHECK (rating_accommodations IS NULL OR rating_accommodations IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_cleanliness CHECK (rating_cleanliness IS NULL OR rating_cleanliness IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_location CHECK (rating_location IS NULL OR rating_location IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_transport CHECK (rating_transport IS NULL OR rating_transport IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_communication CHECK (rating_communication IS NULL OR rating_communication IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
  CONSTRAINT chk_rating_value CHECK (rating_value IS NULL OR rating_value IN (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE review_responses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  review_id BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rr_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE review_photos (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  review_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(500) NOT NULL,
  alt VARCHAR(200) NOT NULL DEFAULT '',
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_rphoto_review (review_id, sort_order),
  CONSTRAINT fk_rphoto_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE review_moderation_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  review_id BIGINT UNSIGNED NOT NULL,
  admin_user_id BIGINT UNSIGNED NOT NULL,
  from_status ENUM('published','hidden') NULL,
  to_status ENUM('published','hidden') NOT NULL,
  reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rme_review (review_id, created_at),
  CONSTRAINT fk_rme_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_rme_admin FOREIGN KEY (admin_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
