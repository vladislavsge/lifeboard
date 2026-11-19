-- CreateTable
CREATE TABLE `WebauthnChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `handle` CHAR(43) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `challenge` VARCHAR(255) NOT NULL,
    `purpose` VARCHAR(20) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WebauthnChallenge_handle_key`(`handle`),
    INDEX `WebauthnChallenge_userId_idx`(`userId`),
    INDEX `WebauthnChallenge_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WebauthnChallenge` ADD CONSTRAINT `WebauthnChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
