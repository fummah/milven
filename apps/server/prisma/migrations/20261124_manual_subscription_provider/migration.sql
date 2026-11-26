-- Add an explicit provider for administrator-granted course access without payment.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'MANUAL';
