CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`businessName` varchar(255) NOT NULL,
	`servicesOffered` text,
	`pricing` text,
	`availability` text,
	`aiPersona` text,
	`stripeCustomerId` varchar(255),
	`stripeSubscriptionId` varchar(255),
	`plan` enum('trial','starter','pro','agency') NOT NULL DEFAULT 'trial',
	`active` boolean NOT NULL DEFAULT true,
	`notificationEmail` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`customerPhone` varchar(20) NOT NULL,
	`status` enum('new','faq_only','collecting_details','qualified','handoff_needed','human_review','awaiting_manager','rejected','closed') NOT NULL DEFAULT 'new',
	`currentState` json,
	`riskFlags` text,
	`handoffReason` varchar(255),
	`rejectionReason` varchar(255),
	`shouldHandoff` boolean NOT NULL DEFAULT false,
	`shouldReject` boolean NOT NULL DEFAULT false,
	`lastUserMessageAt` timestamp,
	`lastAgentMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leadsLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`conversationId` int,
	`inboundMessageId` varchar(255),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`status` varchar(50) NOT NULL,
	`nextAction` varchar(255),
	`handoffReason` varchar(255),
	`rejectionReason` varchar(255),
	`missingFields` text,
	`riskFlags` text,
	`schemaValid` boolean NOT NULL DEFAULT true,
	`parseError` boolean NOT NULL DEFAULT false,
	`ownerAlertSent` boolean NOT NULL DEFAULT false,
	`managerAssigned` varchar(255),
	`managerTakeoverAt` timestamp,
	`replyText` text,
	`notesForManager` text,
	`extractedFields` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `leadsLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`body` text NOT NULL,
	`rawModelOutput` json,
	`schemaValid` boolean NOT NULL DEFAULT true,
	`parseError` boolean NOT NULL DEFAULT false,
	`nextAction` varchar(255),
	`missingFields` text,
	`extractedFields` json,
	`confidenceOverall` decimal(3,2),
	`notesForManager` text,
	`ownerAlertSent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('new_lead','booking_confirmed','system') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`leadId` int,
	`conversationId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `userId_idx` ON `accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `accountPhone_idx` ON `conversations` (`accountId`,`customerPhone`);--> statement-breakpoint
CREATE INDEX `leadsLog_accountId_idx` ON `leadsLog` (`accountId`);--> statement-breakpoint
CREATE INDEX `conversationId_idx` ON `messages` (`conversationId`);--> statement-breakpoint
CREATE INDEX `notifications_accountId_idx` ON `notifications` (`accountId`);--> statement-breakpoint
CREATE INDEX `notifications_userId_idx` ON `notifications` (`userId`);