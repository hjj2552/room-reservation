package com.school.reservation.domain.testdata;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import com.school.reservation.support.MockMvcCsrfTestConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(MockMvcCsrfTestConfiguration.class)
class E2eTestDataCleanupIntegrationTest {

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    MockMvc mockMvc;

    @BeforeEach
    void clearCleanupTestRows() {
        jdbcTemplate.update("""
            delete from reservation_histories
            where reservation_id in (
              select id
              from reservations
              where lower(purpose) like 'e2e-%'
                 or lower(purpose) like 'e2e %'
                 or applicant_email in ('manual@example.test')
            )
            """);
        jdbcTemplate.update("""
            delete from reservations
            where lower(purpose) like 'e2e-%'
               or lower(purpose) like 'e2e %'
               or applicant_email in ('manual@example.test')
            """);
        jdbcTemplate.update("""
            delete from reservation_recurrences
            where lower(purpose) like 'e2e-%'
               or lower(purpose) like 'e2e %'
               or applicant_email in ('manual-recurring-tag@example.test')
            """);
        jdbcTemplate.update("delete from tags where lower(name) like 'e2e-%' or lower(name) like 'e2e %'");
        jdbcTemplate.update("delete from rooms where lower(name) like 'e2e-%' or lower(name) like 'e2e %' or name in ('Manual Acceptance Room', 'Series Label Cleanup Room', 'Tag Cleanup Reference Room')");
    }

