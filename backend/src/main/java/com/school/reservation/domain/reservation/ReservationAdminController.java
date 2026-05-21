package com.school.reservation.domain.reservation;

import com.school.reservation.domain.reservation.dto.request.ReservationActionRequest;
import com.school.reservation.domain.reservation.dto.request.CreateAdminReservationRequest;
import com.school.reservation.domain.reservation.dto.request.UpdateReservationRequest;
import com.school.reservation.domain.reservation.dto.response.AdminReservationDetailResponse;
import com.school.reservation.domain.reservation.dto.response.AdminReservationListItemResponse;
import com.school.reservation.domain.reservation.dto.response.ReservationHistoryResponse;
import com.school.reservation.global.dto.PagedResponse;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.net.URI;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/reservations")
public class ReservationAdminController {

    private final ReservationService reservationService;
    private final AuditQueryService auditQueryService;

    public ReservationAdminController(ReservationService reservationService, AuditQueryService auditQueryService) {
        this.reservationService = reservationService;
        this.auditQueryService = auditQueryService;
    }

    @GetMapping
    public PagedResponse<AdminReservationListItemResponse> getReservations(
        @RequestParam(name = "from", required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        OffsetDateTime fromAt,
        @RequestParam(name = "to", required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        OffsetDateTime toAt,
        @RequestParam(required = false) UUID roomId,
        @RequestParam(required = false) Reservation.ReservationStatus status,
        @RequestParam(required = false) Reservation.ReservationSource source,
        @RequestParam(required = false) String keyword,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "startAt"));
        return PagedResponse.from(reservationService
            .searchAdminReservations(fromAt, toAt, roomId, status, source, keyword, pageable)
            .map(AdminReservationListItemResponse::from));
    }

    @PostMapping
    public ResponseEntity<AdminReservationDetailResponse> create(
        @Valid @RequestBody CreateAdminReservationRequest request,
        Authentication authentication
    ) {
        Reservation reservation = reservationService.createAdminReservation(
            request.toCommand(),
            authentication.getName(),
            request.memo()
        );
        return ResponseEntity.created(URI.create("/api/admin/reservations/" + reservation.getId()))
            .body(AdminReservationDetailResponse.from(reservation));
    }

    @GetMapping("/{reservationId}")
    public AdminReservationDetailResponse getDetail(@PathVariable UUID reservationId) {
        return AdminReservationDetailResponse.from(reservationService.getReservationOrThrow(reservationId));
    }

    @PutMapping("/{reservationId}")
    public AdminReservationDetailResponse update(
        @PathVariable UUID reservationId,
        @Valid @RequestBody UpdateReservationRequest request,
        Authentication authentication
    ) {
        return AdminReservationDetailResponse.from(reservationService.updateReservation(
            reservationId,
            request.toCommand(),
            authentication.getName(),
            request.memo()
        ));
    }

    @PostMapping("/{reservationId}/approve")
    public ResponseEntity<AdminReservationListItemResponse> approve(
        @PathVariable UUID reservationId,
        @Valid @RequestBody(required = false) ReservationActionRequest request,
        Authentication authentication
    ) {
        String memo = request == null ? null : request.memo();
        Reservation reservation = reservationService.approve(reservationId, authentication.getName(), memo);
        return ResponseEntity.ok(AdminReservationListItemResponse.from(reservation));
    }

    @PostMapping("/{reservationId}/cancel")
    public ResponseEntity<AdminReservationListItemResponse> cancel(
        @PathVariable UUID reservationId,
        @Valid @RequestBody(required = false) ReservationActionRequest request,
        Authentication authentication
    ) {
        String memo = request == null ? null : request.memo();
        Reservation reservation = reservationService.cancel(reservationId, authentication.getName(), memo);
        return ResponseEntity.ok(AdminReservationListItemResponse.from(reservation));
    }

    @GetMapping("/{reservationId}/histories")
    public java.util.List<ReservationHistoryResponse> getHistories(@PathVariable UUID reservationId) {
        return auditQueryService.getReservationHistories(reservationId).stream()
            .map(ReservationHistoryResponse::from)
            .toList();
    }
}
