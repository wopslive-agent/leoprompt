-- Migration 0006: Calendar booking, follow-up sequences, WhatsApp multi-channel
-- Adds columns to accounts and conversations, and creates the followUpJobs table.

ALTER TABLE `accounts`
  ADD COLUMN `calendlyUrl` varchar(500) DEFAULT NULL,
  ADD COLUMN `whatsappPhoneNumber` varchar(20) DEFAULT NULL,
  ADD COLUMN `followUpEnabled` boolean NOT NULL DEFAULT false,
  ADD COLUMN `googleCalendarId` varchar(255) DEFAULT NULL,
  ADD COLUMN `googleCalendarAccessToken` text DEFAULT NULL,
  ADD COLUMN `googleCalendarRefreshToken` text DEFAULT NULL;

ALTER TABLE `conversations`
  ADD COLUMN `channel` enum('sms','whatsapp') NOT NULL DEFAULT 'sms';

CREATE TABLE `followUpJobs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `accountId` int NOT NULL,
  `conversationId` int NOT NULL,
  `customerPhone` varchar(20) NOT NULL,
  `channel` enum('sms','whatsapp') NOT NULL DEFAULT 'sms',
  `jobType` enum('no_reply_2h','no_reply_24h','appointment_reminder_24h','appointment_reminder_1h') NOT NULL,
  `scheduledAt` timestamp NOT NULL,
  `status` enum('pending','sent','cancelled') NOT NULL DEFAULT 'pending',
  `sentAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  INDEX `followUpJobs_accountId_idx` (`accountId`),
  INDEX `followUpJobs_scheduledAt_status_idx` (`scheduledAt`, `status`)
);
