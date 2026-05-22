package com.school.reservation.domain.reservation;

import com.school.reservation.domain.room.Room;
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
@Table(name = "reservations")
public class Reservation {

    public enum ReservationStatus {
        REQUESTED,
        CONFIRMED,
        CANCELLED
    }

    public enum ReservationSource {
        PUBLIC_FORM,
        ADMIN_GRID,
        ADMIN_MANUAL,
        RECURRING_GENERATED
    }

    public enum ActorType {
        PUBLIC_USER,
        ADMIN,
        SYSTEM
    }

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @Column(name = "original_room_name", length = 100)
    private String originalRoomName;

    @Column(name = "recurrence_id")
    private UUID recurrenceId;

    @Column(name = "applicant_name", nullable = false, length = 100)
    private String applicantName;

    @Column(name = "applicant_email", nullable = false, length = 255)
    private String applicantEmail;

    @Column(name = "applicant_phone", length = 50)
    private String applicantPhone;

    @Column(nullable = false, length = 500)
    private String purpose;

    @Column(name = "start_at", nullable = false)
    private OffsetDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private OffsetDateTime endAt;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false, columnDefinition = "reservation_status")
    private ReservationStatus status = ReservationStatus.REQUESTED;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false, columnDefinition = "reservation_source")
    private ReservationSource source;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "created_by_actor_type", nullable = false, columnDefinition = "actor_type")
    private ActorType createdByActorType;

    @Column(name = "created_by_actor_id", length = 100)
    private String createdByActorId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "updated_by_actor_type", columnDefinition = "actor_type")
    private ActorType updatedByActorType;

    @Column(name = "updated_by_actor_id", length = 100)
    private String updatedByActorId;

    protected Reservation() {
    }

    public Reservation(
        Room room,
        String applicantName,
        String applicantEmail,
        String applicantPhone,
        String purpose,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        ReservationStatus status,
        ReservationSource source,
        ActorType actorType,
        String actorId
    ) {
        this.room = room;
        this.applicantName = applicantName;
        this.applicantEmail = applicantEmail;
        this.applicantPhone = applicantPhone;
        this.purpose = purpose;
        this.startAt = startAt;
        this.endAt = endAt;
        this.status = status;
        this.source = source;
        this.createdByActorType = actorType;
        this.createdByActorId = actorId;
        this.createdAt = OffsetDateTime.now();
        this.updatedAt = this.createdAt;
    }

    public void cancel(ActorType actorType, String actorId) {
        this.status = ReservationStatus.CANCELLED;
        this.updatedByActorType = actorType;
        this.updatedByActorId = actorId;
        this.updatedAt = OffsetDateTime.now();
    }

    public void approve(ActorType actorType, String actorId) {
        this.status = ReservationStatus.CONFIRMED;
        this.updatedByActorType = actorType;
        this.updatedByActorId = actorId;
        this.updatedAt = OffsetDateTime.now();
    }

    public void update(
        Room room,
        String applicantName,
        String applicantEmail,
        String applicantPhone,
        String purpose,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        ReservationStatus status,
        ActorType actorType,
        String actorId
    ) {
        this.room = room;
        this.applicantName = applicantName;
        this.applicantEmail = applicantEmail;
        this.applicantPhone = applicantPhone;
        this.purpose = purpose;
        this.startAt = startAt;
        this.endAt = endAt;
        this.status = status;
        this.updatedByActorType = actorType;
        this.updatedByActorId = actorId;
        this.updatedAt = OffsetDateTime.now();
    }

    public void attachRecurrence(UUID recurrenceId) {
        this.recurrenceId = recurrenceId;
    }

    public UUID getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public String getDisplayRoomName() {
        if (room != null && room.isSystemReserved()) {
            if (originalRoomName != null && !originalRoomName.isBlank()) {
                return originalRoomName + " (삭제됨)";
            }
            return Room.DELETED_ROOM_DISPLAY_NAME;
        }
        return room == null ? Room.DELETED_ROOM_DISPLAY_NAME : room.getName();
    }

    public String getOriginalRoomName() {
        return originalRoomName;
    }

    public String getApplicantName() {
        return applicantName;
    }

    public String getApplicantEmail() {
        return applicantEmail;
    }

    public String getApplicantPhone() {
        return applicantPhone;
    }

    public String getPurpose() {
        return purpose;
    }

    public OffsetDateTime getStartAt() {
        return startAt;
    }

    public OffsetDateTime getEndAt() {
        return endAt;
    }

    public ReservationStatus getStatus() {
        return status;
    }

    public ReservationSource getSource() {
        return source;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public UUID getRecurrenceId() {
        return recurrenceId;
    }
}
