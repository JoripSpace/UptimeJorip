ALTER TABLE admin_users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 20000;

CREATE TRIGGER IF NOT EXISTS trg_admin_password_legacy_iterations
AFTER UPDATE OF password_hash ON admin_users
WHEN NEW.password_iterations = OLD.password_iterations
BEGIN
  UPDATE admin_users SET password_iterations = 20000 WHERE id = NEW.id;
END;
