package com.school.reservation.domain.room;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.support.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class PublicRoomQueryIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void publicCanGetRoomDetail() throws Exception {
        mockMvc.perform(get("/api/public/rooms/{roomId}", testRoomId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(testRoomId().toString()));
    }

    @Test
    void disabledRoomIsBlockedFromPublicDetail() throws Exception {
        UUID roomId = testRoomId();
        jdbcTemplate.update("update rooms set enabled = false where id = ?", roomId);

        mockMvc.perform(get("/api/public/rooms/{roomId}", roomId))
            .andExpect(status().isNotFound());
    }

    @Test
    void publicCanGetWeeklyReservationsWithoutPersonalData() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(10, 0);
        createPublicReservation(startAt);

        mockMvc.perform(get("/api/public/rooms/{roomId}/weekly-reservations", testRoomId())
                .param("weekStart", startAt.toLocalDate().toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.room.id").value(testRoomId().toString()))
            .andExpect(jsonPath("$.reservations[0].purpose").value("Study"));
    }

    @Test
    void publicWeeklyReservationsExcludeCancelledReservations() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(10, 0);
        UUID reservationId = createPublicReservation(startAt);

        mockMvc.perform(post("/api/public/reservations/{reservationId}/cancel", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "cancelPassword": "test-password"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));

        mockMvc.perform(get("/api/public/rooms/{roomId}/weekly-reservations", testRoomId())
                .param("weekStart", startAt.toLocalDate().toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reservations.length()").value(0));
    }

    private UUID createPublicReservation(OffsetDateTime startAt) throws Exception {
        String response = mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public-query@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "Study",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), startAt, startAt.plusHours(1))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();

        return UUID.fromString(objectMapper.readTree(response).get("id").asText());
    }
}
