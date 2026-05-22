package com.school.reservation.domain.recurrence;

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
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "reservation_recurrences")
public class ReservationRecurrence {

    public enum ConflictPolicy {
        SKIP_CONFLICTS,
        FAIL_ALL,
        CREATE_AVAILABLE_ONLY
    }

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @Column(name = "original_room_name", length = 100)
    private String originalRoomName;

    @Column(name = "applicant_name", nullable = false, length = 100)
    private String applicantName;

    @Column(name = "applicant_email", nullable = false, length = 255)
    private String applicantEmail;

    @Column(name = "applicant_phone", length = 50)
    private String applicantPhone;

    @Column(nullable = false, length = 500)
    private String purpose;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "days_of_week", nullable = false, length = 50)
    private String daysOfWeek;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "conflict_policy", nullable = false, columnDefinition = "recurrence_conflict_policy")
    private ConflictPolicy conflictPolicy;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "deleted_at")
    private OffsetDateTime deletedAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "updated_by")
    private UUID updatedBy;

    protected ReservationRecurrence() {
    }

    public ReservationRecurrence(
        Room room,
        String applicantName,
        String applicantEmail,
        String applicantPhone,
        String purpose,
        LocalDate startDate,
        LocalDate endDate,
        String daysOfWeek,
        LocalTime startTime,
        LocalTime endTime,
        ConflictPolicy conflictPolicy,
        UUID actorId
    ) {
        this.room = room;
        this.applicantName = applicantName;
        this.applicantEmail = applicantEmail;
        this.applicantPhone = applicantPhone;
        this.purpose = purpose;
        this.startDate = startDate;
        this.endDate = endDate;
        this.daysOfWeek = daysOfWeek;
        this.startTime = startTime;
        this.endTime = endTime;
        this.conflictPolicy = conflictPolicy;
        this.createdBy = actorId;
        this.updatedBy = actorId;
        this.createdAt = OffsetDateTime.now();
        this.updatedAt = this.createdAt;
    }

    public void softDelete(UUID actorId) {
        this.deletedAt = OffsetDateTime.now();
        this.updatedAt = this.deletedAt;
        this.updatedBy = actorId;
    }

    public Set<String> daySet() {
        return Arrays.stream(daysOfWeek.split(","))
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .collect(Collectors.toSet());
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

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public String getDaysOfWeek() {
        return daysOfWeek;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }

    public ConflictPolicy getConflictPolicy() {
        return conflictPolicy;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getDeletedAt() {
        return deletedAt;
    }
}
