package com.school.reservation.domain.reservation;

import java.util.List;
import java.util.UUID;
import java.time.OffsetDateTime;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.criteria.JoinType;

@Service
public class AuditQueryService {

    private final ReservationHistoryRepository reservationHistoryRepository;

    public AuditQueryService(ReservationHistoryRepository reservationHistoryRepository) {
        this.reservationHistoryRepository = reservationHistoryRepository;
    }

    @Transactional(readOnly = true)
    public List<ReservationHistory> getReservationHistories(UUID reservationId) {
        return reservationHistoryRepository.findByReservationIdIncludingDeletedOrderByCreatedAtDesc(reservationId);
    }

    @Transactional(readOnly = true)
    public Page<ReservationHistory> searchHistories(UUID reservationId, Pageable pageable) {
        return searchHistories(reservationId, null, null, null, null, pageable);
    }

    @Transactional(readOnly = true)
    public Page<ReservationHistory> searchHistories(
        UUID reservationId,
        UUID roomId,
        ReservationHistory.Action action,
        OffsetDateTime fromAt,
        OffsetDateTime toAt,
        Pageable pageable
    ) {
        return reservationHistoryRepository.findAll(
            historySpec(reservationId, roomId, action, fromAt, toAt),
            pageable
        );
    }

    private Specification<ReservationHistory> historySpec(
        UUID reservationId,
        UUID roomId,
        ReservationHistory.Action action,
        OffsetDateTime fromAt,
        OffsetDateTime toAt
    ) {
        return (root, query, criteriaBuilder) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            var reservation = root.join("reservation", JoinType.LEFT);

            if (reservationId != null) {
                predicates.add(criteriaBuilder.or(
                    criteriaBuilder.equal(reservation.get("id"), reservationId),
                    criteriaBuilder.equal(root.get("reservationDeletedId"), reservationId)
                ));
            }
            if (roomId != null) {
                predicates.add(criteriaBuilder.or(
                    criteriaBuilder.equal(reservation.get("room").get("id"), roomId),
                    criteriaBuilder.equal(root.get("reservationRoomId"), roomId)
                ));
            }
            if (action != null) {
                predicates.add(criteriaBuilder.equal(root.get("action"), action));
            }
            if (fromAt != null) {
                predicates.add(criteriaBuilder.greaterThanOrEqualTo(root.get("createdAt"), fromAt));
            }
            if (toAt != null) {
                predicates.add(criteriaBuilder.lessThanOrEqualTo(root.get("createdAt"), toAt));
            }

            return criteriaBuilder.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }
}
