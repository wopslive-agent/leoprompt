CREATE TABLE `smsMessageBatches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` int NOT NULL,
  `customerPhone` varchar(20) NOT NULL,
  `twilioPhoneNumber` varchar(20) NOT NULL,
  `messageSid` varchar(255),
  `body` text NOT NULL,
  `status` enum('pending','processing','processed') NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `smsMessageBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `smsMessageBatches_accountPhoneStatus_idx` ON `smsMessageBatches` (`accountId`,`customerPhone`,`status`);
