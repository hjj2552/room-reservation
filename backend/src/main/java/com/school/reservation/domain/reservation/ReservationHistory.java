package com.school.reservation.domain.reservation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "reservation_histories")
public class ReservationHistory {

    public enum Action {
        CREATED,
        CREATED_BY_ADMIN,
        UPDATED,
        APPROVED,
        CANCELLED,
        DELETED,
        RECURRENCE_GENERATED,
        RECURRENCE_CANCELLED
    }

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reservation_id")
    private Reservation reservation;

    @Column(name = "reservation_deleted_id")
    private UUID reservationDeletedId;

    @Column(name = "reservation_room_id")
    private UUID reservationRoomId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private Action action;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "before_status", columnDefinition = "reservation_status")
    private Reservation.ReservationStatus beforeStatus;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "after_status", columnDefinition = "reservation_status")
    private Reservation.ReservationStatus afterStatus;

    @Column(columnDefinition = "text")
    private String memo;

    @Column(name = "reservation_purpose", length = 500)
    private String reservationPurpose;

    @Column(name = "reservation_room_name", length = 100)
    private String reservationRoomName;

    @Column(name = "reservation_start_at")
    private OffsetDateTime reservationStartAt;

    @Column(name = "reservation_end_at")
    private OffsetDateTime reservationEndAt;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "actor_type", nullable = false, columnDefinition = "actor_type")
    private Reservation.ActorType actorType;

    @Column(name = "actor_id", length = 100)
    private String actorId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected ReservationHistory() {
    }

    public ReservationHistory(
        Reservation reservation,
        Action action,
        Reservation.ReservationStatus beforeStatus,
        Reservation.ReservationStatus afterStatus,
        String memo,
        Reservation.ActorType actorType,
        String actorId
    ) {
        this.reservation = reservation;
        this.action = action;
        this.beforeStatus = beforeStatus;
        this.afterStatus = afterStatus;
        this.memo = memo;
        this.actorType = actorType;
        this.actorId = actorId;
        this.createdAt = OffsetDateTime.now();
        copyReservationSnapshot(reservation);
    }

    public static ReservationHistory deleted(
        UUID reservationId,
        UUID roomId,
        String purpose,
        String roomName,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        Reservation.ReservationStatus beforeStatus,
        String memo,
        Reservation.ActorType actorType,
        String actorId
    ) {
        ReservationHistory history = new ReservationHistory();
        history.reservation = null;
        history.reservationDeletedId = reservationId;
        history.reservationRoomId = roomId;
        history.action = Action.DELETED;
        history.beforeStatus = beforeStatus;
        history.afterStatus = null;
        history.memo = memo;
        history.reservationPurpose = purpose;
        history.reservationRoomName = roomName;
        history.reservationStartAt = startAt;
        history.reservationEndAt = endAt;
        history.actorType = actorType;
        history.actorId = actorId;
        history.createdAt = OffsetDateTime.now();
        return history;
    }

    private void copyReservationSnapshot(Reservation reservation) {
        if (reservation == null) {
            return;
        }
        this.reservationDeletedId = reservation.getId();
        this.reservationRoomId = reservation.getRoom() == null ? null : reservation.getRoom().getId();
        this.reservationPurpose = reservation.getPurpose();
        this.reservationRoomName = reservation.getDisplayRoomName();
        this.reservationStartAt = reservation.getStartAt();
        this.reservationEndAt = reservation.getEndAt();
    }

    public UUID getId() {
        return id;
    }

    public Reservation getReservation() {
        return reservation;
    }

    public UUID getReservationIdForDisplay() {
        return reservation != null ? reservation.getId() : reservationDeletedId;
    }

    public UUID getReservationRoomId() {
        return reservationRoomId;
    }

    public Action getAction() {
        return action;
    }

    public Reservation.ReservationStatus getBeforeStatus() {
        return beforeStatus;
    }

    public Reservation.ReservationStatus getAfterStatus() {
        return afterStatus;
    }

    public String getMemo() {
        return memo;
    }

    public String getReservationPurpose() {
        return reservationPurpose;
    }

    public String getReservationRoomName() {
        return reservationRoomName;
    }

    public OffsetDateTime getReservationStartAt() {
        return reservationStartAt;
    }

    public OffsetDateTime getReservationEndAt() {
        return reservationEndAt;
    }

    public Reservation.ActorType getActorType() {
        return actorType;
    }

    public String getActorId() {
        return actorId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
