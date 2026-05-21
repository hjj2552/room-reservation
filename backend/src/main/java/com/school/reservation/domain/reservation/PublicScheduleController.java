package com.school.reservation.domain.reservation;

import com.school.reservation.domain.reservation.dto.response.PublicRoomWeeklyReservationsResponse;
import com.school.reservation.domain.reservation.dto.response.ReservationAvailabilityResponse;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public")
public class PublicScheduleController {

    private final PublicScheduleQueryService publicScheduleQueryService;

    public PublicScheduleController(PublicScheduleQueryService publicScheduleQueryService) {
        this.publicScheduleQueryService = publicScheduleQueryService;
    }

    @GetMapping("/rooms/{roomId}/weekly-reservations")
    public PublicRoomWeeklyReservationsResponse getWeeklyReservations(
        @PathVariable UUID roomId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart
    ) {
        return publicScheduleQueryService.getWeeklyReservations(roomId, weekStart);
    }

    @GetMapping("/availability")
    public ReservationAvailabilityResponse checkAvailability(
        @RequestParam UUID roomId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime startAt,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime endAt
    ) {
        return publicScheduleQueryService.checkAvailability(roomId, startAt, endAt);
    }
}

