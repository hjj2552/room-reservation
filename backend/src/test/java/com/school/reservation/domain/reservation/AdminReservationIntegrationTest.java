package com.school.reservation.domain.reservation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.support.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class AdminReservationIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void adminCanListApproveAndCancelReservation() throws Exception {
        UUID reservationId = createPublicReservation();
        MockHttpSession session = loginAsAdmin();

        mockMvc.perform(get("/api/admin/reservations").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].id").value(reservationId.toString()));

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/approve", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "approved in test"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONFIRMED"));

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/cancel", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "cancelled in test"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void adminReservationListDefaultsToNewestCreatedFirst() throws Exception {
        OffsetDateTime firstStart = nextWeekdayAt(9, 0);
        UUID olderReservationId = createPublicReservation(firstStart, "Older reservation");
        UUID newerReservationId = createPublicReservation(firstStart.plusHours(1), "Newer reservation");
        MockHttpSession session = loginAsAdmin();

        mockMvc.perform(get("/api/admin/reservations").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].id").value(newerReservationId.toString()))
            .andExpect(jsonPath("$.items[1].id").value(olderReservationId.toString()));
    }

    @Test
    void adminCanExcludeCancelledReservationsFromTimetablePaging() throws Exception {
        OffsetDateTime firstStart = nextWeekdayAt(9, 0);
        UUID firstActiveId = createPublicReservation(firstStart, "Active first");
        UUID cancelledId = createPublicReservation(firstStart.plusHours(1), "Cancelled middle");
        UUID secondActiveId = createPublicReservation(firstStart.plusHours(2), "Active second");
        MockHttpSession session = loginAsAdmin();

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/cancel", cancelledId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "cancelled for timetable"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));

        mockMvc.perform(get("/api/admin/reservations")
                .session(session)
                .param("from", firstStart.minusMinutes(1).toString())
                .param("to", firstStart.plusHours(4).toString())
                .param("excludeCancelled", "true")
                .param("page", "0")
                .param("size", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(2))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.items[0].id").value(secondActiveId.toString()));

        mockMvc.perform(get("/api/admin/reservations")
                .session(session)
                .param("from", firstStart.minusMinutes(1).toString())
                .param("to", firstStart.plusHours(4).toString())
                .param("excludeCancelled", "true")
                .param("page", "1")
                .param("size", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(2))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.items[0].id").value(firstActiveId.toString()));

        mockMvc.perform(get("/api/admin/reservations")
                .session(session)
                .param("from", firstStart.minusMinutes(1).toString())
                .param("to", firstStart.plusHours(4).toString())
                .param("page", "0")
                .param("size", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(3));
    }

    @Test
    void adminCanHardDeleteReservationAndKeepAuditHistory() throws Exception {
        UUID reservationId = createPublicReservation();
        MockHttpSession session = loginAsAdmin();

        mockMvc.perform(delete("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "deleted in test"
                    }
                    """))
            .andExpect(status().isNoContent());

        Integer reservationCount = jdbcTemplate.queryForObject(
            "select count(*) from reservations where id = ?",
            Integer.class,
            reservationId
        );
        assertThat(reservationCount).isZero();

        mockMvc.perform(get("/api/admin/reservations/{reservationId}", reservationId).session(session))
            .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/admin/audit/reservation-histories")
                .session(session)
                .param("reservationId", reservationId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].reservationId").value(reservationId.toString()))
            .andExpect(jsonPath("$.items[0].action").value("DELETED"))
            .andExpect(jsonPath("$.items[0].memo").value("deleted in test"))
            .andExpect(jsonPath("$.items[0].reservationPurpose").value("Study"))
            .andExpect(jsonPath("$.items[0].reservationRoomName").value("Room 101"));

        Integer detachedHistoryCount = jdbcTemplate.queryForObject(
            "select count(*) from reservation_histories where reservation_deleted_id = ? and reservation_id is null",
            Integer.class,
            reservationId
        );
        assertThat(detachedHistoryCount).isEqualTo(2);
    }

    private UUID createPublicReservation() throws Exception {
        return createPublicReservation(nextWeekdayAt(13, 0), "Study");
    }

    private UUID createPublicReservation(OffsetDateTime startAt, String purpose) throws Exception {
        String response = mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "%s",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(firstRoomId(), purpose, startAt, startAt.plusHours(1))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();

        JsonNode json = objectMapper.readTree(response);
        return UUID.fromString(json.get("id").asText());
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
