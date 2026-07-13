package com.school.reservation.domain.reservation;

import com.school.reservation.domain.reservation.dto.response.ReservationHistoryResponse;
import com.school.reservation.global.dto.PagedResponse;
import com.school.reservation.global.pagination.AdminPageRequestFactory;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/audit")
public class AdminAuditController {

    private final AuditQueryService auditQueryService;

    public AdminAuditController(AuditQueryService auditQueryService) {
        this.auditQueryService = auditQueryService;
    }

    @GetMapping("/reservation-histories")
    public PagedResponse<ReservationHistoryResponse> getReservationHistories(
        @RequestParam(required = false) UUID reservationId,
        @RequestParam(required = false) UUID roomId,
        @RequestParam(required = false) ReservationHistory.Action action,
        @RequestParam(name = "from", required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        OffsetDateTime fromAt,
        @RequestParam(name = "to", required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        OffsetDateTime toAt,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return PagedResponse.from(auditQueryService
            .searchHistories(
                reservationId,
                roomId,
                action,
                fromAt,
                toAt,
                AdminPageRequestFactory.create(page, size, Sort.by(Sort.Direction.DESC, "createdAt"))
            )
            .map(ReservationHistoryResponse::from));
    }
}
