-- Create service_price_history table for audit trail
CREATE TABLE IF NOT EXISTS service_price_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  old_price DECIMAL(10, 2),
  new_price DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  changed_by INT NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  effective_date DATE NOT NULL,
  ip_address VARCHAR(45),
  INDEX idx_service_id (service_id),
  INDEX idx_changed_at (changed_at),
  FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
