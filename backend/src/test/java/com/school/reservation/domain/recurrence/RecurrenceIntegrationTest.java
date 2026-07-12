package com.school.reservation.domain.recurrence;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.support.IntegrationTestSupport;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class RecurrenceIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void recurrencePreviewAndCreateSucceed() throws Exception {
        MockHttpSession session = loginAdminSession();
        LocalDate startDate = nextWeekdayAt(9, 0).toLocalDate();
        UUID tagId = createTag("Regular Class", "#2563eb");

        mockMvc.perform(post("/api/admin/recurrences/preview")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(previewBody(startDate, startDate)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.conflictPolicy").value("FAIL_ALL"))
            .andExpect(jsonPath("$.totalCandidates").value(1))
            .andExpect(jsonPath("$.availableCount").value(1))
            .andExpect(jsonPath("$.createAllowed").value(true));

        String response = mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(startDate, startDate, "FAIL_ALL", tagId)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.createdCount").value(1))
            .andExpect(jsonPath("$.tagId").value(tagId.toString()))
            .andExpect(jsonPath("$.tagName").value("Regular Class"))
            .andExpect(jsonPath("$.tagColor").value("#2563eb"))
            .andReturn()
            .getResponse()
            .getContentAsString();

        UUID recurrenceId = UUID.fromString(objectMapper.readTree(response).get("recurrenceId").asText());
        mockMvc.perform(get("/api/admin/recurrences/{recurrenceId}", recurrenceId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deleted").value(false))
            .andExpect(jsonPath("$.tagId").value(tagId.toString()))
            .andExpect(jsonPath("$.tagName").value("Regular Class"))
            .andExpect(jsonPath("$.tagColor").value("#2563eb"))
            .andExpect(jsonPath("$.reservations[0].id").isNotEmpty())
            .andExpect(jsonPath("$.reservations[0].exception").value(false));

        UUID reservationId = generatedReservationId(recurrenceId);
        mockMvc.perform(get("/api/admin/reservations/{reservationId}", reservationId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.recurrenceId").value(recurrenceId.toString()))
            .andExpect(jsonPath("$.series.id").value(recurrenceId.toString()))
            .andExpect(jsonPath("$.series.label").value("Regular Class"))
            .andExpect(jsonPath("$.series.color").value("#2563eb"))
            .andExpect(jsonPath("$.recurrenceException").value(false));
    }

    @Test
    void skipConflictsCreatesOnlyAvailableCandidates() throws Exception {
        MockHttpSession session = loginAdminSession();
        LocalDate firstDate = nextWeekdayAt(9, 0).toLocalDate();
        LocalDate secondDate = firstDate.plusDays(7);
        createBlockingReservation(session, firstDate);

        mockMvc.perform(post("/api/admin/recurrences/preview")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(previewBody(firstDate, secondDate, "SKIP_CONFLICTS")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalCandidates").value(2))
            .andExpect(jsonPath("$.availableCount").value(1))
            .andExpect(jsonPath("$.conflictCount").value(1))
            .andExpect(jsonPath("$.createAllowed").value(true))
            .andExpect(jsonPath("$.items[0].available").value(false))
            .andExpect(jsonPath("$.items[0].reason").value("TIME_SLOT_CONFLICT"))
            .andExpect(jsonPath("$.items[1].available").value(true));

        String response = mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(firstDate, secondDate, "SKIP_CONFLICTS")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.recurrenceId").isNotEmpty())
            .andExpect(jsonPath("$.createdCount").value(1))
            .andExpect(jsonPath("$.skippedCount").value(1))
            .andExpect(jsonPath("$.failedCount").value(0))
            .andExpect(jsonPath("$.items[0].status").value("SKIPPED"))
            .andExpect(jsonPath("$.items[0].reason").value("TIME_SLOT_CONFLICT"))
            .andExpect(jsonPath("$.items[1].status").value("CREATED"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        UUID recurrenceId = UUID.fromString(objectMapper.readTree(response).get("recurrenceId").asText());

        assertThat(generatedReservationCount()).isEqualTo(1);
        assertThat(generatedReservationCount(recurrenceId)).isEqualTo(1);
        assertThat(activeRecurrenceCount()).isEqualTo(1);
    }

    @Test
    void recurrenceWithoutTagKeepsCompatibilityFieldsNull() throws Exception {
        MockHttpSession session = loginAdminSession();
        LocalDate startDate = nextWeekdayAt(11, 0).toLocalDate();
        String purpose = "Weekly lecture without tag";

        String response = mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(startDate, startDate, "FAIL_ALL", null, purpose)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.tagId").value(nullValue()))
            .andExpect(jsonPath("$.tagName").value(nullValue()))
            .andExpect(jsonPath("$.tagColor").value(nullValue()))
            .andReturn()
            .getResponse()
            .getContentAsString();
        UUID recurrenceId = UUID.fromString(objectMapper.readTree(response).get("recurrenceId").asText());
        UUID reservationId = generatedReservationId(recurrenceId);

        mockMvc.perform(get("/api/admin/reservations/{reservationId}", reservationId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.series.id").value(recurrenceId.toString()))
            .andExpect(jsonPath("$.series.label").value(nullValue()))
            .andExpect(jsonPath("$.series.color").value(nullValue()))
            .andExpect(jsonPath("$.recurrenceException").value(false));

        mockMvc.perform(get("/api/admin/reservations")
                .session(session)
                .param("keyword", purpose))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].recurrenceId").value(recurrenceId.toString()))
            .andExpect(jsonPath("$.items[0].seriesLabel").value(nullValue()))
            .andExpect(jsonPath("$.items[0].seriesColor").value(nullValue()));

        mockMvc.perform(get("/api/public/rooms/{roomId}/weekly-reservations", testRoomId())
                .param("weekStart", startDate.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reservations[0].recurrenceId").value(recurrenceId.toString()))
            .andExpect(jsonPath("$.reservations[0].seriesLabel").value(nullValue()))
            .andExpect(jsonPath("$.reservations[0].seriesColor").value(nullValue()));
    }

    @Test
    void updatingTagIsImmediatelyReflectedInRecurrenceDetailAndTimetable() throws Exception {
        MockHttpSession session = loginAdminSession();
        LocalDate startDate = nextWeekdayAt(13, 0).toLocalDate();
        UUID tagId = createTag("Before Update", "#2563eb");

        String response = mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(startDate, startDate, "FAIL_ALL", tagId, "Tagged lecture")))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        UUID recurrenceId = UUID.fromString(objectMapper.readTree(response).get("recurrenceId").asText());
        UUID reservationId = generatedReservationId(recurrenceId);

        mockMvc.perform(put("/api/admin/tags/{tagId}", tagId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "After Update",
                      "color": "#dc2626"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("After Update"))
            .andExpect(jsonPath("$.color").value("#dc2626"));

        mockMvc.perform(get("/api/admin/recurrences/{recurrenceId}", recurrenceId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tagId").value(tagId.toString()))
            .andExpect(jsonPath("$.tagName").value("After Update"))
            .andExpect(jsonPath("$.tagColor").value("#dc2626"));

        mockMvc.perform(get("/api/admin/reservations/{reservationId}", reservationId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.series.id").value(recurrenceId.toString()))
            .andExpect(jsonPath("$.series.label").value("After Update"))
            .andExpect(jsonPath("$.series.color").value("#dc2626"));

        mockMvc.perform(get("/api/public/rooms/{roomId}/weekly-reservations", testRoomId())
                .param("weekStart", startDate.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reservations[0].recurrenceId").value(recurrenceId.toString()))
            .andExpect(jsonPath("$.reservations[0].seriesLabel").value("After Update"))
            .andExpect(jsonPath("$.reservations[0].seriesColor").value("#dc2626"));
    }

    @Test
    void createAvailableOnlyIsRejectedAsUnsupportedPolicy() throws Exception {
        MockHttpSession session = loginAdminSession();
        LocalDate firstDate = nextWeekdayAt(9, 0).toLocalDate();
        LocalDate secondDate = firstDate.plusDays(7);

        mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(firstDate, secondDate, "CREATE_AVAILABLE_ONLY")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void failAllRollsBackWhenAnyCandidateConflicts() throws Exception {
        MockHttpSession session = loginAdminSession();
        LocalDate firstDate = nextWeekdayAt(9, 0).toLocalDate();
        LocalDate secondDate = firstDate.plusDays(7);
        createBlockingReservation(session, firstDate);

        mockMvc.perform(post("/api/admin/recurrences/preview")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(previewBody(firstDate, secondDate)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalCandidates").value(2))
            .andExpect(jsonPath("$.availableCount").value(1))
            .andExpect(jsonPath("$.conflictCount").value(1));

        mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(firstDate, secondDate, "FAIL_ALL")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("RECURRENCE_CONFLICT"))
            .andExpect(jsonPath("$.details.failedCount").value(1));

        mockMvc.perform(get("/api/admin/recurrences").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(0));

        assertThat(activeRecurrenceCount()).isZero();
        assertThat(generatedReservationCount()).isZero();
    }

    @Test
    void recurrenceCancelSoftDeletesRuleAndCancelsLinkedReservations() throws Exception {
        MockHttpSession session = loginAdminSession();
        LocalDate startDate = nextWeekdayAt(9, 0).toLocalDate();

        String response = mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(startDate, startDate, "FAIL_ALL")))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        UUID recurrenceId = UUID.fromString(objectMapper.readTree(response).get("recurrenceId").asText());

        mockMvc.perform(post("/api/admin/recurrences/{recurrenceId}/cancel", recurrenceId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "cancel recurrence"
                    }
                    """))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/admin/recurrences/{recurrenceId}", recurrenceId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deleted").value(true));

        Integer cancelledCount = jdbcTemplate.queryForObject(
            "select count(*) from reservations where recurrence_id = ? and status = 'CANCELLED'",
            Integer.class,
            recurrenceId
        );
        Integer cancelHistoryCount = jdbcTemplate.queryForObject(
            "select count(*) from reservation_histories where action = 'RECURRENCE_CANCELLED'",
            Integer.class
        );
        Integer softDeletedCount = jdbcTemplate.queryForObject(
            "select count(*) from reservation_recurrences where id = ? and deleted_at is not null",
            Integer.class,
            recurrenceId
        );
        assertThat(cancelledCount).isEqualTo(1);
        assertThat(cancelHistoryCount).isEqualTo(1);
        assertThat(softDeletedCount).isEqualTo(1);
    }

    private String previewBody(LocalDate startDate, LocalDate endDate) {
        return previewBody(startDate, endDate, "FAIL_ALL");
    }

    private String previewBody(LocalDate startDate, LocalDate endDate, String conflictPolicy) {
        return """
            {
              "roomId": "%s",
              "startDate": "%s",
              "endDate": "%s",
              "daysOfWeek": ["%s"],
              "startTime": "09:00:00",
              "endTime": "10:00:00",
              "applicantPhone": "010-5555-5555",
              "conflictPolicy": "%s"
            }
            """.formatted(testRoomId(), startDate, endDate, dayCode(startDate), conflictPolicy);
    }

    private String createBody(LocalDate startDate, LocalDate endDate, String conflictPolicy) {
        return createBody(startDate, endDate, conflictPolicy, null);
    }

    private String createBody(LocalDate startDate, LocalDate endDate, String conflictPolicy, UUID tagId) {
        return createBody(startDate, endDate, conflictPolicy, tagId, "Weekly lecture");
    }

    private String createBody(LocalDate startDate, LocalDate endDate, String conflictPolicy, UUID tagId, String purpose) {
        return """
            {
              "roomId": "%s",
              "applicantName": "Recurring Class",
              "applicantEmail": "class@example.com",
              "applicantPhone": "010-5555-5555",
              "purpose": "%s",
              "tagId": %s,
              "startDate": "%s",
              "endDate": "%s",
              "daysOfWeek": ["%s"],
              "startTime": "09:00:00",
              "endTime": "10:00:00",
              "conflictPolicy": "%s"
            }
            """.formatted(
                testRoomId(),
                purpose,
                tagId == null ? "null" : "\"" + tagId + "\"",
                startDate,
                endDate,
                dayCode(startDate),
                conflictPolicy
            );
    }

    private UUID createTag(String name, String color) {
        return jdbcTemplate.queryForObject(
            "insert into tags (name, color) values (?, ?) returning id",
            UUID.class,
            name,
            color
        );
    }

    private String dayCode(LocalDate date) {
        return date.getDayOfWeek().name().substring(0, 3);
    }

    private void createBlockingReservation(MockHttpSession session, LocalDate date) throws Exception {
        OffsetDateTime startAt = date.atTime(9, 0).atOffset(java.time.ZoneOffset.ofHours(9));
        createAdminReservation(
            session,
            testRoomId(),
            "Blocker",
            "blocker@example.com",
            startAt,
            startAt.plusHours(1),
            "Existing reservation"
        );
    }

    private int activeRecurrenceCount() {
        Integer count = jdbcTemplate.queryForObject(
            "select count(*) from reservation_recurrences where deleted_at is null",
            Integer.class
        );
        return count == null ? 0 : count;
    }

    private int generatedReservationCount() {
        Integer count = jdbcTemplate.queryForObject(
            "select count(*) from reservations where source = 'RECURRING_GENERATED'",
            Integer.class
        );
        return count == null ? 0 : count;
    }

    private int generatedReservationCount(UUID recurrenceId) {
        Integer count = jdbcTemplate.queryForObject(
            "select count(*) from reservations where source = 'RECURRING_GENERATED' and recurrence_id = ?",
            Integer.class,
            recurrenceId
        );
        return count == null ? 0 : count;
    }

    private UUID generatedReservationId(UUID recurrenceId) {
        return jdbcTemplate.queryForObject(
            "select id from reservations where source = 'RECURRING_GENERATED' and recurrence_id = ?",
            UUID.class,
            recurrenceId
        );
    }
}
