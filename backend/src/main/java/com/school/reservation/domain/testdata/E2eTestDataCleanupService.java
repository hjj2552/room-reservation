package com.school.reservation.domain.testdata;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("!prod")
@ConditionalOnProperty(prefix = "app.e2e-cleanup", name = "enabled", havingValue = "true")
public class E2eTestDataCleanupService {

    private static final String DEFAULT_PREFIX = "e2e-";
    private static final String LEGACY_PREFIX = "e2e ";

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public E2eTestDataCleanupService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public E2eTestDataCleanupResponse cleanup(String prefix, boolean includeLegacy, boolean dryRun) {
        String normalizedPrefix = normalizePrefix(prefix);
        MatchPatterns patterns = new MatchPatterns(normalizedPrefix + "%", includeLegacy ? LEGACY_PREFIX + "%" : null);
        List<UUID> roomIds = findRoomIds(patterns);
        List<UUID> tagIds = findTagIds(patterns);
        List<UUID> recurrenceIds = findRecurrenceIds(patterns, roomIds);
        List<UUID> reservationIds = findReservationIds(patterns, roomIds, recurrenceIds);

        if (dryRun) {
            int roomCount = countDeletableRooms(roomIds, reservationIds, recurrenceIds);
            int tagCount = countDeletableTags(tagIds);
            return new E2eTestDataCleanupResponse(
                normalizedPrefix,
                true,
                includeLegacy,
                countHistories(patterns, reservationIds),
                reservationIds.size(),
                recurrenceIds.size(),
                tagCount,
                tagIds.size() - tagCount,
                roomCount,
                roomIds.size() - roomCount
            );
        }

        int historyCount = deleteHistories(patterns, reservationIds);
        int reservationCount = deleteByIds(
            "delete from reservations where id in (:ids)",
            reservationIds
        );
        int recurrenceCount = deleteByIds(
            "delete from reservation_recurrences where id in (:ids)",
            recurrenceIds
        );
        int tagCount = deleteTags(tagIds);
        int roomCount = deleteRooms(roomIds);

        return new E2eTestDataCleanupResponse(
            normalizedPrefix,
            false,
            includeLegacy,
            historyCount,
            reservationCount,
            recurrenceCount,
            tagCount,
            tagIds.size() - tagCount,
            roomCount,
            roomIds.size() - roomCount
        );
    }

    private String normalizePrefix(String prefix) {
        String normalized = prefix == null || prefix.isBlank() ? DEFAULT_PREFIX : prefix.trim().toLowerCase();
        if (!normalized.startsWith(DEFAULT_PREFIX) || normalized.length() < DEFAULT_PREFIX.length()) {
            throw new IllegalArgumentException("E2E cleanup prefix must start with e2e-.");
        }
        if (normalized.contains("%") || normalized.contains("_")) {
            throw new IllegalArgumentException("E2E cleanup prefix cannot contain SQL wildcard characters.");
        }
        return normalized;
    }

    private List<UUID> findRoomIds(MatchPatterns patterns) {
        return jdbcTemplate.queryForList(
            """
                select id
                from rooms
                where system_reserved = false
                  and %s
                """.formatted(matchExpression(patterns, "name")),
            roomParams(patterns),
            UUID.class
        );
    }

    private List<UUID> findTagIds(MatchPatterns patterns) {
        return jdbcTemplate.queryForList(
            """
                select id
                from tags
                where %s
                """.formatted(matchExpression(patterns, "name")),
            params(patterns),
            UUID.class
        );
    }

    private List<UUID> findRecurrenceIds(MatchPatterns patterns, List<UUID> roomIds) {
        String roomPredicate = roomIds.isEmpty() ? "" : "or room_id in (:roomIds)";
        MapSqlParameterSource params = params(patterns)
            .addValue("roomIds", roomIds);
        return jdbcTemplate.queryForList(
            """
                select id
                from reservation_recurrences
                where (
                    %s
                    or %s
                    or %s
                    %s
                )
                """.formatted(
                    matchExpression(patterns, "purpose"),
                    matchExpression(patterns, "applicant_name"),
                    matchExpression(patterns, "applicant_email"),
                    roomPredicate
                ),
            params,
            UUID.class
        );
    }

    private List<UUID> findReservationIds(MatchPatterns patterns, List<UUID> roomIds, List<UUID> recurrenceIds) {
        String roomPredicate = roomIds.isEmpty() ? "" : "or room_id in (:roomIds)";
        String recurrencePredicate = recurrenceIds.isEmpty() ? "" : "or recurrence_id in (:recurrenceIds)";
        MapSqlParameterSource params = params(patterns)
            .addValue("roomIds", roomIds)
            .addValue("recurrenceIds", recurrenceIds);
        return jdbcTemplate.queryForList(
            """
                select id
                from reservations
                where (
                    %s
                    or %s
                    or %s
                    %s
                    %s
                )
                """.formatted(
                    matchExpression(patterns, "purpose"),
                    matchExpression(patterns, "applicant_name"),
                    matchExpression(patterns, "applicant_email"),
                    roomPredicate,
                    recurrencePredicate
                ),
            params,
            UUID.class
        );
    }

