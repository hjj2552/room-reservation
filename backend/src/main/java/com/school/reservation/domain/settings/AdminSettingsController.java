package com.school.reservation.domain.settings;

import com.school.reservation.domain.settings.dto.request.UpdateOperationSettingsRequest;
import com.school.reservation.domain.settings.dto.response.LogoCleanupResponse;
import com.school.reservation.domain.settings.dto.response.LogoUploadResponse;
import com.school.reservation.domain.settings.dto.response.OperationSettingsResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin/settings")
public class AdminSettingsController {

    private final SettingsService settingsService;
    private final LogoStorageService logoStorageService;

    public AdminSettingsController(SettingsService settingsService, LogoStorageService logoStorageService) {
        this.settingsService = settingsService;
        this.logoStorageService = logoStorageService;
    }

    @GetMapping
    public OperationSettingsResponse getSettings() {
        return OperationSettingsResponse.from(settingsService.getSettings());
    }

    @PutMapping
    public OperationSettingsResponse updateSettings(@Valid @RequestBody UpdateOperationSettingsRequest request) {
        return OperationSettingsResponse.from(settingsService.update(request, null));
    }

    @PostMapping("/logo")
    public LogoUploadResponse uploadLogo(@RequestParam("file") MultipartFile file) {
        return logoStorageService.store(file);
    }

    @PostMapping("/logo/cleanup")
    public LogoCleanupResponse cleanupLogos() {
        return settingsService.cleanupOrphanLogos();
    }
}
