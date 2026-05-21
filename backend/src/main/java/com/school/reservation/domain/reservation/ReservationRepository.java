package com.school.reservation.domain.reservation;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationRepository extends JpaRepository<Reservation, UUID>, JpaSpecificationExecutor<Reservation> {

    @Query("""
        select count(r) > 0
        from Reservation r
        where r.room.id = :roomId
          and r.status in :statuses
          and r.startAt < :endAt
          and r.endAt > :startAt
          and (:excludingReservationId is null or r.id <> :excludingReservationId)
        """)
    boolean existsOverlappingReservation(
        @Param("roomId") UUID roomId,
        @Param("startAt") OffsetDateTime startAt,
        @Param("endAt") OffsetDateTime endAt,
        @Param("statuses") List<Reservation.ReservationStatus> statuses,
        @Param("excludingReservationId") UUID excludingReservationId
    );

    @Query("""
        select r
        from Reservation r
        join fetch r.room room
        where r.id = :id
        """)
    Optional<Reservation> findDetailById(@Param("id") UUID id);

    @Query(
        value = """
            select r
            from Reservation r
            join fetch r.room room
            where (:fromAt is null or r.endAt > :fromAt)
              and (:toAt is null or r.startAt < :toAt)
              and (:roomId is null or room.id = :roomId)
              and (:status is null or r.status = :status)
              and (
                :keyword = ''
                or lower(r.applicantName) like lower(concat('%', :keyword, '%'))
                or lower(r.applicantEmail) like lower(concat('%', :keyword, '%'))
                or lower(r.purpose) like lower(concat('%', :keyword, '%'))
              )
            """,
        countQuery = """
            select count(r)
            from Reservation r
            join r.room room
            where (:fromAt is null or r.endAt > :fromAt)
              and (:toAt is null or r.startAt < :toAt)
              and (:roomId is null or room.id = :roomId)
              and (:status is null or r.status = :status)
              and (
                :keyword = ''
                or lower(r.applicantName) like lower(concat('%', :keyword, '%'))
                or lower(r.applicantEmail) like lower(concat('%', :keyword, '%'))
                or lower(r.purpose) like lower(concat('%', :keyword, '%'))
              )
            """
    )
    Page<Reservation> searchAdminReservations(
        @Param("fromAt") OffsetDateTime fromAt,
        @Param("toAt") OffsetDateTime toAt,
        @Param("roomId") UUID roomId,
        @Param("status") Reservation.ReservationStatus status,
        @Param("keyword") String keyword,
        Pageable pageable
    );

    @Query("""
        select r
        from Reservation r
        join fetch r.room room
        where room.id = :roomId
          and r.status in :statuses
          and r.startAt < :endAt
          and r.endAt > :startAt
        order by r.startAt asc
        """)
    List<Reservation> findRoomReservationsBetween(
        @Param("roomId") UUID roomId,
        @Param("startAt") OffsetDateTime startAt,
        @Param("endAt") OffsetDateTime endAt,
        @Param("statuses") List<Reservation.ReservationStatus> statuses
    );

    @Query("""
        select r
        from Reservation r
        join fetch r.room room
        where r.recurrenceId = :recurrenceId
          and r.status in :statuses
        order by r.startAt asc
        """)
    List<Reservation> findActiveReservationsByRecurrenceId(
        @Param("recurrenceId") UUID recurrenceId,
        @Param("statuses") List<Reservation.ReservationStatus> statuses
    );
}
