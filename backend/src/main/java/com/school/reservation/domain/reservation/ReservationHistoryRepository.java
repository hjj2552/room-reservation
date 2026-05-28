package com.school.reservation.domain.reservation;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationHistoryRepository extends JpaRepository<ReservationHistory, UUID>, JpaSpecificationExecutor<ReservationHistory> {

    @Query("""
        select h
        from ReservationHistory h
        left join h.reservation r
        where r.id = :reservationId
           or h.reservationDeletedId = :reservationId
        order by h.createdAt desc
        """)
    List<ReservationHistory> findByReservationIdIncludingDeletedOrderByCreatedAtDesc(@Param("reservationId") UUID reservationId);

    Page<ReservationHistory> findByReservationIdOrderByCreatedAtDesc(UUID reservationId, Pageable pageable);

    Page<ReservationHistory> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Modifying
    @Query("""
        update ReservationHistory h
        set h.reservationDeletedId = coalesce(h.reservationDeletedId, :reservationId),
            h.reservationRoomId = coalesce(h.reservationRoomId, :roomId),
            h.reservationPurpose = coalesce(h.reservationPurpose, :purpose),
            h.reservationRoomName = coalesce(h.reservationRoomName, :roomName),
            h.reservationStartAt = coalesce(h.reservationStartAt, :startAt),
            h.reservationEndAt = coalesce(h.reservationEndAt, :endAt),
            h.reservation = null
        where h.reservation.id = :reservationId
        """)
    int detachReservationReferencesForDelete(
        @Param("reservationId") UUID reservationId,
        @Param("roomId") UUID roomId,
        @Param("purpose") String purpose,
        @Param("roomName") String roomName,
        @Param("startAt") java.time.OffsetDateTime startAt,
        @Param("endAt") java.time.OffsetDateTime endAt
    );
}