    @Test
    void cleanupDeletesOnlyE2ePrefixedDataIncludingRecurrenceChildren() throws Exception {
        MockHttpSession session = loginAdminSession();
        UUID e2eRoomId = UUID.randomUUID();
        UUID normalRoomId = UUID.randomUUID();
        UUID recurrenceId = UUID.randomUUID();
        UUID directReservationId = UUID.randomUUID();
        UUID generatedReservationId = UUID.randomUUID();
        UUID normalReservationId = UUID.randomUUID();
        UUID e2eTagId = UUID.randomUUID();

        insertRoom(e2eRoomId, "e2e-room-cleanup");
        insertRoom(normalRoomId, "Manual Acceptance Room");
        insertTag(e2eTagId, "e2e-tag-cleanup");
        insertRecurrence(recurrenceId, e2eRoomId, "e2e-reservation-recurring");
        insertReservation(directReservationId, e2eRoomId, null, "e2e-admin", "e2e-reservation-direct", "e2e-direct@example.test", 0);
        insertReservation(generatedReservationId, e2eRoomId, recurrenceId, "e2e-admin", "e2e-reservation-generated", "e2e-generated@example.test", 2);
        insertReservation(normalReservationId, normalRoomId, null, "Manual User", "Manual reservation", "manual@example.test", 0);
        insertHistory(directReservationId);
        insertHistory(generatedReservationId);
        insertHistory(normalReservationId);

        mockMvc.perform(delete("/api/admin/test-data/e2e")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.prefix").value("e2e-"))
            .andExpect(jsonPath("$.dryRun").value(false))
            .andExpect(jsonPath("$.includeLegacy").value(false))
            .andExpect(jsonPath("$.reservationHistoriesDeleted").value(2))
            .andExpect(jsonPath("$.reservationsDeleted").value(2))
            .andExpect(jsonPath("$.recurrencesDeleted").value(1))
            .andExpect(jsonPath("$.tagsDeleted").value(1))
            .andExpect(jsonPath("$.tagsSkipped").value(0))
            .andExpect(jsonPath("$.roomsDeleted").value(1))
            .andExpect(jsonPath("$.roomsSkipped").value(0));

        assertThat(count("select count(*) from rooms where id = ?", e2eRoomId)).isZero();
        assertThat(count("select count(*) from reservations where id in (?, ?)", directReservationId, generatedReservationId)).isZero();
        assertThat(count("select count(*) from reservation_recurrences where id = ?", recurrenceId)).isZero();
        assertThat(count("select count(*) from tags where id = ?", e2eTagId)).isZero();
        assertThat(count("select count(*) from rooms where id = ?", normalRoomId)).isEqualTo(1);
        assertThat(count("select count(*) from reservations where id = ?", normalReservationId)).isEqualTo(1);
        assertThat(count("select count(*) from reservation_histories where reservation_id = ?", normalReservationId)).isEqualTo(1);
    }

    @Test
    void previewReportsE2eCleanupWithoutDeleting() throws Exception {
        MockHttpSession session = loginAdminSession();
        UUID e2eRoomId = UUID.randomUUID();
        UUID reservationId = UUID.randomUUID();

        insertRoom(e2eRoomId, "e2e-room-preview");
        insertReservation(reservationId, e2eRoomId, null, "e2e-admin", "e2e-reservation-preview", "e2e-preview@example.test", 0);
        insertHistory(reservationId);

        mockMvc.perform(get("/api/admin/test-data/e2e/preview")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dryRun").value(true))
            .andExpect(jsonPath("$.includeLegacy").value(false))
            .andExpect(jsonPath("$.reservationHistoriesDeleted").value(1))
            .andExpect(jsonPath("$.reservationsDeleted").value(1))
            .andExpect(jsonPath("$.tagsDeleted").value(0))
            .andExpect(jsonPath("$.roomsDeleted").value(1));

        assertThat(count("select count(*) from rooms where id = ?", e2eRoomId)).isEqualTo(1);
        assertThat(count("select count(*) from reservations where id = ?", reservationId)).isEqualTo(1);
        assertThat(count("select count(*) from reservation_histories where reservation_id = ?", reservationId)).isEqualTo(1);
    }

    @Test
    void cleanupDeletesRecurrenceAndGeneratedReservationsIdentifiedByRecurrenceMarker() throws Exception {
        MockHttpSession session = loginAdminSession();
        UUID roomId = UUID.randomUUID();
        UUID recurrenceId = UUID.randomUUID();
        UUID generatedReservationId = UUID.randomUUID();

        insertRoom(roomId, "Series Label Cleanup Room");
        insertRecurrence(
            recurrenceId,
            roomId,
            "Manual Recurring Admin",
            "manual-recurring@example.test",
            "e2e-recurring-marker-cleanup"
        );
        insertReservation(
            generatedReservationId,
            roomId,
            recurrenceId,
            "Manual Generated User",
            "Manual generated reservation",
            "manual-generated@example.test",
            0
        );
        insertHistory(generatedReservationId);

        mockMvc.perform(delete("/api/admin/test-data/e2e")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reservationHistoriesDeleted").value(1))
            .andExpect(jsonPath("$.reservationsDeleted").value(1))
            .andExpect(jsonPath("$.recurrencesDeleted").value(1))
            .andExpect(jsonPath("$.roomsDeleted").value(0))
            .andExpect(jsonPath("$.roomsSkipped").value(0));

        assertThat(count("select count(*) from reservations where id = ?", generatedReservationId)).isZero();
        assertThat(count("select count(*) from reservation_recurrences where id = ?", recurrenceId)).isZero();
        assertThat(count("select count(*) from reservation_histories where reservation_id = ?", generatedReservationId)).isZero();
        assertThat(count("select count(*) from rooms where id = ?", roomId)).isEqualTo(1);

        jdbcTemplate.update("delete from rooms where id = ?", roomId);
    }

    @Test
    void includeLegacyDeletesOldE2eSpaceNamedDataOnlyWhenRequested() throws Exception {
        MockHttpSession session = loginAdminSession();
        UUID legacyRoomId = UUID.randomUUID();
        UUID legacyReservationId = UUID.randomUUID();

        insertRoom(legacyRoomId, "E2E Legacy Room");
        insertReservation(legacyReservationId, legacyRoomId, null, "E2E Admin", "E2E legacy reservation", "legacy@example.test", 0);
        insertHistory(legacyReservationId);

        mockMvc.perform(get("/api/admin/test-data/e2e/preview")
                .session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.includeLegacy").value(false))
            .andExpect(jsonPath("$.reservationsDeleted").value(0))
            .andExpect(jsonPath("$.roomsDeleted").value(0));

        mockMvc.perform(delete("/api/admin/test-data/e2e")
                .session(session)
                .param("includeLegacy", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.includeLegacy").value(true))
            .andExpect(jsonPath("$.reservationHistoriesDeleted").value(1))
            .andExpect(jsonPath("$.reservationsDeleted").value(1))
            .andExpect(jsonPath("$.roomsDeleted").value(1));

        assertThat(count("select count(*) from rooms where id = ?", legacyRoomId)).isZero();
        assertThat(count("select count(*) from reservations where id = ?", legacyReservationId)).isZero();
    }

    @Test
    void cleanupRejectsUnsafePrefix() throws Exception {
        MockHttpSession session = loginAdminSession();

        mockMvc.perform(delete("/api/admin/test-data/e2e")
                .session(session)
                .param("prefix", "room-"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(containsString("E2E cleanup prefix")));
    }

    private void insertRoom(UUID roomId, String name) {
        jdbcTemplate.update(
            """
                insert into rooms (id, name, location, capacity, description, enabled, system_reserved)
                values (?, ?, 'Cleanup Test', 10, 'Cleanup test room', true, false)
                """,
            roomId,
            name
        );
    }

    private void insertRecurrence(UUID recurrenceId, UUID roomId, String purpose) {
        insertRecurrence(
            recurrenceId,
            roomId,
            "e2e-recurring-admin",
            "e2e-recurring@example.test",
            purpose
        );
    }

    @Test
    void cleanupSkipsE2eTagStillReferencedByNonE2eRecurrence() throws Exception {
        MockHttpSession session = loginAdminSession();
        UUID roomId = UUID.randomUUID();
        UUID tagId = UUID.randomUUID();
        UUID recurrenceId = UUID.randomUUID();

        insertRoom(roomId, "Tag Cleanup Reference Room");
        insertTag(tagId, "e2e-tag-referenced");
        insertRecurrence(
            recurrenceId,
            roomId,
            tagId,
            "Manual Recurring Admin",
            "manual-recurring-tag@example.test",
            "Manual tagged recurrence"
        );

        mockMvc.perform(delete("/api/admin/test-data/e2e")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tagsDeleted").value(0))
            .andExpect(jsonPath("$.tagsSkipped").value(1));

        assertThat(count("select count(*) from tags where id = ?", tagId)).isEqualTo(1);
        assertThat(count("select count(*) from reservation_recurrences where id = ?", recurrenceId)).isEqualTo(1);

        jdbcTemplate.update("delete from reservation_recurrences where id = ?", recurrenceId);
        jdbcTemplate.update("delete from tags where id = ?", tagId);
        jdbcTemplate.update("delete from rooms where id = ?", roomId);
    }

    private void insertRecurrence(
        UUID recurrenceId,
        UUID roomId,
        String applicantName,
        String applicantEmail,
        String purpose
    ) {
        insertRecurrence(recurrenceId, roomId, null, applicantName, applicantEmail, purpose);
    }

    private void insertRecurrence(
        UUID recurrenceId,
        UUID roomId,
        UUID tagId,
        String applicantName,
        String applicantEmail,
        String purpose
    ) {
        jdbcTemplate.update(
            """
                insert into reservation_recurrences (
                  id,
                  room_id,
                  tag_id,
                  applicant_name,
                  applicant_email,
                  applicant_phone,
                  purpose,
                  start_date,
                  end_date,
                  days_of_week,
                  start_time,
                  end_time,
                  conflict_policy
                )
                values (?, ?, ?, ?, ?, '010-0000-0000', ?, current_date + interval '21 days', current_date + interval '35 days', 'MON', '10:00', '11:00', 'SKIP_CONFLICTS'::recurrence_conflict_policy)
                """,
            recurrenceId,
            roomId,
            tagId,
            applicantName,
            applicantEmail,
            purpose
        );
    }

    private void insertTag(UUID tagId, String name) {
        jdbcTemplate.update(
            """
                insert into tags (id, name, color)
                values (?, ?, '#2563eb')
                """,
            tagId,
            name
        );
    }

    private void insertReservation(
        UUID reservationId,
        UUID roomId,
        UUID recurrenceId,
        String applicantName,
        String purpose,
        String email,
        int hourOffset
    ) {
        jdbcTemplate.update(
            """
                insert into reservations (
                  id,
                  room_id,
                  recurrence_id,
                  applicant_name,
                  applicant_email,
                  applicant_phone,
                  purpose,
                  start_at,
                  end_at,
                  status,
                  source,
                  created_by_actor_type
                )
                values (?, ?, ?, ?, ?, '010-0000-0000', ?, current_timestamp + interval '21 days' + (? * interval '1 hour'), current_timestamp + interval '21 days' + ((? + 1) * interval '1 hour'), 'CONFIRMED'::reservation_status, 'ADMIN_MANUAL'::reservation_source, 'ADMIN'::actor_type)
                """,
            reservationId,
            roomId,
            recurrenceId,
            applicantName,
            email,
            purpose,
            hourOffset,
            hourOffset
        );
    }

    private void insertHistory(UUID reservationId) {
        jdbcTemplate.update(
            """
                insert into reservation_histories (reservation_id, action, after_status, memo, actor_type, actor_id)
                values (?, 'CREATED_BY_ADMIN', 'CONFIRMED'::reservation_status, 'cleanup test', 'ADMIN'::actor_type, 'admin')
                """,
            reservationId
        );
    }

    private MockHttpSession loginAdminSession() throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username": "admin",
                      "password": "admin1234"
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession(false);
    }

    private int count(String sql, Object... args) {
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, args);
        return count == null ? 0 : count;
    }
}
