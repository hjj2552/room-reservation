package com.school.reservation.domain.recurrence;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationRecurrenceRepository extends JpaRepository<ReservationRecurrence, UUID> {

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
