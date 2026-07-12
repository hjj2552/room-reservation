package com.school.reservation.domain.reservation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.support.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class ReservationHistoryIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void adminCanReadReservationHistories() throws Exception {
        MockHttpSession session = loginAsAdmin();
        UUID reservationId = createReservation(session);

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/approve", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "history approve"
                    }
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(get("/api/admin/reservations/{reservationId}/histories", reservationId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].action").value("APPROVED"))
            .andExpect(jsonPath("$[0].afterStatus").value("CONFIRMED"));

        mockMvc.perform(get("/api/admin/audit/reservation-histories")
                .session(session)
                .param("reservationId", reservationId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(2))
            .andExpect(jsonPath("$.items[0].reservationId").value(reservationId.toString()));
    }

    @Test
    void adminCanFilterReservationHistoriesByServerSideConditions() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime fromAt = OffsetDateTime.now().minusMinutes(1);
        UUID firstReservationId = createReservation(session, testRoomId(), nextWeekdayAt(10, 0), "Audit first room");
        UUID secondReservationId = createReservation(session, secondRoomId(), nextWeekdayAt(11, 0), "Audit second room");
        OffsetDateTime toAt = OffsetDateTime.now().plusMinutes(1);

        mockMvc.perform(get("/api/admin/audit/reservation-histories")
                .session(session)
                .param("roomId", testRoomId().toString())
                .param("action", "CREATED_BY_ADMIN")
                .param("from", fromAt.toString())
                .param("to", toAt.toString())
                .param("page", "0")
                .param("size", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(1))
            .andExpect(jsonPath("$.items[0].reservationId").value(firstReservationId.toString()))
            .andExpect(jsonPath("$.items[0].action").value("CREATED_BY_ADMIN"));

        mockMvc.perform(get("/api/admin/audit/reservation-histories")
                .session(session)
                .param("reservationId", secondReservationId.toString())
                .param("page", "0")
                .param("size", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(1))
            .andExpect(jsonPath("$.items[0].reservationId").value(secondReservationId.toString()));

        mockMvc.perform(get("/api/admin/audit/reservation-histories")
                .session(session)
                .param("action", "CREATED_BY_ADMIN")
                .param("page", "0")
                .param("size", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(2))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(1));

        mockMvc.perform(get("/api/admin/audit/reservation-histories")
                .session(session)
                .param("from", OffsetDateTime.now().plusDays(1).toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(0));
    }

    @Test
    void reservationHistoryActionsArePersistedAsFixedEnumValues() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime startAt = nextWeekdayAt(10, 0);
        UUID reservationId = createReservation(session, startAt, "History enum");

        mockMvc.perform(put("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "History Updated",
                      "applicantEmail": "history-updated@example.com",
                      "applicantPhone": "010-6666-6666",
                      "purpose": "History enum updated",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "REQUESTED",
                      "memo": "enum update"
                    }
                    """.formatted(testRoomId(), startAt.plusHours(1), startAt.plusHours(2))))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/approve", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "enum approve"
                    }
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/cancel", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "enum cancel"
                    }
                    """))
            .andExpect(status().isOk());

        List<String> actions = jdbcTemplate.queryForList(
            "select action from reservation_histories where reservation_id = ? order by created_at asc",
            String.class,
            reservationId
        );
        assertThat(actions).containsExactly("CREATED_BY_ADMIN", "UPDATED", "APPROVED", "CANCELLED");

        mockMvc.perform(get("/api/admin/reservations/{reservationId}/histories", reservationId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].action").value("CANCELLED"))
            .andExpect(jsonPath("$[1].action").value("APPROVED"))
            .andExpect(jsonPath("$[2].action").value("UPDATED"))
            .andExpect(jsonPath("$[2].beforeReservationPurpose").value("History enum"))
            .andExpect(jsonPath("$[2].reservationPurpose").value("History enum updated"))
            .andExpect(jsonPath("$[2].beforeReservationRoomName").value(testRoomName()))
            .andExpect(jsonPath("$[2].reservationRoomName").value(testRoomName()))
            .andExpect(jsonPath("$[2].beforeReservationApplicantName").value("History User"))
            .andExpect(jsonPath("$[2].reservationApplicantName").value("History Updated"))
            .andExpect(jsonPath("$[2].beforeReservationApplicantEmail").value("history@example.com"))
            .andExpect(jsonPath("$[2].reservationApplicantEmail").value("history-updated@example.com"))
            .andExpect(jsonPath("$[3].action").value("CREATED_BY_ADMIN"));
    }

    private UUID createReservation(MockHttpSession session) throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(14, 0);
        return createReservation(session, startAt, "History test");
    }

    private UUID createReservation(MockHttpSession session, OffsetDateTime startAt, String purpose) throws Exception {
        return createReservation(session, testRoomId(), startAt, purpose);
    }

    private UUID createReservation(MockHttpSession session, UUID roomId, OffsetDateTime startAt, String purpose) throws Exception {
        String response = mockMvc.perform(post("/api/admin/reservations")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "History User",
                      "applicantEmail": "history@example.com",
                      "applicantPhone": "010-6666-6666",
                      "purpose": "%s",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "REQUESTED"
                    }
                    """.formatted(roomId, purpose, startAt, startAt.plusHours(1))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return UUID.fromString(json.get("id").asText());
    }

    private UUID secondRoomId() {
        return createTestRoom("secondary");
    }

    private MockHttpSession loginAsAdmin() throws Exception {
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
}
