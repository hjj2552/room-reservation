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
                    """.formatted(testRoomId(), startAt.plusHours(1), startAt.plusHours(2))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(reservationId.toString()))
            .andExpect(jsonPath("$.applicantName").value("Admin Updated"))
            .andExpect(jsonPath("$.purpose").value("Updated meeting"));
    }

    @Test
    void cancelledReservationCanBeReactivatedAsRequestedThroughUpdate() throws Exception {
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
                      "applicantName": "Reactivated User",
                      "applicantEmail": "reactivated-requested@example.com",
                      "applicantPhone": "010-3333-3333",
                      "purpose": "Reactivated as requested",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "REQUESTED",
                      "memo": "reactivate as requested"
                    }
                    """.formatted(testRoomId(), startAt.plusHours(2), startAt.plusHours(3))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andExpect(jsonPath("$.purpose").value("Reactivated as requested"));
    }

    @Test
    void cancelledReservationCanBeReactivatedAsConfirmedStatusThroughUpdate() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime startAt = nextWeekdayAt(12, 0);
        UUID reservationId = createAdminReservation(session, startAt, "Cancel Then Confirm");

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/cancel", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "cancel before confirmed status update"
                    }
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(put("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Confirmed Status Again",
                      "applicantEmail": "reactivated-confirmed-status@example.com",
                      "applicantPhone": "010-4444-4444",
                      "purpose": "Reactivated as confirmed status",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "CONFIRMED",
                      "memo": "reactivate as confirmed status"
                    }
                    """.formatted(testRoomId(), startAt.plusHours(2), startAt.plusHours(3))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONFIRMED"))
            .andExpect(jsonPath("$.purpose").value("Reactivated as confirmed status"));
    }

    @Test
    void cancelledReservationReactivationFailsWhenRequestedSlotConflicts() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime startAt = nextWeekdayAt(14, 0);
        UUID reservationId = createAdminReservation(session, startAt, "Cancelled Conflict Source");
        createAdminReservation(session, startAt.plusHours(1), "Existing Conflict");

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/cancel", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "cancel before conflict update"
                    }
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(put("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Conflict User",
                      "applicantEmail": "reactivated-conflict@example.com",
                      "applicantPhone": "010-5555-5555",
                      "purpose": "Reactivated conflict",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "REQUESTED",
                      "memo": "reactivate conflict"
                    }
                    """.formatted(testRoomId(), startAt.plusHours(1), startAt.plusHours(2))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TIME_SLOT_CONFLICT"));
    }

    @Test
    void cancelledReservationConfirmedStatusReactivationFailsWhenSlotConflicts() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime startAt = nextWeekdayAt(15, 0);
        UUID reservationId = createAdminReservation(session, startAt, "Cancelled Confirmed Status Conflict Source");
        createAdminReservation(session, startAt.plusHours(1), "Existing Confirmed Status Conflict");

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/cancel", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "cancel before confirmed status conflict update"
                    }
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(put("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Confirmed Status Conflict User",
                      "applicantEmail": "reactivated-confirmed-status-conflict@example.com",
                      "applicantPhone": "010-6666-6666",
                      "purpose": "Reactivated confirmed status conflict",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "CONFIRMED",
                      "memo": "reactivate confirmed status conflict"
                    }
                    """.formatted(testRoomId(), startAt.plusHours(1), startAt.plusHours(2))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TIME_SLOT_CONFLICT"));
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
                    """.formatted(testRoomId(), purpose, startAt, startAt.plusHours(1))))
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
