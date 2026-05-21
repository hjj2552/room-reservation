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
        RECURRENCE_GENERATED,
        RECURRENCE_CANCELLED
    }

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reservation_id", nullable = false)
    private Reservation reservation;

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
    }

    public UUID getId() {
        return id;
    }

    public Reservation getReservation() {
        return reservation;
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
