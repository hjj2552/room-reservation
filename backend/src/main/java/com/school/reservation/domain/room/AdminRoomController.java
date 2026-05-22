package com.school.reservation.domain.room;

import com.school.reservation.domain.room.dto.request.CreateRoomRequest;
import com.school.reservation.domain.room.dto.request.UpdateRoomEnabledRequest;
import com.school.reservation.domain.room.dto.request.UpdateRoomRequest;
import com.school.reservation.domain.room.dto.response.AdminRoomResponse;
import com.school.reservation.domain.room.dto.response.RoomDeletionCheckResponse;
import com.school.reservation.global.dto.PagedResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/rooms")
public class AdminRoomController {

    private final RoomService roomService;

    public AdminRoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping
    public PagedResponse<AdminRoomResponse> getRooms(
        @RequestParam(required = false) Boolean enabled,
        @RequestParam(defaultValue = "false") boolean includeDeleted,
        @RequestParam(required = false) String keyword,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(defaultValue = "name,asc") String sort
    ) {
        return PagedResponse.from(roomService
            .search(enabled, includeDeleted, keyword, PageRequest.of(page, size, parseSort(sort)))
            .map(AdminRoomResponse::from));
    }

    @GetMapping("/{roomId}")
    public AdminRoomResponse getRoom(@PathVariable UUID roomId) {
        return AdminRoomResponse.from(roomService.getAdminRoom(roomId));
    }

    @GetMapping("/{roomId}/deletion-check")
    public RoomDeletionCheckResponse getDeletionCheck(@PathVariable UUID roomId) {
        return roomService.getDeletionCheck(roomId);
    }

    @PostMapping
    public ResponseEntity<AdminRoomResponse> createRoom(@Valid @RequestBody CreateRoomRequest request) {
        Room room = roomService.create(request, null);
        return ResponseEntity
            .created(URI.create("/api/admin/rooms/" + room.getId()))
            .body(AdminRoomResponse.from(room));
    }

    @PutMapping("/{roomId}")
    public AdminRoomResponse updateRoom(
        @PathVariable UUID roomId,
        @Valid @RequestBody UpdateRoomRequest request
    ) {
        return AdminRoomResponse.from(roomService.update(roomId, request, null));
    }

    @PatchMapping("/{roomId}/enabled")
    public AdminRoomResponse updateEnabled(
        @PathVariable UUID roomId,
        @Valid @RequestBody UpdateRoomEnabledRequest request
    ) {
        return AdminRoomResponse.from(roomService.updateEnabled(roomId, request, null));
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> deleteRoom(@PathVariable UUID roomId) {
        roomService.hardDelete(roomId);
        return ResponseEntity.noContent().build();
    }

    private Sort parseSort(String sort) {
        String[] tokens = sort.split(",");
        String property = tokens.length > 0 && !tokens[0].isBlank() ? tokens[0] : "name";
        Sort.Direction direction = tokens.length > 1 && "desc".equalsIgnoreCase(tokens[1])
            ? Sort.Direction.DESC
            : Sort.Direction.ASC;
        return Sort.by(direction, property);
    }
}
