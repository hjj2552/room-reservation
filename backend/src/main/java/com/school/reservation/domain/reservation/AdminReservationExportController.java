package com.school.reservation.domain.reservation;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/exports")
public class AdminReservationExportController {

    private final CsvExportService csvExportService;

    public AdminReservationExportController(CsvExportService csvExportService) {
        this.csvExportService = csvExportService;
    }

    @GetMapping(value = "/reservations.csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<byte[]> exportReservations(
        @RequestParam(name = "from", required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        OffsetDateTime fromAt,
        @RequestParam(name = "to", required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        OffsetDateTime toAt,
        @RequestParam(required = false) UUID roomId,
        @RequestParam(required = false) Reservation.ReservationStatus status,
        @RequestParam(required = false) Reservation.ReservationSource source,
        @RequestParam(required = false) String keyword
    ) {
        byte[] csv = csvExportService.exportReservations(fromAt, toAt, roomId, status, source, keyword);
        return ResponseEntity.ok()
            .contentType(new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"reservations.csv\"")
            .body(csv);
    }
}
