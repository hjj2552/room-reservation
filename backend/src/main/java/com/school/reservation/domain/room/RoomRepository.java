package com.school.reservation.domain.room;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomRepository extends JpaRepository<Room, UUID>, JpaSpecificationExecutor<Room> {

    List<Room> findByEnabledTrueAndDeletedAtIsNullOrderByNameAsc();

    Optional<Room> findByIdAndDeletedAtIsNull(UUID id);

    Optional<Room> findByIdAndEnabledTrueAndDeletedAtIsNull(UUID id);

    boolean existsByNameAndDeletedAtIsNull(String name);

    boolean existsByNameAndDeletedAtIsNullAndIdNot(String name, UUID id);
}
