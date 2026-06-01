package com.school.reservation.domain.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Entity
@Table(name = "operation_settings")
public class OperationSettings {

    public static final long SINGLETON_ID = 1L;

    @Id
    private Long id;

    @Column(name = "organization_name", nullable = false, length = 150)
    private String organizationName;

    @Column(name = "public_notice", columnDefinition = "text")
    private String publicNotice;

    @Column(name = "reservation_enabled", nullable = false)
    private boolean reservationEnabled;

    @Column(name = "reservation_disabled_message", columnDefinition = "text")
    private String reservationDisabledMessage;

    @Column(name = "semester_start_date", nullable = false)
    private LocalDate semesterStartDate;

    @Column(name = "semester_end_date", nullable = false)
    private LocalDate semesterEndDate;

    @Column(name = "open_time", nullable = false)
    private LocalTime openTime;

    @Column(name = "close_time", nullable = false)
    private LocalTime closeTime;

    @Column(name = "slot_minutes", nullable = false)
    private Integer slotMinutes;

    @Column(name = "available_days_of_week", nullable = false, length = 50)
    private String availableDaysOfWeek;

    @Column(name = "min_reservation_minutes", nullable = false)
    private Integer minReservationMinutes;

    @Column(name = "max_reservation_minutes", nullable = false)
    private Integer maxReservationMinutes;

    @Column(name = "admin_contact_name", length = 100)
    private String adminContactName;

    @Column(name = "admin_contact_email", length = 255)
    private String adminContactEmail;

    @Column(name = "admin_contact_phone", length = 50)
    private String adminContactPhone;

    @Column(name = "completion_message", columnDefinition = "text")
    private String completionMessage;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Version
    @Column(nullable = false)
    private Long version;

    protected OperationSettings() {
    }

    public void update(
        String organizationName,
        String publicNotice,
        boolean reservationEnabled,
        String reservationDisabledMessage,
        LocalDate semesterStartDate,
        LocalDate semesterEndDate,
        LocalTime openTime,
        LocalTime closeTime,
        Integer slotMinutes,
        String availableDaysOfWeek,
        Integer minReservationMinutes,
        Integer maxReservationMinutes,
        String adminContactName,
        String adminContactEmail,
        String adminContactPhone,
        String completionMessage,
        String logoUrl,
        UUID actorId
    ) {
        this.organizationName = organizationName;
        this.publicNotice = publicNotice;
        this.reservationEnabled = reservationEnabled;
        this.reservationDisabledMessage = reservationDisabledMessage;
        this.semesterStartDate = semesterStartDate;
        this.semesterEndDate = semesterEndDate;
        this.openTime = openTime;
        this.closeTime = closeTime;
        this.slotMinutes = slotMinutes;
        this.availableDaysOfWeek = availableDaysOfWeek;
        this.minReservationMinutes = minReservationMinutes;
        this.maxReservationMinutes = maxReservationMinutes;
        this.adminContactName = adminContactName;
        this.adminContactEmail = adminContactEmail;
        this.adminContactPhone = adminContactPhone;
        this.completionMessage = completionMessage;
        this.logoUrl = logoUrl;
        this.updatedBy = actorId;
        this.updatedAt = OffsetDateTime.now();
    }

    public Set<String> availableDaySet() {
        return Arrays.stream(availableDaysOfWeek.split(","))
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .collect(Collectors.toSet());
    }

    public String getOrganizationName() {
        return organizationName;
    }

    public String getPublicNotice() {
        return publicNotice;
    }

    public boolean isReservationEnabled() {
        return reservationEnabled;
    }

    public String getReservationDisabledMessage() {
        return reservationDisabledMessage;
    }

    public LocalDate getSemesterStartDate() {
        return semesterStartDate;
    }

    public LocalDate getSemesterEndDate() {
        return semesterEndDate;
    }

    public LocalTime getOpenTime() {
        return openTime;
    }

    public LocalTime getCloseTime() {
        return closeTime;
    }

    public Integer getSlotMinutes() {
        return slotMinutes;
    }

    public Integer getMinReservationMinutes() {
        return minReservationMinutes;
    }

    public Integer getMaxReservationMinutes() {
        return maxReservationMinutes;
    }

    public String getCompletionMessage() {
        return completionMessage;
    }

    public String getLogoUrl() {
        return logoUrl;
    }

    public String getAdminContactEmail() {
        return adminContactEmail;
    }

    public String getAdminContactName() {
        return adminContactName;
    }

    public String getAdminContactPhone() {
        return adminContactPhone;
    }

    public Long getVersion() {
        return version;
    }
}
