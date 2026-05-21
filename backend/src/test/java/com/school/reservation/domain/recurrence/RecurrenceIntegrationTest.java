package com.school.reservation.domain.recurrence;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

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

        mockMvc.perform(post("/api/admin/recurrences/preview")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(previewBody(startDate, startDate)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalCandidates").value(1))
            .andExpect(jsonPath("$.availableCount").value(1));

        String response = mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(startDate, startDate, "FAIL_ALL")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.createdCount").value(1))
            .andReturn()
            .getResponse()
            .getContentAsString();

        UUID recurrenceId = UUID.fromString(objectMapper.readTree(response).get("recurrenceId").asText());
        mockMvc.perform(get("/api/admin/recurrences/{recurrenceId}", recurrenceId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deleted").value(false));
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
                .content(previewBody(firstDate, secondDate)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalCandidates").value(2))
            .andExpect(jsonPath("$.availableCount").value(1))
            .andExpect(jsonPath("$.conflictCount").value(1))
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
    void createAvailableOnlyUsesSamePartialCreationContractAsSkipConflicts() throws Exception {
        MockHttpSession session = loginAdminSession();
        LocalDate firstDate = nextWeekdayAt(9, 0).toLocalDate();
        LocalDate secondDate = firstDate.plusDays(7);
        createBlockingReservation(session, firstDate);

        String response = mockMvc.perform(post("/api/admin/recurrences")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody(firstDate, secondDate, "CREATE_AVAILABLE_ONLY")))
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
        return """
            {
              "roomId": "%s",
              "startDate": "%s",
              "endDate": "%s",
              "daysOfWeek": ["%s"],
              "startTime": "09:00:00",
              "endTime": "10:00:00"
            }
            """.formatted(firstRoomId(), startDate, endDate, dayCode(startDate));
    }

    private String createBody(LocalDate startDate, LocalDate endDate, String conflictPolicy) {
        return """
            {
              "roomId": "%s",
              "applicantName": "Recurring Class",
              "applicantEmail": "class@example.com",
              "applicantPhone": "010-5555-5555",
              "purpose": "Weekly lecture",
              "startDate": "%s",
              "endDate": "%s",
              "daysOfWeek": ["%s"],
              "startTime": "09:00:00",
              "endTime": "10:00:00",
              "conflictPolicy": "%s"
            }
            """.formatted(firstRoomId(), startDate, endDate, dayCode(startDate), conflictPolicy);
    }

    private String dayCode(LocalDate date) {
        return date.getDayOfWeek().name().substring(0, 3);
    }

    private void createBlockingReservation(MockHttpSession session, LocalDate date) throws Exception {
        OffsetDateTime startAt = date.atTime(9, 0).atOffset(java.time.ZoneOffset.ofHours(9));
        createAdminReservation(
            session,
            firstRoomId(),
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
}
