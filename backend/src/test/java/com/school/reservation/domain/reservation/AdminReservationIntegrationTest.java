package com.school.reservation.domain.reservation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

    private UUID createPublicReservation() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(13, 0);
        String response = mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "Study",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(firstRoomId(), startAt, startAt.plusHours(1))))
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