    private int countHistories(MatchPatterns patterns, List<UUID> reservationIds) {
        MapSqlParameterSource params = params(patterns)
            .addValue("ids", reservationIds);
        Integer count = jdbcTemplate.queryForObject(
            "select count(*) from reservation_histories where " + historyMatchExpression(patterns, reservationIds),
            params,
            Integer.class
        );
        return count == null ? 0 : count;
    }

    private int deleteHistories(MatchPatterns patterns, List<UUID> reservationIds) {
        MapSqlParameterSource params = params(patterns)
            .addValue("ids", reservationIds);
        return jdbcTemplate.update(
            "delete from reservation_histories where " + historyMatchExpression(patterns, reservationIds),
            params
        );
    }

    private int deleteByIds(String sql, List<UUID> ids) {
        if (ids.isEmpty()) {
            return 0;
        }
        return jdbcTemplate.update(sql, Map.of("ids", ids));
    }

    private int deleteRooms(List<UUID> roomIds) {
        if (roomIds.isEmpty()) {
            return 0;
        }
        return jdbcTemplate.update(
            """
                delete from rooms r
                where r.id in (:ids)
                  and r.system_reserved = false
                  and not exists (
                    select 1
                    from reservations reservation
                    where reservation.room_id = r.id
                  )
                  and not exists (
                    select 1
                    from reservation_recurrences recurrence
                    where recurrence.room_id = r.id
                  )
                """,
            Map.of("ids", roomIds)
        );
    }

    private int deleteTags(List<UUID> tagIds) {
        if (tagIds.isEmpty()) {
            return 0;
        }
        return jdbcTemplate.update(
            """
                delete from tags t
                where t.id in (:ids)
                  and not exists (
                    select 1
                    from reservation_recurrences recurrence
                    where recurrence.tag_id = t.id
                  )
                """,
            Map.of("ids", tagIds)
        );
    }

    private int countDeletableTags(List<UUID> tagIds) {
        if (tagIds.isEmpty()) {
            return 0;
        }
        Integer count = jdbcTemplate.queryForObject(
            """
                select count(*)
                from tags t
                where t.id in (:ids)
                  and not exists (
                    select 1
                    from reservation_recurrences recurrence
                    where recurrence.tag_id = t.id
                  )
                """,
            Map.of("ids", tagIds),
            Integer.class
        );
        return count == null ? 0 : count;
    }

    private int countDeletableRooms(List<UUID> roomIds, List<UUID> reservationIds, List<UUID> recurrenceIds) {
        if (roomIds.isEmpty()) {
            return 0;
        }
        String reservationExclusion = reservationIds.isEmpty() ? "" : "and reservation.id not in (:reservationIds)";
        String recurrenceExclusion = recurrenceIds.isEmpty() ? "" : "and recurrence.id not in (:recurrenceIds)";
        MapSqlParameterSource params = new MapSqlParameterSource("ids", roomIds)
            .addValue("reservationIds", reservationIds)
            .addValue("recurrenceIds", recurrenceIds);
        Integer count = jdbcTemplate.queryForObject(
            """
                select count(*)
                from rooms r
                where r.id in (:ids)
                  and r.system_reserved = false
                  and not exists (
                    select 1
                    from reservations reservation
                    where reservation.room_id = r.id
                    %s
                  )
                  and not exists (
                    select 1
                    from reservation_recurrences recurrence
                    where recurrence.room_id = r.id
                    %s
                  )
                """.formatted(reservationExclusion, recurrenceExclusion),
            params,
            Integer.class
        );
        return count == null ? 0 : count;
    }

    private MapSqlParameterSource roomParams(MatchPatterns patterns) {
        return params(patterns);
    }

    private MapSqlParameterSource params(MatchPatterns patterns) {
        return new MapSqlParameterSource("prefix", patterns.prefixPattern())
            .addValue("legacyPrefix", patterns.legacyPrefixPattern());
    }

    private String matchExpression(MatchPatterns patterns, String column) {
        String expression = "lower(" + column + ") like :prefix";
        if (patterns.legacyPrefixPattern() != null) {
            expression += " or lower(" + column + ") like :legacyPrefix";
        }
        return "(" + expression + ")";
    }

    private String historyMatchExpression(MatchPatterns patterns, List<UUID> reservationIds) {
        String expression = matchExpression(patterns, "reservation_purpose")
            + " or " + matchExpression(patterns, "reservation_room_name");
        if (!reservationIds.isEmpty()) {
            expression = "reservation_id in (:ids) or reservation_deleted_id in (:ids) or " + expression;
        }
        return "(" + expression + ")";
    }

    private record MatchPatterns(String prefixPattern, String legacyPrefixPattern) {
    }
}
