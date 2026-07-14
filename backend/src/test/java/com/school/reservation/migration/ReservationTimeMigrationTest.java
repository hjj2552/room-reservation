package com.school.reservation.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class ReservationTimeMigrationTest {

    @Autowired
    DataSource dataSource;

    private final List<String> schemas = new ArrayList<>();

    @AfterEach
    void dropMigrationSchemas() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        for (String schema : schemas) {
            jdbc.execute("drop schema if exists " + schema + " cascade");
        }
        schemas.clear();
    }

    @Test
    void emptyDatabaseMigratesThroughLatestVersion() {
        String schema = newSchema();

        int migrations = flyway(schema, null).migrate().migrationsExecuted;

        assertThat(migrations).isEqualTo(2);
        assertThat(slotMinutes(schema)).isEqualTo(30);
        assertThat(constraintExists(schema, "chk_operation_settings_time_grid_alignment")).isTrue();
    }

    @Test
    void versionOneDatabaseWithThirtyMinuteSettingUpgradesAndRejectsSixty() {
        String schema = newSchema();
        flyway(schema, MigrationVersion.fromVersion("1")).migrate();

        assertThat(flyway(schema, null).migrate().migrationsExecuted).isEqualTo(1);
        assertThat(slotMinutes(schema)).isEqualTo(30);
        assertThat(constraintExists(schema, "chk_operation_settings_time_slot_alignment")).isFalse();
        assertThat(constraintExists(schema, "chk_operation_settings_time_grid_alignment")).isTrue();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update(
            "update " + schema + ".operation_settings set slot_minutes = 15, min_reservation_minutes = 45, max_reservation_minutes = 120 where id = 1"
        );
        UUID roomId = jdbc.queryForObject(
            "insert into " + schema + ".rooms (name, capacity, enabled, system_reserved) values ('testing-room-migration', 10, true, false) returning id",
            UUID.class
        );
        assertThatThrownBy(() -> jdbc.update("""
            insert into %s.reservations (
              room_id, applicant_name, applicant_email, applicant_phone, purpose,
              start_at, end_at, status, source, created_by_actor_type
            ) values (?, 'testing-user', 'testing@example.test', '010-0000-0000', 'testing-seconds',
              '2026-07-13 09:15:01+09', '2026-07-13 10:00:01+09', 'CONFIRMED', 'ADMIN_MANUAL', 'ADMIN')
            """.formatted(schema), roomId))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
            insert into %s.reservation_recurrences (
              room_id, applicant_name, applicant_email, applicant_phone, purpose,
              start_date, end_date, days_of_week, start_time, end_time, conflict_policy
            ) values (?, 'testing-user', 'testing@example.test', '010-0000-0000', 'testing-nanos',
              '2026-07-13', '2026-07-13', 'MON', '09:15:00.000000001', '10:00:00', 'FAIL_ALL')
            """.formatted(schema), roomId))
            .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> jdbc.update(
            "update " + schema + ".operation_settings set slot_minutes = 60 where id = 1"
        )).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(slotMinutes(schema)).isEqualTo(15);
    }

    @Test
    void versionOneDatabaseWithSixtyMinuteSettingFailsWithoutPartialChanges() {
        String schema = newSchema();
        flyway(schema, MigrationVersion.fromVersion("1")).migrate();
        new JdbcTemplate(dataSource).update(
            "update " + schema + ".operation_settings set slot_minutes = 60, min_reservation_minutes = 60 where id = 1"
        );

        assertThatThrownBy(() -> flyway(schema, null).migrate())
            .isInstanceOf(FlywayException.class)
            .hasStackTraceContaining("operation_settings.slot_minutes is 60");

        assertThat(slotMinutes(schema)).isEqualTo(60);
        assertThat(constraintExists(schema, "chk_operation_settings_time_slot_alignment")).isTrue();
        assertThat(constraintExists(schema, "chk_operation_settings_time_grid_alignment")).isFalse();
    }

    private Flyway flyway(String schema, MigrationVersion target) {
        var configuration = Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .defaultSchema(schema)
            .schemas(schema)
            .createSchemas(true);
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private String newSchema() {
        String schema = "testing_migration_" + UUID.randomUUID().toString().replace("-", "");
        schemas.add(schema);
        return schema;
    }

    private int slotMinutes(String schema) {
        return new JdbcTemplate(dataSource).queryForObject(
            "select slot_minutes from " + schema + ".operation_settings where id = 1",
            Integer.class
        );
    }

    private boolean constraintExists(String schema, String constraintName) {
        Boolean exists = new JdbcTemplate(dataSource).queryForObject(
            """
                select exists (
                  select 1
                  from pg_constraint constraint_definition
                  join pg_namespace namespace on namespace.oid = constraint_definition.connamespace
                  where namespace.nspname = ?
                    and constraint_definition.conname = ?
                )
                """,
            Boolean.class,
            schema,
            constraintName
        );
        return Boolean.TRUE.equals(exists);
    }
}
