package com.school.reservation.domain.settings;

import com.school.reservation.domain.settings.dto.response.LogoCleanupResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "app.upload.logo-cleanup", name = "enabled", havingValue = "true", matchIfMissing = true)
public class LogoCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(LogoCleanupScheduler.class);

    private final SettingsService settingsService;

    public LogoCleanupScheduler(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @Scheduled(
        cron = "${app.upload.logo-cleanup.cron:0 0 4 * * *}",
        zone = "${app.upload.logo-cleanup.zone:Asia/Seoul}"
    )
    public void cleanupOrphanLogos() {
        log.info("Starting scheduled logo orphan cleanup.");
        try {
            LogoCleanupResponse result = settingsService.cleanupOrphanLogos();
            log.info(
                "Finished scheduled logo orphan cleanup. scanned={}, deleted={}, skippedReferenced={}, skippedRecent={}, failed={}",
                result.scanned(),
                result.deleted(),
                result.skippedReferenced(),
                result.skippedRecent(),
                result.failed()
            );
        } catch (RuntimeException exception) {
            log.warn("Scheduled logo orphan cleanup failed.", exception);
        }
    }
}
