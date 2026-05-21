package com.school.reservation.domain.reservation;

import com.school.reservation.domain.reservation.dto.request.CreatePublicReservationRequest;
import com.school.reservation.domain.reservation.dto.response.CreatePublicReservationResponse;
import com.school.reservation.domain.settings.OperationSettings;
import com.school.reservation.domain.settings.OperationSettingsRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/reservations")
public class PublicReservationController {

    private final ReservationService reservationService;
    private final OperationSettingsRepository operationSettingsRepository;

    public PublicReservationController(
        ReservationService reservationService,
        OperationSettingsRepository operationSettingsRepository
    ) {
        this.reservationService = reservationService;
        this.operationSettingsRepository = operationSettingsRepository;
    }

    @PostMapping
    public ResponseEntity<CreatePublicReservationResponse> create(
        @Valid @RequestBody CreatePublicReservationRequest request
    ) {
        Reservation reservation = reservationService.createPublicReservation(request.toCommand());
        OperationSettings settings = operationSettingsRepository.findById(OperationSettings.SINGLETON_ID)
            .orElseThrow(() -> new EntityNotFoundException("Operation settings not found."));

        return ResponseEntity
            .created(URI.create("/api/public/reservations/" + reservation.getId()))
            .body(CreatePublicReservationResponse.from(reservation, settings.getCompletionMessage()));
    }
}

