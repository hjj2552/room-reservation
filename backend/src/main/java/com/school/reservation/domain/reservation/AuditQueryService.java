package com.school.reservation.domain.reservation;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditQueryService {

    private final ReservationHistoryRepository reservationHistoryRepository;

    public AuditQueryService(ReservationHistoryRepository reservationHistoryRepository) {
        this.reservationHistoryRepository = reservationHistoryRepository;
    }

    @Transactional(readOnly = true)
    public List<ReservationHistory> getReservationHistories(UUID reservationId) {
        return reservationHistoryRepository.findByReservationIdOrderByCreatedAtDesc(reservationId);
    }

    @Transactional(readOnly = true)
    public Page<ReservationHistory> searchHistories(UUID reservationId, Pageable pageable) {
        if (reservationId == null) {
            return reservationHistoryRepository.findAllByOrderByCreatedAtDesc(pageable);
        }
        return reservationHistoryRepository.findByReservationIdOrderByCreatedAtDesc(reservationId, pageable);
    }
}
