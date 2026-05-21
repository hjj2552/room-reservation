package com.school.reservation.domain.settings;

import com.school.reservation.domain.settings.dto.request.UpdateOperationSettingsRequest;
import com.school.reservation.domain.settings.dto.response.OperationSettingsResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/settings")
public class AdminSettingsController {

    private final SettingsService settingsService;

    public AdminSettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    public OperationSettingsResponse getSettings() {
        return OperationSettingsResponse.from(settingsService.getSettings());
    }

    @PutMapping
    public OperationSettingsResponse updateSettings(@Valid @RequestBody UpdateOperationSettingsRequest request) {
        return OperationSettingsResponse.from(settingsService.update(request, null));
    }
}

