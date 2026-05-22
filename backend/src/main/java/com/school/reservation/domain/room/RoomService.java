package com.school.reservation.domain.room;

import com.school.reservation.domain.room.dto.request.CreateRoomRequest;
import com.school.reservation.domain.room.dto.request.UpdateRoomEnabledRequest;
import com.school.reservation.domain.room.dto.request.UpdateRoomRequest;
import com.school.reservation.domain.room.dto.response.RoomDeletionCheckResponse;
import com.school.reservation.domain.room.dto.response.RoomDeletionCheckResponse.DeletionBlocker;
import com.school.reservation.domain.room.dto.response.RoomDeletionCheckResponse.DeletionCheckItem;
import com.school.reservation.domain.recurrence.ReservationRecurrenceRepository;
import com.school.reservation.domain.reservation.ReservationRepository;
import com.school.reservation.global.exception.ApiConflictException;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoomService {

    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;
    private final ReservationRecurrenceRepository recurrenceRepository;

    public RoomService(
        RoomRepository roomRepository,
        ReservationRepository reservationRepository,
        ReservationRecurrenceRepository recurrenceRepository
    ) {
        this.roomRepository = roomRepository;
        this.reservationRepository = reservationRepository;
        this.recurrenceRepository = recurrenceRepository;
    }

    @Transactional(readOnly = true)
    public Page<Room> search(Boolean enabled, boolean includeDeleted, String keyword, Pageable pageable) {
        return roomRepository.findAll(roomSpec(enabled, includeDeleted, normalize(keyword)), pageable);
    }

    @Transactional(readOnly = true)
    public Room getAdminRoom(UUID roomId) {
        Room room = roomRepository.findById(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        if (room.isSystemReserved()) {
            throw new EntityNotFoundException("Room not found.");
        }
        return room;
    }

    @Transactional(readOnly = true)
    public Room getPublicRoom(UUID roomId) {
        return roomRepository.findByIdAndEnabledTrueAndDeletedAtIsNullAndSystemReservedFalse(roomId)
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
        Room room = getEditableRoom(roomId);
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
        Room room = getEditableRoom(roomId);
        room.changeEnabled(request.enabled(), actorId);
        return room;
    }

    @Transactional
    public void softDelete(UUID roomId, UUID actorId) {
        Room room = getEditableRoom(roomId);
        room.softDelete(actorId);
    }

    @Transactional(readOnly = true)
    public RoomDeletionCheckResponse getDeletionCheck(UUID roomId) {
        Room room = roomRepository.findByIdAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        return buildDeletionCheck(room);
    }

    @Transactional
    public void hardDelete(UUID roomId) {
        Room room = roomRepository.findByIdAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        RoomDeletionCheckResponse check = buildDeletionCheck(room);
        if (!check.deletable()) {
            throw deletionBlocked(check);
        }

        Room sentinelRoom = getSentinelRoom();
        String originalRoomName = room.getName();
        reservationRepository.moveRoomReferencesToSentinel(roomId, sentinelRoom, originalRoomName);
        recurrenceRepository.moveRoomReferencesToSentinel(roomId, sentinelRoom, originalRoomName);
        roomRepository.delete(room);
        roomRepository.flush();
    }

    private RoomDeletionCheckResponse buildDeletionCheck(Room room) {
        UUID roomId = room.getId();
        long reservationReferenceCount = reservationRepository.countByRoom_Id(roomId);
        long recurrenceReferenceCount = recurrenceRepository.countByRoom_Id(roomId);

        List<DeletionCheckItem> checks = List.of(
            DeletionCheckItem.impact(
                "RESERVATION_REFERENCES_REASSIGNED",
                "예약 기록 보존",
                "기존 예약은 삭제하지 않고 삭제된 강의실 기록으로 연결됩니다.",
                reservationReferenceCount
            ),
            DeletionCheckItem.impact(
                "RECURRENCE_REFERENCES_REASSIGNED",
                "반복 예약 기록 보존",
                "기존 반복 예약은 삭제하지 않고 삭제된 강의실 기록으로 연결됩니다.",
                recurrenceReferenceCount
            )
        );

        List<DeletionBlocker> blockers = room.isSystemReserved()
            ? List.of(DeletionBlocker.of(RoomDeletionBlockerCode.SENTINEL_ROOM_PROTECTED))
            : List.of();

        return RoomDeletionCheckResponse.of(room, checks, blockers);
    }

    private ApiConflictException deletionBlocked(RoomDeletionCheckResponse check) {
        List<Map<String, Object>> blockers = check.blockers().stream()
            .map(blocker -> Map.<String, Object>of(
                "code", blocker.code(),
                "message", blocker.message(),
                "count", blocker.count()
            ))
            .toList();
        return new ApiConflictException(
            "ROOM_DELETE_BLOCKED",
            "Room cannot be deleted because deletion conditions are not met.",
            Map.of(
                "roomId", check.roomId(),
                "roomName", check.roomName(),
                "blockers", blockers
            )
        );
    }

    private Room getEditableRoom(UUID roomId) {
        Room room = roomRepository.findByIdAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        if (room.isSystemReserved()) {
            throw new ApiConflictException(
                "SYSTEM_ROOM_PROTECTED",
                "System reserved room cannot be modified."
            );
        }
        return room;
    }

    private Room getSentinelRoom() {
        return roomRepository.findBySystemReservedTrueAndDeletedAtIsNull()
            .orElseThrow(() -> new IllegalStateException("Deleted room sentinel is missing."));
    }

    private Specification<Room> roomSpec(Boolean enabled, boolean includeDeleted, String keyword) {
        return (root, query, criteriaBuilder) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            predicates.add(criteriaBuilder.isFalse(root.get("systemReserved")));
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
