package com.school.reservation.domain.settings;

import com.school.reservation.domain.settings.dto.response.PublicSettingsResponse;
import jakarta.persistence.EntityNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/settings")
public class PublicSettingsController {

    private final OperationSettingsRepository operationSettingsRepository;
    private final LogoStorageService logoStorageService;

    public PublicSettingsController(OperationSettingsRepository operationSettingsRepository, LogoStorageService logoStorageService) {
        this.operationSettingsRepository = operationSettingsRepository;
        this.logoStorageService = logoStorageService;
    }

    @GetMapping
    public PublicSettingsResponse getSettings() {
        OperationSettings settings = operationSettingsRepository.findById(OperationSettings.SINGLETON_ID)
            .orElseThrow(() -> new EntityNotFoundException("Operation settings not found."));
        return PublicSettingsResponse.from(settings);
    }

    @GetMapping("/logo/{fileName:.+}")
    public ResponseEntity<Resource> getLogo(@PathVariable String fileName) throws IOException {
        Resource resource = logoStorageService.load(fileName);
        String contentType = Files.probeContentType(resource.getFile().toPath());
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noCache())
            .header(HttpHeaders.CONTENT_TYPE, contentType == null ? "application/octet-stream" : contentType)
            .body(resource);
    }
}
