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
        left join fetch rr.tag
        where rr.id = :id
        """)
    Optional<ReservationRecurrence> findDetailById(@Param("id") UUID id);

    @Query(
        value = """
            select rr
            from ReservationRecurrence rr
            join fetch rr.room room
            left join fetch rr.tag tag
            where (:includeDeleted = true or rr.deletedAt is null)
              and (:status is null
                or (:status = 'ACTIVE' and rr.deletedAt is null)
                or (:status = 'CANCELLED' and rr.deletedAt is not null))
              and (:roomId is null or room.id = :roomId)
              and (:fromDate is null or rr.endDate >= :fromDate)
              and (:toDate is null or rr.startDate <= :toDate)
              and (:keyword is null
                or lower(rr.purpose) like :keyword
                or lower(rr.applicantName) like :keyword
                or lower(room.name) like :keyword
                or lower(coalesce(tag.name, '')) like :keyword)
            """,
        countQuery = """
            select count(rr)
            from ReservationRecurrence rr
            join rr.room room
            left join rr.tag tag
            where (:includeDeleted = true or rr.deletedAt is null)
              and (:status is null
                or (:status = 'ACTIVE' and rr.deletedAt is null)
                or (:status = 'CANCELLED' and rr.deletedAt is not null))
              and (:roomId is null or room.id = :roomId)
              and (:fromDate is null or rr.endDate >= :fromDate)
              and (:toDate is null or rr.startDate <= :toDate)
              and (:keyword is null
                or lower(rr.purpose) like :keyword
                or lower(rr.applicantName) like :keyword
                or lower(room.name) like :keyword
                or lower(coalesce(tag.name, '')) like :keyword)
            """
    )
    Page<ReservationRecurrence> findRecurrences(
        @Param("includeDeleted") boolean includeDeleted,
        @Param("status") String status,
        @Param("roomId") UUID roomId,
        @Param("fromDate") LocalDate fromDate,
        @Param("toDate") LocalDate toDate,
        @Param("keyword") String keyword,
        Pageable pageable
    );
}
