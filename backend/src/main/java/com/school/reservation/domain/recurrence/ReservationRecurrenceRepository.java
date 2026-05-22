package com.school.reservation.domain.recurrence;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationRecurrenceRepository extends JpaRepository<ReservationRecurrence, UUID> {

    long countByRoom_Id(UUID roomId);

    @Modifying
    @Query("""
        update ReservationRecurrence rr
        set rr.originalRoomName = coalesce(rr.originalRoomName, :originalRoomName),
            rr.room = :sentinelRoom
        where rr.room.id = :roomId
        """)
    int moveRoomReferencesToSentinel(
        @Param("roomId") UUID roomId,
        @Param("sentinelRoom") com.school.reservation.domain.room.Room sentinelRoom,
        @Param("originalRoomName") String originalRoomName
    );

    long countByRoom_IdAndDeletedAtIsNullAndEndDateGreaterThanEqual(UUID roomId, LocalDate today);

    @Query("""
        select rr
        from ReservationRecurrence rr
        join fetch rr.room
        where rr.id = :id
        """)
    Optional<ReservationRecurrence> findDetailById(@Param("id") UUID id);

    @Query(
        value = """
            select rr
            from ReservationRecurrence rr
            join fetch rr.room room
            where (:includeDeleted = true or rr.deletedAt is null)
            """,
        countQuery = """
            select count(rr)
            from ReservationRecurrence rr
            where (:includeDeleted = true or rr.deletedAt is null)
            """
    )
    Page<ReservationRecurrence> findRecurrences(@Param("includeDeleted") boolean includeDeleted, Pageable pageable);
}
