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

    public ReservationService(
        RoomRepository roomRepository,
        ReservationRepository reservationRepository,
        ReservationHistoryRepository historyRepository,
        ReservationPolicyService policyService,
        ReservationConflictService conflictService
    ) {
        this.roomRepository = roomRepository;
        this.reservationRepository = reservationRepository;
        this.historyRepository = historyRepository;
        this.policyService = policyService;
        this.conflictService = conflictService;
    }

    @Transactional
    public Reservation createPublicReservation(@Valid CreateReservationCommand command) {
        return createReservation(command, Reservation.ActorType.PUBLIC_USER, command.applicantEmail(), ReservationHistory.Action.CREATED, null, null);
    }

    @Transactional
    public Reservation createAdminReservation(@Valid CreateReservationCommand command, String adminId, String memo) {
        return createReservation(command, Reservation.ActorType.ADMIN, adminId, ReservationHistory.Action.CREATED_BY_ADMIN, memo, null);
    }

    @Transactional
    public Reservation createRecurringReservation(@Valid CreateReservationCommand command, String adminId, UUID recurrenceId) {
        return createReservation(command, Reservation.ActorType.ADMIN, adminId, ReservationHistory.Action.RECURRENCE_GENERATED, null, recurrenceId);
    }

    private Reservation createReservation(
        CreateReservationCommand command,
        Reservation.ActorType actorType,
        String actorId,
        ReservationHistory.Action historyAction,
        String memo,
        UUID recurrenceId
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
        if (reservation.getStatus() == Reservation.ReservationStatus.CANCELLED) {
            throw new IllegalArgumentException("Cancelled reservations cannot be updated.");
        }

        Room room = roomRepository.findByIdAndDeletedAtIsNull(command.roomId())
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        policyService.validate(room, command.startAt(), command.endAt(), command.applicantPhone());
        conflictService.validateNoConflict(command.roomId(), command.startAt(), command.endAt(), reservationId);

        Reservation.ReservationStatus beforeStatus = reservation.getStatus();
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
            historyRepository.save(new ReservationHistory(
                reservation,
                ReservationHistory.Action.UPDATED,
                beforeStatus,
                reservation.getStatus(),
                memo,
                Reservation.ActorType.ADMIN,
                adminId
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
        Pageable pageable
    ) {
        String normalizedKeyword = keyword == null || keyword.isBlank() ? "" : keyword.trim();
        return reservationRepository.findAll(adminReservationSpec(fromAt, toAt, roomId, status, source, normalizedKeyword), pageable);
    }

    public Specification<Reservation> adminReservationSpec(
        OffsetDateTime fromAt,
        OffsetDateTime toAt,
        UUID roomId,
        Reservation.ReservationStatus status,
        Reservation.ReservationSource source,
        String keyword
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
}
