-- Update payments table to support fixed service pricing
ALTER TABLE payments 
ADD COLUMN service_id INT NULL AFTER driver_id,
ADD COLUMN official_price_at_payment DECIMAL(10, 2) NULL AFTER amount,
ADD COLUMN receipt_number VARCHAR(50) NULL AFTER transaction_reference,
ADD COLUMN cashier_id INT NULL AFTER payment_method,
ADD COLUMN paid_at TIMESTAMP NULL AFTER payment_date,
ADD INDEX idx_service_id (service_id),
ADD INDEX idx_receipt_number (receipt_number),
ADD INDEX idx_cashier_id (cashier_id),
ADD UNIQUE KEY uniq_receipt_number (receipt_number),
ADD FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE SET NULL,
ADD FOREIGN KEY (cashier_id) REFERENCES users(user_id) ON DELETE SET NULL;
