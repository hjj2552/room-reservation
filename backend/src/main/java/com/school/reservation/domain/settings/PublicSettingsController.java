package com.school.reservation.domain.settings;

import com.school.reservation.domain.settings.dto.response.PublicSettingsResponse;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/settings")
public class PublicSettingsController {

    private final OperationSettingsRepository operationSettingsRepository;

    public PublicSettingsController(OperationSettingsRepository operationSettingsRepository) {
        this.operationSettingsRepository = operationSettingsRepository;
    }

    @GetMapping
    public PublicSettingsResponse getSettings() {
        OperationSettings settings = operationSettingsRepository.findById(OperationSettings.SINGLETON_ID)
            .orElseThrow(() -> new EntityNotFoundException("Operation settings not found."));
        return PublicSettingsResponse.from(settings);
    }
}

