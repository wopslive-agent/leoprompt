ALTER TABLE `accounts` ADD `twilioPhoneNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `accounts` ADD `onboardingComplete` boolean NOT NULL DEFAULT false;