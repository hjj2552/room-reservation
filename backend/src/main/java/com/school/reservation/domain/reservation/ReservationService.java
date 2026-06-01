package com.school.reservation.domain.reservation;

import com.school.reservation.domain.room.Room;
import com.school.reservation.domain.room.RoomRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class ReservationService {

    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;
    private final ReservationHistoryRepository historyRepository;
    private final ReservationPolicyService policyService;
    private final ReservationConflictService conflictService;
    private final PasswordEncoder passwordEncoder;

    public ReservationService(
        RoomRepository roomRepository,
        ReservationRepository reservationRepository,
        ReservationHistoryRepository historyRepository,
        ReservationPolicyService policyService,
        ReservationConflictService conflictService,
        PasswordEncoder passwordEncoder
    ) {
        this.roomRepository = roomRepository;
        this.reservationRepository = reservationRepository;
        this.historyRepository = historyRepository;
        this.policyService = policyService;
        this.conflictService = conflictService;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public Reservation createPublicReservation(@Valid CreateReservationCommand command, String cancelPassword) {
        return createReservation(
            command,
            Reservation.ActorType.PUBLIC_USER,
            command.applicantEmail(),
            ReservationHistory.Action.CREATED,
            null,
            null,
            passwordEncoder.encode(cancelPassword)
        );
    }

    @Transactional
    public Reservation createAdminReservation(@Valid CreateReservationCommand command, String adminId, String memo) {
        return createReservation(command, Reservation.ActorType.ADMIN, adminId, ReservationHistory.Action.CREATED_BY_ADMIN, memo, null, null);
    }

    @Transactional
    public Reservation createRecurringReservation(@Valid CreateReservationCommand command, String adminId, UUID recurrenceId) {
        return createReservation(command, Reservation.ActorType.ADMIN, adminId, ReservationHistory.Action.RECURRENCE_GENERATED, null, recurrenceId, null);
    }

    private Reservation createReservation(
        CreateReservationCommand command,
        Reservation.ActorType actorType,
        String actorId,
        ReservationHistory.Action historyAction,
        String memo,
        UUID recurrenceId,
        String cancelPasswordHash
    ) {
        Room room = roomRepository.findByIdAndDeletedAtIsNull(command.roomId())
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));

        policyService.validate(room, command.startAt(), command.endAt(), command.applicantPhone());
        conflictService.validateNoConflict(command.roomId(), command.startAt(), command.endAt(), null);

        Reservation reservation = new Reservation(
            room,
            command.applicantName(),
            command.applicantEmail(),
            command.applicantPhone(),
            command.purpose(),
            command.startAt(),
            command.endAt(),
            command.status(),
            command.source(),
            actorType,
            actorId
        );
        if (recurrenceId != null) {
            reservation.attachRecurrence(recurrenceId);
        }
        if (cancelPasswordHash != null) {
            reservation.setCancelPasswordHash(cancelPasswordHash);
        }

        try {
            Reservation saved = reservationRepository.saveAndFlush(reservation);
            historyRepository.save(new ReservationHistory(
                saved,
                historyAction,
                null,
                saved.getStatus(),
                memo,
                actorType,
                actorId
            ));
            return saved;
        } catch (DataIntegrityViolationException exception) {
            throw new ReservationConflictService.TimeSlotConflictException(
                command.roomId(),
                command.startAt(),
                command.endAt()
            );
        }
    }

    @Transactional
    public Reservation updateReservation(UUID reservationId, @Valid UpdateReservationCommand command, String adminId, String memo) {
        Reservation reservation = getReservationOrThrow(reservationId);

        Room room = roomRepository.findByIdAndDeletedAtIsNull(command.roomId())
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        policyService.validate(room, command.startAt(), command.endAt(), command.applicantPhone());
        conflictService.validateNoConflict(command.roomId(), command.startAt(), command.endAt(), reservationId);

        Reservation.ReservationStatus beforeStatus = reservation.getStatus();
        ReservationHistory.Snapshot beforeSnapshot = ReservationHistory.Snapshot.from(reservation);
        try {
            reservation.update(
                room,
                command.applicantName(),
                command.applicantEmail(),
                command.applicantPhone(),
                command.purpose(),
                command.startAt(),
                command.endAt(),
                command.status(),
                Reservation.ActorType.ADMIN,
                adminId
            );
            historyRepository.save(ReservationHistory.updated(
                reservation,
                beforeStatus,
                memo,
                Reservation.ActorType.ADMIN,
                adminId,
                beforeSnapshot
            ));
            reservationRepository.flush();
            return reservation;
        } catch (DataIntegrityViolationException exception) {
            throw new ReservationConflictService.TimeSlotConflictException(
                command.roomId(),
                command.startAt(),
                command.endAt()
            );
        }
    }

    @Transactional
    public Reservation approve(UUID reservationId, String adminId, String memo) {
        Reservation reservation = getReservationOrThrow(reservationId);
        Reservation.ReservationStatus beforeStatus = reservation.getStatus();
        conflictService.validateNoConflict(
            reservation.getRoom().getId(),
            reservation.getStartAt(),
            reservation.getEndAt(),
            reservation.getId()
        );
        reservation.approve(Reservation.ActorType.ADMIN, adminId);
        historyRepository.save(new ReservationHistory(
            reservation,
            ReservationHistory.Action.APPROVED,
            beforeStatus,
            reservation.getStatus(),
            memo,
            Reservation.ActorType.ADMIN,
            adminId
        ));
        reservationRepository.flush();
        return reservation;
    }

    @Transactional
    public Reservation cancel(UUID reservationId, String adminId, String memo) {
        Reservation reservation = getReservationOrThrow(reservationId);
        Reservation.ReservationStatus beforeStatus = reservation.getStatus();
        reservation.cancel(Reservation.ActorType.ADMIN, adminId);
        historyRepository.save(new ReservationHistory(
            reservation,
            ReservationHistory.Action.CANCELLED,
            beforeStatus,
            reservation.getStatus(),
            memo,
            Reservation.ActorType.ADMIN,
            adminId
        ));
        reservationRepository.flush();
        return reservation;
    }

    @Transactional
    public Reservation cancelPublicReservation(UUID reservationId, String cancelPassword) {
        Reservation reservation = getReservationOrThrow(reservationId);
        if (reservation.getStatus() == Reservation.ReservationStatus.CANCELLED) {
            throw new IllegalArgumentException("Cancelled reservations cannot be cancelled again.");
        }
        if (reservation.getCancelPasswordHash() == null
            || !passwordEncoder.matches(cancelPassword, reservation.getCancelPasswordHash())) {
            throw new PublicCancelPasswordMismatchException();
        }

        Reservation.ReservationStatus beforeStatus = reservation.getStatus();
        reservation.cancel(Reservation.ActorType.PUBLIC_USER, reservation.getApplicantEmail());
        historyRepository.save(new ReservationHistory(
            reservation,
            ReservationHistory.Action.CANCELLED,
            beforeStatus,
            reservation.getStatus(),
            null,
            Reservation.ActorType.PUBLIC_USER,
            reservation.getApplicantEmail()
        ));
        reservationRepository.flush();
        return reservation;
    }

    @Transactional
    public void deleteReservation(UUID reservationId, String adminId, String memo) {
        Reservation reservation = getReservationOrThrow(reservationId);
        UUID deletedReservationId = reservation.getId();
        UUID roomId = reservation.getRoom().getId();
        String purpose = reservation.getPurpose();
        String roomName = reservation.getDisplayRoomName();
        OffsetDateTime startAt = reservation.getStartAt();
        OffsetDateTime endAt = reservation.getEndAt();
        Reservation.ReservationStatus beforeStatus = reservation.getStatus();

        historyRepository.detachReservationReferencesForDelete(
            deletedReservationId,
            roomId,
            purpose,
            roomName,
            startAt,
            endAt
        );
        historyRepository.save(ReservationHistory.deleted(
            deletedReservationId,
            roomId,
            purpose,
            roomName,
            startAt,
            endAt,
            beforeStatus,
            memo,
            Reservation.ActorType.ADMIN,
            adminId
        ));
        reservationRepository.delete(reservation);
        reservationRepository.flush();
    }

    @Transactional(readOnly = true)
    public Reservation getReservationOrThrow(UUID reservationId) {
        return reservationRepository.findDetailById(reservationId)
            .orElseThrow(() -> new EntityNotFoundException("Reservation not found."));
    }

    @Transactional(readOnly = true)
    public Page<Reservation> searchAdminReservations(
        OffsetDateTime fromAt,
        OffsetDateTime toAt,
        UUID roomId,
        Reservation.ReservationStatus status,
        Reservation.ReservationSource source,
        String keyword,
        boolean excludeCancelled,
        Pageable pageable
    ) {
        String normalizedKeyword = keyword == null || keyword.isBlank() ? "" : keyword.trim();
        return reservationRepository.findAll(
            adminReservationSpec(fromAt, toAt, roomId, status, source, normalizedKeyword, excludeCancelled),
            pageable
        );
    }

    public Specification<Reservation> adminReservationSpec(
        OffsetDateTime fromAt,
        OffsetDateTime toAt,
        UUID roomId,
        Reservation.ReservationStatus status,
        Reservation.ReservationSource source,
        String keyword,
        boolean excludeCancelled
    ) {
        return (root, query, criteriaBuilder) -> {
            if (query.getResultType() != Long.class && query.getResultType() != long.class) {
                root.fetch("room");
            }

            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            if (fromAt != null) {
                predicates.add(criteriaBuilder.greaterThan(root.get("endAt"), fromAt));
            }
            if (toAt != null) {
                predicates.add(criteriaBuilder.lessThan(root.get("startAt"), toAt));
            }
            if (roomId != null) {
                predicates.add(criteriaBuilder.equal(root.get("room").get("id"), roomId));
            }
            if (status != null) {
                predicates.add(criteriaBuilder.equal(root.get("status"), status));
            } else if (excludeCancelled) {
                predicates.add(criteriaBuilder.notEqual(root.get("status"), Reservation.ReservationStatus.CANCELLED));
            }
            if (source != null) {
                predicates.add(criteriaBuilder.equal(root.get("source"), source));
            }
            if (!keyword.isBlank()) {
                String pattern = "%" + keyword.toLowerCase() + "%";
                predicates.add(criteriaBuilder.or(
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("applicantName")), pattern),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("applicantEmail")), pattern),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("purpose")), pattern)
                ));
            }

            return criteriaBuilder.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    public record CreateReservationCommand(
        @NotNull UUID roomId,
        @NotBlank @Size(max = 100) String applicantName,
        @NotBlank @Email @Size(max = 255) String applicantEmail,
        @Size(max = 50) String applicantPhone,
        @NotBlank @Size(max = 500) String purpose,
        @NotNull OffsetDateTime startAt,
        @NotNull OffsetDateTime endAt,
        @NotNull Reservation.ReservationStatus status,
        @NotNull Reservation.ReservationSource source
    ) {
    }

    public record UpdateReservationCommand(
        @NotNull UUID roomId,
        @NotBlank @Size(max = 100) String applicantName,
        @NotBlank @Email @Size(max = 255) String applicantEmail,
        @Size(max = 50) String applicantPhone,
        @NotBlank @Size(max = 500) String purpose,
        @NotNull OffsetDateTime startAt,
        @NotNull OffsetDateTime endAt,
        @NotNull Reservation.ReservationStatus status
    ) {
    }

    public static class PublicCancelPasswordMismatchException extends RuntimeException {
        public PublicCancelPasswordMismatchException() {
            super("Cancel password does not match.");
        }
    }
}
