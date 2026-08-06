-- Vedic Spas - fully normalized MariaDB schema.
-- Lookup tables at the top are static: they are loaded into in-memory arrays
-- by the API at startup (see src/cache/staticCache.ts).

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS payment_events, wishlist_items, answers, questions,
  review_responses, reviews, bookings, retreat_slots, treatments,
  spa_closures, spa_open_hours, spa_photos, spa_amenities, spas, vendors,
  users, booking_statuses, payment_modes, treatment_categories, amenities,
  cities, countries, currencies, roles;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Static lookup tables (cached in memory at startup)
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(16) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE currencies (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code CHAR(3) NOT NULL UNIQUE,
  symbol VARCHAR(4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE countries (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  iso2 CHAR(2) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cities (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  country_id SMALLINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  UNIQUE KEY uq_city (country_id, name),
  CONSTRAINT fk_city_country FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE amenities (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE,
  icon VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE treatment_categories (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payment_modes (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE booking_statuses (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Users and vendors
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id TINYINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL, -- NULL for OAuth-only accounts
  name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  avatar_url VARCHAR(500) NULL,
  bio TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vendors (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  business_name VARCHAR(160) NOT NULL,
  -- New vendors require admin approval before they can publish listings.
  status ENUM('pending','approved','suspended') NOT NULL DEFAULT 'pending',
  stripe_account_id VARCHAR(64) NULL,
  stripe_onboarded TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Spas
-- ---------------------------------------------------------------------------

CREATE TABLE spas (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  vendor_id BIGINT UNSIGNED NOT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  short_description VARCHAR(300) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  address_line VARCHAR(255) NOT NULL,
  postal_code VARCHAR(20) NOT NULL DEFAULT '',
  city_id INT UNSIGNED NOT NULL,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(255) NULL,
  website VARCHAR(500) NULL,
  shopify_collection_handle VARCHAR(160) NULL,
  payment_mode_id TINYINT UNSIGNED NOT NULL,
  deposit_bps SMALLINT UNSIGNED NULL,      -- only for payment mode 'deposit' (e.g. 2000 = 20%)
  booking_fee_minor INT UNSIGNED NULL,     -- only for payment mode 'booking_fee'
  currency_id TINYINT UNSIGNED NOT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_spa_city (city_id),
  KEY idx_spa_geo (lat, lng),
  CONSTRAINT fk_spa_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_spa_city FOREIGN KEY (city_id) REFERENCES cities(id),
  CONSTRAINT fk_spa_payment_mode FOREIGN KEY (payment_mode_id) REFERENCES payment_modes(id),
  CONSTRAINT fk_spa_currency FOREIGN KEY (currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE spa_amenities (
  spa_id BIGINT UNSIGNED NOT NULL,
  amenity_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (spa_id, amenity_id),
  CONSTRAINT fk_sa_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_amenity FOREIGN KEY (amenity_id) REFERENCES amenities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE spa_photos (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  spa_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(500) NOT NULL,
  alt VARCHAR(200) NOT NULL DEFAULT '',
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_photo_spa (spa_id, sort_order),
  CONSTRAINT fk_photo_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE spa_open_hours (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  spa_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL, -- 0 = Sunday ... 6 = Saturday
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  UNIQUE KEY uq_hours (spa_id, weekday),
  CONSTRAINT fk_hours_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE spa_closures (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  spa_id BIGINT UNSIGNED NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  reason VARCHAR(200) NOT NULL DEFAULT '',
  KEY idx_closure_spa (spa_id, date_from, date_to),
  CONSTRAINT fk_closure_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Treatments (time-slot sessions and multi-day retreats)
-- ---------------------------------------------------------------------------

CREATE TABLE treatments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  spa_id BIGINT UNSIGNED NOT NULL,
  category_id SMALLINT UNSIGNED NOT NULL,
  kind ENUM('session','retreat') NOT NULL DEFAULT 'session',
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  duration_minutes SMALLINT UNSIGNED NULL, -- sessions only
  nights TINYINT UNSIGNED NULL,            -- retreats only
  price_minor INT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_treatment_spa (spa_id),
  CONSTRAINT fk_treatment_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
  CONSTRAINT fk_treatment_category FOREIGN KEY (category_id) REFERENCES treatment_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE retreat_slots (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  treatment_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  capacity SMALLINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_retreat_slot (treatment_id, start_date),
  CONSTRAINT fk_rslot_treatment FOREIGN KEY (treatment_id) REFERENCES treatments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Bookings and payments
-- ---------------------------------------------------------------------------

CREATE TABLE bookings (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code CHAR(10) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  spa_id BIGINT UNSIGNED NOT NULL,
  treatment_id BIGINT UNSIGNED NOT NULL,
  status_id TINYINT UNSIGNED NOT NULL,
  payment_mode_id TINYINT UNSIGNED NOT NULL, -- snapshot of the spa's mode at booking time
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  party_size TINYINT UNSIGNED NOT NULL DEFAULT 1,
  total_minor INT UNSIGNED NOT NULL,
  paid_minor INT UNSIGNED NOT NULL DEFAULT 0,
  platform_fee_minor INT UNSIGNED NOT NULL DEFAULT 0,
  currency_id TINYINT UNSIGNED NOT NULL,
  stripe_payment_intent_id VARCHAR(64) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_booking_user (user_id),
  KEY idx_booking_spa_time (spa_id, starts_at, ends_at),
  CONSTRAINT fk_booking_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_booking_spa FOREIGN KEY (spa_id) REFERENCES spas(id),
  CONSTRAINT fk_booking_treatment FOREIGN KEY (treatment_id) REFERENCES treatments(id),
  CONSTRAINT fk_booking_status FOREIGN KEY (status_id) REFERENCES booking_statuses(id),
  CONSTRAINT fk_booking_payment_mode FOREIGN KEY (payment_mode_id) REFERENCES payment_modes(id),
  CONSTRAINT fk_booking_currency FOREIGN KEY (currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payment_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  stripe_event_id VARCHAR(64) NOT NULL UNIQUE,
  type VARCHAR(64) NOT NULL,
  amount_minor INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pe_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Reviews, Q&A, wishlists
-- ---------------------------------------------------------------------------

CREATE TABLE reviews (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  spa_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL, -- 1..5
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  visited_on DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_review_spa (spa_id, created_at),
  KEY idx_review_user (user_id),
  CONSTRAINT fk_review_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_review_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE review_responses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  review_id BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL, -- the vendor user replying
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rr_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE questions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  spa_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_question_spa (spa_id, created_at),
  CONSTRAINT fk_q_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
  CONSTRAINT fk_q_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE answers (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  is_vendor TINYINT(1) NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_a_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_a_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE wishlist_items (
  user_id BIGINT UNSIGNED NOT NULL,
  spa_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, spa_id),
  CONSTRAINT fk_wl_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_wl_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
