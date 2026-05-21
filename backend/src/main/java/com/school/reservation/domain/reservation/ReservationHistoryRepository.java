package com.school.reservation.domain.reservation;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface ReservationHistoryRepository extends JpaRepository<ReservationHistory, UUID>, JpaSpecificationExecutor<ReservationHistory> {

    List<ReservationHistory> findByReservationIdOrderByCreatedAtDesc(UUID reservationId);

    Page<ReservationHistory> findByReservationIdOrderByCreatedAtDesc(UUID reservationId, Pageable pageable);

    Page<ReservationHistory> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
