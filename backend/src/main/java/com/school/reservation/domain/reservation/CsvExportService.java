package com.school.reservation.domain.reservation;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CsvExportService {

    private static final ZoneId EXPORT_ZONE = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ReservationRepository reservationRepository;
    private final ReservationService reservationService;

    public CsvExportService(ReservationRepository reservationRepository, ReservationService reservationService) {
        this.reservationRepository = reservationRepository;
        this.reservationService = reservationService;
    }

    @Transactional(readOnly = true)
    public byte[] exportReservations(
        OffsetDateTime fromAt,
        OffsetDateTime toAt,
        UUID roomId,
        Reservation.ReservationStatus status,
        Reservation.ReservationSource source,
        String keyword
    ) {
        String normalizedKeyword = keyword == null || keyword.isBlank() ? "" : keyword.trim();
        List<Reservation> reservations = reservationRepository.findAll(
            reservationService.adminReservationSpec(fromAt, toAt, roomId, status, source, normalizedKeyword),
            Sort.by(Sort.Direction.ASC, "startAt")
        );

        StringBuilder builder = new StringBuilder();
        builder.append('\uFEFF');
        builder.append("reservationId,roomName,applicantName,applicantEmail,applicantPhone,purpose,startAt,endAt,status,source,recurrenceId,createdAt\n");
        for (Reservation reservation : reservations) {
            appendRow(builder, reservation);
        }
        return builder.toString().getBytes(StandardCharsets.UTF_8);
    }

    private void appendRow(StringBuilder builder, Reservation reservation) {
        builder
            .append(csv(reservation.getId()))
            .append(',')
            .append(csv(reservation.getRoom().getName()))
            .append(',')
            .append(csv(reservation.getApplicantName()))
            .append(',')
            .append(csv(reservation.getApplicantEmail()))
            .append(',')
            .append(csv(reservation.getApplicantPhone()))
            .append(',')
            .append(csv(reservation.getPurpose()))
            .append(',')
            .append(csv(format(reservation.getStartAt())))
            .append(',')
            .append(csv(format(reservation.getEndAt())))
            .append(',')
            .append(csv(reservation.getStatus()))
            .append(',')
            .append(csv(reservation.getSource()))
            .append(',')
            .append(csv(reservation.getRecurrenceId()))
            .append(',')
            .append(csv(format(reservation.getCreatedAt())))
            .append('\n');
    }

    private String format(OffsetDateTime dateTime) {
        if (dateTime == null) {
            return "";
        }
        return dateTime.atZoneSameInstant(EXPORT_ZONE).format(DATE_TIME_FORMATTER);
    }

    private String csv(Object value) {
        if (value == null) {
            return "";
        }
        String text = String.valueOf(value);
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }
}
