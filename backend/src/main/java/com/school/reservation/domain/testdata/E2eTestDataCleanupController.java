package com.school.reservation.domain.testdata;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!prod")
@ConditionalOnProperty(prefix = "app.e2e-cleanup", name = "enabled", havingValue = "true")
@RequestMapping("/api/admin/test-data/e2e")
public class E2eTestDataCleanupController {

    private final E2eTestDataCleanupService cleanupService;

    public E2eTestDataCleanupController(E2eTestDataCleanupService cleanupService) {
        this.cleanupService = cleanupService;
    }

    @DeleteMapping
    public E2eTestDataCleanupResponse cleanup(
        @RequestParam(defaultValue = "testing-") String prefix
    ) {
        return cleanupService.cleanup(prefix, false);
    }

    @GetMapping("/preview")
    public E2eTestDataCleanupResponse preview(
        @RequestParam(defaultValue = "testing-") String prefix
    ) {
        return cleanupService.cleanup(prefix, true);
    }
}
