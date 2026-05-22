package com.school.reservation.domain.room;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomRepository extends JpaRepository<Room, UUID>, JpaSpecificationExecutor<Room> {

    List<Room> findByEnabledTrueAndDeletedAtIsNullOrderByNameAsc();

    List<Room> findByEnabledTrueAndDeletedAtIsNullAndSystemReservedFalseOrderByNameAsc();

    Optional<Room> findByIdAndDeletedAtIsNull(UUID id);

    Optional<Room> findByIdAndEnabledTrueAndDeletedAtIsNull(UUID id);

    Optional<Room> findByIdAndEnabledTrueAndDeletedAtIsNullAndSystemReservedFalse(UUID id);

    Optional<Room> findBySystemReservedTrueAndDeletedAtIsNull();

    boolean existsByNameAndDeletedAtIsNull(String name);

    boolean existsByNameAndDeletedAtIsNullAndIdNot(String name, UUID id);
}
