package com.school.reservation.domain.room;

import com.school.reservation.domain.room.dto.response.PublicRoomResponse;
import com.school.reservation.domain.room.dto.response.PublicRoomDetailResponse;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/rooms")
public class PublicRoomController {

    private final RoomRepository roomRepository;

    public PublicRoomController(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    @GetMapping
    public List<PublicRoomResponse> getRooms() {
        return roomRepository.findByEnabledTrueAndDeletedAtIsNullAndSystemReservedFalseOrderByNameAsc().stream()
            .map(PublicRoomResponse::from)
            .toList();
    }

    @GetMapping("/{roomId}")
    public PublicRoomDetailResponse getRoom(@PathVariable java.util.UUID roomId) {
        Room room = roomRepository.findByIdAndEnabledTrueAndDeletedAtIsNullAndSystemReservedFalse(roomId)
            .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException("Room not found."));
        return PublicRoomDetailResponse.from(room);
    }
}
