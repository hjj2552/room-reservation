package com.school.reservation.domain.reservation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.support.IntegrationTestSupport;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

@Import(ReservationPastTimeIntegrationTest.FixedClockConfiguration.class)
class ReservationPastTimeIntegrationTest extends IntegrationTestSupport {

    private static final Instant NOW = Instant.parse("2026-07-13T07:45:00Z");
    private static final OffsetDateTime PAST_START = OffsetDateTime.parse("2026-07-13T09:00:00+09:00");
    private static final OffsetDateTime FUTURE_START = OffsetDateTime.parse("2026-07-13T17:00:00+09:00");

    @Autowired
    ObjectMapper objectMapper;

    @BeforeEach
    void configureFixedSemester() {
        jdbcTemplate.update("""
            update operation_settings
            set semester_start_date = '2026-07-01',
                semester_end_date = '2026-07-31',
                open_time = '09:00',
                close_time = '18:00',
                slot_minutes = 30,
                available_days_of_week = 'MON,TUE,WED,THU,FRI',
                min_reservation_minutes = 30,
                max_reservation_minutes = 240
            where id = 1
            """);
    }

    @Test
    void publicCreationRejectsPastStartAndAcceptsFutureStart() throws Exception {
        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(publicRequest(PAST_START, "testing-reservation-public-past")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PAST_RESERVATION_TIME"))
            .andExpect(jsonPath("$.message").value("Reservation start time must not be in the past."));

        String createdBody = mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(publicRequest(FUTURE_START, "testing-reservation-public-future")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        UUID reservationId = UUID.fromString(objectMapper.readTree(createdBody).get("id").asText());

        mockMvc.perform(put("/api/public/reservations/{reservationId}", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(publicRequest(PAST_START, "testing-reservation-public-update-past")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PAST_RESERVATION_TIME"));
    }

    @Test
    void adminCreationAndTimeChangingUpdateRejectPastStart() throws Exception {
        MockHttpSession session = loginAdminSession();

        mockMvc.perform(post("/api/admin/reservations")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(adminRequest(PAST_START, "testing-reservation-admin-past")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PAST_RESERVATION_TIME"));

        String createdBody = mockMvc.perform(post("/api/admin/reservations")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(adminRequest(FUTURE_START, "testing-reservation-admin-future")))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode created = objectMapper.readTree(createdBody);
        UUID reservationId = UUID.fromString(created.get("id").asText());

        mockMvc.perform(put("/api/admin/reservations/{reservationId}", reservationId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(adminRequest(PAST_START, "testing-reservation-admin-update-past")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PAST_RESERVATION_TIME"));
    }

    private String publicRequest(OffsetDateTime startAt, String purpose) {
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
            """.formatted(testRoomId(), purpose, startAt, startAt.plusMinutes(30));
    }

    private String adminRequest(OffsetDateTime startAt, String purpose) {
        return """
            {
              "roomId": "%s",
              "applicantName": "testing-admin-user",
              "applicantEmail": "testing-admin@example.test",
              "applicantPhone": "010-1111-2222",
              "purpose": "%s",
              "startAt": "%s",
              "endAt": "%s",
              "status": "CONFIRMED",
              "memo": "testing-past-policy"
            }
            """.formatted(testRoomId(), purpose, startAt, startAt.plusMinutes(30));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {

        @Bean
        @Primary
        Clock fixedReservationPolicyClock() {
            return Clock.fixed(NOW, ZoneOffset.UTC);
        }
    }
}
