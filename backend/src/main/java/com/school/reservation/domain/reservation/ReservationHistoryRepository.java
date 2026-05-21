package com.school.reservation.domain.reservation;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationHistoryRepository extends JpaRepository<ReservationHistory, UUID> {

    List<ReservationHistory> findByReservationIdOrderByCreatedAtDesc(UUID reservationId);

    Page<ReservationHistory> findByReservationIdOrderByCreatedAtDesc(UUID reservationId, Pageable pageable);

    Page<ReservationHistory> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query(
        value = """
            select h
            from ReservationHistory h
            join fetch h.reservation r
            where (:reservationId is null or r.id = :reservationId)
            """,
        countQuery = """
            select count(h)
            from ReservationHistory h
            join h.reservation r
            where (:reservationId is null or r.id = :reservationId)
            """
    )
    Page<ReservationHistory> searchHistories(@Param("reservationId") UUID reservationId, Pageable pageable);
}
