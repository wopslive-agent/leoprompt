CREATE TABLE `aiPersonaVersions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` int NOT NULL,
  `userId` int NOT NULL,
  `aiPersona` text NOT NULL,
  `label` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aiPersonaVersions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `aiPersonaVersions_accountId_idx` ON `aiPersonaVersions` (`accountId`);
--> statement-breakpoint
CREATE TABLE `conversationFeedback` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` int NOT NULL,
  `conversationId` int NOT NULL,
  `rating` enum('works_well','needs_improvement','bug') NOT NULL,
  `comment` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `conversationFeedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `conversationFeedback_conversationId_idx` ON `conversationFeedback` (`conversationId`);
--> statement-breakpoint
CREATE TABLE `conversationTags` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` int NOT NULL,
  `conversationId` int NOT NULL,
  `tag` varchar(80) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `conversationTags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `conversationTags_conversationId_idx` ON `conversationTags` (`conversationId`);
