package com.school.reservation.domain.reservation.dto.response;

import com.school.reservation.domain.reservation.Reservation;
import java.time.OffsetDateTime;
import java.util.UUID;

public record PublicReservationDetailResponse(
    UUID id,
    RoomSummary room,
    String applicantName,
    String applicantEmail,
    String applicantPhone,
    String purpose,
    OffsetDateTime startAt,
    OffsetDateTime endAt,
    Reservation.ReservationStatus status,
    boolean cancellable
) {
    public static PublicReservationDetailResponse from(Reservation reservation) {
        return new PublicReservationDetailResponse(
            reservation.getId(),
            RoomSummary.from(reservation),
            maskName(reservation.getApplicantName()),
            maskEmail(reservation.getApplicantEmail()),
            maskPhone(reservation.getApplicantPhone()),
            reservation.getPurpose(),
            reservation.getStartAt(),
            reservation.getEndAt(),
            reservation.getStatus(),
            reservation.getStatus() != Reservation.ReservationStatus.CANCELLED
        );
    }

    private static String maskName(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }

        String[] chars = value.codePoints()
            .mapToObj(Character::toString)
            .toArray(String[]::new);
        if (chars.length == 1) {
            return "*";
        }
        if (chars.length == 2) {
            return chars[0] + "*";
        }
        return chars[0] + "*" + chars[chars.length - 1];
    }

    private static String maskEmail(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }

        int atIndex = value.indexOf('@');
        if (atIndex <= 0) {
            return maskName(value);
        }

        String localPart = value.substring(0, atIndex);
        String domain = value.substring(atIndex);
        if (localPart.length() == 1) {
            return "*" + domain;
        }
        return localPart.substring(0, Math.min(2, localPart.length()))
            + "*".repeat(Math.max(1, localPart.length() - 2))
            + domain;
    }

    private static String maskPhone(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }

        String digits = value.replaceAll("\\D", "");
        if (digits.length() <= 1) {
            return "*";
        }
        if (digits.length() <= 5) {
            return digits.charAt(0)
                + "*".repeat(Math.max(1, digits.length() - 2))
                + digits.charAt(digits.length() - 1);
        }
        return digits.substring(0, 4)
            + "*".repeat(digits.length() - 5)
            + digits.charAt(digits.length() - 1);
    }

    public record RoomSummary(UUID id, String name, String location) {
        static RoomSummary from(Reservation reservation) {
            return new RoomSummary(
                reservation.getRoom().getId(),
                reservation.getDisplayRoomName(),
                reservation.getRoom().getLocation()
            );
        }
    }
}
