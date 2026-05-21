package com.school.reservation.domain.reservation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

class AdminReservationWriteIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void adminCanCreateAndUpdateReservation() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime startAt = nextWeekdayAt(10, 0);
        UUID reservationId = createAdminReservation(session, startAt, "Admin Direct");

        mockMvc.perform(put("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Admin Updated",
                      "applicantEmail": "updated@example.com",
                      "applicantPhone": "010-2222-2222",
                      "purpose": "Updated meeting",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "CONFIRMED",
                      "memo": "update in test"
                    }
                    """.formatted(firstRoomId(), startAt.plusHours(1), startAt.plusHours(2))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(reservationId.toString()))
            .andExpect(jsonPath("$.applicantName").value("Admin Updated"))
            .andExpect(jsonPath("$.purpose").value("Updated meeting"));
    }

    @Test
    void cancelledReservationCannotBeUpdated() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime startAt = nextWeekdayAt(11, 0);
        UUID reservationId = createAdminReservation(session, startAt, "Cancel Then Update");

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/cancel", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "cancel before update"
                    }
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(put("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Should Fail",
                      "applicantEmail": "fail@example.com",
                      "applicantPhone": "010-3333-3333",
                      "purpose": "Should fail",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "CONFIRMED"
                    }
                    """.formatted(firstRoomId(), startAt.plusHours(2), startAt.plusHours(3))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private UUID createAdminReservation(MockHttpSession session, OffsetDateTime startAt, String purpose) throws Exception {
        String response = mockMvc.perform(post("/api/admin/reservations")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Admin User",
                      "applicantEmail": "admin-user@example.com",
                      "applicantPhone": "010-1111-1111",
                      "purpose": "%s",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "CONFIRMED",
                      "memo": "created in test"
                    }
                    """.formatted(firstRoomId(), purpose, startAt, startAt.plusHours(1))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.source").value("ADMIN_MANUAL"))
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
