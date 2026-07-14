package com.school.reservation.domain.reservation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class ReservationPolicyServiceTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void reservationOutsideOperatingHoursFails() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(8, 0);

        mockMvc.perform(post("/api/public/reservations")
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
                    """.formatted(testRoomId(), startAt, startAt.plusHours(1))))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("OUTSIDE_OPERATING_HOURS"));
    }

    @Test
    void reservationTimesRequireCurrentSlotDurationAndMinutePrecision() throws Exception {
        jdbcTemplate.update("""
            update operation_settings
            set slot_minutes = 15,
                min_reservation_minutes = 45,
                max_reservation_minutes = 120
            where id = 1
            """);
        OffsetDateTime validStart = nextWeekdayAt(9, 15);

        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(publicRequest(validStart, validStart.plusMinutes(45), "testing-valid-fifteen-minute-slot")))
            .andExpect(status().isCreated());

        OffsetDateTime secondsStart = nextWeekdayAt(10, 15).plusSeconds(1);
        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(publicRequest(secondsStart, secondsStart.plusMinutes(45), "testing-seconds-rejected")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("INVALID_SLOT_UNIT"));

        OffsetDateTime nanosStart = nextWeekdayAt(11, 15).plusNanos(1);
        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(publicRequest(nanosStart, nanosStart.plusMinutes(45), "testing-nanos-rejected")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("INVALID_SLOT_UNIT"));

        OffsetDateTime invalidDurationStart = nextWeekdayAt(13, 15);
        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(publicRequest(
                    invalidDurationStart,
                    invalidDurationStart.plusMinutes(50),
                    "testing-duration-unit-rejected"
                )))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("INVALID_SLOT_UNIT"));
    }

    @Test
    void slotChangePreservesExistingReservationAndStatusTransitionsButRevalidatesContentUpdates() throws Exception {
        jdbcTemplate.update("""
            update operation_settings
            set slot_minutes = 5,
                min_reservation_minutes = 30,
                max_reservation_minutes = 240
            where id = 1
            """);
        MockHttpSession session = loginAdminSession();
        OffsetDateTime legacyStart = nextWeekdayAt(9, 10);
        String createdBody = mockMvc.perform(post("/api/admin/reservations")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(adminRequest(legacyStart, legacyStart.plusMinutes(30), "testing-existing-slot-policy", "REQUESTED")))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        UUID reservationId = UUID.fromString(objectMapper.readTree(createdBody).get("id").asText());

        jdbcTemplate.update("update operation_settings set slot_minutes = 30 where id = 1");

        mockMvc.perform(put("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(adminRequest(legacyStart, legacyStart.plusMinutes(30), "testing-content-update", "REQUESTED")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("INVALID_SLOT_UNIT"));

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/approve", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"testing-approve-existing-slot\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONFIRMED"));

        mockMvc.perform(post("/api/admin/reservations/{reservationId}/cancel", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"memo\":\"testing-cancel-existing-slot\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    private String publicRequest(OffsetDateTime startAt, OffsetDateTime endAt, String purpose) {
        return """
            {
              "roomId": "%s",
              "applicantName": "testing-public-user",
              "applicantEmail": "testing-public@example.test",
              "applicantPhone": "010-0000-0000",
              "purpose": "%s",
              "startAt": "%s",
              "endAt": "%s",
              "cancelPassword": "testing-password"
            }
            """.formatted(testRoomId(), purpose, startAt, endAt);
    }

    private String adminRequest(OffsetDateTime startAt, OffsetDateTime endAt, String purpose, String status) {
        return """
            {
              "roomId": "%s",
              "applicantName": "testing-admin-user",
              "applicantEmail": "testing-admin@example.test",
              "applicantPhone": "010-1111-2222",
              "purpose": "%s",
              "startAt": "%s",
              "endAt": "%s",
              "status": "%s",
              "memo": "testing-slot-policy"
            }
            """.formatted(testRoomId(), purpose, startAt, endAt, status);
    }
}
