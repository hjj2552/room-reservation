package com.school.reservation.domain.room;

import com.school.reservation.domain.room.dto.request.CreateRoomRequest;
import com.school.reservation.domain.room.dto.request.UpdateRoomEnabledRequest;
import com.school.reservation.domain.room.dto.request.UpdateRoomRequest;
import com.school.reservation.global.exception.ApiConflictException;
import jakarta.persistence.EntityNotFoundException;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoomService {

    private final RoomRepository roomRepository;

    public RoomService(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    @Transactional(readOnly = true)
    public Page<Room> search(Boolean enabled, boolean includeDeleted, String keyword, Pageable pageable) {
        return roomRepository.findAll(roomSpec(enabled, includeDeleted, normalize(keyword)), pageable);
    }

    @Transactional(readOnly = true)
    public Room getAdminRoom(UUID roomId) {
        return roomRepository.findById(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
    }

    @Transactional(readOnly = true)
    public Room getPublicRoom(UUID roomId) {
        return roomRepository.findByIdAndEnabledTrueAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
    }

    @Transactional
    public Room create(CreateRoomRequest request, UUID actorId) {
        if (roomRepository.existsByNameAndDeletedAtIsNull(request.name())) {
            throw new ApiConflictException("ROOM_NAME_DUPLICATED", "Room name already exists.");
        }

        Room room = new Room(
            request.name(),
            request.location(),
            request.capacity(),
            request.description(),
            request.enabled(),
            actorId
        );
        return roomRepository.save(room);
    }

    @Transactional
    public Room update(UUID roomId, UpdateRoomRequest request, UUID actorId) {
        Room room = roomRepository.findByIdAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        if (roomRepository.existsByNameAndDeletedAtIsNullAndIdNot(request.name(), roomId)) {
            throw new ApiConflictException("ROOM_NAME_DUPLICATED", "Room name already exists.");
        }

        room.update(
            request.name(),
            request.location(),
            request.capacity(),
            request.description(),
            request.enabled(),
            actorId
        );
        return room;
    }

    @Transactional
    public Room updateEnabled(UUID roomId, UpdateRoomEnabledRequest request, UUID actorId) {
        Room room = roomRepository.findByIdAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        room.changeEnabled(request.enabled(), actorId);
        return room;
    }

    @Transactional
    public void softDelete(UUID roomId, UUID actorId) {
        Room room = roomRepository.findByIdAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        room.softDelete(actorId);
    }

    private Specification<Room> roomSpec(Boolean enabled, boolean includeDeleted, String keyword) {
        return (root, query, criteriaBuilder) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            if (!includeDeleted) {
                predicates.add(criteriaBuilder.isNull(root.get("deletedAt")));
            }
            if (enabled != null) {
                predicates.add(criteriaBuilder.equal(root.get("enabled"), enabled));
            }
            if (!keyword.isBlank()) {
                String pattern = "%" + keyword.toLowerCase() + "%";
                predicates.add(criteriaBuilder.or(
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("name")), pattern),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("location")), pattern),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("description")), pattern)
                ));
            }
            return criteriaBuilder.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    private String normalize(String keyword) {
        return keyword == null ? "" : keyword.trim();
    }
}

