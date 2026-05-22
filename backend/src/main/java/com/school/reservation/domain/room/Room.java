package com.school.reservation.domain.room;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "rooms")
public class Room {

    public static final String DELETED_ROOM_DISPLAY_NAME = "삭제된 강의실";

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 150)
    private String location;

    @Column(nullable = false)
    private Integer capacity;

    @Column(columnDefinition = "text")
    private String description;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "system_reserved", nullable = false)
    private boolean systemReserved = false;

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

    protected Room() {
    }

    public Room(String name, String location, Integer capacity, String description, boolean enabled, UUID actorId) {
        this.name = name;
        this.location = location;
        this.capacity = capacity;
        this.description = description;
        this.enabled = enabled;
        this.createdBy = actorId;
        this.updatedBy = actorId;
        this.createdAt = OffsetDateTime.now();
        this.updatedAt = this.createdAt;
    }

    public void update(String name, String location, Integer capacity, String description, boolean enabled, UUID actorId) {
        this.name = name;
        this.location = location;
        this.capacity = capacity;
        this.description = description;
        this.enabled = enabled;
        this.updatedBy = actorId;
        this.updatedAt = OffsetDateTime.now();
    }

    public void changeEnabled(boolean enabled, UUID actorId) {
        this.enabled = enabled;
        this.updatedBy = actorId;
        this.updatedAt = OffsetDateTime.now();
    }

    public void softDelete(UUID actorId) {
        this.enabled = false;
        this.deletedAt = OffsetDateTime.now();
        this.updatedBy = actorId;
        this.updatedAt = this.deletedAt;
    }

    public boolean isUsable() {
        return enabled && deletedAt == null && !systemReserved;
    }

    public boolean isSystemReserved() {
        return systemReserved;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getLocation() {
        return location;
    }

    public Integer getCapacity() {
        return capacity;
    }

    public String getDescription() {
        return description;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public OffsetDateTime getDeletedAt() {
        return deletedAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
